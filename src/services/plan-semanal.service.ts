import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { normalizarDecimal } from "@/lib/decimal";
import { hoy } from "@/utils/fechas";
import {
  ppcDePlan,
  paretoCausas,
  porcentajeARegistrar,
  tendenciaPpc,
  rangoSemana,
  proximoCorte,
  tareasDeLaSemana,
  restriccionDeTarea,
  sugerirCantidad,
  mapaPreservablePorUid,
  validarCantidadPlan,
  uidsDuplicados,
  avisoNumeracionSemana,
  cumplidosSinAvance,
  tareasTerminadas,
  arrastreDeIncumplidos,
  CAUSAS_CNC,
  type AvisoNumeracion,
  type FilaPareto,
  type PuntoPpc,
  type EnlacePredecesora,
} from "@/lib/plan-semanal";
import { cumplidoAlCerrar } from "@/lib/cierre-cantidad";
import { ultimoAvancePorTarea } from "@/lib/cronograma";
import type {
  EstadoPlanSemanal,
  CausaNoCumplimiento,
  EstadoLookahead,
} from "@/generated/prisma/enums";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import { fotosPorDestino, type FotoResumen } from "@/services/evidencia.service";
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

export interface CompromisoDelInforme {
  descripcion: string;
  cumplido: boolean | null;
  causa: CausaNoCumplimiento | null;
  notaCierre: string | null;
}

export interface LastPlannerAlCorte {
  /// La semana que cierra EXACTAMENTE en la fecha del informe, si la hay. Un
  /// corte del cronograma puede no coincidir con ninguna semana del PTS.
  semana: {
    numero: number;
    cerrada: boolean;
    total: number;
    cumplidos: number;
    /// Null mientras la semana no este cerrada: un PPC a medio evaluar no
    /// significa nada, y en un informe impreso menos todavia.
    ppc: number | null;
  } | null;
  compromisos: CompromisoDelInforme[];
  /// PPC de las semanas CERRADAS hasta la fecha, para la tendencia.
  tendencia: PuntoPpc[];
  /// Causas acumuladas hasta la fecha, de mayor a menor.
  pareto: FilaPareto[];
}

/**
 * El Last Planner de la obra A UNA FECHA, para el informe semanal.
 *
 * El informe no mencionaba el Last Planner en absoluto: daba avance fisico,
 * curva S, capitulos y alertas —todo lo que se saca de un cronograma— y ni una
 * linea de PPC, causas o compromisos. En una herramienta construida sobre Last
 * Planner, ese documento se dejaba fuera justo lo que la distingue de exportar
 * el Gantt: se puede ir al dia en la curva con un PPC del 50%, y eso significa
 * que el ritmo tapa una planificacion que no se cumple.
 *
 * TODO SE MIDE HASTA `fechaCorte`, igual que el resto del informe: la
 * tendencia no incluye semanas posteriores y el Pareto no cuenta causas que
 * aun no habian pasado. Un informe historico tiene que ensenar lo que se sabia
 * entonces, o no es historico.
 */
export async function lastPlannerAlCorte(
  sesion: SesionActiva,
  obraId: string,
  fechaCorte: Date,
): Promise<LastPlannerAlCorte | null> {
  if (!puede(sesion, "plan_semanal:leer")) return null;

  const planes = await prisma.planSemanal.findMany({
    where: {
      projectId: obraId,
      project: { companyId: sesion.companyId },
      fechaCorte: { lte: fechaCorte },
    },
    orderBy: { fechaCorte: "asc" },
    select: {
      numero: true,
      fechaCorte: true,
      estado: true,
      compromisos: {
        orderBy: { createdAt: "asc" },
        select: {
          descripcion: true,
          cumplido: true,
          causa: true,
          notaCierre: true,
        },
      },
    },
  });

  if (planes.length === 0) {
    return { semana: null, compromisos: [], tendencia: [], pareto: [] };
  }

  const laDelCorte = planes.find(
    (p) => p.fechaCorte.getTime() === fechaCorte.getTime(),
  );

  const tendencia = tendenciaPpc(
    planes
      .filter((p) => p.estado === "CERRADO")
      .map((p) => ({ fecha: p.fechaCorte, ppc: ppcDePlan(p.compromisos).ppc })),
  );

  const pareto = paretoCausas(planes.flatMap((p) => p.compromisos));

  if (!laDelCorte) {
    return { semana: null, compromisos: [], tendencia, pareto };
  }

  const cerrada = laDelCorte.estado === "CERRADO";
  const { total, cumplidos, ppc } = ppcDePlan(laDelCorte.compromisos);

  return {
    semana: {
      numero: laDelCorte.numero,
      cerrada,
      total,
      cumplidos,
      ppc: cerrada ? ppc : null,
    },
    compromisos: laDelCorte.compromisos,
    tendencia,
    pareto,
  };
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
  /// Cantidad comprometida y su unidad (PTS por cantidad).
  cantidadPlan: string | null;
  unidad: string | null;
  /// Cuanto se ejecuto, anotado al cerrar la semana.
  cantidadEjec: string | null;
  /// Acumulado de la tarea ANTES de cerrar. Con la meta pactada permite
  /// deducir el «% alcanzado» en vez de pedirlo dos veces.
  avanceActual: string | null;
  /// De que tarea del Lookahead nacio, si vino de ahi.
  lookaheadTaskId: string | null;
  /// Fotos adosadas al compromiso: documentan la causa de no cumplimiento (o
  /// lo ejecutado). Vacio si no hay ninguna.
  fotos: FotoResumen[];
  /// Estado en el Lookahead HOY (no congelado): si no esta LISTO, la pantalla
  /// avisa de que se comprometio algo sin liberar. Si se libera despues, el
  /// aviso desaparece solo.
  estadoLookahead: EstadoLookahead | null;
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
  /// Estado en el Lookahead: LISTO = analizada y sin restricciones pendientes
  /// (puede que no tenga ninguna). null = la tarea no esta en la matriz.
  estadoLookahead: EstadoLookahead | null;
  /// Alguien decidio que flujos le aplican. Sin esto, PENDIENTE no distingue
  /// "le falta el fierro" de "nadie la ha mirado".
  analizadaLookahead: boolean;
  /// Cantidad y unidad que propone la partida mapeada, si se puede.
  cantidadSugerida: string | null;
  unidadSugerida: string | null;
}

export interface CompromisoSugerido {
  uid: number;
  descripcion: string;
  metaPorcentaje: string | null;
  cantidadPlan: string | null;
  unidad: string | null;
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
  /**
   * Lo que se prometio en una semana cerrada, fallo y sigue sin hacerse.
   *
   * Va aparte de `sugeridas` porque no es lo mismo y no debe leerse igual: una
   * sugerencia es trabajo que TOCA esta semana segun el cronograma; esto es
   * trabajo que ya se prometio y no salio. Ademas no llega por la misma via —
   * `sugeridas` sale de las fechas del cronograma, y una tarea cuya fecha ya
   * paso no aparece ahi ni en el Lookahead—.
   */
  arrastradas: CompromisoArrastrado[];
}

/// Una tarea que vuelve, con lo que hay que saber para decidir si recomprometerla.
export interface CompromisoArrastrado {
  uid: number;
  descripcion: string;
  /// En cuantas semanas se prometio y fallo. 2 o mas es un bloqueo cronico.
  veces: number;
  ultimaSemana: number;
  causa: CausaNoCumplimiento | null;
  avance: number;
  cantidadPlan: string | null;
  unidad: string | null;
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
          cantidadPlan: true, unidad: true, cantidadEjec: true,
          lookaheadTaskId: true,
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

  // Que tareas caen dentro de la semana del corte (para agrupar el desplegable
  // y para autocargar la semana vacia). Las TERMINADAS no se proponen: no se
  // promete lo que ya esta hecho, y proponerlo era la otra cara del mismo
  // agujero que dejaba el Lookahead ofrecer trabajo cumplido.
  const terminadasUids = tareasTerminadas(
    tareasCron.map((t) => ({
      uid: t.uid,
      porcentajeArchivo: t.porcentajeArchivo.toString(),
    })),
    ultimos,
  );
  const { inicio: iniSemana, fin: finSemana } = rangoSemana(plan.fechaCorte);
  const enSemanaUids = new Set(
    tareasDeLaSemana(tareasCron, iniSemana, finSemana, terminadasUids).map((t) => t.uid),
  );

  // El analisis del Lookahead, para que el desplegable ponga primero lo LISTO
  // y avise de lo que no lo esta. Se lee al vuelo (no se congela): si las
  // restricciones se liberan luego, el aviso desaparece solo.
  const deLookahead = await prisma.lookaheadTask.findMany({
    where: { projectId: obraId },
    select: { uid: true, estado: true, analizadaAt: true },
  });
  const lkPorUidPlan = new Map(deLookahead.map((l) => [l.uid, l]));
  const estadoLkPorUid = new Map(deLookahead.map((l) => [l.uid, l.estado]));

  // Cantidad y unidad que propone la partida mapeada de cada tarea.
  const sugerenciaPorUid = await sugerenciasPorTarea(
    obraId,
    tareasCron.filter((t) => !t.esResumen).map((t) => t.uid),
  );

  // Para el desplegable: todas las tareas de trabajo (sin resumenes), con su
  // estado de semana y su restriccion.
  const tareas: TareaOpcionPlan[] = tareasCron
    .filter((t) => !t.esResumen)
    .map((t) => {
      const r = restriccionDeTarea(t.uid, dependencias, avancePorUid, nombrePorUid);
      const s = sugerenciaPorUid.get(t.uid);
      return {
        uid: t.uid,
        codigo: t.codigo,
        nombre: t.nombre,
        enSemana: enSemanaUids.has(t.uid),
        conRestriccion: !r.libre,
        restriccion: r.motivo,
        estadoLookahead: estadoLkPorUid.get(t.uid) ?? null,
        analizadaLookahead:
          (lkPorUidPlan.get(t.uid)?.analizadaAt ?? null) !== null,
        cantidadSugerida: s?.cantidad ?? null,
        unidadSugerida: s?.unidad ?? null,
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
  //
  // Los dos filtros hacen falta y no son el mismo: `uidsHechos` mira si alguien
  // la dio por CUMPLIDA en otra semana; `terminadasUids`, si el avance
  // reportado llego al 100%. Una tarea puede estar al 100% sin que ningun
  // compromiso la declarara cumplida —se termino sin haberla prometido—.
  const sugeridas = tareasDeLaSemana(tareasCron, iniSemana, finSemana, terminadasUids)
    .filter((t) => !uidsHechos.has(t.uid))
    .map((t) => ({
      uid: t.uid,
      descripcion: `${t.codigo ? `${t.codigo} ` : ""}${t.nombre}`.slice(0, 300),
      metaPorcentaje: null as string | null,
      cantidadPlan: sugerenciaPorUid.get(t.uid)?.cantidad ?? null,
      unidad: sugerenciaPorUid.get(t.uid)?.unidad ?? null,
    }));

  // EL ARRASTRE: lo que se prometio en una semana ya CERRADA y no salio.
  //
  // Se traen tambien los CUMPLIDOS —no solo los fallidos— porque `arrastreDe
  // Incumplidos` necesita saber cual fue la ULTIMA palabra de cada tarea: una
  // que fallo la Semana 1 y se cumplio la Semana 2 va avanzando, y volver a
  // sacarla seria el ruido que hace que nadie lea la lista.
  const previos = await prisma.compromisoSemanal.findMany({
    where: {
      uid: { not: null },
      cumplido: { not: null },
      plan: { projectId: obraId, id: { not: planId }, estado: "CERRADO" },
    },
    select: {
      uid: true,
      descripcion: true,
      cumplido: true,
      causa: true,
      plan: { select: { numero: true, fechaCorte: true } },
    },
  });

  const yaEnLaSemana = new Set<number>(
    plan.compromisos.map((c) => c.uid).filter((u): u is number => u !== null),
  );

  const arrastradas: CompromisoArrastrado[] = arrastreDeIncumplidos(
    previos.map((c) => ({
      uid: c.uid,
      descripcion: c.descripcion,
      numeroSemana: c.plan.numero,
      fechaCorte: c.plan.fechaCorte,
      cumplido: c.cumplido === true,
      causa: c.causa,
    })),
    avancePorUid,
    yaEnLaSemana,
  ).map((a) => ({
    uid: a.uid,
    // El nombre vigente del cronograma manda sobre el que se guardo: si la
    // tarea se renombro, el residente busca por el nombre de ahora.
    descripcion: nombrePorUid.get(a.uid) ?? a.descripcion,
    veces: a.veces,
    ultimaSemana: a.ultimaSemana,
    causa: a.causa,
    avance: a.avance,
    cantidadPlan: sugerenciaPorUid.get(a.uid)?.cantidad ?? null,
    unidad: sugerenciaPorUid.get(a.uid)?.unidad ?? null,
  }));

  // La evidencia de todos los compromisos en una consulta, no una por fila.
  const fotosPorCompromiso = plan.compromisos.length
    ? await fotosPorDestino(sesion, obraId, {
        compromisos: plan.compromisos.map((c) => c.id),
      })
    : new Map<string, FotoResumen[]>();

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
    cantidadPlan: c.cantidadPlan?.toString() ?? null,
    unidad: c.unidad,
    cantidadEjec: c.cantidadEjec?.toString() ?? null,
    // Donde iba la tarea antes de cerrar: con la meta pactada basta para
    // deducir el «% alcanzado», y sirve de freno para no proponer nunca un
    // valor por debajo del que ya tiene.
    avanceActual:
      c.uid !== null ? (avancePorUid.get(c.uid)?.toString() ?? null) : null,
    lookaheadTaskId: c.lookaheadTaskId,
    estadoLookahead: c.uid !== null ? (estadoLkPorUid.get(c.uid) ?? null) : null,
    fotos: fotosPorCompromiso.get(c.id) ?? [],
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
    arrastradas,
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
 * Lo que puede devolver CREAR una semana, que es lo unico que ademas avisa.
 *
 * Va aparte de `ResultadoPlan` y no ensanchandolo: ese tipo lo comparten cerrar,
 * reabrir, guardar y eliminar, y ninguna de esas puede pedir confirmacion.
 * Meter el caso ahi obligaria a cuatro pantallas a tratar algo que jamas les
 * llega —el compilador lo dijo en cuanto se intento—.
 */
export type ResultadoCrearPlan =
  | ResultadoPlan
  /**
   * La fecha deja el correlativo a contramano. No es un error: es un aviso
   * que hay que confirmar.
   *
   * Misma regla que `comprometerAlPts`: **se avisa, no se impide**. Quien esta
   * en obra a veces necesita registrar una semana que se quedo sin meter, y
   * prohibirselo no le ayuda. Renumerar tampoco vale: cambiaria el numero de
   * semanas ya cerradas que estan citadas en actas y correos.
   */
  | { ok: false; requiereConfirmacion: true; aviso: string };

/**
 * Crea la semana. El correlativo se calcula dentro de la transaccion; el indice
 * unico `(projectId, fechaCorte)` impide dos planes para la misma semana.
 */
export async function crearPlanSemanal(
  sesion: SesionActiva,
  obraId: string,
  datos: { fechaCorte: string; confirmado?: boolean },
): Promise<ResultadoCrearPlan> {
  if (!puede(sesion, "plan_semanal:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar el plan semanal." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

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

  // El numero es `max(numero) + 1` y no mira la fecha, asi que una semana con
  // corte anterior a otra ya existente queda a contramano. Se dice ANTES de
  // crearla, que es cuando todavia se puede cambiar la fecha.
  if (!datos.confirmado) {
    const semanas = await prisma.planSemanal.findMany({
      where: { projectId: obraId },
      select: { numero: true, fechaCorte: true },
    });

    const desorden = avisoNumeracionSemana(fechaCorte, semanas);
    if (desorden) {
      return {
        ok: false,
        requiereConfirmacion: true,
        aviso: textoDesorden(desorden),
      };
    }
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

/**
 * El aviso de numeracion, en una frase que se pueda leer en el formulario.
 *
 * Dice las tres cosas y en este orden: que numero le va a tocar, con cual va a
 * quedar a contramano, y que eso es solo el rotulo. Lo ultimo importa: sin
 * ello, quien lo lee cree que el PPC o la tendencia van a salir mal, y no es
 * verdad —esos se ordenan por fecha—.
 */
function textoDesorden(a: AvisoNumeracion): string {
  const primera = a.desordenadas[0]!;
  const otras = a.desordenadas.length - 1;
  const mas =
    otras > 0
      ? ` y otra${otras === 1 ? "" : "s"} ${otras} más`
      : "";

  return (
    `Se creará como Semana ${a.numero}, pero cierra antes que la Semana ` +
    `${primera.numero} (${diaYMes(primera.fechaCorte)})${mas}: el número no ` +
    `seguirá al calendario. Los gráficos y el PPC sí van por fecha, así que ` +
    `solo queda raro el rótulo. ¿La creas igual?`
  );
}

function diaYMes(f: Date): string {
  const dd = String(f.getUTCDate()).padStart(2, "0");
  const mm = String(f.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

export interface DatosCompromiso {
  /// uid de la tarea del cronograma, o null/undefined si es una linea libre.
  uid?: number | null;
  descripcion: string;
  metaPorcentaje?: string | null;
  /// Cantidad planificada y su unidad (el PTS por cantidad del Last Planner).
  cantidadPlan?: string | null;
  unidad?: string | null;
  /// De que tarea del Lookahead nace (trazabilidad); se conserva al reeditar.
  lookaheadTaskId?: string | null;
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

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

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

  // La cantidad va a un Decimal(14,4): se valida igual que la meta, antes de
  // tocar la base, para no caer con un 500 por un numero mal escrito.
  const cantidades: (string | null)[] = [];
  for (const c of compromisos) {
    const v = validarCantidadPlan(c.cantidadPlan);
    if (!v.ok) return { ok: false, error: v.error };
    cantidades.push(v.valor);
  }

  const limpios = compromisos
    .map((c, i) => ({
      uid:
        c.uid === null || c.uid === undefined || !Number.isSafeInteger(c.uid)
          ? null
          : c.uid,
      descripcion: c.descripcion.trim().slice(0, 300),
      metaPorcentaje:
        c.metaPorcentaje && c.metaPorcentaje.trim()
          ? normalizarDecimal(c.metaPorcentaje, 2)
          : null,
      cantidadPlan: cantidades[i],
      unidad: c.unidad?.trim() ? c.unidad.trim().slice(0, 20) : null,
      lookaheadTaskId: c.lookaheadTaskId ?? null,
    }))
    .filter((c) => c.descripcion.length > 0);

  // La misma tarea dos veces en una semana no es un compromiso, es un descuido:
  // se avisa en vez de descartar en silencio una linea que el usuario escribio.
  const repetidos = uidsDuplicados(limpios);
  if (repetidos.length > 0) {
    return {
      ok: false,
      error: `Hay una tarea repetida en la semana (uid ${repetidos.join(", ")}). Dejala una sola vez.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    // Planificar REEMPLAZA la semana, asi que lo que esta pantalla no edita
    // (zona, subcontratista, color, protocolo) se perderia en cada guardado.
    // Se rescata por uid ANTES de borrar; `mapaPreservablePorUid` se abstiene
    // cuando hay ambiguedad.
    const previos = await tx.compromisoSemanal.findMany({
      where: { planSemanalId: planId },
      select: {
        uid: true,
        zona: true,
        proveedorId: true,
        color: true,
        protocoloCalidad: true,
        cantidadEjec: true,
      },
    });
    const preservar = mapaPreservablePorUid(
      previos.map((p) => ({ ...p, cantidadEjec: p.cantidadEjec?.toString() ?? null })),
      limpios,
    );

    await tx.compromisoSemanal.deleteMany({ where: { planSemanalId: planId } });
    if (limpios.length > 0) {
      await tx.compromisoSemanal.createMany({
        data: limpios.map((c) => {
          const guardado = c.uid !== null ? preservar.get(c.uid) : undefined;
          return {
            planSemanalId: planId,
            uid: c.uid,
            descripcion: c.descripcion,
            metaPorcentaje: c.metaPorcentaje,
            cantidadPlan: c.cantidadPlan,
            unidad: c.unidad,
            lookaheadTaskId: c.lookaheadTaskId,
            zona: guardado?.zona ?? null,
            proveedorId: guardado?.proveedorId ?? null,
            color: guardado?.color ?? null,
            protocoloCalidad: guardado?.protocoloCalidad ?? false,
            cantidadEjec: guardado?.cantidadEjec ?? null,
          };
        }),
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
  /// Cuanto se EJECUTO de verdad, en la unidad del compromiso. Es la otra
  /// mitad del PTS por cantidad: sin esto se compromete "120 m2" y al cerrar
  /// solo se puede decir "cumplido", que es justo lo que no se queria medir.
  cantidadEjec?: string | null;
}

export type ResultadoCerrarPlan =
  | { ok: true; id: string }
  | { ok: false; error: string }
  /**
   * Hay compromisos que se van a dar por cumplidos sin dejar avance. No es un
   * error: es un aviso que hay que ver antes de cerrar.
   *
   * Misma regla que el resto de GCM —se avisa, no se impide—. A veces el
   * residente de verdad no sabe el porcentaje, y prohibirle cerrar la semana
   * por eso le dejaria el PPC sin registrar, que es peor.
   */
  | {
      ok: false;
      requiereConfirmacion: true;
      sinAvance: { compromisoId: string; descripcion: string }[];
    }
  /**
   * La semana no tiene ni un compromiso. Cerrarla esta permitido —la obra
   * paro, o se creo por error y se prefiere cerrarla a borrarla— pero no
   * aporta nada: no da PPC, y desde el 17 de agosto de 2026 tampoco entra en
   * la media de capacidad, porque hundia el rendimiento y disparaba el aviso
   * de sobrecarga sin que el equipo hubiera cambiado.
   *
   * Se avisa para que nadie cierre una semana vacia creyendo que registra
   * algo. Se avisa, no se impide, como en el resto de GCM.
   */
  | { ok: false; requiereConfirmacion: true; semanaVacia: true };

/**
 * Cierra la semana: marca cada compromiso cumplido/no y, si no, su causa; deja
 * el plan CERRADO. De aqui sale el PPC y el Pareto.
 *
 * Un no cumplido SIN causa se rechaza: la causa es justo lo que hace util el
 * cierre —sin ella no hay aprendizaje ni Pareto—.
 *
 * Y un CUMPLIDO sin porcentaje ni meta avisa antes de pasar. No se rechaza
 * —cerrar la semana sigue siendo mas importante que el dato fino— pero tampoco
 * se deja pasar en silencio: en CRIOCORD, cinco cumplidos asi dejaron el PPC
 * al 100% con la curva marcando esas partidas al 0%, y durante dias el
 * Lookahead las ofrecio como trabajo por preparar.
 */
export async function cerrarPlanSemanal(
  sesion: SesionActiva,
  obraId: string,
  planId: string,
  evaluaciones: Evaluacion[],
  /// Segunda pasada: ya se vio el aviso de los cumplidos sin avance y se cierra
  /// igual.
  confirmado = false,
): Promise<ResultadoCerrarPlan> {
  if (!puede(sesion, "plan_semanal:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar el plan semanal." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const plan = await prisma.planSemanal.findFirst({
    where: { id: planId, projectId: obraId, project: { companyId: sesion.companyId } },
    select: {
      id: true,
      estado: true,
      numero: true,
      fechaCorte: true,
      compromisos: {
        select: {
          id: true,
          uid: true,
          metaPorcentaje: true,
          descripcion: true,
          // Lo comprometido en cantidad: es contra esto contra lo que se mide
          // si se cumplio, cuando el compromiso se pacto por cantidad.
          cantidadPlan: true,
        },
      },
    },
  });
  if (!plan) return { ok: false, error: "Plan no encontrado." };
  if (plan.estado !== "ABIERTO") {
    return { ok: false, error: "La semana ya esta cerrada." };
  }

  // Semana sin compromisos: se puede cerrar, pero que quede dicho que no
  // registra nada. Va ANTES de recorrer las evaluaciones porque no hay
  // ninguna que recorrer.
  if (plan.compromisos.length === 0 && !confirmado) {
    return { ok: false, requiereConfirmacion: true, semanaVacia: true };
  }

  const idsPlan = new Set(plan.compromisos.map((c) => c.id));
  const porId = new Map<string, Evaluacion>();
  for (const e of evaluaciones) {
    if (!idsPlan.has(e.compromisoId)) {
      // Casi siempre significa que la pantalla quedo desfasada: guardar la
      // planificacion borra los compromisos y los recrea con otros ids, y
      // hasta el 11 de agosto de 2026 el formulario de cierre se quedaba con
      // los viejos. Ya no deberia pasar, pero si pasa hay que decir que hacer
      // y no dejar a nadie delante de un callejon sin salida.
      return {
        ok: false,
        error:
          "La lista de compromisos cambió mientras cerrabas la semana. Recarga la página y vuelve a marcarla.",
      };
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
    // La cantidad ejecutada usa la MISMA validacion que la planificada: misma
    // columna, mismas reglas (nada de negativos ni de comas ambiguas).
    const ejec = validarCantidadPlan(e.cantidadEjec);
    if (!ejec.ok) return { ok: false, error: ejec.error };
    porId.set(e.compromisoId, e);
  }

  /**
   * Lo que se va a guardar como cumplido, con la CANTIDAD mandando cuando la
   * hay: 30 de los 120 m2 comprometidos no es cumplido aunque la casilla diga
   * que si. Ver `lib/cierre-cantidad`.
   *
   * Se resuelve UNA vez y se usa en los dos sitios que dependen de ello —el
   * aviso previo y la escritura—. Si el aviso mirara la casilla y la escritura
   * la cantidad, se preguntaria por compromisos que acaban no cumplidos, que
   * es la peor forma de pedir una confirmacion.
   */
  const ejecutadaDe = (e: Evaluacion | undefined): string | null => {
    const v = validarCantidadPlan(e?.cantidadEjec);
    return v.ok ? v.valor : null;
  };
  const cumplidoPorId = new Map<string, boolean>(
    plan.compromisos.map((c) => {
      const e = porId.get(c.id);
      return [
        c.id,
        cumplidoAlCerrar({
          // Sin evaluar se cierra como NO cumplido: no marcarlo no lo aprueba.
          marcado: e?.cumplido ?? false,
          cantidadPlan: c.cantidadPlan?.toString() ?? null,
          cantidadEjec: ejecutadaDe(e),
        }),
      ];
    }),
  );

  // Los que se van a dar por cumplidos sin dejar avance. Se pregunta DESPUES de
  // validar —para no avisar de esto cuando ademas hay un error que corregir— y
  // ANTES de escribir nada.
  if (!confirmado) {
    const sinAvance = cumplidosSinAvance(
      plan.compromisos.map((c) => {
        const e = porId.get(c.id);
        return {
          compromisoId: c.id,
          uid: c.uid,
          descripcion: c.descripcion,
          cumplido: cumplidoPorId.get(c.id) ?? false,
          porcentajeReal: e?.porcentajeReal,
          metaPorcentaje: c.metaPorcentaje?.toString() ?? null,
        };
      }),
    );
    if (sinAvance.length > 0) {
      return { ok: false, requiereConfirmacion: true, sinAvance };
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const c of plan.compromisos) {
      const e = porId.get(c.id);
      // Un compromiso sin evaluar se cierra como NO cumplido (honesto: no
      // marcarlo no lo aprueba).
      const cumplido = cumplidoPorId.get(c.id) ?? false;
      await tx.compromisoSemanal.update({
        where: { id: c.id },
        data: {
          cumplido,
          causa: cumplido ? null : (e?.causa ?? "OTRA"),
          notaCierre: e?.nota?.trim() ? e.nota.trim() : null,
          // Lo ejecutado de verdad. Si no se anota, se deja como estaba en vez
          // de borrarlo: reabrir y cerrar otra vez no debe perder la medicion.
          ...(() => {
            const v = validarCantidadPlan(e?.cantidadEjec);
            return v.ok && v.valor !== null ? { cantidadEjec: v.valor } : {};
          })(),
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
      Math.min(plan.fechaCorte.getTime(), hoy().getTime()),
    );
    let avancesRegistrados = 0;
    for (const c of plan.compromisos) {
      if (c.uid == null) continue;
      const e = porId.get(c.id);
      // La regla vive en `@/lib/plan-semanal` y esta probada: sin porcentaje
      // escrito y sin meta pactada NO se registra avance. Antes se escribia un
      // 100 que daba por terminada la tarea entera y falsificaba la curva S.
      const bruto = porcentajeARegistrar({
        porcentajeReal: e?.porcentajeReal,
        cumplido: e?.cumplido,
        metaPorcentaje: c.metaPorcentaje?.toString(),
      });
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

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

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
 * Corrige la fecha de corte de una semana ABIERTA.
 *
 * Existe porque el numero de una semana es `max(numero) + 1` y no mira la
 * fecha: crear la Semana 3 con corte 14/08 despues de una Semana 2 que cierra
 * el 15/08 deja el rotulo cruzado para siempre. El aviso de `crearPlanSemanal`
 * lo dice antes de crearla, pero las que ya estaban creadas cuando ese aviso no
 * existia no tenian arreglo: solo borrar y rehacer, que sube el correlativo.
 *
 * Se corrige la FECHA y no el NUMERO, y esa eleccion es la de siempre en GCM:
 * renumerar cambiaria el rotulo de semanas ya cerradas que estan citadas en
 * actas y correos. La fecha, en cambio, describe un hecho —que dia cierra esta
 * semana— y si esta mal, esta mal.
 *
 * Solo sobre semanas ABIERTAS. Mover el corte de una cerrada moveria su punto
 * en la tendencia del PPC y el reparto de lo arrastrado, que ya se leyeron y se
 * firmaron; para eso esta reabrir, que deja rastro.
 */
export async function corregirFechaCorte(
  sesion: SesionActiva,
  obraId: string,
  planId: string,
  fecha: string,
): Promise<ResultadoPlan> {
  if (!puede(sesion, "plan_semanal:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar el plan semanal." };
  }

  const cerradaObra = await motivoSiObraCerrada(sesion, obraId);
  if (cerradaObra) return { ok: false, error: cerradaObra };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: "La fecha no es válida." };
  }

  const plan = await prisma.planSemanal.findFirst({
    where: { id: planId, projectId: obraId, project: { companyId: sesion.companyId } },
    select: { id: true, numero: true, fechaCorte: true, estado: true },
  });
  if (!plan) return { ok: false, error: "Plan no encontrado." };
  if (plan.estado === "CERRADO") {
    return {
      ok: false,
      error: "La semana está cerrada. Reábrela si de verdad hay que mover su corte.",
    };
  }

  const nueva = fechaDeObra(fecha);
  if (nueva.getTime() === plan.fechaCorte.getTime()) return { ok: true, id: planId };

  // El indice unico `(projectId, fechaCorte)` lo impediria igual, pero el error
  // de base de datos no explica nada a quien esta mirando la pantalla.
  const ocupada = await prisma.planSemanal.findFirst({
    where: { projectId: obraId, fechaCorte: nueva, NOT: { id: planId } },
    select: { numero: true },
  });
  if (ocupada) {
    return { ok: false, error: `La Semana ${ocupada.numero} ya cierra ese día.` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.planSemanal.update({
      where: { id: planId },
      data: { fechaCorte: nueva },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "PlanSemanal",
        entidadId: planId,
        accion: "UPDATE",
        antes: { fechaCorte: plan.fechaCorte.toISOString().slice(0, 10) },
        despues: { numero: plan.numero, fechaCorte: fecha },
      },
    });
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

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

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


// ---------------------------------------------------------------------------
// Del Lookahead al PTS
// ---------------------------------------------------------------------------

export interface SemanaAbierta {
  id: string;
  numero: number;
  fechaCorte: Date;
}

/// Las semanas que todavia admiten compromisos (para elegir destino).
export async function planesAbiertos(
  sesion: SesionActiva,
  obraId: string,
): Promise<SemanaAbierta[]> {
  if (!puede(sesion, "plan_semanal:leer")) return [];

  return prisma.planSemanal.findMany({
    where: {
      projectId: obraId,
      estado: "ABIERTO",
      project: { companyId: sesion.companyId },
    },
    orderBy: { fechaCorte: "asc" },
    select: { id: true, numero: true, fechaCorte: true },
  });
}

/**
 * La cantidad y unidad que se pueden proponer para cada tarea, sacadas de las
 * partidas que tiene mapeadas. Dos consultas planas y el cruce en memoria (el
 * mismo patron de `obtenerMapeo`): nada de cargar el presupuesto entero.
 */
async function sugerenciasPorTarea(
  obraId: string,
  uids: number[],
): Promise<Map<number, { unidad: string | null; cantidad: string | null }>> {
  const vacio = new Map<number, { unidad: string | null; cantidad: string | null }>();
  if (uids.length === 0) return vacio;

  const mapeos = await prisma.mapeoTareaPartida.findMany({
    where: { projectId: obraId, uid: { in: uids } },
    select: { uid: true, codigoPartida: true },
  });
  if (mapeos.length === 0) return vacio;

  const partidas = await prisma.wbsItem.findMany({
    where: {
      projectId: obraId,
      codigoPartida: { in: [...new Set(mapeos.map((m) => m.codigoPartida))] },
    },
    select: { codigoPartida: true, unidad: true, metrado: true },
  });
  const porCodigo = new Map(partidas.map((p) => [p.codigoPartida, p] as const));

  const porUid = new Map<number, { unidad: string | null; metrado: string | null }[]>();
  for (const m of mapeos) {
    const p = porCodigo.get(m.codigoPartida);
    if (!p) continue;
    const lista = porUid.get(m.uid) ?? [];
    lista.push({ unidad: p.unidad, metrado: p.metrado?.toString() ?? null });
    porUid.set(m.uid, lista);
  }

  for (const [uid, lista] of porUid) {
    const s = sugerirCantidad(lista);
    vacio.set(uid, { unidad: s.unidad, cantidad: s.cantidad });
  }
  return vacio;
}


export interface DatosComprometer {
  /// Semana destino; null = crear la del proximo corte.
  planId: string | null;
  uids: number[];
  /// El usuario ya vio y acepto los avisos (tareas no listas, repetidas).
  confirmado: boolean;
}

export interface AvisoComprometer {
  uid: number;
  nombre: string;
  /// En que otra semana ya esta comprometida, si es el caso.
  semana?: number;
  /**
   * Si esa otra semana ya esta CERRADA y si alli se dio por cumplida.
   *
   * Sin esto, el dialogo decia lo mismo —«ya comprometida en la Semana 2»—
   * tanto si la tarea sigue viva en una semana en marcha como si se cumplio y
   * se cerro hace dias. Son avisos opuestos: el primero es un solape que hay
   * que resolver; el segundo es volver a prometer trabajo hecho.
   */
  cerrada?: boolean;
  cumplida?: boolean;
}

export type ResultadoComprometer =
  | {
      ok: true;
      planId: string;
      numero: number;
      agregados: number;
      /// Ya estaban en esa misma semana: se omiten sin ruido.
      omitidos: number;
    }
  | {
      ok: false;
      error?: string;
      /// El servidor exige una vuelta mas: hay que confirmar estos avisos.
      requiereConfirmacion?: {
        /// Analizadas, pero con alguna restriccion sin levantar.
        noListas: AvisoComprometer[];
        /// Nadie ha dicho todavia que restricciones les aplican. Van aparte de
        /// `noListas` porque no es el mismo problema: acusar de "sin liberar" a
        /// una tarea que no tiene ninguna restriccion es un aviso falso, y un
        /// aviso falso ensena a saltarse el dialogo entero.
        sinAnalizar: AvisoComprometer[];
        enOtraSemana: AvisoComprometer[];
      };
    };


/**
 * Lleva tareas del Lookahead al PTS: crea sus compromisos en una semana.
 *
 * A diferencia de `guardarCompromisos` (que reemplaza la semana entera), esto
 * AÑADE: comprometer desde el Lookahead no puede arrasar lo que el residente ya
 * habia planificado.
 *
 * El Last Planner dice que solo lo LISTO se compromete, pero la obra a veces
 * arranca igual: no se prohibe, se avisa. Si hay tareas sin liberar o ya
 * comprometidas en otra semana, la primera llamada NO escribe nada y devuelve
 * los avisos; el usuario confirma y se repite con `confirmado`.
 */
export async function comprometerAlPts(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosComprometer,
): Promise<ResultadoComprometer> {
  if (!puede(sesion, "plan_semanal:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar el plan semanal." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const uids = [...new Set(datos.uids.filter((u) => Number.isSafeInteger(u)))];
  if (uids.length === 0) return { ok: false, error: "No elegiste ninguna tarea." };

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true, diaCorteSemanal: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  // Las tareas deben existir en el cronograma vigente de ESTA obra: el uid
  // llega del cliente y no se puede creer sin comprobarlo.
  const cronograma = await prisma.cronograma.findFirst({
    where: { projectId: obraId },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: {
      tareas: {
        where: { uid: { in: uids } },
        select: { uid: true, codigo: true, nombre: true, esResumen: true },
      },
    },
  });
  const tareas = (cronograma?.tareas ?? []).filter((t) => !t.esResumen);
  if (tareas.length === 0) {
    return { ok: false, error: "Las tareas no estan en el cronograma vigente." };
  }
  const nombreDe = (t: { codigo: string | null; nombre: string }) =>
    `${t.codigo ? `${t.codigo} ` : ""}${t.nombre}`.slice(0, 300);


  // Semana destino: la pedida (debe estar abierta) o la del proximo corte.
  const abiertas = await planesAbiertos(sesion, obraId);
  let planId = datos.planId;
  if (planId !== null && !abiertas.some((p) => p.id === planId)) {
    return { ok: false, error: "Esa semana ya no esta abierta. Vuelve a elegir." };
  }

  // Avisos: lo que no esta LISTO y lo que ya vive en otra semana.
  const lookahead = await prisma.lookaheadTask.findMany({
    where: { projectId: obraId, uid: { in: uids } },
    select: { uid: true, id: true, estado: true, analizadaAt: true },
  });
  const lkPorUid = new Map(lookahead.map((l) => [l.uid, l]));

  const yaEnAlguna = await prisma.compromisoSemanal.findMany({
    where: { uid: { in: uids }, plan: { projectId: obraId } },
    select: {
      uid: true,
      cumplido: true,
      plan: { select: { id: true, numero: true, estado: true } },
    },
    // Si una tarea aparece en varias semanas se avisa de la MAS RECIENTE, que
    // es la que describe donde esta ahora.
    orderBy: { plan: { fechaCorte: "desc" } },
  });

  const noListas: AvisoComprometer[] = [];
  const sinAnalizar: AvisoComprometer[] = [];
  const enOtraSemana: AvisoComprometer[] = [];
  for (const t of tareas) {
    const lk = lkPorUid.get(t.uid);
    // Los dos siguen exigiendo confirmacion —comprometer lo que nadie ha
    // revisado es exactamente el fallo que el Last Planner quiere hacer
    // visible— pero el dialogo tiene que decir cual de los dos es.
    if (lk == null || lk.analizadaAt === null) {
      sinAnalizar.push({ uid: t.uid, nombre: nombreDe(t) });
    } else if (lk.estado !== "LISTO") {
      noListas.push({ uid: t.uid, nombre: nombreDe(t) });
    }
    const otra = yaEnAlguna.find((c) => c.uid === t.uid && c.plan.id !== planId);
    if (otra) {
      enOtraSemana.push({
        uid: t.uid,
        nombre: nombreDe(t),
        semana: otra.plan.numero,
        cerrada: otra.plan.estado === "CERRADO",
        cumplida: otra.cumplido === true,
      });
    }
  }

  if (
    !datos.confirmado &&
    (noListas.length > 0 || sinAnalizar.length > 0 || enOtraSemana.length > 0)
  ) {
    return {
      ok: false,
      requiereConfirmacion: { noListas, sinAnalizar, enOtraSemana },
    };
  }

  const sugerencias = await sugerenciasPorTarea(obraId, uids);


  try {
    return await prisma.$transaction(async (tx) => {
      // Sin semana elegida se abre la del proximo corte, con el mismo
      // correlativo dentro de transaccion que usa `crearPlanSemanal`.
      let numero: number;
      if (planId === null) {
        const fechaCorte = proximoCorte(obra.diaCorteSemanal, hoy());
        const existente = await tx.planSemanal.findFirst({
          where: { projectId: obraId, fechaCorte },
          select: { id: true, numero: true, estado: true },
        });
        if (existente && existente.estado !== "ABIERTO") {
          return {
            ok: false as const,
            error: "La semana de esa fecha esta cerrada. Reabrela o elige otra.",
          };
        }
        if (existente) {
          planId = existente.id;
          numero = existente.numero;
        } else {
          const ultimo = await tx.planSemanal.aggregate({
            where: { projectId: obraId },
            _max: { numero: true },
          });
          numero = (ultimo._max.numero ?? 0) + 1;
          const creado = await tx.planSemanal.create({
            data: { projectId: obraId, numero, fechaCorte, creadoPor: quien(sesion) },
            select: { id: true },
          });
          planId = creado.id;
        }
      } else {
        numero = abiertas.find((p) => p.id === planId)?.numero ?? 0;
      }


      // Lo que ya esta en ESTA semana se omite: comprometer dos veces la misma
      // tarea en la misma semana no significa nada. Se relee dentro de la
      // transaccion para que dos usuarios a la vez no la dupliquen.
      const yaEnEsta = await tx.compromisoSemanal.findMany({
        where: { planSemanalId: planId, uid: { in: uids } },
        select: { uid: true },
      });
      const presentes = new Set(yaEnEsta.map((c) => c.uid));
      const nuevas = tareas.filter((t) => !presentes.has(t.uid));

      if (nuevas.length > 0) {
        await tx.compromisoSemanal.createMany({
          data: nuevas.map((t) => {
            const s = sugerencias.get(t.uid);
            return {
              planSemanalId: planId as string,
              uid: t.uid,
              descripcion: nombreDe(t),
              cantidadPlan: s?.cantidad ?? null,
              unidad: s?.unidad ?? null,
              lookaheadTaskId: lkPorUid.get(t.uid)?.id ?? null,
            };
          }),
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
          despues: {
            evento: "comprometer",
            uids: nuevas.map((t) => t.uid),
            noListas: noListas.map((a) => a.uid),
            sinAnalizar: sinAnalizar.map((a) => a.uid),
          },
        },
      });

      return {
        ok: true as const,
        planId: planId as string,
        numero,
        agregados: nuevas.length,
        omitidos: tareas.length - nuevas.length,
      };
    });
  } catch {
    return { ok: false, error: "No se pudo comprometer. Vuelve a intentarlo." };
  }
}


// ---------------------------------------------------------------------------

export interface SemanaDeObra {
  obraId: string;
  obra: string;
  planId: string;
  numero: number;
  fechaCorte: Date;
  /// Compromisos del plan abierto que siguen sin evaluar (`cumplido = null`).
  sinEvaluar: number;
  total: number;
  /// El corte ya paso y la semana sigue abierta: habia que cerrarla.
  vencida: boolean;
  /**
   * PPC de la ULTIMA semana ya cerrada de esa obra.
   *
   * `null` cuando no se puede saber —no hay semana cerrada, o la habia sin
   * compromisos—, nunca cero. Es la misma regla que ya fijaron los
   * indicadores del Lookahead: un cero se lee como «se incumple todo», que es
   * lo contrario de «no hay dato».
   */
  ppcAnterior: number | null;
}

/**
 * El estado del ritual semanal en TODA la empresa, para la pagina de inicio.
 *
 * Responde la pregunta que el panel no contestaba: **que me toca esta
 * semana**. Las cifras que ya habia son de dinero y de plazo, y el ritual
 * —cerrar la semana, evaluar los compromisos— solo se veia entrando obra por
 * obra.
 *
 * Es de empresa a proposito, por el mismo motivo escrito para los avisos del
 * panel: el plan que se te pasa es justo el de la obra que no estas mirando.
 *
 * NO devuelve un PPC agregado de la empresa, y es una decision, no un olvido:
 * promediar el PPC de una obra con tres compromisos y otra con cuarenta trata
 * igual dos cosas que no lo son. Cada obra trae el suyo.
 *
 * Las obras CERRADAS quedan fuera: en una obra cerrada no hay nada que hacer
 * esta semana, y si arrastraba un plan sin cerrar seria ruido permanente.
 */
export async function semanaDeLaEmpresa(
  sesion: SesionActiva,
): Promise<SemanaDeObra[]> {
  // Sin el permiso no se devuelve nada, igual que `planesAbiertos`: la franja
  // simplemente no se pinta para quien no sigue el Last Planner.
  if (!puede(sesion, "plan_semanal:leer")) return [];

  const abiertos = await prisma.planSemanal.findMany({
    where: {
      estado: "ABIERTO",
      project: {
        companyId: sesion.companyId,
        estado: { not: "CERRADA" },
      },
    },
    orderBy: { fechaCorte: "asc" },
    select: {
      id: true,
      numero: true,
      fechaCorte: true,
      projectId: true,
      project: { select: { nombreObra: true } },
      // Solo el booleano de cada compromiso: es lo unico que hace falta para
      // contar los que faltan por evaluar, y evita traer descripciones,
      // cantidades y zonas de toda la empresa a la pagina mas visitada.
      compromisos: { select: { cumplido: true } },
    },
  });

  if (abiertos.length === 0) return [];

  const ppcPorObra = await ppcDeLaUltimaCerrada(
    abiertos.map((p) => p.projectId),
  );

  const corteDeHoy = hoy();

  return abiertos.map((plan) => ({
    obraId: plan.projectId,
    obra: plan.project.nombreObra,
    planId: plan.id,
    numero: plan.numero,
    fechaCorte: plan.fechaCorte,
    sinEvaluar: plan.compromisos.filter((c) => c.cumplido === null).length,
    total: plan.compromisos.length,
    vencida: plan.fechaCorte < corteDeHoy,
    ppcAnterior: ppcPorObra.get(plan.projectId) ?? null,
  }));
}

/**
 * El PPC de la ultima semana cerrada de cada obra, en dos consultas.
 *
 * Se hace en dos pasos y no en una sola porque la ingenua —traer los planes
 * cerrados de esas obras y quedarse con el ultimo en memoria— arrastra el
 * historial ENTERO: con un año de obra son cincuenta semanas por obra, con
 * todos sus compromisos, para acabar usando una de cada cincuenta.
 *
 * Primero se pregunta a la base cual es la fecha de corte mas alta de cada
 * obra, que es un agregado barato, y solo despues se piden esos planes.
 */
async function ppcDeLaUltimaCerrada(
  obraIds: readonly string[],
): Promise<Map<string, number | null>> {
  const porObra = new Map<string, number | null>();

  const ultimas = await prisma.planSemanal.groupBy({
    by: ["projectId"],
    where: { estado: "CERRADO", projectId: { in: [...obraIds] } },
    _max: { fechaCorte: true },
  });

  const pares = ultimas.flatMap((u) =>
    u._max.fechaCorte
      ? [{ projectId: u.projectId, fechaCorte: u._max.fechaCorte }]
      : [],
  );
  if (pares.length === 0) return porObra;

  const planes = await prisma.planSemanal.findMany({
    where: { OR: pares },
    select: {
      projectId: true,
      // `causa` no se usa para calcular el PPC, pero es parte de lo que define
      // un compromiso ya evaluado y `ppcDePlan` la pide en su tipo. Se trae en
      // vez de recortar el tipo compartido: cuesta una columna y deja el dato
      // listo si algun dia el PPC separa los incumplidos por causa.
      compromisos: { select: { cumplido: true, causa: true } },
    },
  });

  for (const plan of planes) {
    // `ppcDePlan` es el MISMO calculo que la pantalla de la obra, no una copia
    // aparte: si algun dia cambia que cuenta como cumplido, cambia en los dos
    // sitios a la vez. Ya devuelve null cuando no hay compromisos.
    porObra.set(plan.projectId, ppcDePlan(plan.compromisos).ppc);
  }

  return porObra;
}
