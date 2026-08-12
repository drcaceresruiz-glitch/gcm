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
import {
  diasSinReportar,
  filasDelParte,
  tareasAbiertas,
  ultimoDiaLaborableDeLaSemana,
  validarLoteAvance,
  type EntradaParte,
  type GrupoParte,
} from "@/lib/parte-diario";
import { capituloDeCadaTarea } from "@/lib/control-avance";
import { obtenerCalendario } from "@/services/calendario.service";
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

export interface CorteDisponible {
  /// "YYYY-MM-DD", que es como viaja en la URL del informe.
  iso: string;
  fecha: Date;
  /// Numero de la semana del PTS que cierra ese dia, si la hay.
  semana: number | null;
  /// El corte por defecto: el ultimo que ya paso.
  esUltimo: boolean;
}

export interface InformeAlCorte {
  fechaCorte: Date;
  /// Las tareas MEDIDAS a esa fecha: el avance que se conocia ese dia.
  tareas: (TareaDelPlan & Medida)[];
  /// % real ponderado por duracion a la fecha del informe.
  real: string;
  /// % planeado reconstruido dia a dia a esa misma fecha.
  planeado: string;
  /// Real menos planeado.
  desviacion: string;
  /// Las fechas que el selector puede ofrecer, de la mas reciente a la mas
  /// antigua.
  cortes: CorteDisponible[];
  /// Version del cronograma con el que se midio, para el pie del documento.
  version: number;
  importadoPor: string;
  /// Lo que el propio MS Project totaliza, para poder contrastar.
  planeadoProject: string | null;
  realProject: string | null;
}

/**
 * El estado de la obra A UNA FECHA, para el informe semanal.
 *
 * El informe se anclaba a `cronograma.fechaCorte`, o sea a la fecha del ULTIMO
 * XML IMPORTADO. Con el parte del dia entrando avance a diario eso lo dejaba
 * congelado: el 12/08/2026 el informe de CRIOCORD encabezaba «Corte de
 * control: 08 de agosto» y daba 11.3% real cuando el tablero ya iba por 22.6%,
 * y su bloque de partidas activas decia «ninguna en marcha» porque miraba la
 * semana del 8. Es el mismo defecto que se corrigio en la curva y en el panel;
 * esta era su tercera guarida.
 *
 * Aqui la fecha es un PARAMETRO, y de ahi sale lo demas:
 *
 * - Se miden las tareas con los reportes de fecha menor o igual, asi que el
 *   informe de una semana pasada ensena lo que se sabia ESA semana y no lo que
 *   se sabe hoy. Sin esto, «ver el historico» daria el mismo documento con
 *   otra cabecera.
 * - El planeado se reconstruye dia a dia con `planeadoEnFecha`, la misma
 *   funcion que la curva y el panel. El «% Planeado» del archivo solo existe
 *   en las fechas de corte del propio archivo.
 *
 * Devuelve null si la obra no tiene cronograma: sin plan no hay informe.
 */
export async function informeAlCorte(
  sesion: SesionActiva,
  obraId: string,
  corteISO?: string,
): Promise<InformeAlCorte | null> {
  if (!puede(sesion, "cronograma:leer")) return null;

  const cronograma = await prisma.cronograma.findFirst({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: {
      version: true,
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
    },
  });
  if (!cronograma) return null;

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { diaCorteSemanal: true },
  });
  if (!obra) return null;

  const tareasBase: TareaDelPlan[] = cronograma.tareas.map((t) => ({
    ...t,
    duracionDias: t.duracionDias.toString(),
    porcentajePlaneado: t.porcentajePlaneado.toString(),
    porcentajeArchivo: t.porcentajeArchivo.toString(),
    holguraDias: t.holguraDias.toString(),
  }));

  const trabajo = tareasBase.filter((t) => !t.esResumen);
  const inicioObra = trabajo.reduce(
    (m, t) => (t.inicio < m ? t.inicio : m),
    trabajo[0]?.inicio ?? hoyUtc(),
  );

  // Los cortes que el selector puede ofrecer: los dias de cierre semanal de la
  // obra que YA pasaron. Se cruzan con las semanas del PTS para poder
  // rotularlos «Semana 2» en vez de una fecha suelta.
  const ahora = hoyUtc();
  const semanales = fechasSemanales(inicioObra, ahora, obra.diaCorteSemanal);
  const planes = await prisma.planSemanal.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    select: { numero: true, fechaCorte: true },
  });
  const semanaPorIso = new Map(
    planes.map((p) => [p.fechaCorte.toISOString().slice(0, 10), p.numero]),
  );

  // Las semanas del PTS entran aunque su corte no caiga en el dia configurado:
  // si el residente cerro una semana el viernes y la obra corta los sabados,
  // ese informe tiene que poder emitirse igual.
  const porIso = new Map<string, Date>();
  for (const f of semanales) porIso.set(f.toISOString().slice(0, 10), f);
  for (const p of planes) {
    if (p.fechaCorte.getTime() <= ahora.getTime()) {
      porIso.set(p.fechaCorte.toISOString().slice(0, 10), p.fechaCorte);
    }
  }
  porIso.set(ahora.toISOString().slice(0, 10), ahora);

  const ordenadas = [...porIso.entries()].sort(
    (a, b) => b[1].getTime() - a[1].getTime(),
  );
  const ultimoIso = ordenadas[0]?.[0] ?? ahora.toISOString().slice(0, 10);

  // La fecha pedida solo vale si es una de las ofrecidas: asi un `?corte=`
  // manipulado no produce un informe de una fecha arbitraria.
  const elegidoIso =
    corteISO && porIso.has(corteISO) ? corteISO : ultimoIso;
  const fechaCorte = porIso.get(elegidoIso)!;

  const cortes: CorteDisponible[] = ordenadas.map(([iso, fecha]) => ({
    iso,
    fecha,
    semana: semanaPorIso.get(iso) ?? null,
    esUltimo: iso === ultimoIso,
  }));

  // El avance TAL COMO SE CONOCIA a esa fecha.
  const avances = await prisma.avanceTarea.findMany({
    where: { projectId: obraId, fecha: { lte: fechaCorte } },
    orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
    select: {
      uid: true, porcentaje: true, fecha: true,
      createdAt: true, reportadoPor: true, nota: true,
    },
  });

  const medido = medirAvance(
    tareasBase,
    avances.map((a) => ({ ...a, porcentaje: a.porcentaje.toString() })),
  );

  const medibles = medido.tareas.map((t) => ({
    esResumen: t.esResumen,
    duracionDias: t.duracionDias,
    real: t.porcentajeReal,
  }));

  const real = ponderarPorDuracion(medibles, (t) => t.real);
  const planeado = planeadoEnFecha(
    tareasBase.map((t) => ({
      uid: t.uid,
      esResumen: t.esResumen,
      duracionDias: t.duracionDias,
      inicio: t.inicio,
      fin: t.fin,
    })),
    fechaCorte,
  ).toFixed(2);

  const resumen = tareasBase.find((t) => t.nivel === 1);

  return {
    fechaCorte,
    tareas: medido.tareas,
    real,
    planeado,
    desviacion: restar(real, planeado) ?? "0.00",
    cortes,
    version: cronograma.version,
    importadoPor: cronograma.importadoPor,
    planeadoProject: resumen?.porcentajePlaneado ?? null,
    realProject: resumen?.porcentajeArchivo ?? null,
  };
}

export interface ParteDelDia {
  grupos: GrupoParte[];
  /// Cuantas casillas se van a pintar. Es el numero del boton.
  tareas: number;
  /// Cuantas quedaron fuera por empezar mas alla de la ventana.
  fuera: number;
  diasVista: number;
  /// El ultimo dia laborable de esta semana: el dia en que toca cerrar.
  cierraEl: Date;
  /// Dias laborables desde el ultimo reporte de la obra, sea de la tarea que
  /// sea. Null si nunca se reporto nada.
  diasSinParte: number | null;
}

/**
 * Lo que hay que pintar en el parte del dia.
 *
 * Se apoya entero en `obtenerCronograma`, que ya cruza el archivo con
 * lo reportado: aqui no se vuelve a medir nada, solo se elige que tareas se
 * ofrecen, de que capitulo cuelga cada una y cuanto hace que no se sabe de
 * ellas.
 */
export async function obtenerParteDelDia(
  sesion: SesionActiva,
  obraId: string,
  opciones: { diasVista?: number } = {},
): Promise<ParteDelDia | null> {
  if (!puede(sesion, "cronograma:leer")) return null;

  const vigente = await obtenerCronograma(sesion, obraId);
  if (!vigente) return null;

  const calendario = await obtenerCalendario(sesion, obraId);
  const ahora = hoyUtc();
  const diasVista = opciones.diasVista ?? 7;

  const { dentro, fuera } = tareasAbiertas(vigente.tareas, ahora, diasVista);

  // El capitulo sale del orden del documento —`capituloDeCadaTarea`—, no del
  // prefijo del codigo: "7.3.1" es hermana de "7.3" y no su hija.
  const capituloUid = capituloDeCadaTarea(vigente.tareas);
  const nombrePorUid = new Map(
    vigente.tareas.map((t) => [t.uid, t.codigo ? `${t.codigo} ${t.nombre}` : t.nombre]),
  );
  const capituloPorUid = new Map<number, string>();
  for (const [uid, cap] of capituloUid) {
    const nombre = nombrePorUid.get(cap);
    if (nombre) capituloPorUid.set(uid, nombre);
  }

  const ultimoReporte = new Map<number, Date>();
  for (const t of vigente.tareas) {
    if (t.avance) ultimoReporte.set(t.uid, t.avance.fecha);
  }

  const fechas = [...ultimoReporte.values()].map((f) => f.getTime());
  const ultimoDeTodos = fechas.length > 0 ? new Date(Math.max(...fechas)) : null;

  return {
    grupos: filasDelParte(dentro, capituloPorUid, ultimoReporte, ahora, calendario),
    tareas: dentro.length,
    fuera,
    diasVista,
    cierraEl: ultimoDiaLaborableDeLaSemana(ahora, calendario),
    diasSinParte:
      ultimoDeTodos === null
        ? null
        : diasSinReportar(ultimoDeTodos, ahora, calendario),
  };
}

export type ResultadoLoteAvance =
  | { ok: true; escritas: number }
  | { ok: false; error: string };

/**
 * Registra de una vez el avance de muchas tareas: el parte del dia.
 *
 * Existe por una razon muy concreta y muy poco teorica: reportar las ~107
 * tareas de una obra de una en una son ~107 peticiones contra un hosting con
 * 20 Entry Processes (`docs/infraestructura.md`). No es que fuera lento: es
 * que no se hacia, y un avance que no se reporta sale en la curva S como una
 * obra mas atrasada de lo que esta.
 *
 * Las reglas de que entra y que no las decide `validarLoteAvance`, que es
 * logica pura y tiene tests. Aqui solo se anaden las dos cosas que necesitan
 * la base: que los UID existan de verdad en el cronograma vigente y que todo
 * se escriba junto o no se escriba nada.
 *
 * Un solo apunte de auditoria para el lote entero, por el mismo motivo que
 * `importarCronograma`: cien apuntes por parte ahogarian el registro de
 * actividad justo el dia que haga falta leerlo.
 *
 * Guardar dos veces el mismo dia no rompe nada. `ultimoAvancePorTarea`
 * desempata por `createdAt`, asi que el segundo parte manda, que es
 * exactamente lo que se quiere cuando el residente corrige por la tarde lo que
 * dijo por la manana. Dentro de un mismo lote no hay empate posible porque
 * `validarLoteAvance` rechaza el UID repetido.
 */
export async function registrarAvancesEnLote(
  sesion: SesionActiva,
  obraId: string,
  datos: { fecha: string; entradas: readonly EntradaParte[] },
): Promise<ResultadoLoteAvance> {
  if (!puede(sesion, "avance:registrar")) {
    return { ok: false, error: "No tienes permiso para reportar avance." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const validado = validarLoteAvance(datos.entradas, datos.fecha, hoyUtc());
  if (!validado.ok) return validado;

  // Cero casillas rellenas no es un error: es un parte en el que no se supo
  // nada de ninguna tarea. Se responde bien y no se escribe nada.
  if (validado.escribir.length === 0) return { ok: true, escritas: 0 };

  // Los UID tienen que estar en el cronograma vigente de ESTA obra. Se
  // comprueban todos de una consulta: reportar contra un UID que no existe
  // crea un huerfano de nacimiento, y hacerlo por la puerta del lote no lo
  // hace mas valido que por la de una tarea suelta.
  const uids = validado.escribir.map((e) => e.uid);
  const conocidas = await prisma.tareaCronograma.findMany({
    where: {
      uid: { in: uids },
      cronograma: { projectId: obraId, project: { companyId: sesion.companyId } },
    },
    select: { uid: true },
    distinct: ["uid"],
  });

  const existentes = new Set(conocidas.map((t) => t.uid));
  const intrusas = uids.filter((u) => !existentes.has(u));
  if (intrusas.length > 0) {
    return {
      ok: false,
      error: `Hay ${intrusas.length} tarea(s) que no están en el cronograma de la obra.`,
    };
  }

  const fecha = fechaDeObra(datos.fecha);
  const reportadoPor = `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);

  await prisma.$transaction(async (tx) => {
    await tx.avanceTarea.createMany({
      data: validado.escribir.map((e) => ({
        projectId: obraId,
        uid: e.uid,
        fecha,
        porcentaje: e.porcentaje,
        reportadoPor,
      })),
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "AvanceTarea",
        entidadId: obraId,
        accion: "CREATE",
        despues: {
          parteDelDia: datos.fecha,
          tareas: validado.escribir.length,
          uids: validado.escribir.map((e) => e.uid),
        },
      },
    });
  });

  return { ok: true, escritas: validado.escribir.length };
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

  // La linea real medida: se muestrea el avance desde el inicio del plan hasta
  // hoy. Usa las tareas fuente (base o vigente) y los mismos avances, con la
  // tecnica ya probada.
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
  /**
   * Donde se mide la linea real: en los cortes semanales, en HOY, y **en cada
   * dia que obra reporto algo**.
   *
   * Los cortes solos daban una curva que solo se movia una vez por semana:
   * entre viernes y viernes era una recta interpolada, y el trabajo reportado
   * el martes no se veia hasta el viernes. Con el parte del dia eso ya no
   * describe la obra —el avance entra a diario—, asi que la curva tiene que
   * medir donde hay medida.
   *
   * No se muestrea dia a dia a ciegas: un dia sin reporte no aporta un punto
   * nuevo, aporta el mismo valor del dia anterior, y llenar la serie de puntos
   * repetidos solo hace creer que se midio cuando no se midio.
   *
   * `fechasSem` (solo cortes) se mantiene intacta para la cadencia
   * (`ultimoCorteEsperado`), que sigue siendo semanal: una cosa es cada cuanto
   * TOCA cerrar y otra cada cuanto se sabe algo.
   */
  const marcas = new Map<number, Date>();
  for (const f of fechasSem) marcas.set(f.getTime(), f);
  for (const r of reportes) {
    // Un reporte fechado despues del fin de obra no dibuja nada util y sacaria
    // la linea del plazo.
    if (r.fecha.getTime() <= hastaMuestreo.getTime()) marcas.set(r.fecha.getTime(), r.fecha);
  }
  marcas.set(hastaMuestreo.getTime(), hastaMuestreo);
  const fechasReal = [...marcas.values()].sort((a, b) => a.getTime() - b.getTime());
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
    select: { id: true, projectId: true, fechaCorte: true, lineaBaseAt: true },
  });

  // La fuente del PLAN es la misma que usa la curva: la version marcada como
  // linea base si la hay, y si no el corte vigente. Medir el plan contra una
  // version y dibujarlo contra otra daria dos cifras distintas de la misma
  // obra en dos pantallas.
  const vigentes = new Map<string, { id: string; fechaCorte: Date }>();
  for (const c of cronogramas) {
    if (!vigentes.has(c.projectId)) {
      vigentes.set(c.projectId, { id: c.id, fechaCorte: c.fechaCorte });
    }
  }
  for (const c of cronogramas) {
    if (c.lineaBaseAt !== null) {
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
        inicio: true,
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
      real: ultimos.get(t.uid)?.porcentaje ?? t.porcentajeArchivo.toString(),
    }));

    /**
     * El plan A HOY, no el «% Planeado» que trae el archivo.
     *
     * El del archivo esta congelado en la fecha del corte, asi que la tarjeta
     * comparaba el avance de HOY contra el plan de hace dias. En CRIOCORD eso
     * daba «14.8% de 10.2%» en el panel y «14.78% sobre 11.99%» en la curva:
     * la misma obra, dos cifras, y la del panel la pintaba mas adelantada de
     * lo que iba. Un dato optimista falso es peor que uno pesimista, porque
     * nadie va a comprobarlo.
     *
     * Es la misma reconstruccion dia a dia que usa la curva (`planeadoEnFecha`
     * sobre `curvaPlaneada`), de modo que las dos pantallas no pueden
     * discrepar por construccion.
     */
    const planificadas = suyas.map((t) => ({
      uid: t.uid,
      esResumen: t.esResumen,
      duracionDias: t.duracionDias.toString(),
      inicio: t.inicio,
      fin: t.fin,
    }));

    // `planeadoEnFecha` trabaja en coma flotante a proposito —son coordenadas
    // de una curva, no dinero—, asi que se fija a dos decimales al cruzar a
    // texto, que es como viaja el resto de cifras del sistema.
    const planeado = planeadoEnFecha(planificadas, hoyPanel).toFixed(2);
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
