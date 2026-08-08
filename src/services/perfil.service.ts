import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import {
  validarPropuesta,
  type CambiosPropuestos,
  type PerfilActual,
  type PropuestaPerfil,
} from "@/lib/perfil";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Perfil de usuario, con flujo de solicitud y aprobacion.
 *
 * El `User` guarda desde el primer dia `tipoDoc`, `numDoc`, `celular` y
 * `cargo`, y ningun archivo los leia ni los escribia: se rellenaban en el
 * seed y ahi se quedaban. Aqui se abren, pero los datos de identidad no se
 * cambian libremente —son lo que queda escrito en los `aprobadaPor` de
 * ordenes y movimientos ya emitidos—, de ahi el flujo de solicitud.
 *
 * Regla de aislamiento: el `companyId` sale SIEMPRE de la sesion, nunca de
 * un parametro de la peticion.
 */

export class SinPermisoError extends Error {
  constructor(mensaje = "No tienes permiso para esta operacion.") {
    super(mensaje);
    this.name = "SinPermisoError";
  }
}

export type Resultado = { ok: true } | { ok: false; error: string };

export interface SolicitudPendiente {
  id: string;
  nombres: string | null;
  apellidos: string | null;
  cargo: string | null;
  tipoDoc: string | null;
  numDoc: string | null;
  motivo: string | null;
  createdAt: Date;
}

export interface Perfil {
  nombres: string;
  apellidos: string;
  cargo: string | null;
  tipoDoc: string;
  numDoc: string;
  celular: string | null;
  /// Foto de perfil como data URL, o null. Libre, sin aprobacion.
  fotoPerfil: string | null;
  /// Solo lectura: el correo es el identificador de acceso y no se edita.
  email: string;
  role: string;
  /// De la empresa, solo lectura.
  razonSocial: string;
  ruc: string;
  /// Su solicitud viva, si la hay.
  pendiente: SolicitudPendiente | null;
}

export async function obtenerPerfil(sesion: SesionActiva): Promise<Perfil | null> {
  const usuario = await prisma.user.findFirst({
    // companyId de la sesion: nadie alcanza el perfil de otra empresa.
    where: { id: sesion.userId, companyId: sesion.companyId },
    select: {
      nombres: true,
      apellidos: true,
      cargo: true,
      tipoDoc: true,
      numDoc: true,
      celular: true,
      fotoPerfil: true,
      email: true,
      role: true,
      company: { select: { razonSocial: true, ruc: true } },
    },
  });

  if (!usuario) return null;

  const pendiente = await prisma.solicitudCambioPerfil.findUnique({
    // `usuarioPendienteId` es unico y solo lo tiene la solicitud viva: es la
    // consulta directa a "su solicitud pendiente, si la hay".
    where: { usuarioPendienteId: sesion.userId },
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      cargo: true,
      tipoDoc: true,
      numDoc: true,
      motivo: true,
      createdAt: true,
    },
  });

  return {
    nombres: usuario.nombres,
    apellidos: usuario.apellidos,
    cargo: usuario.cargo,
    tipoDoc: usuario.tipoDoc,
    numDoc: usuario.numDoc,
    celular: usuario.celular,
    fotoPerfil: usuario.fotoPerfil,
    email: usuario.email,
    role: usuario.role,
    razonSocial: usuario.company.razonSocial,
    ruc: usuario.company.ruc,
    pendiente,
  };
}

/**
 * El unico campo libre. Se guarda directo, sin aprobacion.
 *
 * Vacio y ausente son lo mismo: el celular no es obligatorio.
 */
export async function guardarCelular(
  sesion: SesionActiva,
  celular: string,
): Promise<Resultado> {
  const limpio = celular.trim().slice(0, 30);
  const valor = limpio === "" ? null : limpio;

  const antes = await prisma.user.findFirst({
    where: { id: sesion.userId, companyId: sesion.companyId },
    select: { celular: true },
  });
  if (!antes) return { ok: false, error: "No se encontro el usuario." };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: sesion.userId },
      data: { celular: valor },
    });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "User",
        entidadId: sesion.userId,
        accion: "UPDATE",
        antes: { celular: antes.celular },
        despues: { celular: valor },
      },
    });
  });

  return { ok: true };
}

/**
 * Guarda o quita la foto de perfil. Libre, sin aprobacion, como el celular.
 *
 * `foto` es un data URL ya recortado y comprimido en el navegador, o null
 * para quitarla. Se valida que sea una imagen y que no exceda un tamano
 * razonable: el recorte del cliente deja avatares de pocas decenas de KB, asi
 * que un data URL muy grande solo puede venir de saltarse la interfaz.
 */
const MAX_FOTO = 700_000; // ~500 KB de imagen; el data URL base64 pesa ~1.33x

export async function guardarFotoPerfil(
  sesion: SesionActiva,
  foto: string | null,
): Promise<Resultado> {
  let valor: string | null = null;

  if (foto && foto.trim() !== "") {
    const limpio = foto.trim();
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(limpio)) {
      return { ok: false, error: "El archivo no es una imagen valida." };
    }
    if (limpio.length > MAX_FOTO) {
      return {
        ok: false,
        error: "La imagen es demasiado grande. Prueba con una mas pequena.",
      };
    }
    valor = limpio;
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: sesion.userId },
      data: { fotoPerfil: valor },
    });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "User",
        entidadId: sesion.userId,
        accion: "UPDATE",
        // No se guarda la imagen en la auditoria —seria enorme—: solo el hecho.
        despues: { fotoPerfil: valor === null ? "(quitada)" : "(actualizada)" },
      },
    });
  });

  return { ok: true };
}

/**
 * Pide un cambio de los datos controlados. Valida, rechaza si no cambia nada,
 * rechaza si ya hay una pendiente, y comprueba que el numDoc propuesto no sea
 * de otra persona de la empresa.
 */
export async function solicitarCambio(
  sesion: SesionActiva,
  propuesta: PropuestaPerfil,
  motivo?: string,
): Promise<Resultado> {
  const usuario = await prisma.user.findFirst({
    where: { id: sesion.userId, companyId: sesion.companyId },
    select: {
      nombres: true,
      apellidos: true,
      cargo: true,
      tipoDoc: true,
      numDoc: true,
    },
  });
  if (!usuario) return { ok: false, error: "No se encontro el usuario." };

  const actual: PerfilActual = {
    nombres: usuario.nombres,
    apellidos: usuario.apellidos,
    cargo: usuario.cargo,
    tipoDoc: usuario.tipoDoc,
    numDoc: usuario.numDoc,
  };

  const validacion = validarPropuesta(actual, propuesta);
  if (!validacion.ok) return { ok: false, error: validacion.error };
  const { cambios } = validacion;

  const yaHay = await prisma.solicitudCambioPerfil.findUnique({
    where: { usuarioPendienteId: sesion.userId },
    select: { id: true },
  });
  if (yaHay) {
    return {
      ok: false,
      error: "Ya tienes una solicitud pendiente. Retirala antes de pedir otra.",
    };
  }

  // El numDoc propuesto no puede ser de otro usuario de la empresa. Se
  // comprueba aqui para poder decir de QUIEN es; la clave unica lo cierra de
  // todos modos al aprobar.
  const numDocError = await conflictoDocumento(sesion, cambios.numDoc);
  if (numDocError) return { ok: false, error: numDocError };

  await prisma.$transaction(async (tx) => {
    await tx.solicitudCambioPerfil.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        usuarioPendienteId: sesion.userId,
        nombres: cambios.nombres ?? null,
        apellidos: cambios.apellidos ?? null,
        // La columna `cargo` guarda tres cosas con dos valores posibles, y hay
        // que distinguirlas: NULL = "no se cambia el cargo"; cadena vacia =
        // "se borra el cargo"; texto = "se pone ese cargo". Es el unico campo
        // controlado que se puede vaciar (nombres/apellidos no pueden quedar
        // vacios y el documento siempre lleva valor), asi que el centinela
        // solo hace falta aqui.
        cargo: "cargo" in cambios ? (cambios.cargo === null ? "" : cambios.cargo) : null,
        tipoDoc: cambios.tipoDoc ?? null,
        numDoc: cambios.numDoc ?? null,
        motivo: recortarMotivo(motivo),
      },
    });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "SolicitudCambioPerfil",
        entidadId: sesion.userId,
        accion: "CREATE",
        despues: cambios,
      },
    });
  });

  return { ok: true };
}

/** Retira la propia solicitud pendiente. Solo la propia, solo si esta viva. */
export async function cancelarSolicitud(
  sesion: SesionActiva,
  id: string,
): Promise<Resultado> {
  const solicitud = await prisma.solicitudCambioPerfil.findFirst({
    where: {
      id,
      userId: sesion.userId,
      companyId: sesion.companyId,
      estado: "PENDIENTE",
    },
    select: { id: true },
  });
  if (!solicitud) {
    return { ok: false, error: "No se encontro una solicitud pendiente tuya." };
  }

  // Se borra la fila entera: una solicitud que el propio usuario retira antes
  // de que nadie la vea no deja rastro util en la bandeja del admin. La
  // creacion y la retirada quedan en la auditoria.
  await prisma.$transaction(async (tx) => {
    await tx.solicitudCambioPerfil.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "SolicitudCambioPerfil",
        entidadId: sesion.userId,
        accion: "DELETE",
      },
    });
  });

  return { ok: true };
}

export interface SolicitudRevision {
  id: string;
  solicitanteId: string;
  solicitante: string;
  /// Antes y despues de cada campo que cambia, para que el admin decida.
  cambios: { campo: string; antes: string; despues: string }[];
  motivo: string | null;
  createdAt: Date;
}

/**
 * Cuantas solicitudes pendientes hay. Para el numerito del menu de Empresa.
 * Sin permiso, cero: quien no puede resolverlas tampoco las cuenta.
 */
export async function contarSolicitudesPendientes(
  sesion: SesionActiva,
): Promise<number> {
  if (!puede(sesion, "usuario:editar")) return 0;

  return prisma.solicitudCambioPerfil.count({
    where: { companyId: sesion.companyId, estado: "PENDIENTE" },
  });
}

/** La bandeja del ADMIN: solicitudes pendientes con su antes y despues. */
export async function listarSolicitudes(
  sesion: SesionActiva,
): Promise<SolicitudRevision[]> {
  if (!puede(sesion, "usuario:editar")) throw new SinPermisoError();

  const filas = await prisma.solicitudCambioPerfil.findMany({
    where: { companyId: sesion.companyId, estado: "PENDIENTE" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      nombres: true,
      apellidos: true,
      cargo: true,
      tipoDoc: true,
      numDoc: true,
      motivo: true,
      createdAt: true,
      user: {
        select: {
          nombres: true,
          apellidos: true,
          cargo: true,
          tipoDoc: true,
          numDoc: true,
        },
      },
    },
  });

  return filas.map((f) => {
    const cambios: SolicitudRevision["cambios"] = [];
    const anadir = (campo: string, antes: string | null, despues: string | null) => {
      // Solo los campos que la solicitud propone (no null en la fila).
      if (despues === null) return;
      // La cadena vacia es el centinela de "borrar" del cargo: se muestra como
      // "(vacio)", no como una cadena en blanco que pareceria un error.
      const valor = despues === "" ? "(vacio)" : despues;
      cambios.push({ campo, antes: antes ?? "(vacio)", despues: valor });
    };

    anadir("Nombres", f.user.nombres, f.nombres);
    anadir("Apellidos", f.user.apellidos, f.apellidos);
    anadir("Cargo", f.user.cargo, f.cargo);
    anadir("Tipo de documento", f.user.tipoDoc, f.tipoDoc);
    anadir("Numero de documento", f.user.numDoc, f.numDoc);

    return {
      id: f.id,
      solicitanteId: f.userId,
      solicitante: `${f.user.nombres} ${f.user.apellidos}`.trim(),
      cambios,
      motivo: f.motivo,
      createdAt: f.createdAt,
    };
  });
}

/**
 * Aprueba o rechaza una solicitud. Exige `usuario:editar`.
 *
 * Al aprobar, aplica los campos al `User` EN LA MISMA TRANSACCION, libera
 * `usuarioPendienteId` (marcando la solicitud como resuelta) y audita con
 * antes y despues. Un ADMIN puede aprobar su propia solicitud: CRIOCORD tiene
 * un unico administrador y prohibirlo dejaria su solicitud atascada para
 * siempre. La auditoria deja constancia de que solicitante y aprobador
 * coinciden.
 */
export async function resolverSolicitud(
  sesion: SesionActiva,
  id: string,
  decision: { aprobar: boolean; motivoRechazo?: string },
): Promise<Resultado> {
  if (!puede(sesion, "usuario:editar")) throw new SinPermisoError();

  const solicitud = await prisma.solicitudCambioPerfil.findFirst({
    where: { id, companyId: sesion.companyId, estado: "PENDIENTE" },
    select: {
      id: true,
      userId: true,
      nombres: true,
      apellidos: true,
      cargo: true,
      tipoDoc: true,
      numDoc: true,
    },
  });
  if (!solicitud) {
    return { ok: false, error: "No se encontro una solicitud pendiente." };
  }

  const aprobador = `${sesion.nombres} ${sesion.apellidos}`.trim();

  if (!decision.aprobar) {
    const motivo = (decision.motivoRechazo ?? "").trim();
    if (!motivo) {
      // Rechazar exige motivo, igual que anular una orden: quien pidio el
      // cambio tiene que saber por que se le niega.
      return { ok: false, error: "Indica el motivo del rechazo." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.solicitudCambioPerfil.update({
        where: { id },
        data: {
          estado: "RECHAZADA",
          resueltaAt: new Date(),
          resueltaPor: aprobador,
          motivoRechazo: motivo.slice(0, 2000),
          // Libera el hueco: el usuario puede volver a solicitar.
          usuarioPendienteId: null,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          entidad: "SolicitudCambioPerfil",
          entidadId: solicitud.userId,
          accion: "UPDATE",
          despues: { estado: "RECHAZADA", motivoRechazo: motivo },
        },
      });
    });

    return { ok: true };
  }

  // Aprobar: aplicar los campos propuestos (no null) al usuario.
  const cambios: CambiosPropuestos = {};
  if (solicitud.nombres !== null) cambios.nombres = solicitud.nombres;
  if (solicitud.apellidos !== null) cambios.apellidos = solicitud.apellidos;
  if (solicitud.tipoDoc !== null) cambios.tipoDoc = solicitud.tipoDoc;
  if (solicitud.numDoc !== null) cambios.numDoc = solicitud.numDoc;
  // cargo: NULL en la columna = sin cambio; cadena vacia = borrar; texto =
  // poner. El centinela se traduce de vuelta a null solo al aplicarlo.
  if (solicitud.cargo !== null) {
    cambios.cargo = solicitud.cargo === "" ? null : solicitud.cargo;
  }

  // El numDoc se vuelve a comprobar AL APROBAR, no solo al solicitar: entre
  // una cosa y otra pueden pasar dias y otro usuario puede haberse quedado con
  // ese numero. La clave unica lo rechazaria igual, pero con un error crudo.
  if (solicitud.numDoc !== null) {
    const conflicto = await conflictoDocumento(
      sesion,
      solicitud.numDoc,
      solicitud.userId,
    );
    if (conflicto) return { ok: false, error: conflicto };
  }

  const antes = await prisma.user.findUnique({
    where: { id: solicitud.userId },
    select: {
      nombres: true,
      apellidos: true,
      cargo: true,
      tipoDoc: true,
      numDoc: true,
    },
  });
  if (!antes) return { ok: false, error: "El usuario ya no existe." };

  // El `data` del update se arma con tipos estrictos: nombres, apellidos,
  // tipoDoc y numDoc son columnas NOT NULL y solo entran cuando la solicitud
  // los propone; el cargo es el unico que admite null (borrarlo). Pasar
  // `cambios` tal cual no compila porque su tipo permite null en todos.
  const datosUsuario: {
    nombres?: string;
    apellidos?: string;
    cargo?: string | null;
    tipoDoc?: string;
    numDoc?: string;
  } = {};
  if (cambios.nombres != null) datosUsuario.nombres = cambios.nombres;
  if (cambios.apellidos != null) datosUsuario.apellidos = cambios.apellidos;
  if (cambios.tipoDoc != null) datosUsuario.tipoDoc = cambios.tipoDoc;
  if (cambios.numDoc != null) datosUsuario.numDoc = cambios.numDoc;
  if ("cargo" in cambios) datosUsuario.cargo = cambios.cargo ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: solicitud.userId },
      data: datosUsuario,
    });
    await tx.solicitudCambioPerfil.update({
      where: { id },
      data: {
        estado: "APROBADA",
        resueltaAt: new Date(),
        resueltaPor: aprobador,
        usuarioPendienteId: null,
      },
    });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "User",
        entidadId: solicitud.userId,
        accion: "UPDATE",
        antes,
        despues: {
          ...datosUsuario,
          _aprobadaPor: aprobador,
          _autoAprobada: sesion.userId === solicitud.userId,
        },
      },
    });
  });

  return { ok: true };
}

/**
 * Devuelve un mensaje si el numDoc ya es de otro usuario ACTIVO o no de la
 * empresa, o null si esta libre. `exceptoUserId` excluye al propio solicitante
 * (su documento actual puede coincidir con el propuesto si solo cambia el tipo).
 */
async function conflictoDocumento(
  sesion: SesionActiva,
  numDoc: string | null | undefined,
  exceptoUserId?: string,
): Promise<string | null> {
  if (!numDoc) return null;

  const otro = await prisma.user.findFirst({
    where: {
      companyId: sesion.companyId,
      numDoc,
      id: { not: exceptoUserId ?? sesion.userId },
    },
    select: { nombres: true, apellidos: true },
  });

  if (!otro) return null;

  return `Ese documento ya es de ${`${otro.nombres} ${otro.apellidos}`.trim()}.`;
}

/** El motivo libre del formulario, recortado. Vive junto a la solicitud. */
function recortarMotivo(motivo: string | undefined): string | null {
  const limpio = (motivo ?? "").trim();
  return limpio === "" ? null : limpio.slice(0, 2000);
}
