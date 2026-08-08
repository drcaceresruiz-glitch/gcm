import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { medirAvance, type AvanceReportado, type Medida } from "@/lib/cronograma";
import { normalizarDecimal } from "@/lib/decimal";
import { serieCurvaS, type PuntoCurva } from "@/lib/curva-s";
import type { ResultadoAnalisisCronograma } from "@/lib/msproject-xml";
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
    select: { id: true },
  });

  if (!obra) return { ok: false, error: "Obra no encontrada." };

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

/** Hoy como fecha de calendario en UTC, comparable con las columnas `@db.Date`. */
function hoyUtc(): Date {
  const ahora = new Date();
  return new Date(
    Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()),
  );
}

/**
 * La serie de la curva de avance: un punto por corte cargado.
 *
 * Se traen TODOS los cortes con sus tareas. Son unas cien filas por corte y
 * unos pocos cortes por obra, asi que cabe de sobra en una consulta; hacerlo
 * por partes obligaria a repetir el calculo de la ponderacion en dos sitios.
 */
export async function serieDeAvance(
  sesion: SesionActiva,
  obraId: string,
): Promise<PuntoCurva[]> {
  if (!puede(sesion, "cronograma:leer")) return [];

  const [cortes, avances] = await Promise.all([
    prisma.cronograma.findMany({
      where: { projectId: obraId, project: { companyId: sesion.companyId } },
      orderBy: { fechaCorte: "asc" },
      select: {
        version: true,
        fechaCorte: true,
        tareas: {
          select: {
            uid: true,
            esResumen: true,
            duracionDias: true,
            porcentajePlaneado: true,
            porcentajeArchivo: true,
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
  ]);

  return serieCurvaS(
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
    avances.map((a) => ({ ...a, porcentaje: a.porcentaje.toString() })),
  );
}
