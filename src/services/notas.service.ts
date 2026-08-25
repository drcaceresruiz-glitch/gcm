import "server-only";

import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { esVencida } from "@/lib/notas";
import { env } from "@/lib/env";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";
import type { CategoriaNota } from "@/generated/prisma/enums";
import { filtroDeObras } from "@/lib/alcance-obras";

/**
 * La bitacora libre de la obra: notas con, como mucho, una fecha en la que
 * alguien quiere que se las recuerden.
 *
 * NO es el sitio para explicar por que una tarea esta bloqueada: eso es una
 * Restriccion del Lookahead, que tiene tipo cerrado, responsable y fecha de
 * COMPROMISO. Una Nota no compromete a nadie.
 */

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export interface AdjuntoResumen {
  id: string;
  nombreOriginal: string;
  mimeType: string;
  tamano: number;
  subidaPor: string;
  createdAt: Date;
}

export interface NotaResumen {
  id: string;
  categoria: CategoriaNota;
  titulo: string;
  cuerpo: string;
  fechaRecordatorio: Date | null;
  atendida: boolean;
  atendidaAt: Date | null;
  atendidaPor: string | null;
  vencida: boolean;
  creadoPor: string;
  createdAt: Date;
  updatedAt: Date;
  adjuntos: AdjuntoResumen[];
}

/** Todas las notas de la obra, mas nuevas primero. La pantalla las ordena. */
export async function listarNotas(
  sesion: SesionActiva,
  obraId: string,
): Promise<NotaResumen[] | null> {
  if (!puede(sesion, "nota:leer")) return null;

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return null;

  const ahora = new Date();

  const filas = await prisma.nota.findMany({
    where: { projectId: obraId, companyId: sesion.companyId },
    orderBy: { createdAt: "desc" },
    include: { adjuntos: { orderBy: { createdAt: "asc" } } },
  });

  return filas.map((n) => ({
    id: n.id,
    categoria: n.categoria,
    titulo: n.titulo,
    cuerpo: n.cuerpo,
    fechaRecordatorio: n.fechaRecordatorio,
    atendida: n.atendida,
    atendidaAt: n.atendidaAt,
    atendidaPor: n.atendidaPor,
    vencida: esVencida(n, ahora),
    creadoPor: n.creadoPor,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    adjuntos: n.adjuntos.map((a) => ({
      id: a.id,
      nombreOriginal: a.nombreOriginal,
      mimeType: a.mimeType,
      tamano: a.tamano,
      subidaPor: a.subidaPor,
      createdAt: a.createdAt,
    })),
  }));
}

export interface RecordatorioNota {
  id: string;
  titulo: string;
  categoria: CategoriaNota;
  fechaRecordatorio: Date;
  vencida: boolean;
}

/**
 * Alimenta SOLO el widget de "proximos recordatorios" del tablero: notas
 * pendientes CON fecha, vencidas primero y despues por fecha mas proxima.
 *
 * Devuelve `null` sin `nota:leer`, y no una lista vacia: son cosas distintas.
 * Una lista vacia dice "al dia, sin nada pendiente"; `null` dice "no puedes
 * ver esto". Confundirlas pintaria en verde un "sin recordatorios" a quien en
 * realidad no tiene permiso para verlos.
 */
export async function recordatoriosDeObra(
  sesion: SesionActiva,
  obraId: string,
  limite = 5,
): Promise<RecordatorioNota[] | null> {
  if (!puede(sesion, "nota:leer")) return null;

  const ahora = new Date();

  const filas = await prisma.nota.findMany({
    where: {
      projectId: obraId,
      companyId: sesion.companyId,
      atendida: false,
      fechaRecordatorio: { not: null },
    },
    orderBy: { fechaRecordatorio: "asc" },
    take: limite,
    select: { id: true, titulo: true, categoria: true, fechaRecordatorio: true },
  });

  return filas
    .map((n) => ({
      id: n.id,
      titulo: n.titulo,
      categoria: n.categoria,
      // No-null: se filtro arriba. TypeScript no lo sabe desde el `where`.
      fechaRecordatorio: n.fechaRecordatorio as Date,
      vencida: esVencida(
        { atendida: false, fechaRecordatorio: n.fechaRecordatorio },
        ahora,
      ),
    }))
    .sort((a, b) => {
      // Vencidas primero, y dentro de cada grupo por fecha mas proxima —que
      // ya es el orden que trae la consulta, así que solo hace falta separar
      // los dos grupos sin romper ese orden interno.
      if (a.vencida !== b.vencida) return a.vencida ? -1 : 1;
      return 0;
    });
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export type ResultadoNota =
  | { ok: true; id: string }
  | { ok: false; error: string };

export interface DatosNota {
  categoria: CategoriaNota;
  titulo: string;
  cuerpo: string;
  /// "YYYY-MM-DD", o vacio/undefined para nota sin recordatorio.
  fechaRecordatorio?: string;
}

function validar(datos: DatosNota): string | null {
  if (!datos.titulo.trim()) return "La nota necesita un titulo.";
  if (datos.titulo.trim().length > 150) {
    return "El titulo no puede pasar de 150 caracteres.";
  }
  if (!datos.cuerpo.trim()) return "La nota necesita contenido.";
  return null;
}

/** Crea una nota. Requiere `nota:crear`. */
export async function crearNota(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosNota,
): Promise<ResultadoNota> {
  if (!puede(sesion, "nota:crear")) {
    return { ok: false, error: "No tienes permiso para escribir notas." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const problema = validar(datos);
  if (problema) return { ok: false, error: problema };

  // `motivoSiObraCerrada` responde null tanto si la obra esta abierta como
  // si no existe o es de otra empresa —no distingue los tres casos—, asi que
  // no basta por si sola para saber que `obraId` es un projectId valido de
  // ESTA empresa. Sin esta comprobacion, una nota podria crearse con
  // `companyId` de una empresa y `projectId` de otra: la fila no aparece en
  // ninguna pantalla normal pero queda ahi, la misma clase de fallo que
  // `crearEncargo` ya evita comprobando la obra aparte.
  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  try {
    const id = await prisma.$transaction(async (tx) => {
      const nota = await tx.nota.create({
        data: {
          companyId: sesion.companyId,
          projectId: obraId,
          categoria: datos.categoria,
          titulo: datos.titulo.trim(),
          cuerpo: datos.cuerpo.trim(),
          fechaRecordatorio: datos.fechaRecordatorio
            ? new Date(`${datos.fechaRecordatorio}T00:00:00Z`)
            : null,
          creadoPor: quien(sesion),
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: obraId,
          entidad: "Nota",
          entidadId: nota.id.slice(0, 40),
          accion: "CREATE",
          despues: {
            categoria: datos.categoria,
            titulo: datos.titulo,
            fechaRecordatorio: datos.fechaRecordatorio ?? null,
          },
        },
      });

      return nota.id;
    });

    return { ok: true, id };
  } catch {
    return {
      ok: false,
      error: "No se pudo guardar la nota. Vuelve a intentarlo en unos segundos.",
    };
  }
}

/** Reescribe una nota existente. Requiere `nota:gestionar`. */
export async function editarNota(
  sesion: SesionActiva,
  obraId: string,
  notaId: string,
  datos: DatosNota,
): Promise<ResultadoNota> {
  if (!puede(sesion, "nota:gestionar")) {
    return { ok: false, error: "No tienes permiso para corregir notas." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const problema = validar(datos);
  if (problema) return { ok: false, error: problema };

  const existente = await prisma.nota.findFirst({
    where: { id: notaId, projectId: obraId, companyId: sesion.companyId },
    select: {
      id: true,
      categoria: true,
      titulo: true,
      cuerpo: true,
      fechaRecordatorio: true,
    },
  });
  if (!existente) return { ok: false, error: "Nota no encontrada." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.nota.update({
        where: { id: notaId },
        data: {
          categoria: datos.categoria,
          titulo: datos.titulo.trim(),
          cuerpo: datos.cuerpo.trim(),
          fechaRecordatorio: datos.fechaRecordatorio
            ? new Date(`${datos.fechaRecordatorio}T00:00:00Z`)
            : null,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: obraId,
          entidad: "Nota",
          entidadId: notaId.slice(0, 40),
          accion: "UPDATE",
          antes: {
            categoria: existente.categoria,
            titulo: existente.titulo,
            cuerpo: existente.cuerpo,
            fechaRecordatorio: existente.fechaRecordatorio?.toISOString() ?? null,
          },
          despues: {
            categoria: datos.categoria,
            titulo: datos.titulo,
            fechaRecordatorio: datos.fechaRecordatorio ?? null,
          },
        },
      });
    });

    return { ok: true, id: notaId };
  } catch {
    return {
      ok: false,
      error: "No se pudo guardar la nota. Vuelve a intentarlo en unos segundos.",
    };
  }
}

/**
 * Marca una nota como atendida, o la reabre. Requiere `nota:crear`: es un
 * acto reversible de campo, igual que escribirla — no reescribe ni destruye
 * el texto de nadie.
 */
export async function alternarAtendida(
  sesion: SesionActiva,
  obraId: string,
  notaId: string,
  atendida: boolean,
): Promise<ResultadoNota> {
  if (!puede(sesion, "nota:crear")) {
    return { ok: false, error: "No tienes permiso para atender notas." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const { count } = await prisma.nota.updateMany({
    where: { id: notaId, projectId: obraId, companyId: sesion.companyId },
    data: {
      atendida,
      atendidaAt: atendida ? new Date() : null,
      atendidaPor: atendida ? quien(sesion) : null,
    },
  });
  if (count === 0) return { ok: false, error: "Nota no encontrada." };

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "Nota",
      entidadId: notaId.slice(0, 40),
      accion: "UPDATE",
      despues: { atendida },
    },
  });

  return { ok: true, id: notaId };
}

/** Borra una nota. Requiere `nota:gestionar`. El unico rastro que queda es AuditLog. */
export async function eliminarNota(
  sesion: SesionActiva,
  obraId: string,
  notaId: string,
): Promise<ResultadoNota> {
  if (!puede(sesion, "nota:gestionar")) {
    return { ok: false, error: "No tienes permiso para borrar notas." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const existente = await prisma.nota.findFirst({
    where: { id: notaId, projectId: obraId, companyId: sesion.companyId },
  });
  if (!existente) return { ok: false, error: "Nota no encontrada." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.nota.delete({ where: { id: notaId } });

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: obraId,
          entidad: "Nota",
          entidadId: notaId.slice(0, 40),
          accion: "DELETE",
          antes: {
            categoria: existente.categoria,
            titulo: existente.titulo,
            cuerpo: existente.cuerpo,
            fechaRecordatorio: existente.fechaRecordatorio?.toISOString() ?? null,
            atendida: existente.atendida,
            creadoPor: existente.creadoPor,
          },
        },
      });
    });

    return { ok: true, id: notaId };
  } catch {
    return {
      ok: false,
      error: "No se pudo borrar la nota. Vuelve a intentarlo en unos segundos.",
    };
  }
}

// ---------------------------------------------------------------------------
// Adjuntos
// ---------------------------------------------------------------------------

/**
 * El archivo fisico vive en STORAGE_ROOT, FUERA del arbol de la app —mismo
 * motivo que `evidencia.service.ts`: un despliegue extrae un paquete encima
 * y con un swap atomico, y eso jamas puede llevarse un adjunto por delante—.
 */
function raizAlmacen(): string {
  return resolve(env.STORAGE_ROOT);
}

/// 10 MB: un adjunto de Nota suele ser un documento (contrato, factura
/// escaneada), no una foto ya comprimida por el navegador como en
/// evidencia -de ahi el tope mas alto que sus 5 MB-.
export const TAMANO_MAXIMO_ADJUNTO = 10 * 1024 * 1024;

const MIMES_PERMITIDOS_NOTA = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"],
]);

export type ResultadoAdjunto =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Sube un adjunto a una nota ya existente. Requiere `nota:gestionar`: es la
 * misma puerta que editar el texto, no una aparte —adjuntar un archivo es
 * otra forma de corregir la nota, no un acto distinto.
 */
export async function subirAdjuntoNota(
  sesion: SesionActiva,
  obraId: string,
  notaId: string,
  archivo: File,
): Promise<ResultadoAdjunto> {
  if (!puede(sesion, "nota:gestionar")) {
    return { ok: false, error: "No tienes permiso para adjuntar archivos a una nota." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const nota = await prisma.nota.findFirst({
    where: { id: notaId, projectId: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!nota) return { ok: false, error: "Nota no encontrada." };

  const extension = MIMES_PERMITIDOS_NOTA.get(archivo.type);
  if (!extension) {
    return {
      ok: false,
      error: "Solo se aceptan imágenes (JPG, PNG, WebP) o PDF.",
    };
  }
  if (archivo.size === 0) {
    return { ok: false, error: "El archivo llegó vacío." };
  }
  if (archivo.size > TAMANO_MAXIMO_ADJUNTO) {
    return { ok: false, error: "El archivo supera los 10 MB." };
  }

  const contenido = Buffer.from(await archivo.arrayBuffer());

  // Primero el registro (para tener el id que nombra al archivo), despues el
  // archivo, y si el disco falla se borra el registro: mismo orden que
  // `guardarFoto` en evidencia.service.ts, por el mismo motivo.
  const adjunto = await prisma.adjuntoNota.create({
    data: {
      notaId,
      projectId: obraId,
      ruta: "",
      nombreOriginal: archivo.name.slice(0, 255) || `adjunto${extension}`,
      mimeType: archivo.type,
      tamano: archivo.size,
      subidaPor: quien(sesion),
    },
  });

  const rutaRelativa = join("notas", obraId, `${adjunto.id}${extension}`);
  const rutaAbsoluta = join(raizAlmacen(), rutaRelativa);

  try {
    await fs.mkdir(join(raizAlmacen(), "notas", obraId), { recursive: true });
    await fs.writeFile(rutaAbsoluta, contenido);
    await prisma.adjuntoNota.update({
      where: { id: adjunto.id },
      data: { ruta: rutaRelativa.replaceAll("\\", "/") },
    });
  } catch (e) {
    await prisma.adjuntoNota.delete({ where: { id: adjunto.id } });
    console.error("[notas] No se pudo guardar el adjunto:", e);
    return {
      ok: false,
      error: "No se pudo guardar el archivo en el servidor. Inténtalo de nuevo.",
    };
  }

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "AdjuntoNota",
      entidadId: adjunto.id.slice(0, 40),
      accion: "CREATE",
      despues: {
        notaId,
        nombreOriginal: archivo.name,
        tamano: archivo.size,
      },
    },
  });

  return { ok: true, id: adjunto.id };
}

/**
 * Borra un adjunto —registro Y archivo—. Requiere `nota:gestionar`.
 *
 * A diferencia de una foto de evidencia, un adjunto de Nota no es prueba de
 * auditoria inmutable: no hay purga que lo conserve marcado, se va del disco
 * de verdad. El `AuditLog` es el unico rastro que queda.
 */
export async function eliminarAdjuntoNota(
  sesion: SesionActiva,
  obraId: string,
  adjuntoId: string,
): Promise<ResultadoAdjunto> {
  if (!puede(sesion, "nota:gestionar")) {
    return { ok: false, error: "No tienes permiso para borrar adjuntos." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const adjunto = await prisma.adjuntoNota.findFirst({
    where: { id: adjuntoId, projectId: obraId },
    select: { id: true, notaId: true, ruta: true, nombreOriginal: true },
  });
  if (!adjunto) return { ok: false, error: "Adjunto no encontrado." };

  await prisma.adjuntoNota.delete({ where: { id: adjuntoId } });

  if (adjunto.ruta) {
    try {
      await fs.unlink(join(raizAlmacen(), adjunto.ruta));
    } catch (e) {
      // El registro ya se borro: un archivo huerfano en disco no rompe nada
      // que la aplicacion vuelva a mirar, y queda en el log para limpiarlo
      // a mano si hace falta.
      console.error("[notas] No se pudo borrar el archivo del adjunto:", e);
    }
  }

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "AdjuntoNota",
      entidadId: adjuntoId.slice(0, 40),
      accion: "DELETE",
      antes: { notaId: adjunto.notaId, nombreOriginal: adjunto.nombreOriginal },
    },
  });

  return { ok: true, id: adjuntoId };
}

/**
 * Lee el archivo de un adjunto, para la ruta que lo sirve.
 *
 * Nada de URLs adivinables: pasa por sesion, `nota:leer` y EMPRESA, igual
 * que `archivoEvidencia`. Sin pase de obra —los adjuntos de Nota no son un
 * flujo de campo con pase, a diferencia de la evidencia fotografica.
 */
export async function archivoAdjuntoNota(
  sesion: SesionActiva,
  adjuntoId: string,
): Promise<{ contenido: Buffer; mimeType: string; nombreOriginal: string } | { error: "no" }> {
  if (!puede(sesion, "nota:leer")) return { error: "no" };

  /*
   * EL ALCANCE, metido en el propio `where` y no comprobado despues.
   *
   * Estas rutas sirven un ARCHIVO por su id, sin pasar por el layout de la
   * obra: `/api/{ruta}/[id]`. Filtraban por empresa y no por alcance, asi que
   * un residente con el id a mano se bajaba el archivo de una obra que no
   * gestiona. Comprobado el 24 de agosto de 2026 con una sesion de residente
   * de verdad.
   *
   * Va DENTRO del `where` porque asi la respuesta a «no la alcanzas» y a «no
   * existe» es la misma consulta y el mismo `null`: no hay forma de usar
   * estas rutas para averiguar que ids existen.
   */
  const adjunto = await prisma.adjuntoNota.findFirst({
    where: {
      id: adjuntoId,
      // `filtroDeObras` esparcido DENTRO del filtro del proyecto: es su forma
      // natural -devuelve `{}` para quien alcanza todas las obras, y
      // `{ id: { in: [...] } }` para quien no-, la misma que usa el resumen
      // de empresa.
      project: { companyId: sesion.companyId, ...filtroDeObras(sesion) },
    },
    select: { ruta: true, mimeType: true, nombreOriginal: true },
  });
  if (!adjunto || !adjunto.ruta) return { error: "no" };

  try {
    const contenido = await fs.readFile(join(raizAlmacen(), adjunto.ruta));
    return { contenido, mimeType: adjunto.mimeType, nombreOriginal: adjunto.nombreOriginal };
  } catch {
    console.error(`[notas] Archivo ausente para el adjunto ${adjuntoId}`);
    return { error: "no" };
  }
}
