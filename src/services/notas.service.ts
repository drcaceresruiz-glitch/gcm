import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { esVencida } from "@/lib/notas";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";
import type { CategoriaNota } from "@/generated/prisma/enums";

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
