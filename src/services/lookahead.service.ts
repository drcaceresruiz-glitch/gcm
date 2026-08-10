import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { hoy } from "@/utils/fechas";
import { tareasDeLaSemana, type TareaProgramada } from "@/lib/plan-semanal";
import {
  ventanaLookahead,
  estadoDeTarea,
  confiabilidad,
  normalizarSemanas,
  TIPOS_RESTRICCION,
  type Confiabilidad,
} from "@/lib/lookahead";
import { planesAbiertos, type SemanaAbierta } from "@/services/plan-semanal.service";
import type { EstadoLookahead, TipoRestriccion } from "@/generated/prisma/enums";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Lookahead (Last Planner): la ventana de mediano plazo y el analisis de las 7
 * restricciones por tarea.
 *
 * Las tareas se DERIVAN del cronograma vigente (no se crean a mano): son las de
 * trabajo cuyo rango solapa la ventana [hoy, hoy+3 semanas], ancladas por `uid`
 * como `AvanceTarea`. La lectura (`obtenerLookahead`) es pura; los `LookaheadTask`
 * y sus restricciones nacen con la accion `sincronizarLookahead`. La aritmetica
 * (ventana, semaforo, confiabilidad) vive en `@/lib/lookahead`, probada.
 */

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

export interface CeldaRestriccion {
  /// null si la tarea aun no se sincronizo (no hay fila de restriccion todavia).
  id: string | null;
  tipo: TipoRestriccion;
  resuelta: boolean;
}

/// En que semana del PTS esta ya comprometida una tarea.
export interface CompromisoDeTarea {
  planId: string;
  numero: number;
  abierta: boolean;
}

export interface FilaLookahead {
  uid: number;
  codigo: string | null;
  nombre: string;
  inicio: Date;
  fin: Date;
  faseBloque: string | null;
  zona: string | null;
  estado: EstadoLookahead;
  /// Tiene ya `LookaheadTask` + restricciones (se sincronizo).
  sincronizada: boolean;
  /// Para enlazar el compromiso con la tarea que lo origino (trazabilidad).
  lookaheadTaskId: string | null;
  /// Las 7 restricciones, en el orden de `TIPOS_RESTRICCION`.
  restricciones: CeldaRestriccion[];
  /// Semanas del PTS donde ya se comprometio (para no duplicar a ciegas).
  comprometida: CompromisoDeTarea[];
}

export interface LookaheadDatos {
  desde: Date;
  hasta: Date;
  filas: FilaLookahead[];
  confiabilidad: Confiabilidad;
  /// Tareas de la ventana que aun no tienen `LookaheadTask` (a sincronizar).
  pendientesDeSincronizar: number;
  /// Cuantas semanas mira esta ventana (ya acotado).
  semanas: number;
  puedeGestionar: boolean;
  /// Semanas del PTS que admiten compromisos (destino al comprometer).
  semanasAbiertas: SemanaAbierta[];
  /// Comprometer escribe el PTS, asi que manda el permiso del plan semanal.
  puedeComprometer: boolean;
}

export type ResultadoLookahead = { ok: true } | { ok: false; error: string };
export type ResultadoSync =
  | { ok: true; creadas: number }
  | { ok: false; error: string };

/** El cronograma vigente de la obra (mas reciente) con sus tareas. */
async function cronogramaVigente(sesion: SesionActiva, obraId: string) {
  return prisma.cronograma.findFirst({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: {
      id: true,
      tareas: {
        select: {
          uid: true,
          codigo: true,
          nombre: true,
          inicio: true,
          fin: true,
          esResumen: true,
        },
      },
    },
  });
}

/** Tareas del cronograma vigente que caen en la ventana del Lookahead. */
async function tareasDeLaVentana(
  sesion: SesionActiva,
  obraId: string,
  semanas: number,
): Promise<{ desde: Date; hasta: Date; tareas: TareaProgramada[] }> {
  const { desde, hasta } = ventanaLookahead(hoy(), semanas);
  const cronograma = await cronogramaVigente(sesion, obraId);
  const tareasCron: TareaProgramada[] = (cronograma?.tareas ?? []).map((t) => ({
    uid: t.uid,
    codigo: t.codigo,
    nombre: t.nombre,
    inicio: t.inicio,
    fin: t.fin,
    esResumen: t.esResumen,
  }));
  return { desde, hasta, tareas: tareasDeLaSemana(tareasCron, desde, hasta) };
}

/**
 * La matriz del Lookahead: por cada tarea de la ventana, sus 7 restricciones y
 * su estado de confiabilidad. Lectura pura (no crea nada): las tareas aun no
 * sincronizadas salen con celdas vacias y `sincronizada: false`.
 */
export async function obtenerLookahead(
  sesion: SesionActiva,
  obraId: string,
  semanasPedidas?: string | number,
): Promise<LookaheadDatos | null> {
  if (!puede(sesion, "lookahead:leer")) return null;

  const semanas = normalizarSemanas(semanasPedidas);
  const { desde, hasta, tareas } = await tareasDeLaVentana(sesion, obraId, semanas);

  const uids = tareas.map((t) => t.uid);
  const lookaheadTareas = uids.length
    ? await prisma.lookaheadTask.findMany({
        where: { projectId: obraId, uid: { in: uids } },
        select: {
          id: true,
          uid: true,
          faseBloque: true,
          zona: true,
          restricciones: { select: { id: true, tipo: true, resuelta: true } },
        },
      })
    : [];
  const porUid = new Map(lookaheadTareas.map((l) => [l.uid, l]));

  // En que semanas del PTS esta ya cada tarea: cierra el ciclo (el Lookahead
  // muestra lo que ya se comprometio) y evita comprometer dos veces sin verlo.
  const compromisos = uids.length
    ? await prisma.compromisoSemanal.findMany({
        where: { uid: { in: uids }, plan: { projectId: obraId } },
        select: {
          uid: true,
          plan: { select: { id: true, numero: true, estado: true } },
        },
        orderBy: { plan: { numero: "asc" } },
      })
    : [];
  const comprometidaPorUid = new Map<number, CompromisoDeTarea[]>();
  for (const c of compromisos) {
    if (c.uid === null) continue;
    const lista = comprometidaPorUid.get(c.uid) ?? [];
    lista.push({
      planId: c.plan.id,
      numero: c.plan.numero,
      abierta: c.plan.estado === "ABIERTO",
    });
    comprometidaPorUid.set(c.uid, lista);
  }

  const filas: FilaLookahead[] = tareas.map((t) => {
    const lk = porUid.get(t.uid);
    if (!lk) {
      return {
        uid: t.uid,
        codigo: t.codigo,
        nombre: t.nombre,
        inicio: t.inicio,
        fin: t.fin,
        faseBloque: null,
        zona: null,
        estado: "PENDIENTE",
        sincronizada: false,
        lookaheadTaskId: null,
        restricciones: TIPOS_RESTRICCION.map((tipo) => ({
          id: null,
          tipo,
          resuelta: false,
        })),
        comprometida: comprometidaPorUid.get(t.uid) ?? [],
      };
    }
    const porTipo = new Map(lk.restricciones.map((r) => [r.tipo, r]));
    const restricciones: CeldaRestriccion[] = TIPOS_RESTRICCION.map((tipo) => {
      const r = porTipo.get(tipo);
      return { id: r?.id ?? null, tipo, resuelta: r?.resuelta ?? false };
    });
    return {
      uid: t.uid,
      codigo: t.codigo,
      nombre: t.nombre,
      inicio: t.inicio,
      fin: t.fin,
      faseBloque: lk.faseBloque,
      zona: lk.zona,
      // Se recalcula del estado real de las restricciones (fuente de verdad); el
      // `estado` guardado se mantiene en sincronia al alternar una restriccion.
      estado: estadoDeTarea(restricciones),
      sincronizada: true,
      lookaheadTaskId: lk.id,
      restricciones,
      comprometida: comprometidaPorUid.get(t.uid) ?? [],
    };
  });

  // Comprometer escribe el PTS: el permiso que manda es el del plan semanal,
  // no el del Lookahead (un consultor ve la matriz pero no compromete).
  const puedeComprometer = puede(sesion, "plan_semanal:gestionar");

  return {
    desde,
    hasta,
    filas,
    confiabilidad: confiabilidad(filas),
    pendientesDeSincronizar: filas.filter((f) => !f.sincronizada).length,
    semanas,
    puedeGestionar: puede(sesion, "lookahead:gestionar"),
    semanasAbiertas: puedeComprometer ? await planesAbiertos(sesion, obraId) : [],
    puedeComprometer,
  };
}

/**
 * Trae al Lookahead las tareas de la ventana que aun no estan: crea su
 * `LookaheadTask` y siembra sus 7 restricciones (sin resolver). Idempotente: no
 * duplica las que ya existen.
 */
export async function sincronizarLookahead(
  sesion: SesionActiva,
  obraId: string,
  /// LAS MISMAS semanas que se estan viendo. Si aqui se usara otra cifra, el
  /// boton dejaria sin analizar tareas que la pantalla si muestra, y no habria
  /// forma de entender por que.
  semanasPedidas?: string | number,
): Promise<ResultadoSync> {
  if (!puede(sesion, "lookahead:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar el Lookahead." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const { tareas } = await tareasDeLaVentana(
    sesion,
    obraId,
    normalizarSemanas(semanasPedidas),
  );
  if (tareas.length === 0) return { ok: true, creadas: 0 };

  const existentes = await prisma.lookaheadTask.findMany({
    where: { projectId: obraId, uid: { in: tareas.map((t) => t.uid) } },
    select: { uid: true },
  });
  const yaHay = new Set(existentes.map((e) => e.uid));
  const nuevas = tareas.filter((t) => !yaHay.has(t.uid));
  if (nuevas.length === 0) return { ok: true, creadas: 0 };

  await prisma.$transaction(async (tx) => {
    for (const t of nuevas) {
      const lk = await tx.lookaheadTask.create({
        data: { projectId: obraId, uid: t.uid },
        select: { id: true },
      });
      await tx.restriccion.createMany({
        data: TIPOS_RESTRICCION.map((tipo) => ({ lookaheadTaskId: lk.id, tipo })),
      });
    }

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "LookaheadTask",
        entidadId: obraId,
        accion: "CREATE",
        despues: { evento: "sincronizar", creadas: nuevas.length },
      },
    });
  });

  return { ok: true, creadas: nuevas.length };
}

/**
 * Marca una restriccion como resuelta o no, y recalcula el estado de su tarea
 * (LISTO cuando todas quedan resueltas). Comprueba que la restriccion sea de una
 * tarea de ESTA obra y empresa.
 */
export async function alternarRestriccion(
  sesion: SesionActiva,
  obraId: string,
  restriccionId: string,
  resuelta: boolean,
): Promise<ResultadoLookahead> {
  if (!puede(sesion, "lookahead:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar el Lookahead." };
  }

  const restr = await prisma.restriccion.findFirst({
    where: {
      id: restriccionId,
      tarea: { projectId: obraId, project: { companyId: sesion.companyId } },
    },
    select: { id: true, lookaheadTaskId: true },
  });
  if (!restr) return { ok: false, error: "Restriccion no encontrada." };

  await prisma.$transaction(async (tx) => {
    await tx.restriccion.update({
      where: { id: restriccionId },
      data: {
        resuelta,
        resueltaAt: resuelta ? new Date() : null,
        resueltaPor: resuelta ? quien(sesion) : null,
      },
    });

    // Recalcular el semaforo de la tarea con TODAS sus restricciones ya
    // actualizadas, y guardarlo para que el PTS pueda filtrar por LISTO.
    const todas = await tx.restriccion.findMany({
      where: { lookaheadTaskId: restr.lookaheadTaskId },
      select: { resuelta: true },
    });
    await tx.lookaheadTask.update({
      where: { id: restr.lookaheadTaskId },
      data: { estado: estadoDeTarea(todas) },
    });
  });

  return { ok: true };
}
