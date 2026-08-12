import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import {
  causasQuePidenAnalisis,
  type CausaQuePideAnalisis,
} from "@/lib/causa-raiz";
import type { CausaNoCumplimiento } from "@/generated/prisma/enums";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * El analisis de causa raiz: por que se repite una causa y que se hara.
 *
 * Cuando se pide lo decide `@/lib/causa-raiz`, que no toca la base. Aqui se
 * cuentan las filas y se guarda.
 *
 * Va con los permisos del plan semanal y no con unos propios: analizar por que
 * falla lo que se promete es parte del mismo ciclo, y quien cierra la semana
 * es quien tiene delante el Pareto.
 */

export interface AnalisisResumen {
  id: string;
  causa: CausaNoCumplimiento;
  porQue: string;
  accion: string;
  responsable: string | null;
  fechaCompromiso: Date | null;
  cerradoAt: Date | null;
  creadoPor: string;
  createdAt: Date;
}

export interface CausasParaAnalizar {
  /// Las que piden analisis y NO tienen uno abierto. Son las accionables.
  pendientes: CausaQuePideAnalisis[];
  /// Las que lo piden y ya se estan trabajando, para no reclamarlas dos veces.
  enCurso: CausaNoCumplimiento[];
}

function nombre(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`.trim().slice(0, 150);
}

/** Los analisis de la obra, abiertos primero y dentro de cada grupo lo reciente. */
export async function listarAnalisis(
  sesion: SesionActiva,
  obraId: string,
): Promise<AnalisisResumen[]> {
  if (!puede(sesion, "plan_semanal:leer")) return [];

  const filas = await prisma.analisisCausa.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: [{ cerradoAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      causa: true,
      porQue: true,
      accion: true,
      fechaCompromiso: true,
      cerradoAt: true,
      creadoPor: true,
      createdAt: true,
      responsable: { select: { nombres: true, apellidos: true } },
    },
  });

  return filas.map((f) => ({
    id: f.id,
    causa: f.causa,
    porQue: f.porQue,
    accion: f.accion,
    responsable: f.responsable
      ? `${f.responsable.nombres} ${f.responsable.apellidos}`
      : null,
    fechaCompromiso: f.fechaCompromiso,
    cerradoAt: f.cerradoAt,
    creadoPor: f.creadoPor,
    createdAt: f.createdAt,
  }));
}

/**
 * Que causas piden analisis hoy, separando las que ya se estan trabajando.
 *
 * Una causa con analisis abierto NO se reclama: ya hay alguien en ello, y
 * repetir el aviso solo ensena a ignorarlo.
 */
export async function causasParaAnalizar(
  sesion: SesionActiva,
  obraId: string,
): Promise<CausasParaAnalizar> {
  const vacio: CausasParaAnalizar = { pendientes: [], enCurso: [] };
  if (!puede(sesion, "plan_semanal:leer")) return vacio;

  const [planes, abiertos] = await Promise.all([
    prisma.planSemanal.findMany({
      where: {
        projectId: obraId,
        project: { companyId: sesion.companyId },
        estado: "CERRADO",
      },
      select: {
        numero: true,
        compromisos: { where: { cumplido: false }, select: { causa: true } },
      },
    }),
    prisma.analisisCausa.findMany({
      where: {
        projectId: obraId,
        project: { companyId: sesion.companyId },
        cerradoAt: null,
      },
      select: { causa: true },
    }),
  ]);

  const incumplimientos = planes.flatMap((p) =>
    p.compromisos.flatMap((c) =>
      c.causa === null ? [] : [{ numeroSemana: p.numero, causa: c.causa }],
    ),
  );

  const enCurso = new Set(abiertos.map((a) => a.causa));
  const piden = causasQuePidenAnalisis(incumplimientos);

  return {
    pendientes: piden.filter((p) => !enCurso.has(p.causa)),
    enCurso: piden.filter((p) => enCurso.has(p.causa)).map((p) => p.causa),
  };
}

export type ResultadoAnalisis =
  | { ok: true; id: string }
  | { ok: false; error: string };

export interface DatosAnalisis {
  causa: CausaNoCumplimiento;
  porQue: string;
  accion: string;
  responsableUserId?: string | null;
  fechaCompromiso?: string | null;
}

/// Ni un desahogo de dos palabras ni una novela: lo primero no dice nada y lo
/// segundo no lo lee nadie.
const MINIMO_TEXTO = 10;
const MAXIMO_TEXTO = 2000;

function texto(valor: string, campo: string): string | { error: string } {
  const limpio = valor.trim();
  if (limpio.length < MINIMO_TEXTO) {
    return { error: `${campo} necesita al menos ${MINIMO_TEXTO} caracteres.` };
  }
  if (limpio.length > MAXIMO_TEXTO) {
    return { error: `${campo} no puede pasar de ${MAXIMO_TEXTO} caracteres.` };
  }
  return limpio;
}

/**
 * Abre el analisis de una causa.
 *
 * Solo puede haber UNO abierto por causa y obra. No lo garantiza un indice
 * porque MariaDB no admite indices unicos parciales —el mismo motivo por el
 * que la linea base del cronograma se cuida desde el codigo—, asi que se
 * comprueba aqui dentro de la transaccion: dos pulsaciones del mismo boton
 * bastarian para crear dos.
 */
export async function abrirAnalisis(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosAnalisis,
): Promise<ResultadoAnalisis> {
  if (!puede(sesion, "plan_semanal:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar el plan semanal." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const porQue = texto(datos.porQue, "El porqué");
  if (typeof porQue !== "string") return { ok: false, error: porQue.error };
  const accion = texto(datos.accion, "La acción");
  if (typeof accion !== "string") return { ok: false, error: accion.error };

  // Una fecha comprometida que ya paso al escribirla no es un compromiso.
  let fecha: Date | null = null;
  if (datos.fechaCompromiso) {
    const d = new Date(`${datos.fechaCompromiso}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "La fecha comprometida no es válida." };
    }
    fecha = d;
  }

  try {
    const creado = await prisma.$transaction(async (tx) => {
      const obra = await tx.project.findFirst({
        where: { id: obraId, companyId: sesion.companyId },
        select: { id: true },
      });
      if (!obra) throw new Error("Obra no encontrada.");

      // El responsable, si se indica, tiene que ser de la MISMA empresa: si no
      // se comprobara, un id ajeno dejaria un analisis a nombre de alguien de
      // otra constructora.
      if (datos.responsableUserId) {
        const persona = await tx.user.findFirst({
          where: { id: datos.responsableUserId, companyId: sesion.companyId },
          select: { id: true },
        });
        if (!persona) throw new Error("La persona responsable no existe.");
      }

      const yaAbierto = await tx.analisisCausa.findFirst({
        where: { projectId: obraId, causa: datos.causa, cerradoAt: null },
        select: { id: true },
      });
      if (yaAbierto) {
        throw new Error("Esa causa ya tiene un análisis abierto.");
      }

      return tx.analisisCausa.create({
        data: {
          projectId: obraId,
          causa: datos.causa,
          porQue,
          accion,
          responsableUserId: datos.responsableUserId ?? null,
          fechaCompromiso: fecha,
          creadoPor: nombre(sesion),
        },
        select: { id: true },
      });
    });

    return { ok: true, id: creado.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/**
 * Da por resuelto un analisis. No lo borra: lo que se intento —funcionara o
 * no— es lo mas util del historial cuando la causa vuelve.
 */
export async function cerrarAnalisis(
  sesion: SesionActiva,
  analisisId: string,
): Promise<ResultadoAnalisis> {
  if (!puede(sesion, "plan_semanal:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar el plan semanal." };
  }

  const fila = await prisma.analisisCausa.findFirst({
    where: { id: analisisId, project: { companyId: sesion.companyId } },
    select: { id: true, projectId: true, cerradoAt: true },
  });
  if (!fila) return { ok: false, error: "Análisis no encontrado." };
  if (fila.cerradoAt) return { ok: false, error: "Ese análisis ya estaba cerrado." };

  const cerrada = await motivoSiObraCerrada(sesion, fila.projectId);
  if (cerrada) return { ok: false, error: cerrada };

  await prisma.analisisCausa.update({
    where: { id: fila.id },
    data: { cerradoAt: new Date(), cerradoPor: nombre(sesion) },
  });

  return { ok: true, id: fila.id };
}
