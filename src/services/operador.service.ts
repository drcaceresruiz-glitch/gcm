import "server-only";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { generateTemporaryPassword } from "@/lib/tokens";
import { validarAltaUsuario, type DatosAltaUsuario } from "@/lib/usuarios";
import {
  validarAltaEmpresa,
  CORREO_NO_DISPONIBLE,
  type DatosAltaEmpresa,
} from "@/lib/empresas";
import { enviarCorreo, correoBienvenida } from "@/services/mailer.service";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Dar de alta constructoras clientes. El area del operador de GCM.
 *
 * Es el UNICO sitio de todo el sistema que crea un usuario con un `companyId`
 * que no viene de la sesion. Por eso vive aparte de `usuarios.service`, cuya
 * regla —el companyId sale SIEMPRE de la sesion— es la garantia mas
 * importante del producto y no se toca ni para esto.
 *
 * Lo que el operador PUEDE: crear una constructora con su primer ADMIN, verlas
 * listadas por metadatos, y suspenderlas o reactivarlas.
 *
 * Lo que NO PUEDE, por decision expresa: entrar en los datos de un cliente.
 * No hay aqui ninguna funcion que lea obras, presupuestos, ordenes ni usuarios
 * de otra empresa, y `listarConstructoras` esta acotada a proposito a
 * contadores. El aislamiento por `companyId` no tiene excepciones.
 */

export type MotivoAlta =
  | "no_autorizado"
  | "datos_invalidos"
  | "ruc_duplicado"
  | "correo_no_disponible"
  | "fallo";

export type ResultadoAlta =
  | {
      ok: true;
      empresaId: string;
      /// Se devuelve para ensenarla UNA vez en pantalla, como en `crearUsuario`.
      claveTemporal: string;
      correoEnviado: boolean;
    }
  | { ok: false; motivo: MotivoAlta; error: string };

export interface DatosAltaConstructora {
  empresa: DatosAltaEmpresa;
  /// El rol NO viaja: se fuerza a ADMIN. Ver `altaConstructora`.
  admin: Omit<DatosAltaUsuario, "role">;
}

/**
 * Da de alta una constructora con su primer administrador.
 *
 * Empresa y usuario nacen en la MISMA transaccion, y eso no es un detalle de
 * estilo: si la empresa se creara y el usuario no, quedaria una constructora
 * sin ningun ADMIN, inaccesible para siempre y ni siquiera borrable desde la
 * aplicacion (`User.companyId` es `onDelete: Restrict`).
 */
export async function altaConstructora(
  sesion: SesionActiva,
  datos: DatosAltaConstructora,
): Promise<ResultadoAlta> {
  if (!sesion.esOperador) {
    return {
      ok: false,
      motivo: "no_autorizado",
      error: "Esta pantalla es solo para quien opera GCM.",
    };
  }

  const empresa = validarAltaEmpresa(datos.empresa);
  if (!empresa.ok) {
    return { ok: false, motivo: "datos_invalidos", error: empresa.error };
  }

  // El primer usuario SIEMPRE es ADMIN y el formulario no lo pregunta: una
  // constructora cuyo unico usuario fuera CONSULTOR naceria muerta, sin nadie
  // que pudiera crear obras ni dar de alta a nadie mas.
  const admin = validarAltaUsuario({ ...datos.admin, role: "ADMIN" });
  if (!admin.ok) {
    return { ok: false, motivo: "datos_invalidos", error: admin.error };
  }

  // El hash va FUERA de la transaccion: scrypt es lento a proposito y no debe
  // tener una transaccion abierta esperandolo.
  const claveTemporal = generateTemporaryPassword();
  const passwordHash = await hashPassword(claveTemporal);

  let empresaId: string;
  try {
    empresaId = await prisma.$transaction(async (tx) => {
      const nueva = await tx.company.create({
        data: {
          razonSocial: empresa.datos.razonSocial,
          ruc: empresa.datos.ruc,
          direccion: empresa.datos.direccion,
          telefono: empresa.datos.telefono,
          email: empresa.datos.email,
        },
        select: { id: true },
      });

      const usuario = await tx.user.create({
        data: {
          companyId: nueva.id,
          nombres: admin.datos.nombres,
          apellidos: admin.datos.apellidos,
          email: admin.datos.email,
          tipoDoc: admin.datos.tipoDoc,
          numDoc: admin.datos.numDoc,
          cargo: admin.datos.cargo,
          celular: admin.datos.celular,
          role: "ADMIN",
          passwordHash,
          mustChangePassword: true,
        },
        select: { id: true },
      });

      // Dos apuntes, uno en cada empresa. El del cliente para que vea en su
      // propia auditoria como nacio; el del operador es su bitacora comercial
      // de altas, y le deja registro de sus clientes sin leer nada suyo.
      // Funciona porque `AuditLog.companyId` no tiene clave foranea.
      await tx.auditLog.createMany({
        data: [
          {
            companyId: nueva.id,
            userId: sesion.userId,
            entidad: "Company",
            entidadId: nueva.id,
            accion: "CREATE",
            despues: { razonSocial: empresa.datos.razonSocial, admin: usuario.id },
          },
          {
            companyId: sesion.companyId,
            userId: sesion.userId,
            entidad: "Company",
            entidadId: nueva.id,
            accion: "CREATE",
            despues: {
              evento: "alta_constructora",
              razonSocial: empresa.datos.razonSocial,
              ruc: empresa.datos.ruc,
            },
          },
        ],
      });

      return nueva.id;
    });
  } catch (e) {
    return falloDeAlta(e);
  }

  // El correo va fuera de la transaccion y es best-effort: si el SMTP esta
  // caido el alta NO se pierde, y la clave se ensena en pantalla.
  const { enviado } = await enviarCorreo({
    para: admin.datos.email,
    ...correoBienvenida({
      nombre: admin.datos.nombres,
      email: admin.datos.email,
      claveTemporal,
    }),
  });

  return { ok: true, empresaId, claveTemporal, correoEnviado: enviado };
}

/**
 * Traduce el choque de unicidad de la base.
 *
 * Se mira el error de la base y NO se consulta antes si el RUC o el correo
 * existen: una comprobacion previa deja una ventana de carrera y, peor,
 * convierte el formulario en un oraculo que se puede interrogar tecleando
 * correos hasta acertar.
 *
 * RUC y correo se tratan distinto A PROPOSITO. El RUC es dato publico de
 * SUNAT y se puede decir claro. El correo no: decir "ya existe" confirmaria
 * que esa persona es cliente de GCM, que es informacion de un tercero.
 */
function falloDeAlta(e: unknown): ResultadoAlta {
  const codigo =
    typeof e === "object" && e !== null && "code" in e
      ? String((e as { code: unknown }).code)
      : "";

  if (codigo === "P2002") {
    const destino =
      typeof e === "object" && e !== null && "meta" in e
        ? JSON.stringify((e as { meta: unknown }).meta ?? "")
        : "";

    if (destino.includes("ruc")) {
      return {
        ok: false,
        motivo: "ruc_duplicado",
        error: "Ya existe una constructora con ese RUC.",
      };
    }
    if (destino.includes("email")) {
      return {
        ok: false,
        motivo: "correo_no_disponible",
        error: CORREO_NO_DISPONIBLE,
      };
    }
  }

  return {
    ok: false,
    motivo: "fallo",
    error: "No se pudo dar de alta la constructora. Vuelve a intentarlo.",
  };
}

export interface ConstructoraResumen {
  id: string;
  razonSocial: string;
  ruc: string;
  activa: boolean;
  createdAt: Date;
  usuarios: number;
  obras: number;
  /// La del propio operador: no se puede suspender.
  esLaPropia: boolean;
}

/**
 * Las constructoras, en metadatos.
 *
 * OJO: es la UNICA consulta del sistema que no filtra por `companyId`, y por
 * eso el `select` es explicito y se queda en contadores. No anadir aqui nada
 * que asome el contenido de un cliente —ni un nombre de obra, ni un importe—:
 * el operador no entra en sus datos, y esta funcion es la puerta por la que
 * se colaria si alguien "solo anade un campito".
 */
export async function listarConstructoras(
  sesion: SesionActiva,
): Promise<ConstructoraResumen[]> {
  if (!sesion.esOperador) return [];

  const empresas = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      razonSocial: true,
      ruc: true,
      activa: true,
      createdAt: true,
      _count: { select: { users: true, projects: true } },
    },
  });

  return empresas.map((e) => ({
    id: e.id,
    razonSocial: e.razonSocial,
    ruc: e.ruc,
    activa: e.activa,
    createdAt: e.createdAt,
    usuarios: e._count.users,
    obras: e._count.projects,
    esLaPropia: e.id === sesion.companyId,
  }));
}

export interface ConstructoraDetalle extends ConstructoraResumen {
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  /// Congelada por una migracion en curso. No es lo mismo que suspendida, y la
  /// ficha las ensena por separado porque se arreglan de forma distinta.
  enMigracionAt: Date | null;
}

/**
 * Una constructora por dentro… hasta donde llega el operador.
 *
 * SIGUE SIN ENTRAR EN SUS DATOS: aqui hay identificacion, contacto y
 * contadores, y ni un nombre de obra ni un usuario con nombre y apellido. La
 * regla de `listarConstructoras` vale igual con un `id` delante, y es
 * exactamente aqui donde alguien la romperia "solo para ver quien es el
 * admin".
 */
export async function detalleConstructora(
  sesion: SesionActiva,
  empresaId: string,
): Promise<ConstructoraDetalle | null> {
  if (!sesion.esOperador) return null;

  const e = await prisma.company.findUnique({
    where: { id: empresaId },
    select: {
      id: true,
      razonSocial: true,
      ruc: true,
      direccion: true,
      telefono: true,
      email: true,
      activa: true,
      enMigracionAt: true,
      createdAt: true,
      _count: { select: { users: true, projects: true } },
    },
  });
  if (!e) return null;

  return {
    id: e.id,
    razonSocial: e.razonSocial,
    ruc: e.ruc,
    direccion: e.direccion,
    telefono: e.telefono,
    email: e.email,
    activa: e.activa,
    enMigracionAt: e.enMigracionAt,
    createdAt: e.createdAt,
    usuarios: e._count.users,
    obras: e._count.projects,
    esLaPropia: e.id === sesion.companyId,
  };
}

export type ResultadoEdicion = { ok: true } | { ok: false; error: string };

/**
 * Corrige los datos de una constructora desde el area del operador.
 *
 * POR QUE EXISTE, si la empresa ya edita lo suyo en `/empresa`: cuando un alta
 * se teclea mal —un RUC cambiado, la razon social a medias— el cliente puede
 * quedarse sin poder arreglarlo, y hasta hoy la unica salida era borrarla y
 * volver a crearla, que ni siquiera es posible. Es un arreglo de operador, no
 * una via para administrar al cliente.
 *
 * Valida con `validarAltaEmpresa` a proposito: son los mismos cinco campos con
 * los mismos limites, y tener dos validaciones distintas para la misma fila es
 * como se llega a que el alta rechace lo que la edicion acepta.
 *
 * NO se toca una empresa congelada: si hay una migracion en curso, sus datos
 * estan viajando a otra instalacion y cambiarlos a media exportacion deja las
 * dos copias diciendo cosas distintas.
 */
export async function editarConstructora(
  sesion: SesionActiva,
  empresaId: string,
  datos: DatosAltaEmpresa,
): Promise<ResultadoEdicion> {
  if (!sesion.esOperador) {
    return { ok: false, error: "Esta accion es solo para quien opera GCM." };
  }

  const validacion = validarAltaEmpresa(datos);
  if (!validacion.ok) return { ok: false, error: validacion.error };

  const antes = await prisma.company.findUnique({
    where: { id: empresaId },
    select: {
      razonSocial: true,
      ruc: true,
      direccion: true,
      telefono: true,
      email: true,
      enMigracionAt: true,
    },
  });
  if (!antes) return { ok: false, error: "Constructora no encontrada." };

  if (antes.enMigracionAt !== null) {
    return {
      ok: false,
      error:
        "Esa constructora esta congelada por una migracion. Terminala o descongelala antes de editarla.",
    };
  }

  const d = validacion.datos;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id: empresaId }, data: d });

      // La auditoria guarda el ANTES y el DESPUES: corregir un RUC es tocar
      // como se identifica a una empresa en documentos ya emitidos, y sin el
      // valor anterior nadie podria reconstruir a que apuntaban.
      await tx.auditLog.create({
        data: {
          companyId: empresaId,
          userId: sesion.userId,
          entidad: "Company",
          entidadId: empresaId,
          accion: "UPDATE",
          antes: {
            razonSocial: antes.razonSocial,
            ruc: antes.ruc,
            direccion: antes.direccion ?? "",
            telefono: antes.telefono ?? "",
            email: antes.email ?? "",
          },
          despues: {
            evento: "editar_constructora",
            razonSocial: d.razonSocial,
            ruc: d.ruc,
            direccion: d.direccion ?? "",
            telefono: d.telefono ?? "",
            email: d.email ?? "",
          },
        },
      });
    });
  } catch (e) {
    // El RUC es unico en TODO GCM. Se dice claro —es un dato publico de SUNAT—
    // igual que en el alta, y se lee el codigo de la base con la misma forma
    // que `falloDeAlta` para no arrastrar aqui el espacio de nombres de Prisma.
    const codigo =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code: unknown }).code)
        : "";
    if (codigo === "P2002") {
      return { ok: false, error: "Ya existe otra constructora con ese RUC." };
    }
    return { ok: false, error: "No se pudo guardar. Vuelve a intentarlo." };
  }

  return { ok: true };
}

export type ResultadoSuspension = { ok: true } | { ok: false; error: string };

/**
 * Suspende o reactiva a un cliente.
 *
 * Nunca sobre la empresa propia: el operador se cerraria la puerta. Es la
 * tercera red, ademas del salto del bloqueo en el login y en la sesion; son
 * fallos de distinta clase y conviene que las tres existan.
 */
export async function alternarConstructora(
  sesion: SesionActiva,
  empresaId: string,
  activa: boolean,
): Promise<ResultadoSuspension> {
  if (!sesion.esOperador) {
    return { ok: false, error: "Esta accion es solo para quien opera GCM." };
  }
  if (empresaId === sesion.companyId) {
    return { ok: false, error: "No puedes suspender tu propia empresa." };
  }

  const empresa = await prisma.company.findUnique({
    where: { id: empresaId },
    select: { id: true, razonSocial: true },
  });
  if (!empresa) return { ok: false, error: "Constructora no encontrada." };

  await prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: empresaId }, data: { activa } });

    await tx.auditLog.createMany({
      data: [
        {
          companyId: empresaId,
          userId: sesion.userId,
          entidad: "Company",
          entidadId: empresaId,
          accion: "UPDATE",
          despues: { activa: String(activa) },
        },
        {
          companyId: sesion.companyId,
          userId: sesion.userId,
          entidad: "Company",
          entidadId: empresaId,
          accion: "UPDATE",
          despues: {
            evento: activa ? "reactivar_constructora" : "suspender_constructora",
            razonSocial: empresa.razonSocial,
          },
        },
      ],
    });
  });

  return { ok: true };
}
