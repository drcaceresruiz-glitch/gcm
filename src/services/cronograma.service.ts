import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import {
  medirAvance,
  ultimoAvancePorTarea,
  type AvanceReportado,
  type Medida,
} from "@/lib/cronograma";
import { normalizarDecimal, restar } from "@/lib/decimal";
import { obraAdmiteCambios, OBRA_CERRADA } from "@/lib/obras";
import { hoy as hoyCalendario } from "@/utils/fechas";
import {
  curvaPlaneada,
  fechasSemanales,
  planeadoEnFecha,
  ponderarPorDuracion,
  proyectar,
  serieCurvaS,
  serieRealPorFechas,
  type PuntoCurva,
  type PuntoDiario,
} from "@/lib/curva-s";
import type { ResultadoAnalisisCronograma } from "@/lib/msproject-xml";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Escritura y lectura del cronograma.
 *
 * El analisis del XML vive en `@/lib/msproject-xml` y el cruce con el avance
 * en `@/lib/cronograma`: los dos son logica pura y se prueban sin base de
 * datos ni servidor. Aqui solo queda lo que toca datos, que es donde importan
 * los permisos y el aislamiento por empresa.
 *
 * A diferencia del presupuesto NO hay "reemplazar": cada corte es una version
 * nueva y no se destruye nada, asi que tampoco hace falta el equivalente a
 * `analizarRiesgoDeReemplazo`.
 */

export type ResultadoImportacionCronograma =
  | { ok: true; version: number; tareas: number; dependencias: number; yaEstaba?: false }
  | { ok: true; version: number; tareas: number; dependencias: number; yaEstaba: true }
  | { ok: false; error: string };

/**
 * Convierte la fecha del lector en la fecha de calendario que espera la base.
 *
 * El lector devuelve "YYYY-MM-DD" a proposito, sin construir ningun `Date`.
 * Aqui se ancla a medianoche UTC, que es como Prisma guarda y devuelve las
 * columnas `@db.Date` y lo que `utils/fechas.ts` sabe deshacer. Usar
 * `new Date("2026-08-01")` local correria un dia todo el cronograma.
 */
function fechaDeObra(texto: string): Date {
  return new Date(`${texto}T00:00:00Z`);
}

export async function importarCronograma(
  sesion: SesionActiva,
  obraId: string,
  analisis: ResultadoAnalisisCronograma,
  archivo: string,
): Promise<ResultadoImportacionCronograma> {
  // La pantalla ya exige el permiso, pero se comprueba aqui igualmente: los
  // servicios son la frontera real y una ruta nueva podria llamar a esto sin
  // pasar por alli.
  if (!puede(sesion, "cronograma:importar")) {
    return { ok: false, error: "No tienes permiso para importar el cronograma." };
  }

  if (analisis.tareas.length === 0) {
    return { ok: false, error: "El archivo no trae ninguna tarea que importar." };
  }

  /**
   * Sin fecha de corte no se importa.
   *
   * El `<StatusDate>` es lo que identifica el corte y lo que despues situa
   * cada punto de la curva S en su sitio. Inventarlo —poniendo hoy, por
   * ejemplo— es exactamente lo que este modulo no hace: preferimos pedir el
   * archivo bien exportado a guardar un dato que nadie escribio.
   */
  if (!analisis.fechaCorte) {
    return {
      ok: false,
      error:
        "El archivo no trae fecha de estado (<StatusDate>). Fijala en MS Project " +
        "y vuelve a exportarlo: es la fecha a la que estan referidos los avances.",
    };
  }

  // El filtro por empresa sale de la sesion: es lo que impide cargar un
  // cronograma en la obra de otro cliente manipulando el identificador.
  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true, estado: true },
  });

  if (!obra) return { ok: false, error: "Obra no encontrada." };

  if (!obraAdmiteCambios(obra.estado)) {
    return { ok: false, error: OBRA_CERRADA };
  }

  const fechaCorte = fechaDeObra(analisis.fechaCorte);

  /**
   * Un corte ya cargado no se vuelve a cargar.
   *
   * La comparacion es por `<StatusDate>` y no por el contenido del archivo.
   * De la misma semana hay dos exports distintos —uno de ellos guardado con
   * otra configuracion, con campos que cambian sin que el plan cambie—, y
   * compararlos byte a byte los daria por cortes diferentes: la curva S
   * acabaria con dos puntos sobre el mismo dia.
   */
  const mismoCorte = await prisma.cronograma.findFirst({
    where: { projectId: obraId, fechaCorte },
    select: { version: true, _count: { select: { tareas: true, dependencias: true } } },
  });

  if (mismoCorte) {
    return {
      ok: true,
      yaEstaba: true,
      version: mismoCorte.version,
      tareas: mismoCorte._count.tareas,
      dependencias: mismoCorte._count.dependencias,
    };
  }

  try {
    const version = await prisma.$transaction(async (tx) => {
      // La version se calcula DENTRO de la transaccion y contra lo guardado,
      // como hace `aprobarOrden`. El indice unico (projectId, version) es la
      // red de seguridad si dos importaciones coinciden en el tiempo.
      const ultima = await tx.cronograma.findFirst({
        where: { projectId: obraId },
        orderBy: { version: "desc" },
        select: { version: true },
      });

      const siguiente = (ultima?.version ?? 0) + 1;

      const cronograma = await tx.cronograma.create({
        data: {
          projectId: obraId,
          version: siguiente,
          fechaCorte,
          nombreProyecto: analisis.nombreProyecto || "Cronograma",
          minutosPorDia: analisis.minutosPorDia,
          archivo: archivo.slice(0, 255),
          importadoPor: `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150),
        },
        select: { id: true, version: true },
      });

      await tx.tareaCronograma.createMany({
        data: analisis.tareas.map((t) => ({
          cronogramaId: cronograma.id,
          uid: t.uid,
          fila: t.fila,
          codigo: t.codigo,
          nombre: t.nombre,
          nivel: t.nivel,
          esResumen: t.esResumen,
          esHito: t.esHito,
          esCritico: t.esCritico,
          inicio: fechaDeObra(t.inicio),
          fin: fechaDeObra(t.fin),
          duracionDias: t.duracionDias,
          porcentajePlaneado: t.porcentajePlaneado,
          porcentajeArchivo: t.porcentajeArchivo,
          holguraDias: t.holguraDias,
          holguraInferida: t.holguraInferida,
        })),
      });

      if (analisis.dependencias.length > 0) {
        await tx.dependenciaTarea.createMany({
          data: analisis.dependencias.map((d) => ({
            cronogramaId: cronograma.id,
            tareaUid: d.tareaUid,
            predecesoraUid: d.predecesoraUid,
            tipo: d.tipo,
            desfaseDias: d.desfaseDias,
          })),
        });
      }

      // Se audita UNA vez por importacion y no por tarea, como en el
      // presupuesto: 107 apuntes por archivo ahogarian el registro de
      // actividad y no dirian nada que este no diga.
      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: obraId,
          entidad: "Cronograma",
          entidadId: cronograma.id,
          accion: "CREATE",
          despues: {
            origen: "importacion-msproject",
            version: cronograma.version,
            archivo: archivo.slice(0, 255),
            fechaCorte: analisis.fechaCorte,
            tareas: analisis.tareas.length,
            dependencias: analisis.dependencias.length,
          },
        },
      });

      return cronograma.version;
    });

    return {
      ok: true,
      version,
      tareas: analisis.tareas.length,
      dependencias: analisis.dependencias.length,
    };
  } catch {
    // Casi siempre, dos importaciones a la vez chocando contra el indice
    // unico. Se pide reintentar en vez de exponer el error de la base.
    return {
      ok: false,
      error: "No se pudo guardar el cronograma. Vuelve a intentarlo en unos segundos.",
    };
  }
}

export interface TareaDelPlan {
  uid: number;
  fila: number;
  codigo: string | null;
  nombre: string;
  nivel: number;
  esResumen: boolean;
  esHito: boolean;
  esCritico: boolean;
  inicio: Date;
  fin: Date;
  duracionDias: string;
  porcentajePlaneado: string;
  porcentajeArchivo: string;
  holguraDias: string;
  holguraInferida: boolean;
}

export interface DependenciaDelPlan {
  tareaUid: number;
  predecesoraUid: number;
  tipo: string;
  desfaseDias: string;
}

export interface CronogramaVigente {
  id: string;
  version: number;
  fechaCorte: Date;
  nombreProyecto: string;
  archivo: string;
  importadoAt: Date;
  importadoPor: string;
  tareas: (TareaDelPlan & Medida)[];
  dependencias: DependenciaDelPlan[];
  /// Reportes de obra cuya tarea ya no esta en el cronograma vigente.
  huerfanos: AvanceReportado[];
}

/**
 * El cronograma que rige hoy, con el avance de obra ya cruzado.
 *
 * "El ultimo" es el del corte mas reciente y no el de numero de version mas
 * alto: nada impide cargar despues un corte antiguo para completar el
 * historico, y eso no debe cambiar cual es el plan vigente.
 */
export async function obtenerCronograma(
  sesion: SesionActiva,
  obraId: string,
): Promise<CronogramaVigente | null> {
  if (!puede(sesion, "cronograma:leer")) return null;

  const cronograma = await prisma.cronograma.findFirst({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: {
      id: true,
      version: true,
      fechaCorte: true,
      nombreProyecto: true,
      archivo: true,
      importadoAt: true,
      importadoPor: true,
      tareas: {
        orderBy: { fila: "asc" },
        select: {
          uid: true, fila: true, codigo: true, nombre: true, nivel: true,
          esResumen: true, esHito: true, esCritico: true,
          inicio: true, fin: true, duracionDias: true,
          porcentajePlaneado: true, porcentajeArchivo: true,
          holguraDias: true, holguraInferida: true,
        },
      },
      dependencias: {
        select: { tareaUid: true, predecesoraUid: true, tipo: true, desfaseDias: true },
      },
    },
  });

  if (!cronograma) return null;

  // Todos los reportes de la obra, no solo los de este corte: el avance vive
  // aparte del cronograma justamente para sobrevivir a sus versiones.
  const avances = await prisma.avanceTarea.findMany({
    where: { projectId: obraId },
    orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
    select: {
      uid: true, porcentaje: true, fecha: true,
      createdAt: true, reportadoPor: true, nota: true,
    },
  });

  // Los Decimal de Prisma se pasan a texto en la frontera: de aqui hacia
  // dentro el sistema no toca una cifra que no sea exacta.
  const tareas: TareaDelPlan[] = cronograma.tareas.map((t) => ({
    ...t,
    duracionDias: t.duracionDias.toString(),
    porcentajePlaneado: t.porcentajePlaneado.toString(),
    porcentajeArchivo: t.porcentajeArchivo.toString(),
    holguraDias: t.holguraDias.toString(),
  }));

  const reportes: AvanceReportado[] = avances.map((a) => ({
    ...a,
    porcentaje: a.porcentaje.toString(),
  }));

  const medido = medirAvance(tareas, reportes);

  return {
    id: cronograma.id,
    version: cronograma.version,
    fechaCorte: cronograma.fechaCorte,
    nombreProyecto: cronograma.nombreProyecto,
    archivo: cronograma.archivo,
    importadoAt: cronograma.importadoAt,
    importadoPor: cronograma.importadoPor,
    tareas: medido.tareas,
    dependencias: cronograma.dependencias.map((d) => ({
      ...d,
      desfaseDias: d.desfaseDias.toString(),
    })),
    huerfanos: medido.huerfanos,
  };
}

export interface CorteImportado {
  id: string;
  version: number;
  fechaCorte: Date;
  archivo: string;
  importadoAt: Date;
  importadoPor: string;
  tareas: number;
}

/** Los cortes cargados, del mas reciente al mas antiguo. */
export async function historialCronogramas(
  sesion: SesionActiva,
  obraId: string,
): Promise<CorteImportado[]> {
  if (!puede(sesion, "cronograma:leer")) return [];

  const cortes = await prisma.cronograma.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: {
      id: true, version: true, fechaCorte: true, archivo: true,
      importadoAt: true, importadoPor: true,
      _count: { select: { tareas: true } },
    },
  });

  return cortes.map((c) => ({
    id: c.id,
    version: c.version,
    fechaCorte: c.fechaCorte,
    archivo: c.archivo,
    importadoAt: c.importadoAt,
    importadoPor: c.importadoPor,
    tareas: c._count.tareas,
  }));
}

export type ResultadoLineaBase =
  | { ok: true; version: number }
  | { ok: false; error: string };

/**
 * Fija (o re-fija) la linea base del cronograma: marca UNA version como el
 * plan CONGELADO contra el que se mide el EVM (PV/SPI).
 *
 * Re-fijable a proposito —los cronogramas se re-baselinean cuando cambia el
 * alcance—, pero cada cambio limpia la base anterior (solo una por obra) y se
 * audita. Espeja a `aprobarRevision` del presupuesto SIN su irreversibilidad:
 * aqui la base es una herramienta de control, no un acto contractual.
 */
export async function marcarLineaBase(
  sesion: SesionActiva,
  obraId: string,
  cronogramaId: string,
): Promise<ResultadoLineaBase> {
  if (!puede(sesion, "cronograma:linea_base")) {
    return { ok: false, error: "No tienes permiso para fijar la linea base." };
  }

  const cerradaBase = await motivoSiObraCerrada(sesion, obraId);
  if (cerradaBase) return { ok: false, error: cerradaBase };

  // El corte tiene que ser de esta obra y de esta empresa: sin esta
  // comprobacion, con el identificador de un corte ajeno se marcaria base en
  // la obra de otro.
  const corte = await prisma.cronograma.findFirst({
    where: {
      id: cronogramaId,
      projectId: obraId,
      project: { companyId: sesion.companyId },
    },
    select: { id: true, version: true },
  });

  if (!corte) return { ok: false, error: "Ese corte no existe en la obra." };

  const fijadaPor = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`
    .trim()
    .slice(0, 150);

  await prisma.$transaction(async (tx) => {
    // Solo una base por obra: se limpia la anterior antes de fijar la nueva.
    await tx.cronograma.updateMany({
      where: { projectId: obraId, lineaBaseAt: { not: null } },
      data: { lineaBaseAt: null, lineaBasePor: null },
    });

    await tx.cronograma.update({
      where: { id: corte.id },
      data: { lineaBaseAt: new Date(), lineaBasePor: fijadaPor },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "Cronograma",
        entidadId: corte.id,
        accion: "UPDATE",
        despues: { evento: "linea_base_fijada", version: corte.version, fijadaPor },
      },
    });
  });

  return { ok: true, version: corte.version };
}

export interface HitoBase {
  uid: number;
  nombre: string;
  esResumen: boolean;
  esHito: boolean;
  duracionDias: string;
  inicio: Date;
  fin: Date;
}

export interface LineaBaseCronograma {
  id: string;
  version: number;
  fechaCorte: Date;
  fijadaEn: Date;
  fijadaPor: string | null;
  tareas: HitoBase[];
}

/**
 * La version marcada como linea base, con sus tareas —para cruzar hitos y
 * fechas contra lo vigente—. null si la obra aun no ha fijado una.
 */
export async function lineaBaseCronograma(
  sesion: SesionActiva,
  obraId: string,
): Promise<LineaBaseCronograma | null> {
  if (!puede(sesion, "cronograma:leer")) return null;

  const base = await prisma.cronograma.findFirst({
    where: {
      projectId: obraId,
      project: { companyId: sesion.companyId },
      lineaBaseAt: { not: null },
    },
    select: {
      id: true, version: true, fechaCorte: true,
      lineaBaseAt: true, lineaBasePor: true,
      tareas: {
        orderBy: { fila: "asc" },
        select: {
          uid: true, nombre: true, esResumen: true, esHito: true,
          duracionDias: true, inicio: true, fin: true,
        },
      },
    },
  });

  if (!base || !base.lineaBaseAt) return null;

  return {
    id: base.id,
    version: base.version,
    fechaCorte: base.fechaCorte,
    fijadaEn: base.lineaBaseAt,
    fijadaPor: base.lineaBasePor,
    tareas: base.tareas.map((t) => ({ ...t, duracionDias: t.duracionDias.toString() })),
  };
}

export type ResultadoDiaCorte = { ok: true } | { ok: false; error: string };

/**
 * Fija el dia de la semana en que se espera el corte de avance (cadencia
 * semanal, Last Planner). ISO 1=lunes … 7=domingo.
 *
 * Es una preferencia de la obra, no un dato contable: la lleva quien lleva el
 * cronograma (`cronograma:importar`). Se audita para dejar rastro de cuando y
 * quien cambio el ritmo de reporte.
 */
export async function configurarDiaCorte(
  sesion: SesionActiva,
  obraId: string,
  dia: number,
): Promise<ResultadoDiaCorte> {
  if (!puede(sesion, "cronograma:importar")) {
    return { ok: false, error: "No tienes permiso para configurar el cronograma." };
  }

  if (!Number.isInteger(dia) || dia < 1 || dia > 7) {
    return { ok: false, error: "El dia de corte debe estar entre 1 (lunes) y 7 (domingo)." };
  }

  const cerradaDia = await motivoSiObraCerrada(sesion, obraId);
  if (cerradaDia) return { ok: false, error: cerradaDia };

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true, diaCorteSemanal: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  if (obra.diaCorteSemanal === dia) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: obraId },
      data: { diaCorteSemanal: dia },
    });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "Project",
        entidadId: obraId,
        accion: "UPDATE",
        antes: { diaCorteSemanal: obra.diaCorteSemanal },
        despues: { diaCorteSemanal: dia },
      },
    });
  });

  return { ok: true };
}

export type ResultadoAvance = { ok: true } | { ok: false; error: string };

/**
 * Registra lo que reporta obra sobre una tarea.
 *
 * Cada reporte es una fila NUEVA, nunca un UPDATE. La serie historica es lo
 * que despues dibuja la curva de avance, y saber quien dijo que una partida
 * iba al 60% y cuando es justamente lo que hoy se pierde cuando alguien
 * sobrescribe el porcentaje en Project.
 */
export async function registrarAvance(
  sesion: SesionActiva,
  obraId: string,
  datos: { uid: number; porcentaje: string; fecha: string; nota?: string },
): Promise<ResultadoAvance> {
  if (!puede(sesion, "avance:registrar")) {
    return { ok: false, error: "No tienes permiso para reportar avance." };
  }

  const cerradaAvance = await motivoSiObraCerrada(sesion, obraId);
  if (cerradaAvance) return { ok: false, error: cerradaAvance };

  const porcentaje = normalizarDecimal(datos.porcentaje, 2);
  if (porcentaje === null) {
    return { ok: false, error: "El porcentaje no es un numero valido." };
  }

  // Comparacion de rango, no aritmetica: el valor que se guarda sigue siendo
  // el texto exacto que se normalizo.
  const n = Number(porcentaje);
  if (n < 0 || n > 100) {
    return { ok: false, error: "El porcentaje debe estar entre 0 y 100." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) {
    return { ok: false, error: "La fecha del reporte no es valida." };
  }

  const fecha = fechaDeObra(datos.fecha);

  // Un reporte con fecha futura descolocaria la serie: el ultimo reporte de
  // cada tarea es el de fecha mas alta, asi que uno fechado el mes que viene
  // congelaria esa tarea hasta que llegara el mes que viene.
  if (fecha.getTime() > hoyUtc().getTime()) {
    return { ok: false, error: "No se puede reportar avance con fecha futura." };
  }

  // La tarea tiene que estar en el cronograma vigente. Reportar contra un UID
  // que no existe crea un huerfano de nacimiento, sin nada que ensenar.
  const tarea = await prisma.tareaCronograma.findFirst({
    where: {
      uid: datos.uid,
      cronograma: { projectId: obraId, project: { companyId: sesion.companyId } },
    },
    orderBy: { cronograma: { fechaCorte: "desc" } },
    select: { nombre: true, codigo: true },
  });

  if (!tarea) {
    return { ok: false, error: "Esa tarea no esta en el cronograma de la obra." };
  }

  await prisma.$transaction(async (tx) => {
    const avance = await tx.avanceTarea.create({
      data: {
        projectId: obraId,
        uid: datos.uid,
        fecha,
        porcentaje,
        nota: datos.nota?.trim() ? datos.nota.trim() : null,
        reportadoPor: `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150),
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "AvanceTarea",
        entidadId: avance.id,
        accion: "CREATE",
        despues: {
          uid: datos.uid,
          codigo: tarea.codigo,
          tarea: tarea.nombre,
          porcentaje,
          fecha: datos.fecha,
        },
      },
    });
  });

  return { ok: true };
}

/** Hoy como fecha de calendario. Fuente unica: `hoy()` de `@/utils/fechas`. */
function hoyUtc(): Date {
  return hoyCalendario();
}

export interface DatosCurva {
  /// Un punto por corte cargado: lo medido.
  cortes: PuntoCurva[];
  /// El plan dia a dia, de principio a fin de obra.
  plan: PuntoDiario[];
  /// Como acabaria si se siguiera al ritmo actual, desde el ultimo corte.
  proyeccion: PuntoDiario[];
  /// Real entre planeado en la fecha de corte. 1 es ir justo al plan.
  factor: number;
  terminoProyectado: Date | null;
  inicio: Date | null;
  fin: Date | null;
  /// De donde sale el PLAN (PV): la version base congelada, o el corte vigente
  /// si la obra aun no ha fijado base.
  fuentePlan: "base" | "vigente";
  /// % planeado a la fecha del ultimo corte segun la base congelada. null sin
  /// base: entonces el PV puntual usa el % del archivo del ultimo corte.
  planeadoBaseEnCorte: number | null;
  /// La version marcada como base y cuando se fijo. null si no hay.
  lineaBase: { version: number; fijadaEn: Date | null } | null;
  /// La linea real muestreada POR SEMANA (cadencia Last Planner). Vacia sin plan.
  realSemanal: PuntoDiario[];
  /// Dia ISO de corte semanal (1..7) configurado en la obra.
  diaCorteSemanal: number;
  /// Estado de la cadencia: el ultimo corte esperado <= hoy y si falta reporte.
  cadencia: { ultimoCorteEsperado: Date | null; semanaPendiente: boolean };
  /// El punto "actual" para los indicadores: el ultimo real semanal (o el ultimo
  /// corte si no hay), con su planeado a esa fecha. De aqui salen EV/PV puntuales
  /// del EVM y el "avance al corte" del panel, sin depender de reimportar.
  puntoActual: { fecha: Date; real: number; planeado: number } | null;
}

/**
 * Todo lo que necesita la curva de avance.
 *
 * Se traen TODOS los cortes con sus tareas. Son unas cien filas por corte y
 * unos pocos cortes por obra, asi que cabe de sobra en una consulta; hacerlo
 * por partes obligaria a repetir el calculo de la ponderacion en dos sitios.
 */
export async function datosCurvaS(
  sesion: SesionActiva,
  obraId: string,
): Promise<DatosCurva> {
  const vacio: DatosCurva = {
    cortes: [], plan: [], proyeccion: [],
    factor: 1, terminoProyectado: null, inicio: null, fin: null,
    fuentePlan: "vigente", planeadoBaseEnCorte: null, lineaBase: null,
    realSemanal: [], diaCorteSemanal: 5,
    cadencia: { ultimoCorteEsperado: null, semanaPendiente: false },
    puntoActual: null,
  };

  if (!puede(sesion, "cronograma:leer")) return vacio;

  const [cortes, avances, obra] = await Promise.all([
    prisma.cronograma.findMany({
      where: { projectId: obraId, project: { companyId: sesion.companyId } },
      orderBy: { fechaCorte: "asc" },
      select: {
        version: true,
        fechaCorte: true,
        lineaBaseAt: true,
        tareas: {
          select: {
            uid: true,
            esResumen: true,
            duracionDias: true,
            porcentajePlaneado: true,
            porcentajeArchivo: true,
            inicio: true,
            fin: true,
          },
        },
      },
    }),
    prisma.avanceTarea.findMany({
      where: { projectId: obraId },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
      select: {
        uid: true, porcentaje: true, fecha: true,
        createdAt: true, reportadoPor: true, nota: true,
      },
    }),
    prisma.project.findFirst({
      where: { id: obraId, companyId: sesion.companyId },
      select: { diaCorteSemanal: true },
    }),
  ]);

  const diaCorteSemanal = obra?.diaCorteSemanal ?? 5;

  if (cortes.length === 0) return { ...vacio, diaCorteSemanal };

  const reportes = avances.map((a) => ({ ...a, porcentaje: a.porcentaje.toString() }));

  const serie = serieCurvaS(
    cortes.map((c) => ({
      version: c.version,
      fechaCorte: c.fechaCorte,
      tareas: c.tareas.map((t) => ({
        uid: t.uid,
        esResumen: t.esResumen,
        duracionDias: t.duracionDias.toString(),
        porcentajePlaneado: t.porcentajePlaneado.toString(),
        porcentajeArchivo: t.porcentajeArchivo.toString(),
      })),
    })),
    reportes,
  );

  // La fuente del PLAN: la version marcada como linea base si existe, y si no
  // el corte mas reciente (comportamiento previo). Congelar la base es lo que
  // impide que reprogramar mueva los postes del PV/SPI.
  const base = cortes.find((c) => c.lineaBaseAt !== null);
  const vigente = cortes[cortes.length - 1]!;
  const fuente = base ?? vigente;

  const planificadas = fuente.tareas.map((t) => ({
    uid: t.uid,
    esResumen: t.esResumen,
    duracionDias: t.duracionDias.toString(),
    inicio: t.inicio,
    fin: t.fin,
  }));

  const fuentePlan = base ? ("base" as const) : ("vigente" as const);
  const lineaBase = base
    ? { version: base.version, fijadaEn: base.lineaBaseAt }
    : null;

  const conDuracion = planificadas.filter((t) => !t.esResumen);
  if (conDuracion.length === 0) {
    return { ...vacio, cortes: serie, fuentePlan, lineaBase, diaCorteSemanal };
  }

  const inicio = conDuracion.reduce(
    (m, t) => (t.inicio < m ? t.inicio : m),
    conDuracion[0]!.inicio,
  );
  const fin = conDuracion.reduce(
    (m, t) => (t.fin > m ? t.fin : m),
    conDuracion[0]!.fin,
  );

  const plan = curvaPlaneada(planificadas, inicio, fin);

  const ultimo = serie[serie.length - 1]!;

  // El PV puntual contra la base: el % planeado a la fecha del ultimo corte
  // segun el plan congelado. Sin base es null y el EVM cae al % del archivo.
  const planeadoBaseEnCorte = base
    ? planeadoEnFecha(planificadas, ultimo.fecha)
    : null;

  // La linea real POR SEMANA: se muestrea el avance en cada dia de corte
  // (cadencia Last Planner) desde el inicio del plan hasta hoy. Usa las tareas
  // fuente (base o vigente) y los mismos avances, con la tecnica ya probada.
  const hoy = hoyUtc();
  const hastaMuestreo = new Date(Math.min(fin.getTime(), hoy.getTime()));
  const fechasSem = fechasSemanales(inicio, hastaMuestreo, diaCorteSemanal);
  const tareasCurva = fuente.tareas.map((t) => ({
    uid: t.uid,
    esResumen: t.esResumen,
    duracionDias: t.duracionDias.toString(),
    porcentajePlaneado: t.porcentajePlaneado.toString(),
    porcentajeArchivo: t.porcentajeArchivo.toString(),
  }));
  // Ademas de los cortes semanales, incluir HOY como punto final (la semana en
  // curso) para que la linea real, el puntoActual y el EVM reflejen el avance
  // del dia y no se queden en el ultimo corte semanal ya cerrado. `fechasSem`
  // (solo cortes) se mantiene intacta para la cadencia (ultimoCorteEsperado).
  const fechasReal =
    fechasSem.length &&
    fechasSem[fechasSem.length - 1]!.getTime() >= hastaMuestreo.getTime()
      ? fechasSem
      : [...fechasSem, hastaMuestreo];
  const realSemanal = serieRealPorFechas(tareasCurva, reportes, fechasReal);

  // La cadencia: el ultimo corte esperado que ya paso, y si falta reporte (el
  // ultimo avance es anterior a ese corte, o no hay ninguno todavia).
  const ultimoCorteEsperado = fechasSem.length
    ? fechasSem[fechasSem.length - 1]!
    : null;
  const ultimaFechaAvance = reportes.reduce<Date | null>(
    (m, a) => (m === null || a.fecha > m ? a.fecha : m),
    null,
  );
  const semanaPendiente =
    ultimoCorteEsperado !== null &&
    (ultimaFechaAvance === null ||
      ultimaFechaAvance.getTime() < ultimoCorteEsperado.getTime());

  // La proyeccion arranca en el ultimo punto real —el semanal si lo hay, si no
  // el del corte— para que no salte respecto a lo medido.
  const anclaReal = realSemanal.length
    ? realSemanal[realSemanal.length - 1]!
    : { fecha: ultimo.fecha, valor: Number(ultimo.real) || 0 };

  const { puntos, factor, terminoProyectado } = proyectar(
    plan,
    anclaReal.fecha,
    anclaReal.valor,
  );

  // El punto actual para los indicadores: el ultimo real (semanal si lo hay),
  // con su planeado a esa fecha. Hace que EVM y el panel avancen desde GCM
  // (los avances) sin necesidad de reimportar un cronograma.
  const puntoActual = {
    fecha: anclaReal.fecha,
    real: anclaReal.valor,
    planeado: Number(planeadoEnFecha(planificadas, anclaReal.fecha)),
  };

  return {
    cortes: serie,
    plan,
    proyeccion: puntos,
    factor,
    terminoProyectado,
    inicio,
    fin,
    fuentePlan,
    planeadoBaseEnCorte,
    lineaBase,
    realSemanal,
    diaCorteSemanal,
    cadencia: { ultimoCorteEsperado, semanaPendiente },
    puntoActual,
  };
}

export interface AvanceFisico {
  real: string;
  planeado: string;
  desfase: string;
  fechaCorte: Date;
  /// Fin de obra SEGUN EL CRONOGRAMA, que puede no ser el de la ficha: las
  /// fechas de la ficha las teclea alguien al dar de alta la obra y se quedan
  /// viejas en cuanto el planificador reprograma.
  finPlan: Date;
}

/**
 * El avance fisico de varias obras a la vez, para el panel.
 *
 * Se calcula EXACTAMENTE igual que el ultimo punto de la curva —misma
 * ponderacion por duracion, mismo criterio de reporte vigente—. Si el panel
 * usara otra formula, la tarjeta y la pantalla del cronograma dirian cifras
 * distintas de la misma obra, y ninguna de las dos seria creible.
 *
 * Va en tres consultas y no en una por obra: el panel pinta una tarjeta por
 * obra y una consulta dentro del bucle multiplicaria el trabajo por el numero
 * de obras de la empresa.
 */
export async function avanceFisicoPorObra(
  sesion: SesionActiva,
  obraIds: readonly string[],
): Promise<Map<string, AvanceFisico>> {
  const resultado = new Map<string, AvanceFisico>();

  if (obraIds.length === 0 || !puede(sesion, "cronograma:leer")) return resultado;

  // Los cronogramas de todas las obras, del corte mas reciente al mas
  // antiguo. Se queda el primero de cada obra, que es el vigente.
  const cronogramas = await prisma.cronograma.findMany({
    where: {
      projectId: { in: [...obraIds] },
      project: { companyId: sesion.companyId },
    },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: { id: true, projectId: true, fechaCorte: true },
  });

  const vigentes = new Map<string, { id: string; fechaCorte: Date }>();
  for (const c of cronogramas) {
    if (!vigentes.has(c.projectId)) {
      vigentes.set(c.projectId, { id: c.id, fechaCorte: c.fechaCorte });
    }
  }

  if (vigentes.size === 0) return resultado;

  const idsVigentes = [...vigentes.values()].map((v) => v.id);
  const proyectosConPlan = [...vigentes.keys()];

  const [tareas, avances] = await Promise.all([
    prisma.tareaCronograma.findMany({
      where: { cronogramaId: { in: idsVigentes } },
      select: {
        cronogramaId: true,
        uid: true,
        esResumen: true,
        duracionDias: true,
        porcentajePlaneado: true,
        porcentajeArchivo: true,
        fin: true,
      },
    }),
    prisma.avanceTarea.findMany({
      where: { projectId: { in: proyectosConPlan } },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
      select: {
        projectId: true, uid: true, porcentaje: true,
        fecha: true, createdAt: true, reportadoPor: true, nota: true,
      },
    }),
  ]);

  const porCronograma = new Map<string, typeof tareas>();
  for (const t of tareas) {
    const lista = porCronograma.get(t.cronogramaId) ?? [];
    lista.push(t);
    porCronograma.set(t.cronogramaId, lista);
  }

  for (const [projectId, vigente] of vigentes) {
    const suyas = porCronograma.get(vigente.id) ?? [];
    if (suyas.length === 0) continue;

    // El reporte vigente A HOY: el avance real de GCM manda y avanza sin
    // reimportar, igual que la linea real semanal de la curva. (Antes se
    // anclaba a la fecha del ultimo import y el panel quedaba congelado.)
    const hoyPanel = hoyUtc();
    const hasta = hoyPanel.getTime();
    const ultimos = ultimoAvancePorTarea(
      avances
        .filter((a) => a.projectId === projectId && a.fecha.getTime() <= hasta)
        .map((a) => ({ ...a, porcentaje: a.porcentaje.toString() })),
    );

    const medibles = suyas.map((t) => ({
      esResumen: t.esResumen,
      duracionDias: t.duracionDias.toString(),
      planeado: t.porcentajePlaneado.toString(),
      real: ultimos.get(t.uid)?.porcentaje ?? t.porcentajeArchivo.toString(),
    }));

    const planeado = ponderarPorDuracion(medibles, (t) => t.planeado);
    const real = ponderarPorDuracion(medibles, (t) => t.real);

    resultado.set(projectId, {
      real,
      planeado,
      desfase: restar(real, planeado) ?? "0.00",
      fechaCorte: hoyPanel,
      finPlan: suyas.reduce((m, t) => (t.fin > m ? t.fin : m), suyas[0]!.fin),
    });
  }

  return resultado;
}
