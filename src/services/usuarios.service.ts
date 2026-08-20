import "server-only";
import { SinPermisoError } from "@/lib/errores";
import { codigoDeFallo, motivoSiFalla } from "@/lib/fallo-de-base";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { motivoSiEmpresaEnMigracion } from "@/services/empresa-migracion.service";
import { hashPassword } from "@/lib/password";
import { generateTemporaryPassword } from "@/lib/tokens";
import { cerrarTodasLasSesiones } from "@/services/sesion.service";
import {
  enviarCorreo,
  correoBienvenida,
  correoClaveRestablecida,
} from "@/services/mailer.service";
import {
  correoValido,
  validarAltaUsuario,
  rolValido,
  mensajeCorreoEnUso,
  type DatosAltaUsuario,
} from "@/lib/usuarios";
import { esCorreoOperador, parsearOperadores } from "@/lib/operador";
import { env } from "@/lib/env";
import { validarDocumento } from "@/lib/perfil";
import type { SesionActiva } from "@/services/sesion.service";
import type { Role } from "@/generated/prisma/enums";

/**
 * Gestion de usuarios de la empresa.
 *
 * Los cinco permisos `usuario:*` existian en la matriz desde el principio
 * pero solo `usuario:editar` se estrenaba, con la bandeja de solicitudes de
 * perfil. Aqui se abren los demas: dar de alta, editar, activar/desactivar y
 * resetear la clave.
 *
 * Regla de aislamiento: el `companyId` sale SIEMPRE de la sesion. Nadie
 * alcanza usuarios de otra empresa manipulando un id en la peticion.
 *
 * Dos guardas cruzan todo el modulo:
 *  - La empresa no puede quedarse sin NINGUN administrador activo. Es la
 *    unica via para gestionar permisos y usuarios; perderla es perder el
 *    control de la empresa desde dentro de la aplicacion.
 *  - Nadie se degrada ni se desactiva a si mismo. Evita el autobloqueo y
 *    cierra la puerta a errores irreversibles con un clic.
 */

export type Resultado = { ok: true } | { ok: false; error: string };

/**
 * Lo que se dice cuando la base rechaza escribir un usuario.
 *
 * EXISTE POR EL MISMO HUECO QUE TENIA EL IMPORTADOR: la escritura se llamaba
 * sin capturar, asi que un rechazo de MariaDB subia hasta el limite de Next y
 * el administrador veia «Esta pantalla no se pudo cargar» en vez de que
 * corregir. Se cerro el 20/08/2026, el mismo dia que el del presupuesto.
 *
 * Casi todo lo que puede fallar se comprueba ANTES y con mejor mensaje —el
 * correo repetido dice de quien es, el documento tambien—. Esto es la red por
 * debajo: la carrera de dos administradores dando de alta a la vez, y lo que
 * no se nos haya ocurrido.
 */
export function motivoDeFalloConUsuario(e: unknown): string {
  const codigo = codigoDeFallo(e);

  // Comun a todos: la escritura va en transaccion, asi que o entro entera o
  // no entro nada. Decirlo importa tanto como el motivo.
  const intacto = "No se guardo nada: la operacion se deshace entera si algo falla.";

  switch (codigo) {
    case "P2002":
      return (
        "Ese correo o ese documento acaban de darse de alta desde otra " +
        `pantalla. Recarga la lista de usuarios y comprueba antes de repetir. ${intacto}`
      );
    case "P2000":
      return (
        "Algun dato es mas largo de lo que admite el sistema: los nombres y " +
        `los apellidos llegan a 100 caracteres y el correo a 150. ${intacto}`
      );
    case "P2003":
      return `La empresa de la sesion ya no existe. Vuelve a entrar. ${intacto}`;
    default:
      return `No se pudo guardar el usuario. ${intacto}`;
  }
}

/**
 * El alta y el reseteo devuelven la clave temporal para mostrarla UNA vez, y
 * si ademas se logro enviar por correo. Se muestra siempre en pantalla —el
 * correo es un extra, no un sustituto—: si no salio, el admin la comunica a
 * mano; si salio, ya la tiene el usuario y el admin lo sabe.
 */
export type ResultadoConClave =
  | { ok: true; claveTemporal: string; correoEnviado: boolean }
  | { ok: false; error: string };

export interface UsuarioLista {
  id: string;
  nombres: string;
  apellidos: string;
  email: string;
  cargo: string | null;
  celular: string | null;
  tipoDoc: string;
  numDoc: string;
  role: string;
  estado: string;
  /// Solo para ofrecer el rescate: un ADMIN puede apagarsela a quien perdio
  /// el acceso a su buzon. Encenderla es cosa de cada uno, en su perfil.
  dosFactoresActivo: boolean;
  /// El propio usuario de la sesion: la interfaz le oculta las acciones que
  /// no puede hacerse a si mismo (degradarse, desactivarse, eliminarse).
  esYo: boolean;
  /// El administrador principal: el usuario mas antiguo de la empresa, el
  /// fundador. No se puede eliminar por ninguna via —es el ancla de la
  /// cuenta—, aunque si editar.
  esPrincipal: boolean;
}

export async function listarUsuarios(
  sesion: SesionActiva,
): Promise<UsuarioLista[]> {
  if (!puede(sesion, "usuario:leer")) throw new SinPermisoError();

  const usuarios = await prisma.user.findMany({
    where: { companyId: sesion.companyId },
    // Activos primero; dentro, por apellidos. Un ENUM ordena por indice de
    // declaracion, y `estado` declara ACTIVO antes que INACTIVO.
    orderBy: [{ estado: "asc" }, { apellidos: "asc" }, { nombres: "asc" }],
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      email: true,
      cargo: true,
      celular: true,
      tipoDoc: true,
      numDoc: true,
      role: true,
      estado: true,
      dosFactoresActivo: true,
      createdAt: true,
    },
  });

  const principalId = await idAdministradorPrincipal(sesion.companyId);

  return usuarios.map((u) => ({
    id: u.id,
    nombres: u.nombres,
    apellidos: u.apellidos,
    email: u.email,
    cargo: u.cargo,
    celular: u.celular,
    tipoDoc: u.tipoDoc,
    numDoc: u.numDoc,
    role: u.role,
    estado: u.estado,
    dosFactoresActivo: u.dosFactoresActivo,
    esYo: u.id === sesion.userId,
    esPrincipal: u.id === principalId,
  }));
}

/**
 * El administrador principal de la empresa: el usuario MAS ANTIGUO.
 *
 * No hay una columna que lo marque; se deduce del `createdAt`, que es lo que
 * lo hace estable sin migracion. Es el fundador —en la practica, el ADMIN que
 * creo el sembrado— y el modulo lo trata como intocable para el borrado: es el
 * ancla desde la que se gestiona todo lo demas.
 */
async function idAdministradorPrincipal(
  companyId: string,
): Promise<string | null> {
  const primero = await prisma.user.findFirst({
    where: { companyId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return primero?.id ?? null;
}

/**
 * Da de alta un usuario con clave temporal y `mustChangePassword`, para que
 * la cambie en el primer acceso. La clave se devuelve una sola vez: no se
 * guarda en claro en ningun sitio.
 */
export async function crearUsuario(
  sesion: SesionActiva,
  datos: DatosAltaUsuario,
): Promise<ResultadoConClave> {
  if (!puede(sesion, "usuario:crear")) {
    return { ok: false, error: "No tienes permiso para crear usuarios." };
  }

  // Las personas viajan en el archivo de migracion —con su hash de
  // contrasena— y se leen las PRIMERAS. Ver `motivoSiEmpresaEnMigracion`.
  const congelada = await motivoSiEmpresaEnMigracion(sesion.companyId);
  if (congelada) return { ok: false, error: congelada };

  const validacion = validarAltaUsuario(datos);
  if (!validacion.ok) return { ok: false, error: validacion.error };
  const d = validacion.datos;

  // El correo es unico DENTRO DE LA EMPRESA. Se comprueba aqui para dar un
  // mensaje con nombre y apellidos en vez del error crudo de la clave unica.
  //
  // Desde que dejo de ser unico global (20/08/2026) esta consulta ya no puede
  // encontrar a nadie de otra constructora, y con eso desaparecio tambien el
  // mensaje que tenia que callarse de quien era.
  const correoEnUso = await prisma.user.findUnique({
    where: { companyId_email: { companyId: sesion.companyId, email: d.email } },
    select: { nombres: true, apellidos: true },
  });
  if (correoEnUso) {
    return { ok: false, error: mensajeCorreoEnUso(correoEnUso) };
  }

  // El documento es unico por empresa.
  const docEnUso = await prisma.user.findFirst({
    where: { companyId: sesion.companyId, numDoc: d.numDoc },
    select: { nombres: true, apellidos: true },
  });
  if (docEnUso) {
    return {
      ok: false,
      error: `Ese documento ya es de ${`${docEnUso.nombres} ${docEnUso.apellidos}`.trim()}.`,
    };
  }

  const claveTemporal = generateTemporaryPassword();
  const passwordHash = await hashPassword(claveTemporal);

  const fallo = await motivoSiFalla(prisma.$transaction(async (tx) => {
    const creado = await tx.user.create({
      data: {
        companyId: sesion.companyId,
        nombres: d.nombres,
        apellidos: d.apellidos,
        email: d.email,
        tipoDoc: d.tipoDoc,
        numDoc: d.numDoc,
        cargo: d.cargo,
        celular: d.celular,
        role: d.role,
        passwordHash,
        mustChangePassword: true,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "User",
        entidadId: creado.id,
        accion: "CREATE",
        // La clave NO se audita: ni en claro ni hasheada. Solo el hecho.
        despues: {
          nombres: d.nombres,
          apellidos: d.apellidos,
          email: d.email,
          role: d.role,
        },
      },
    });
  }), motivoDeFalloConUsuario);

  if (fallo) return { ok: false, error: fallo };

  // Correo de bienvenida, best-effort: si el SMTP no esta configurado o falla,
  // el alta ya ocurrio y la clave se muestra igual en pantalla.
  const { enviado } = await enviarCorreo({
    para: d.email,
    ...correoBienvenida({
      nombre: `${d.nombres} ${d.apellidos}`.trim(),
      email: d.email,
      claveTemporal,
    }),
  });

  return { ok: true, claveTemporal, correoEnviado: enviado };
}

export interface CambiosUsuario {
  nombres: string;
  apellidos: string;
  /**
   * El correo, que ADEMAS es el identificador de acceso.
   *
   * Hasta el 19/08/2026 no se podia cambiar por ninguna via: ni en «Mi
   * perfil» —donde sale como solo lectura— ni aqui ni por la solicitud de
   * cambio de perfil. Eso dejaba sin salida dos casos corrientes: un correo
   * mal tecleado al dar de alta, y alguien que deja de tener acceso a ese
   * buzon. Sin correo accesible no hay recuperacion de clave, y si ademas era
   * el unico ADMIN, la constructora quedaba cerrada.
   */
  email: string;
  cargo: string;
  tipoDoc: string;
  numDoc: string;
  celular: string;
  role: string;
}

/**
 * El ADMIN edita directo los datos de otro usuario, sin pasar por la solicitud
 * de perfil: la solicitud existe para que alguien no cambie SU PROPIA
 * identidad sin control, y el admin es justamente quien la aprobaria.
 */
export async function editarUsuario(
  sesion: SesionActiva,
  userId: string,
  cambios: CambiosUsuario,
): Promise<Resultado> {
  if (!puede(sesion, "usuario:editar")) {
    return { ok: false, error: "No tienes permiso para editar usuarios." };
  }

  const congelada = await motivoSiEmpresaEnMigracion(sesion.companyId);
  if (congelada) return { ok: false, error: congelada };

  const usuario = await prisma.user.findFirst({
    where: { id: userId, companyId: sesion.companyId },
    select: {
      nombres: true,
      apellidos: true,
      email: true,
      cargo: true,
      tipoDoc: true,
      numDoc: true,
      celular: true,
      role: true,
      estado: true,
    },
  });
  if (!usuario) return { ok: false, error: "No se encontro el usuario." };

  const nombres = cambios.nombres.trim().replace(/\s+/g, " ");
  const apellidos = cambios.apellidos.trim().replace(/\s+/g, " ");
  if (!nombres || !apellidos) {
    return { ok: false, error: "Nombres y apellidos no pueden quedar vacios." };
  }

  const tipoDoc = cambios.tipoDoc.trim();
  const numDoc = cambios.numDoc.trim();
  const doc = validarDocumento(tipoDoc, numDoc);
  if (!doc.ok) return doc;

  if (!rolValido(cambios.role)) {
    return { ok: false, error: "El rol no es valido." };
  }
  const role = cambios.role as Role;

  // Nadie se cambia su propio rol: evita que un admin se autodegrade y quede
  // sin poder revertirlo.
  if (userId === sesion.userId && role !== usuario.role) {
    return {
      ok: false,
      error: "No puedes cambiar tu propio rol. Pideselo a otro administrador.",
    };
  }

  // La empresa no puede quedarse sin ADMIN activo: si este era el ultimo y se
  // le cambia el rol, se rechaza.
  if (usuario.role === "ADMIN" && role !== "ADMIN" && usuario.estado === "ACTIVO") {
    if (await esUltimoAdminActivo(sesion.companyId, userId)) {
      return { ok: false, error: NO_SIN_ADMIN };
    }
  }

  /**
   * EL CORREO. Se normaliza igual que en el alta y en el acceso —minusculas y
   * sin espacios— porque «Ana@X» y «ana@x» son la misma persona.
   */
  const email = cambios.email.trim().toLowerCase();
  if (!correoValido(email)) {
    return { ok: false, error: "El correo no tiene un formato valido." };
  }

  const cambiaCorreo = email !== usuario.email;

  if (cambiaCorreo) {
    /**
     * NO SE TOCA EL CORREO DE UN OPERADOR, y es la guarda que mas importa.
     *
     * Quien opera GCM lo es por estar su correo en `GCM_OPERADORES`, una
     * variable del SERVIDOR que no se puede editar desde la aplicacion.
     * Cambiarlo aqui le quitaria el area de constructoras en silencio y sin
     * forma de recuperarla desde dentro: habria que entrar a cPanel. Se
     * rechaza y se dice el orden correcto.
     */
    if (esCorreoOperador(usuario.email, parsearOperadores(env.GCM_OPERADORES))) {
      return {
        ok: false,
        error:
          "Ese correo esta en la lista de operadores del servidor. Cambiarlo " +
          "aqui dejaria a esa cuenta sin el area de constructoras y sin forma " +
          "de recuperarla desde GCM. Cambialo primero en el servidor " +
          "(GCM_OPERADORES) y despues aqui.",
      };
    }

    /**
     * El correo es unico DENTRO DE LA EMPRESA. Se comprueba aqui para poder
     * decirlo con palabras en vez de dejar que reviente la clave unica.
     *
     * Que la misma persona lo tenga tambien en otra constructora ya no es un
     * choque: es el caso que esto vino a permitir.
     */
    const enUso = await prisma.user.findUnique({
      where: { companyId_email: { companyId: sesion.companyId, email } },
      select: { id: true, nombres: true, apellidos: true },
    });

    if (enUso && enUso.id !== userId) {
      return { ok: false, error: mensajeCorreoEnUso(enUso) };
    }
  }

  // El documento propuesto no puede ser de otro de la empresa.
  if (numDoc !== usuario.numDoc) {
    const otro = await prisma.user.findFirst({
      where: { companyId: sesion.companyId, numDoc, id: { not: userId } },
      select: { nombres: true, apellidos: true },
    });
    if (otro) {
      return {
        ok: false,
        error: `Ese documento ya es de ${`${otro.nombres} ${otro.apellidos}`.trim()}.`,
      };
    }
  }

  const celular = cambios.celular.trim();
  const datosNuevos = {
    nombres,
    apellidos,
    email,
    cargo: cambios.cargo.trim() === "" ? null : cambios.cargo.trim().slice(0, 100),
    tipoDoc,
    numDoc,
    celular: celular === "" ? null : celular.slice(0, 30),
    role,
  };

  // Misma red que en el alta: aqui tambien entra texto de un formulario, y el
  // correo puede chocar con el de un companero por una carrera.
  const fallo = await motivoSiFalla(prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: datosNuevos });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "User",
        entidadId: userId,
        accion: "UPDATE",
        antes: usuario,
        despues: datosNuevos,
      },
    });
  }), motivoDeFalloConUsuario);

  if (fallo) return { ok: false, error: fallo };

  /**
   * Cambiar el correo cierra las sesiones de esa persona.
   *
   * El correo ES el identificador de acceso: dejarle la sesion abierta seria
   * dejarle creyendo que entra con el de antes hasta que caduque y se
   * encuentre fuera sin saber por que. Que tenga que volver a entrar es como
   * se entera de cual es su nuevo identificador.
   *
   * Va FUERA de la transaccion y a proposito: si esto fallara, el correo ya
   * esta cambiado y lo unico que queda es una sesion viva de mas, que caduca
   * sola. Meterlo dentro arriesgaria deshacer un cambio de identidad correcto.
   */
  if (cambiaCorreo) await cerrarTodasLasSesiones(userId);

  return { ok: true };
}

/**
 * Activa o desactiva un usuario. No se borra: la auditoria y los `aprobadaPor`
 * de sus ordenes deben sobrevivir a su baja. Al desactivar, se cierran sus
 * sesiones para que el cambio surta efecto en el acto.
 */
export async function cambiarEstadoUsuario(
  sesion: SesionActiva,
  userId: string,
  activar: boolean,
): Promise<Resultado> {
  if (!puede(sesion, "usuario:desactivar")) {
    return { ok: false, error: "No tienes permiso para activar o desactivar usuarios." };
  }

  const congelada = await motivoSiEmpresaEnMigracion(sesion.companyId);
  if (congelada) return { ok: false, error: congelada };

  if (userId === sesion.userId) {
    return { ok: false, error: "No puedes desactivarte a ti mismo." };
  }

  const usuario = await prisma.user.findFirst({
    where: { id: userId, companyId: sesion.companyId },
    select: { role: true, estado: true },
  });
  if (!usuario) return { ok: false, error: "No se encontro el usuario." };

  const estado = activar ? "ACTIVO" : "INACTIVO";
  if (usuario.estado === estado) return { ok: true }; // idempotente

  // No dejar la empresa sin ADMIN activo al desactivar el ultimo.
  if (!activar && usuario.role === "ADMIN") {
    if (await esUltimoAdminActivo(sesion.companyId, userId)) {
      return { ok: false, error: NO_SIN_ADMIN };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { estado } });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "User",
        entidadId: userId,
        accion: "UPDATE",
        antes: { estado: usuario.estado },
        despues: { estado },
      },
    });
  });

  // Fuera de la transaccion: cerrar sesiones no debe abortar el cambio de
  // estado si falla, y al reves da igual porque el usuario ya esta INACTIVO y
  // `obtenerSesion` lo rechazaria en la siguiente peticion de todos modos.
  if (!activar) await cerrarTodasLasSesiones(userId);

  return { ok: true };
}

/**
 * Genera una nueva clave temporal, obliga a cambiarla y cierra las sesiones
 * del usuario. Se usa cuando alguien olvida su clave y un admin la restablece.
 * La clave se devuelve una sola vez.
 */
export async function resetearClave(
  sesion: SesionActiva,
  userId: string,
): Promise<ResultadoConClave> {
  if (!puede(sesion, "usuario:resetear_clave")) {
    return { ok: false, error: "No tienes permiso para resetear claves." };
  }

  const congelada = await motivoSiEmpresaEnMigracion(sesion.companyId);
  if (congelada) return { ok: false, error: congelada };

  // Uno no se resetea a si mismo: el reseteo genera una clave temporal y
  // cierra las sesiones, lo que te sacaria de la que estas usando. Para la
  // propia clave esta "Cambiar clave", que la eliges tu y no cierra sesion.
  if (userId === sesion.userId) {
    return {
      ok: false,
      error: 'Para tu propia clave usa "Cambiar clave": no te cierra la sesion.',
    };
  }

  const usuario = await prisma.user.findFirst({
    where: { id: userId, companyId: sesion.companyId },
    select: { id: true, nombres: true, apellidos: true, email: true },
  });
  if (!usuario) return { ok: false, error: "No se encontro el usuario." };

  const claveTemporal = generateTemporaryPassword();
  const passwordHash = await hashPassword(claveTemporal);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true },
    });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "User",
        entidadId: userId,
        accion: "PASSWORD_RESET",
      },
    });
  });

  await cerrarTodasLasSesiones(userId);

  // La nueva clave tambien va por correo, best-effort: el usuario que la
  // olvido la recibe sin depender de que el admin se la dicte.
  const { enviado } = await enviarCorreo({
    para: usuario.email,
    ...correoClaveRestablecida({
      nombre: `${usuario.nombres} ${usuario.apellidos}`.trim(),
      email: usuario.email,
      claveTemporal,
    }),
  });

  return { ok: true, claveTemporal, correoEnviado: enviado };
}

/**
 * Apaga la verificacion en dos pasos de OTRO usuario.
 *
 * Es un rescate, no una preferencia: si alguien la activo y despues perdio el
 * acceso a su buzon, el codigo no le llega y no hay forma de entrar. Sin esto,
 * la unica salida seria tocar la base a mano.
 *
 * Solo apaga. Encenderla a otro empezaria a mandarle codigos a un buzon que
 * quiza no controla, y ademas es una proteccion que uno se pone: la enciende
 * cada cual desde su perfil.
 *
 * No abre un agujero nuevo: quien puede hacer esto ya podia restablecerle la
 * clave, que es estrictamente mas poder.
 */
export async function desactivarDosFactoresUsuario(
  sesion: SesionActiva,
  userId: string,
): Promise<Resultado> {
  if (!puede(sesion, "usuario:editar")) {
    return {
      ok: false,
      error: "No tienes permiso para editar usuarios.",
    };
  }

  const congelada = await motivoSiEmpresaEnMigracion(sesion.companyId);
  if (congelada) return { ok: false, error: congelada };

  // Para la propia esta el perfil, que ademas explica lo que implica.
  if (userId === sesion.userId) {
    return {
      ok: false,
      error: 'Para la tuya usa "Mi perfil".',
    };
  }

  const usuario = await prisma.user.findFirst({
    where: { id: userId, companyId: sesion.companyId },
    select: { dosFactoresActivo: true },
  });
  if (!usuario) return { ok: false, error: "No se encontro el usuario." };

  if (!usuario.dosFactoresActivo) return { ok: true }; // idempotente

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { dosFactoresActivo: false },
    });

    // Los desafios abiertos mueren con ella: si no, un codigo pedido hace un
    // minuto seguiria sirviendo despues de haberla apagado.
    await tx.codigoAcceso.deleteMany({ where: { userId } });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "User",
        entidadId: userId,
        accion: "UPDATE",
        antes: { dosFactoresActivo: true },
        despues: { dosFactoresActivo: false },
      },
    });
  });

  return { ok: true };
}

/**
 * Elimina un usuario de forma definitiva, con trazabilidad.
 *
 * A diferencia de desactivar —que lo deja inerte pero recuperable—, esto lo
 * borra. Se permite porque un usuario creado por error, o alguien que nunca
 * llego a operar, no tiene por que quedarse como fila inactiva para siempre.
 *
 * La trazabilidad NO se pierde: lo que este usuario firmo vive como TEXTO en
 * los `aprobadaPor` de ordenes y movimientos —no como referencia—, y el
 * `AuditLog` guarda `userId` suelto, sin clave foranea, asi que sus registros
 * sobreviven. Antes de borrar se deja un apunte con quien era.
 *
 * Guardas: no al administrador principal (el ancla de la cuenta), no a uno
 * mismo, y no al ultimo administrador activo.
 */
export async function eliminarUsuario(
  sesion: SesionActiva,
  userId: string,
): Promise<Resultado> {
  // Eliminar es la forma dura de dar de baja: se gobierna con el mismo
  // permiso que desactivar.
  if (!puede(sesion, "usuario:desactivar")) {
    return { ok: false, error: "No tienes permiso para eliminar usuarios." };
  }

  const congelada = await motivoSiEmpresaEnMigracion(sesion.companyId);
  if (congelada) return { ok: false, error: congelada };

  if (userId === sesion.userId) {
    return { ok: false, error: "No puedes eliminarte a ti mismo." };
  }

  const usuario = await prisma.user.findFirst({
    where: { id: userId, companyId: sesion.companyId },
    select: {
      nombres: true,
      apellidos: true,
      email: true,
      role: true,
      estado: true,
      tipoDoc: true,
      numDoc: true,
    },
  });
  if (!usuario) return { ok: false, error: "No se encontro el usuario." };

  if (userId === (await idAdministradorPrincipal(sesion.companyId))) {
    return {
      ok: false,
      error: "No se puede eliminar al administrador principal de la empresa.",
    };
  }

  // Aunque no sea el principal, si es el ultimo ADMIN activo, borrarlo dejaria
  // la empresa sin administracion.
  if (usuario.role === "ADMIN" && usuario.estado === "ACTIVO") {
    if (await esUltimoAdminActivo(sesion.companyId, userId)) {
      return { ok: false, error: NO_SIN_ADMIN };
    }
  }

  await prisma.$transaction(async (tx) => {
    // El apunte de auditoria va ANTES del borrado: si fuera despues, un fallo
    // al borrar dejaria un registro de algo que no paso, y el borrado en
    // cascada de sus datos ya habria empezado.
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "User",
        entidadId: userId,
        accion: "DELETE",
        antes: {
          nombres: usuario.nombres,
          apellidos: usuario.apellidos,
          email: usuario.email,
          role: usuario.role,
          tipoDoc: usuario.tipoDoc,
          numDoc: usuario.numDoc,
        },
      },
    });
    // Sus sesiones, asignaciones a obra, tokens y solicitudes de perfil caen
    // en cascada (asi lo declara el esquema). Lo que firmo es texto y no se va.
    await tx.user.delete({ where: { id: userId } });
  });

  return { ok: true };
}

const NO_SIN_ADMIN =
  "No puedes dejar la empresa sin ningun administrador activo. Nombra otro administrador antes.";

/** ¿Es el unico ADMIN activo de la empresa, aparte de el mismo? */
async function esUltimoAdminActivo(
  companyId: string,
  exceptoUserId: string,
): Promise<boolean> {
  const otros = await prisma.user.count({
    where: {
      companyId,
      role: "ADMIN",
      estado: "ACTIVO",
      id: { not: exceptoUserId },
    },
  });
  return otros === 0;
}
