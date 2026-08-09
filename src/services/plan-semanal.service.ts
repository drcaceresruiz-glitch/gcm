import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { normalizarDecimal } from "@/lib/decimal";
import {
  ppcDePlan,
  paretoCausas,
  tendenciaPpc,
  rangoSemana,
  tareasDeLaSemana,
  CAUSAS_CNC,
  type FilaPareto,
  type PuntoPpc,
} from "@/lib/plan-semanal";
import type {
  EstadoPlanSemanal,
  CausaNoCumplimiento,
} from "@/generated/prisma/enums";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Plan Semanal (Last Planner): la escritura y lectura de los compromisos de la
 * semana y su cierre (PPC/CNC).
 *
 * Espeja a `encargos.service`: cabecera (`PlanSemanal`) + hijos
 * (`CompromisoSemanal`), correlativo por obra dentro de transaccion, ciclo de
 * vida (ABIERTO/CERRADO) y aislamiento por la empresa de la obra —nunca por un
 * companyId propio, que no existe—. La aritmetica (PPC, Pareto) vive en
 * `@/lib/plan-semanal`, pura y probada; aqui solo se traen los datos.
 */

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

function fechaDeObra(texto: string): Date {
  return new Date(`${texto}T00:00:00Z`);
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export interface SemanaResumen {
  id: string;
  numero: number;
  fechaCorte: Date;
  estado: EstadoPlanSemanal;
  total: number;
  cumplidos: number;
  ppc: number | null;
}

export interface PlanesSemanales {
  semanas: SemanaResumen[];
  /// Un punto por semana CERRADA, en orden, para la tendencia.
  tendencia: PuntoPpc[];
  /// Causas de no cumplimiento agregadas de todas las semanas (Pareto).
  pareto: FilaPareto[];
}

/**
 * Las semanas de la obra con su PPC, mas los agregados para los graficos.
 */
export async function listarPlanesSemanales(
  sesion: SesionActiva,
  obraId: string,
): Promise<PlanesSemanales> {
  const vacio: PlanesSemanales = { semanas: [], tendencia: [], pareto: [] };
  if (!puede(sesion, "plan_semanal:leer")) return vacio;

  const planes = await prisma.planSemanal.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: [{ fechaCorte: "desc" }],
    select: {
      id: true,
      numero: true,
      fechaCorte: true,
      estado: true,
      compromisos: { select: { cumplido: true, causa: true } },
    },
  });

  const semanas: SemanaResumen[] = planes.map((p) => {
    const { total, cumplidos, ppc } = ppcDePlan(p.compromisos);
    return {
      id: p.id,
      numero: p.numero,
      fechaCorte: p.fechaCorte,
      estado: p.estado,
      total,
      cumplidos,
      ppc,
    };
  });

  // La tendencia solo cuenta semanas CERRADAS: el PPC de una semana abierta aun
  // no significa nada (faltan compromisos por evaluar).
  const tendencia = tendenciaPpc(
    planes
      .filter((p) => p.estado === "CERRADO")
      .map((p) => ({ fecha: p.fechaCorte, ppc: ppcDePlan(p.compromisos).ppc })),
  );

  // El Pareto agrega las causas de TODAS las semanas: es donde mirar que falla
  // una y otra vez.
  const pareto = paretoCausas(planes.flatMap((p) => p.compromisos));

  return { semanas, tendencia, pareto };
}

export interface CompromisoDetalle {
  id: string;
  uid: number | null;
  descripcion: string;
  metaPorcentaje: string | null;
  cumplido: boolean | null;
  causa: CausaNoCumplimiento | null;
  notaCierre: string | null;
  /// Nombre/codigo de la tarea si el compromiso es una tarea del cronograma.
  tarea: { codigo: string | null; nombre: string } | null;
}

export interface TareaOpcionPlan {
  uid: number;
  codigo: string | null;
  nombre: string;
}

export interface CompromisoSugerido {
  uid: number;
  descripcion: string;
  metaPorcentaje: string | null;
}

export interface PlanSemanalDetalle {
  id: string;
  numero: number;
  fechaCorte: Date;
  estado: EstadoPlanSemanal;
  notas: string | null;
  creadoPor: string;
  cerradoPor: string | null;
  cerradoAt: Date | null;
  compromisos: CompromisoDetalle[];
  total: number;
  cumplidos: number;
  ppc: number | null;
  /// Tareas de trabajo (sin resumenes) para el desplegable al planificar.
  tareas: TareaOpcionPlan[];
  /// Tareas cuyo trabajo cae en la semana del corte, para autocargar cuando la
  /// semana no tiene compromisos aun.
  sugeridas: CompromisoSugerido[];
}

/**
 * Un plan con sus compromisos, con el nombre de cada tarea resuelto por uid
 * contra el cronograma vigente (el compromiso guarda solo el uid, estable).
 */
export async function obtenerPlanSemanal(
  sesion: SesionActiva,
  obraId: string,
  planId: string,
): Promise<PlanSemanalDetalle | null> {
  if (!puede(sesion, "plan_semanal:leer")) return null;

  const plan = await prisma.planSemanal.findFirst({
    where: { id: planId, projectId: obraId, project: { companyId: sesion.companyId } },
    select: {
      id: true, numero: true, fechaCorte: true, estado: true, notas: true,
      creadoPor: true, cerradoPor: true, cerradoAt: true,
      compromisos: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, uid: true, descripcion: true, metaPorcentaje: true,
          cumplido: true, causa: true, notaCierre: true,
        },
      },
    },
  });

  if (!plan) return null;

  // Nombres y fechas de tarea desde el corte vigente. Consulta LIGERA (solo
  // estos campos): antes esta pantalla cargaba el cronograma completo —con
  // curva S, EVM y ruta critica—, y bajo los limites de recursos de produccion
  // eso mataba el render a mitad. Con esto basta para el desplegable y para
  // autosugerir las tareas de la semana.
  const cronograma = await prisma.cronograma.findFirst({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: {
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
  const tareasCron = cronograma?.tareas ?? [];
  const porUid = new Map<number, { codigo: string | null; nombre: string }>();
  for (const t of tareasCron) {
    porUid.set(t.uid, { codigo: t.codigo, nombre: t.nombre });
  }

  // Para el desplegable: todas las tareas de trabajo (sin resumenes).
  const tareas = tareasCron
    .filter((t) => !t.esResumen)
    .map((t) => ({ uid: t.uid, codigo: t.codigo, nombre: t.nombre }));

  // Sugerencias: las tareas cuyo trabajo cae en la semana del corte. La
  // pantalla las usa para autocargar los compromisos cuando la semana esta
  // vacia; el residente confirma o ajusta.
  const { inicio: iniSemana, fin: finSemana } = rangoSemana(plan.fechaCorte);
  const sugeridas = tareasDeLaSemana(tareasCron, iniSemana, finSemana).map((t) => ({
    uid: t.uid,
    descripcion: `${t.codigo ? `${t.codigo} ` : ""}${t.nombre}`.slice(0, 300),
    metaPorcentaje: null as string | null,
  }));

  const compromisos: CompromisoDetalle[] = plan.compromisos.map((c) => ({
    id: c.id,
    uid: c.uid,
    descripcion: c.descripcion,
    metaPorcentaje: c.metaPorcentaje?.toString() ?? null,
    cumplido: c.cumplido,
    causa: c.causa,
    notaCierre: c.notaCierre,
    tarea: c.uid !== null ? (porUid.get(c.uid) ?? null) : null,
  }));

  const { total, cumplidos, ppc } = ppcDePlan(plan.compromisos);

  return {
    id: plan.id,
    numero: plan.numero,
    fechaCorte: plan.fechaCorte,
    estado: plan.estado,
    notas: plan.notas,
    creadoPor: plan.creadoPor,
    cerradoPor: plan.cerradoPor,
    cerradoAt: plan.cerradoAt,
    compromisos,
    total,
    cumplidos,
    ppc,
    tareas,
    sugeridas,
  };
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export type ResultadoPlan =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Crea la semana. El correlativo se calcula dentro de la transaccion; el indice
 * unico `(projectId, fechaCorte)` impide dos planes para la misma semana.
 */
export async function crearPlanSemanal(
  sesion: SesionActiva,
  obraId: string,
  datos: { fechaCorte: string },
): Promise<ResultadoPlan> {
  if (!puede(sesion, "plan_semanal:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar el plan semanal." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fechaCorte)) {
    return { ok: false, error: "Falta la fecha de la semana." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const fechaCorte = fechaDeObra(datos.fechaCorte);

  const yaExiste = await prisma.planSemanal.findFirst({
    where: { projectId: obraId, fechaCorte },
    select: { id: true },
  });
  if (yaExiste) {
    return { ok: false, error: "Ya hay un plan para esa semana." };
  }

  try {
    const id = await prisma.$transaction(async (tx) => {
      const ultimo = await tx.planSemanal.aggregate({
        where: { projectId: obraId },
        _max: { numero: true },
      });
      const numero = (ultimo._max.numero ?? 0) + 1;

      const plan = await tx.planSemanal.create({
        data: {
          projectId: obraId,
          numero,
          fechaCorte,
          creadoPor: quien(sesion),
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: obraId,
          entidad: "PlanSemanal",
          entidadId: plan.id,
          accion: "CREATE",
          despues: { numero, fechaCorte: datos.fechaCorte },
        },
      });

      return plan.id;
    });

    return { ok: true, id };
  } catch {
    return {
      ok: false,
      error: "No se pudo crear la semana. Vuelve a intentarlo en unos segundos.",
    };
  }
}

export interface DatosCompromiso {
  /// uid de la tarea del cronograma, o null/undefined si es una linea libre.
  uid?: number | null;
  descripcion: string;
  metaPorcentaje?: string | null;
}

/**
 * Reemplaza los compromisos de una semana ABIERTA (planificar). Como en
 * `editarEncargo`: se borran los hijos y se recrean, dentro de una transaccion.
 */
export async function guardarCompromisos(
  sesion: SesionActiva,
  obraId: string,
  planId: string,
  compromisos: DatosCompromiso[],
): Promise<ResultadoPlan> {
  if (!puede(sesion, "plan_semanal:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar el plan semanal." };
  }

  const plan = await prisma.planSemanal.findFirst({
    where: { id: planId, projectId: obraId, project: { companyId: sesion.companyId } },
    select: { id: true, estado: true },
  });
  if (!plan) return { ok: false, error: "Plan no encontrado." };
  if (plan.estado !== "ABIERTO") {
    return { ok: false, error: "La semana esta cerrada. Reabrela para cambiar los compromisos." };
  }

  const limpios = compromisos
    .map((c) => ({
      uid:
        c.uid === null || c.uid === undefined || !Number.isSafeInteger(c.uid)
          ? null
          : c.uid,
      descripcion: c.descripcion.trim().slice(0, 300),
      metaPorcentaje:
        c.metaPorcentaje && c.metaPorcentaje.trim()
          ? normalizarDecimal(c.metaPorcentaje, 2)
          : null,
    }))
    .filter((c) => c.descripcion.length > 0);

  await prisma.$transaction(async (tx) => {
    await tx.compromisoSemanal.deleteMany({ where: { planSemanalId: planId } });
    if (limpios.length > 0) {
      await tx.compromisoSemanal.createMany({
        data: limpios.map((c) => ({
          planSemanalId: planId,
          uid: c.uid,
          descripcion: c.descripcion,
          metaPorcentaje: c.metaPorcentaje,
        })),
      });
    }
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "PlanSemanal",
        entidadId: planId,
        accion: "UPDATE",
        despues: { evento: "compromisos", cantidad: limpios.length },
      },
    });
  });

  return { ok: true, id: planId };
}

export interface Evaluacion {
  compromisoId: string;
  cumplido: boolean;
  causa?: CausaNoCumplimiento | null;
  nota?: string | null;
}

/**
 * Cierra la semana: marca cada compromiso cumplido/no y, si no, su causa; deja
 * el plan CERRADO. De aqui sale el PPC y el Pareto.
 *
 * Un no cumplido SIN causa se rechaza: la causa es justo lo que hace util el
 * cierre —sin ella no hay aprendizaje ni Pareto—.
 */
export async function cerrarPlanSemanal(
  sesion: SesionActiva,
  obraId: string,
  planId: string,
  evaluaciones: Evaluacion[],
): Promise<ResultadoPlan> {
  if (!puede(sesion, "plan_semanal:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar el plan semanal." };
  }

  const plan = await prisma.planSemanal.findFirst({
    where: { id: planId, projectId: obraId, project: { companyId: sesion.companyId } },
    select: { id: true, estado: true, compromisos: { select: { id: true } } },
  });
  if (!plan) return { ok: false, error: "Plan no encontrado." };
  if (plan.estado !== "ABIERTO") {
    return { ok: false, error: "La semana ya esta cerrada." };
  }

  const idsPlan = new Set(plan.compromisos.map((c) => c.id));
  const porId = new Map<string, Evaluacion>();
  for (const e of evaluaciones) {
    if (!idsPlan.has(e.compromisoId)) {
      return { ok: false, error: "Un compromiso evaluado no pertenece a esta semana." };
    }
    if (!e.cumplido) {
      if (!e.causa || !CAUSAS_CNC.includes(e.causa)) {
        return { ok: false, error: "Cada compromiso no cumplido necesita una causa." };
      }
    }
    porId.set(e.compromisoId, e);
  }

  await prisma.$transaction(async (tx) => {
    for (const c of plan.compromisos) {
      const e = porId.get(c.id);
      // Un compromiso sin evaluar se cierra como NO cumplido (honesto: no
      // marcarlo no lo aprueba).
      const cumplido = e?.cumplido ?? false;
      await tx.compromisoSemanal.update({
        where: { id: c.id },
        data: {
          cumplido,
          causa: cumplido ? null : (e?.causa ?? "OTRA"),
          notaCierre: e?.nota?.trim() ? e.nota.trim() : null,
        },
      });
    }

    await tx.planSemanal.update({
      where: { id: planId },
      data: { estado: "CERRADO", cerradoPor: quien(sesion), cerradoAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "PlanSemanal",
        entidadId: planId,
        accion: "UPDATE",
        despues: { evento: "cierre", compromisos: plan.compromisos.length },
      },
    });
  });

  return { ok: true, id: planId };
}

/** Reabre una semana cerrada para corregir compromisos o evaluaciones. */
export async function reabrirPlanSemanal(
  sesion: SesionActiva,
  obraId: string,
  planId: string,
): Promise<ResultadoPlan> {
  if (!puede(sesion, "plan_semanal:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar el plan semanal." };
  }

  const { count } = await prisma.planSemanal.updateMany({
    where: { id: planId, projectId: obraId, project: { companyId: sesion.companyId } },
    data: { estado: "ABIERTO", cerradoPor: null, cerradoAt: null },
  });
  if (count === 0) return { ok: false, error: "Plan no encontrado." };

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "PlanSemanal",
      entidadId: planId,
      accion: "UPDATE",
      despues: { evento: "reabrir" },
    },
  });

  return { ok: true, id: planId };
}

/**
 * Elimina la semana entera (cabecera y compromisos, en cascada). Para rehacerla
 * cuando se creo por error o quedo mal planteada. Es destructivo y no reversible;
 * el correlativo no se recicla (la siguiente semana sigue subiendo de numero),
 * pero la auditoria conserva que existio y con que datos.
 */
export async function eliminarPlanSemanal(
  sesion: SesionActiva,
  obraId: string,
  planId: string,
): Promise<ResultadoPlan> {
  if (!puede(sesion, "plan_semanal:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar el plan semanal." };
  }

  const plan = await prisma.planSemanal.findFirst({
    where: { id: planId, projectId: obraId, project: { companyId: sesion.companyId } },
    select: { id: true, numero: true, fechaCorte: true, estado: true },
  });
  if (!plan) return { ok: false, error: "Plan no encontrado." };

  await prisma.$transaction(async (tx) => {
    // Los compromisos caen por la cascada de la FK (onDelete: Cascade).
    await tx.planSemanal.delete({ where: { id: planId } });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "PlanSemanal",
        entidadId: planId,
        accion: "DELETE",
        antes: {
          numero: plan.numero,
          estado: plan.estado,
          fechaCorte: plan.fechaCorte.toISOString().slice(0, 10),
        },
      },
    });
  });

  return { ok: true, id: planId };
}
