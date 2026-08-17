import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { normalizarDecimal } from "@/lib/decimal";
import { hoy as hoyCalendario } from "@/utils/fechas";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Tareas de cronograma escritas a mano.
 *
 * La tercera via de entrada, junto a MS Project y Excel. Existe porque una
 * obra pequena no tiene planificador ni licencia de Project, y sin cronograma
 * no hay curva S, ni valor ganado, ni informe semanal.
 *
 * TODO lo de aqui toca UNICAMENTE filas `origen: MANUAL`. Editar una IMPORTADO
 * seria una perdida silenciosa —el siguiente archivo la devuelve como estaba— y
 * borrarla, un no-op diferido: desaparece hoy y reaparece el jueves.
 */

export type Resultado<T = void> =
  | ({ ok: true } & (T extends void ? object : { datos: T }))
  | { ok: false; error: string };

export interface TareaAMano {
  codigo?: string | null;
  nombre: string;
  /// Fechas de CALENDARIO, "YYYY-MM-DD". Nunca un `Date` local.
  inicio: string;
  fin: string;
  /// En dias, con decimales. Se TECLEA, no se deduce de las fechas: una
  /// partida de un dia puede abarcar tres dias naturales por el calendario, y
  /// deducirla haria que las manuales y las importadas midieran cosas
  /// distintas con el mismo nombre.
  duracionDias: string;
  /// El "% planeado" que leera el informe. Cero si no se dice.
  porcentajePlaneado?: string | null;
  esHito?: boolean;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Comprueba la obra, el permiso y que el cronograma se pueda tocar.
 *
 * Devuelve el cronograma VIGENTE —la version mas alta—, que es sobre el que se
 * escribe. No se crea una version nueva por cada tarea tecleada: una version
 * es un CORTE, y teclear tres tareas seguidas no son tres cortes.
 */
async function contextoEditable(
  sesion: SesionActiva,
  obraId: string,
  permiso: "cronograma:editar" | "cronograma:eliminar",
) {
  if (!puede(sesion, permiso)) {
    return { ok: false as const, error: "No tienes permiso para editar el cronograma." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false as const, error: cerrada };

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true, ultimoUidManual: true },
  });
  if (!obra) return { ok: false as const, error: "Obra no encontrada." };

  const vigente = await prisma.cronograma.findFirst({
    where: { projectId: obraId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, lineaBaseAt: true, fechaCorte: true },
  });

  /**
   * Con la linea base fijada, el cronograma no se toca.
   *
   * Todos los indicadores —SPI, curva S, desviacion de hitos— se calculan
   * CONTRA ella. Anadir o mover una tarea despues cambiaria hacia atras cifras
   * que ya se han emitido, y nadie sabria por que.
   */
  if (vigente?.lineaBaseAt) {
    return {
      ok: false as const,
      error:
        `El cronograma v${vigente.version} esta fijado como linea base ` +
        `(${vigente.lineaBaseAt.toISOString().slice(0, 10)}). Los indicadores se ` +
        `calculan contra el, asi que no admite cambios.`,
    };
  }

  return { ok: true as const, obra, vigente };
}

/**
 * Anade una tarea escrita a mano al cronograma vigente.
 *
 * Si la obra no tiene ninguna version todavia, la primera tarea crea una, con
 * `origen: MANUAL` y sin archivo. Asi teclear el cronograma no exige haber
 * importado antes nada.
 */
export async function crearTareaManual(
  sesion: SesionActiva,
  obraId: string,
  tarea: TareaAMano,
): Promise<Resultado<{ uid: number; version: number }>> {
  const ctx = await contextoEditable(sesion, obraId, "cronograma:editar");
  if (!ctx.ok) return ctx;

  const problema = revisarCampos(tarea);
  if (problema) return { ok: false, error: problema };

  const duracion = normalizarDecimal(tarea.duracionDias, 2);
  const planeado = normalizarDecimal(tarea.porcentajePlaneado || "0", 2);

  if (duracion === null) {
    return { ok: false, error: "La duracion no es un numero valido." };
  }
  if (planeado === null || Number(planeado) < 0 || Number(planeado) > 100) {
    return { ok: false, error: "El % planeado tiene que estar entre 0 y 100." };
  }

  const quien = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`.trim().slice(0, 150);

  const salida = await prisma.$transaction(async (tx) => {
    /**
     * El uid sale de un contador que SOLO BAJA, y se reserva aqui dentro.
     *
     * `AvanceTarea` y `MapeoTareaPartida` anclan a `(projectId, uid)` sin clave
     * foranea. Si el uid de una tarea borrada volviera al saco, la siguiente
     * heredaria su avance —y el aviso de huerfanos se apagaria justo entonces,
     * porque el uid vuelve a existir—. Reservarlo dentro de la transaccion es
     * lo que impide que dos altas a la vez se lleven el mismo.
     */
    const obra = await tx.project.update({
      where: { id: obraId },
      data: { ultimoUidManual: { decrement: 1 } },
      select: { ultimoUidManual: true },
    });

    const uid = obra.ultimoUidManual;

    let cronogramaId = ctx.vigente?.id ?? null;
    let version = ctx.vigente?.version ?? 0;

    if (cronogramaId === null) {
      version = 1;
      const nuevo = await tx.cronograma.create({
        data: {
          projectId: obraId,
          version,
          // `hoy()` YA devuelve la fecha de calendario a medianoche UTC, igual
          // que las guarda la base. Envolverla otra vez la rompia.
          fechaCorte: hoyCalendario(),
          nombreProyecto: "Cronograma escrito en GCM",
          archivo: null,
          origen: "MANUAL",
          importadoPor: quien,
        },
        select: { id: true },
      });
      cronogramaId = nuevo.id;
    }

    const ultima = await tx.tareaCronograma.findFirst({
      where: { cronogramaId },
      orderBy: { fila: "desc" },
      select: { fila: true },
    });

    await tx.tareaCronograma.create({
      data: {
        cronogramaId,
        uid,
        fila: (ultima?.fila ?? 0) + 1,
        codigo: tarea.codigo?.trim() ? tarea.codigo.trim().slice(0, 40) : null,
        nombre: tarea.nombre.trim().slice(0, 500),
        nivel: 1,
        esResumen: false,
        esHito: tarea.esHito ?? false,
        // Sin red de precedencias no hay ruta critica: no se inventa.
        esCritico: false,
        holguraDias: "0.00",
        holguraInferida: true,
        inicio: new Date(`${tarea.inicio}T00:00:00.000Z`),
        fin: new Date(`${tarea.fin}T00:00:00.000Z`),
        duracionDias: duracion,
        porcentajePlaneado: planeado,
        porcentajeArchivo: "0.00",
        origen: "MANUAL",
      },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "TareaCronograma",
        entidadId: `${uid}`,
        accion: "CREATE",
        despues: { uid, version, nombre: tarea.nombre, inicio: tarea.inicio, fin: tarea.fin },
      },
    });

    return { uid, version };
  });

  return { ok: true, datos: salida };
}

/** Los campos que no dependen de la base. */
function revisarCampos(tarea: TareaAMano): string | null {
  if (tarea.nombre.trim() === "") return "La tarea necesita un nombre.";

  if (!FECHA.test(tarea.inicio) || !FECHA.test(tarea.fin)) {
    return "Las fechas tienen que ser dias del calendario, como 2026-08-17.";
  }
  // Comparacion de CADENAS, que en este formato ordena igual que el calendario
  // y no pasa por ninguna zona horaria.
  if (tarea.fin < tarea.inicio) {
    return "La tarea no puede terminar antes de empezar.";
  }
  return null;
}

/**
 * Cambia una tarea escrita a mano. Las importadas no se tocan.
 */
export async function editarTareaManual(
  sesion: SesionActiva,
  obraId: string,
  uid: number,
  tarea: TareaAMano,
): Promise<Resultado> {
  const ctx = await contextoEditable(sesion, obraId, "cronograma:editar");
  if (!ctx.ok) return ctx;
  if (!ctx.vigente) return { ok: false, error: "Esta obra no tiene cronograma." };

  const problema = revisarCampos(tarea);
  if (problema) return { ok: false, error: problema };

  const duracion = normalizarDecimal(tarea.duracionDias, 2);
  const planeado = normalizarDecimal(tarea.porcentajePlaneado || "0", 2);

  if (duracion === null) return { ok: false, error: "La duracion no es un numero valido." };
  if (planeado === null || Number(planeado) < 0 || Number(planeado) > 100) {
    return { ok: false, error: "El % planeado tiene que estar entre 0 y 100." };
  }

  const fila = await prisma.tareaCronograma.findFirst({
    where: { cronogramaId: ctx.vigente.id, uid },
    select: { id: true, origen: true, nombre: true },
  });

  if (!fila) return { ok: false, error: "Esa tarea no esta en el cronograma vigente." };

  if (fila.origen !== "MANUAL") {
    return {
      ok: false,
      error:
        `"${fila.nombre}" vino de un archivo. Cambiarla aqui se perderia con el ` +
        `siguiente corte, que la devolveria como estaba: corrigela en el archivo ` +
        `y vuelve a importarlo.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.tareaCronograma.update({
      where: { id: fila.id },
      data: {
        codigo: tarea.codigo?.trim() ? tarea.codigo.trim().slice(0, 40) : null,
        nombre: tarea.nombre.trim().slice(0, 500),
        esHito: tarea.esHito ?? false,
        inicio: new Date(`${tarea.inicio}T00:00:00.000Z`),
        fin: new Date(`${tarea.fin}T00:00:00.000Z`),
        duracionDias: duracion,
        porcentajePlaneado: planeado,
      },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "TareaCronograma",
        entidadId: `${uid}`,
        accion: "UPDATE",
        antes: { nombre: fila.nombre },
        despues: { uid, nombre: tarea.nombre, inicio: tarea.inicio, fin: tarea.fin },
      },
    });
  });

  return { ok: true };
}

/**
 * Borra una tarea escrita a mano, con lo que colgaba de ella.
 *
 * Va en DOS PASOS a proposito. Llamada sin `confirmarPerdida`, no borra: dice
 * exactamente cuanto avance y cuantos enlaces con el presupuesto se irian.
 * Ninguna de esas dos cosas tiene clave foranea contra la tarea, asi que la
 * base no protestaria y desaparecerian sin dejar rastro.
 */
export async function eliminarTareaManual(
  sesion: SesionActiva,
  obraId: string,
  uid: number,
  confirmarPerdida = false,
): Promise<Resultado<{ avances: number; mapeos: number }>> {
  const ctx = await contextoEditable(sesion, obraId, "cronograma:eliminar");
  if (!ctx.ok) return ctx;
  if (!ctx.vigente) return { ok: false, error: "Esta obra no tiene cronograma." };

  const fila = await prisma.tareaCronograma.findFirst({
    where: { cronogramaId: ctx.vigente.id, uid },
    select: { id: true, origen: true, nombre: true },
  });

  if (!fila) return { ok: false, error: "Esa tarea no esta en el cronograma vigente." };

  if (fila.origen !== "MANUAL") {
    return {
      ok: false,
      error:
        `"${fila.nombre}" vino de un archivo. Borrarla aqui no serviria: el ` +
        `siguiente corte la devuelve. Quitala del archivo y vuelve a importarlo.`,
    };
  }

  const [avances, mapeos] = await Promise.all([
    prisma.avanceTarea.count({ where: { projectId: obraId, uid } }),
    prisma.mapeoTareaPartida.count({ where: { projectId: obraId, uid } }),
  ]);

  if ((avances > 0 || mapeos > 0) && !confirmarPerdida) {
    const partes = [
      avances > 0 ? `${avances} reporte(s) de avance` : null,
      mapeos > 0 ? `${mapeos} enlace(s) con el presupuesto` : null,
    ].filter(Boolean);

    return {
      ok: false,
      error:
        `Borrar "${fila.nombre}" se llevaria ${partes.join(" y ")}. ` +
        `Nada de eso se puede recuperar. Confirma si aun asi quieres borrarla.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.avanceTarea.deleteMany({ where: { projectId: obraId, uid } });
    await tx.mapeoTareaPartida.deleteMany({ where: { projectId: obraId, uid } });
    await tx.dependenciaTarea.deleteMany({
      where: {
        cronogramaId: ctx.vigente!.id,
        OR: [{ tareaUid: uid }, { predecesoraUid: uid }],
      },
    });
    await tx.tareaCronograma.delete({ where: { id: fila.id } });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "TareaCronograma",
        entidadId: `${uid}`,
        accion: "DELETE",
        // Queda escrito QUE se destruyo, porque no hay forma de recuperarlo.
        antes: { uid, nombre: fila.nombre, avancesBorrados: avances, mapeosBorrados: mapeos },
      },
    });
  });

  return { ok: true, datos: { avances, mapeos } };
}


export interface TareaManualListada {
  uid: number;
  codigo: string | null;
  nombre: string;
  /// Fechas de calendario "YYYY-MM-DD", no `Date`: la pantalla las pinta tal
  /// cual y pasarlas por una zona horaria correria el cronograma un dia.
  inicio: string;
  fin: string;
  duracionDias: string;
  porcentajePlaneado: string;
  esHito: boolean;
}

/**
 * Las tareas del cronograma vigente que se ESCRIBIERON AQUI.
 *
 * Lectura propia y no un campo mas en `obtenerCronograma` a proposito: ese
 * lector lo comparten el Gantt, el informe, la curva S y el valor ganado, y
 * anadirle una columna para una pantalla mueve a todos los demas.
 */
export async function listarTareasManuales(
  sesion: SesionActiva,
  obraId: string,
): Promise<TareaManualListada[]> {
  if (!puede(sesion, "cronograma:leer")) return [];

  const vigente = await prisma.cronograma.findFirst({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: { id: true },
  });

  if (!vigente) return [];

  const tareas = await prisma.tareaCronograma.findMany({
    where: { cronogramaId: vigente.id, origen: "MANUAL" },
    orderBy: { fila: "asc" },
    select: {
      uid: true,
      codigo: true,
      nombre: true,
      inicio: true,
      fin: true,
      duracionDias: true,
      porcentajePlaneado: true,
      esHito: true,
    },
  });

  return tareas.map((t) => ({
    ...t,
    inicio: t.inicio.toISOString().slice(0, 10),
    fin: t.fin.toISOString().slice(0, 10),
    duracionDias: t.duracionDias.toString(),
    porcentajePlaneado: t.porcentajePlaneado.toString(),
  }));
}
