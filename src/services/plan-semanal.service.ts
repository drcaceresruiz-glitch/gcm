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
  restriccionDeTarea,
  CAUSAS_CNC,
  type FilaPareto,
  type PuntoPpc,
  type EnlacePredecesora,
} from "@/lib/plan-semanal";
import { ultimoAvancePorTarea } from "@/lib/cronograma";
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

/** Hoy a medianoche UTC (para anclar fechas @db.Date sin desfase de zona). */
function hoyUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
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
  /// % de avance ya registrado por ESTE plan para la tarea (para pre-llenar el
  /// cierre al reabrir). null si es linea libre o aun no se registro.
  porcentajeReal: string | null;
}

export interface TareaOpcionPlan {
  uid: number;
  codigo: string | null;
  nombre: string;
  /// La tarea esta programada dentro de la semana del corte.
  enSemana: boolean;
  /// Tiene una predecesora pendiente (se puede adelantar igual, con aviso).
  conRestriccion: boolean;
  /// Texto de la restriccion, si la hay.
  restriccion: string | null;
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
      id: true,
      tareas: {
        select: {
          uid: true,
          codigo: true,
          nombre: true,
          inicio: true,
          fin: true,
          esResumen: true,
          porcentajeArchivo: true,
        },
      },
    },
  });
  const tareasCron = cronograma?.tareas ?? [];
  const porUid = new Map<number, { codigo: string | null; nombre: string }>();
  const nombrePorUid = new Map<number, string>();
  for (const t of tareasCron) {
    porUid.set(t.uid, { codigo: t.codigo, nombre: t.nombre });
    nombrePorUid.set(t.uid, `${t.codigo ? `${t.codigo} ` : ""}${t.nombre}`);
  }

  // Dependencias (predecesoras) y avance vigente por tarea: para saber que se
  // puede ADELANTAR (libre) y que tiene una predecesora pendiente.
  const dependencias: EnlacePredecesora[] = cronograma?.id
    ? await prisma.dependenciaTarea.findMany({
        where: { cronogramaId: cronograma.id },
        select: { tareaUid: true, predecesoraUid: true, tipo: true },
      })
    : [];

  const avances = await prisma.avanceTarea.findMany({
    where: { projectId: obraId },
    select: {
      uid: true,
      fecha: true,
      porcentaje: true,
      createdAt: true,
      nota: true,
      reportadoPor: true,
    },
  });
  const ultimos = ultimoAvancePorTarea(
    avances.map((a) => ({ ...a, porcentaje: a.porcentaje.toString() })),
  );
  // Lo reportado gana; si una tarea no tiene reporte, el % del archivo (la
  // siembra de la unica importacion).
  const avancePorUid = new Map<number, number>();
  for (const t of tareasCron) avancePorUid.set(t.uid, Number(t.porcentajeArchivo));
  for (const [uid, a] of ultimos) avancePorUid.set(uid, Number(a.porcentaje));

  // Avances ya registrados por ESTE plan (para pre-llenar el cierre al reabrir).
  const avancesDelPlan = await prisma.avanceTarea.findMany({
    where: { projectId: obraId, planSemanalId: planId },
    select: { uid: true, porcentaje: true },
  });
  const realDelPlanPorUid = new Map<number, string>();
  for (const a of avancesDelPlan) realDelPlanPorUid.set(a.uid, a.porcentaje.toString());

  // Que tareas caen dentro de la semana del corte (para agrupar el desplegable).
  const { inicio: iniSemana, fin: finSemana } = rangoSemana(plan.fechaCorte);
  const enSemanaUids = new Set(
    tareasDeLaSemana(tareasCron, iniSemana, finSemana).map((t) => t.uid),
  );

  // Para el desplegable: todas las tareas de trabajo (sin resumenes), con su
  // estado de semana y su restriccion.
  const tareas: TareaOpcionPlan[] = tareasCron
    .filter((t) => !t.esResumen)
    .map((t) => {
      const r = restriccionDeTarea(t.uid, dependencias, avancePorUid, nombrePorUid);
      return {
        uid: t.uid,
        codigo: t.codigo,
        nombre: t.nombre,
        enSemana: enSemanaUids.has(t.uid),
        conRestriccion: !r.libre,
        restriccion: r.motivo,
      };
    });

  // Tareas ya cumplidas en OTRA semana (marcadas cumplido en otro plan de la
  // obra): una tarea terminada no vuelve a proponerse aunque su rango
  // programado alcance esta semana.
  const cumplidasPrevias = await prisma.compromisoSemanal.findMany({
    where: {
      cumplido: true,
      uid: { not: null },
      // La relacion en CompromisoSemanal se llama `plan` (no `planSemanal`).
      plan: { projectId: obraId, id: { not: planId } },
    },
    select: { uid: true },
  });
  const uidsHechos = new Set<number>(
    cumplidasPrevias
      .map((c) => c.uid)
      .filter((u): u is number => u !== null),
  );

  // Sugerencias: las tareas cuyo trabajo cae en la semana del corte, menos las
  // ya cumplidas. La pantalla las usa para autocargar los compromisos cuando la
  // semana esta vacia; el residente confirma o ajusta.
  const sugeridas = tareasDeLaSemana(tareasCron, iniSemana, finSemana)
    .filter((t) => !uidsHechos.has(t.uid))
    .map((t) => ({
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
    porcentajeReal: c.uid !== null ? (realDelPlanPorUid.get(c.uid) ?? null) : null,
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

  // La meta es un PORCENTAJE de 0 a 100. Sin este control, un valor como 1000
  // desbordaba la columna Decimal(5,2) (tope 999.99) y la accion caia con un
  // 500 que dejaba la pagina en error. Se valida antes de tocar la base.
  for (const c of compromisos) {
    const m = c.metaPorcentaje?.trim();
    if (m) {
      const n = Number(m.replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return {
          ok: false,
          error: "La meta de cada compromiso es un porcentaje entre 0 y 100.",
        };
      }
    }
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
  /// % de avance real ALCANZADO por la tarea (acumulado 0-100). Solo aplica a
  /// compromisos con tarea (uid); se propaga a AvanceTarea al cerrar.
  porcentajeReal?: string | null;
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
    select: {
      id: true,
      estado: true,
      numero: true,
      fechaCorte: true,
      compromisos: { select: { id: true, uid: true, metaPorcentaje: true } },
    },
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
    if (e.porcentajeReal != null && e.porcentajeReal.trim()) {
      const n = Number(e.porcentajeReal.replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return { ok: false, error: "El % alcanzado de cada tarea es un porcentaje entre 0 y 100." };
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

    // Propagar el avance REAL a las tareas: se registra el % alcanzado de cada
    // compromiso CON tarea. Primero se borran los avances que ESTE plan habia
    // registrado, para que reabrir/re-cerrar reemplace y no duplique. Los
    // avances manuales (planSemanalId null) no se tocan.
    await tx.avanceTarea.deleteMany({
      where: { projectId: obraId, planSemanalId: planId },
    });

    const fechaAvance = new Date(
      Math.min(plan.fechaCorte.getTime(), hoyUtc().getTime()),
    );
    let avancesRegistrados = 0;
    for (const c of plan.compromisos) {
      if (c.uid == null) continue;
      const e = porId.get(c.id);
      // El % alcanzado que manda la pantalla; si no viene y se cumplio, su meta
      // (o 100% si no tenia meta). Si no se cumplio y no hay %, no se registra.
      const bruto = e?.porcentajeReal?.trim()
        ? e.porcentajeReal
        : e?.cumplido
          ? (c.metaPorcentaje?.toString() ?? "100")
          : null;
      if (bruto == null) continue;
      const pct = normalizarDecimal(bruto, 2);
      if (pct == null) continue;
      await tx.avanceTarea.create({
        data: {
          projectId: obraId,
          uid: c.uid,
          fecha: fechaAvance,
          porcentaje: pct,
          reportadoPor: quien(sesion),
          nota: `Plan semanal ${plan.numero}`,
          planSemanalId: planId,
        },
      });
      avancesRegistrados += 1;
    }

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "PlanSemanal",
        entidadId: planId,
        accion: "UPDATE",
        despues: {
          evento: "cierre",
          compromisos: plan.compromisos.length,
          avancesRegistrados,
        },
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
