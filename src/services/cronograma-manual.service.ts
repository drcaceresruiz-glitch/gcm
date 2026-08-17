import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { normalizarDecimal } from "@/lib/decimal";
import { diasLaborablesEntre } from "@/lib/calendario";
import { hoy as hoyCalendario } from "@/utils/fechas";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import { recalcularResumenes } from "@/services/edt.service";
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

/**
 * Una fecha de calendario "YYYY-MM-DD" en el dia LOCAL que nombra.
 *
 * `new Date("2026-08-17T00:00:00.000Z")` no vale: en Peru —UTC-5— es el 16 a
 * las 19:00, y `getDay()` diria domingo en vez de lunes. Contando dias
 * laborables eso corre la cuenta un dia entero.
 */
function diaLocal(iso: string): Date {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return new Date(anio!, mes! - 1, dia!);
}

/**
 * La duracion SALE de las fechas, en dias de trabajo.
 *
 * Una tarea importada trae su `<Duration>` del archivo y ahi no se toca: una
 * partida de un dia puede abarcar tres dias naturales, y deducirla haria que
 * las manuales y las importadas midieran cosas distintas con el mismo nombre.
 * Pero una tarea TECLEADA no tiene archivo del que sacarla, y pedirla aparte
 * obligaba a calcular a mano algo que las dos fechas ya dicen —y a mantenerlo
 * al dia cada vez que se corre una fecha, que es justo lo que nadie hace—.
 *
 * Se cuenta con el calendario de la obra, no en dias naturales, porque eso es
 * lo que significa la duracion en un cronograma: del viernes al lunes hay dos
 * dias de trabajo si no se trabaja el domingo, no cuatro. El regimen es por
 * obra —el sabado de 5 horas de CRIOCORD no aplica a otra— y sin filas se
 * asume laborable, que es preferible a esconder trabajo ya programado.
 */
async function duracionDeLasFechas(
  projectId: string,
  inicio: string,
  fin: string,
): Promise<string> {
  const calendario = await prisma.workCalendar.findMany({
    where: { projectId },
    select: { diaSemana: true, laborable: true, horas: true },
  });

  const dias = diasLaborablesEntre(
    diaLocal(inicio),
    diaLocal(fin),
    calendario.map((d) => ({ ...d, horas: d.horas.toString() })),
  );

  return `${dias}.00`;
}

export interface TareaAMano {
  codigo?: string | null;
  nombre: string;
  /// Fechas de CALENDARIO, "YYYY-MM-DD". Nunca un `Date` local.
  inicio: string;
  fin: string;
  /**
   * Ya NO se teclea: sale de las fechas, en dias de trabajo del calendario de
   * la obra. Se acepta por compatibilidad y se ignora —ver
   * `duracionDeLasFechas`—.
   */
  duracionDias?: string;
  /// El "% planeado" que leera el informe. Cero si no se dice.
  porcentajePlaneado?: string | null;
  esHito?: boolean;
  /**
   * De que tarea cuelga, si cuelga de alguna. Es lo que hace que una EDT sea
   * una EDT y no una lista.
   *
   * OJO: el cronograma no tiene `parentId`. La jerarquia sale del `nivel` mas
   * el ORDEN del documento —una tarea pertenece a la ultima anterior de nivel
   * menor—, que es como lo exporta MS Project. Asi que elegir padre aqui se
   * traduce en dos cosas: el nivel del padre mas uno, y la posicion justo
   * detras de su ultima descendiente.
   */
  padreUid?: number | null;
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

  const duracion = await duracionDeLasFechas(obraId, tarea.inicio, tarea.fin);
  const planeado = normalizarDecimal(tarea.porcentajePlaneado || "0", 2);

  if (planeado === null || Number(planeado) < 0 || Number(planeado) > 100) {
    return { ok: false, error: "El % planeado tiene que estar entre 0 y 100." };
  }

  /**
   * El padre se comprueba ANTES de abrir la transaccion.
   *
   * Dentro tambien se vuelve a mirar —por si desaparece entre medias— pero
   * alli solo cabe lanzar, y una excepcion es un mensaje generico. Aqui se
   * puede decir lo que pasa.
   */
  if (tarea.padreUid !== null && tarea.padreUid !== undefined) {
    if (!ctx.vigente) {
      return { ok: false, error: "Esta obra no tiene cronograma del que colgar la tarea." };
    }

    const padre = await prisma.tareaCronograma.findFirst({
      where: { cronogramaId: ctx.vigente.id, uid: tarea.padreUid },
      select: { uid: true },
    });

    if (!padre) {
      return { ok: false, error: "La tarea de la que quieres colgar esta ya no existe." };
    }
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

    /**
     * Donde entra la fila, y con que nivel.
     *
     * Sin padre, al final y a nivel 1. Con padre, JUSTO DETRAS de su ultima
     * descendiente: en un cronograma la pertenencia la da el orden, asi que
     * ponerla al final la sacaria del grupo aunque el nivel dijera lo
     * contrario. Todo lo que venga despues se corre una fila.
     */
    const hermanas = await tx.tareaCronograma.findMany({
      where: { cronogramaId },
      orderBy: { fila: "asc" },
      select: { uid: true, fila: true, nivel: true },
    });

    let nivel = 1;
    let fila = (hermanas.at(-1)?.fila ?? 0) + 1;

    if (tarea.padreUid !== null && tarea.padreUid !== undefined) {
      const indice = hermanas.findIndex((t) => t.uid === tarea.padreUid);
      const padre = hermanas[indice];

      if (!padre) {
        throw new Error("AVISO: la tarea de la que quieres colgar esta no existe.");
      }

      nivel = padre.nivel + 1;

      // La ultima descendiente es la ultima seguida con nivel MAYOR que el
      // padre; la primera de nivel igual o menor ya es de otra rama.
      let ultima = indice;
      for (let i = indice + 1; i < hermanas.length; i++) {
        if ((hermanas[i]?.nivel ?? 0) <= padre.nivel) break;
        ultima = i;
      }

      fila = (hermanas[ultima]?.fila ?? padre.fila) + 1;

      await tx.tareaCronograma.updateMany({
        where: { cronogramaId, fila: { gte: fila } },
        data: { fila: { increment: 1 } },
      });

      // Quien tiene descendientes es una tarea RESUMEN: su duracion y su
      // avance son los de lo que agrupa, no los suyos propios.
      await tx.tareaCronograma.updateMany({
        where: { cronogramaId, uid: padre.uid },
        data: { esResumen: true },
      });
    }

    await tx.tareaCronograma.create({
      data: {
        cronogramaId,
        uid,
        fila,
        codigo: tarea.codigo?.trim() ? tarea.codigo.trim().slice(0, 40) : null,
        nombre: tarea.nombre.trim().slice(0, 500),
        nivel,
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

    // Las fechas de los paquetes y capitulos son la envoltura de sus hojas: en
    // cuanto entra o cambia una hoja, hay que volver a subirlas.
    await recalcularResumenes(tx, cronogramaId);

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

  const duracion = await duracionDeLasFechas(obraId, tarea.inicio, tarea.fin);
  const planeado = normalizarDecimal(tarea.porcentajePlaneado || "0", 2);

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
        // Teclear sus fechas es JUSTO lo que le faltaba a una fila nacida de la
        // EDT generada: deja de estar sin programar y vuelve a contar para los
        // atrasos. Sin esto se quedaria invisible al control para siempre.
        sinProgramar: false,
      },
    });

    // Cambiar la fecha de una hoja mueve la envoltura de todo lo que la
    // contiene, hasta el capitulo.
    await recalcularResumenes(tx, ctx.vigente!.id);

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

  /**
   * Una tarea con otras dentro no se borra sin mas.
   *
   * La pertenencia la da el ORDEN mas el nivel: al desaparecer la madre, sus
   * hijas conservan su nivel y pasan a colgar de lo que quede delante, que
   * puede ser cualquier cosa. No da error, reorganiza la EDT sola. Se exige
   * vaciarla primero, igual que un capitulo del presupuesto.
   */
  const orden = await prisma.tareaCronograma.findMany({
    where: { cronogramaId: ctx.vigente.id },
    orderBy: { fila: "asc" },
    select: { uid: true, nivel: true },
  });

  const indice = orden.findIndex((t) => t.uid === uid);
  const nivelPropio = orden[indice]?.nivel ?? 1;
  let dentro = 0;

  for (let i = indice + 1; i < orden.length; i++) {
    if ((orden[i]?.nivel ?? 0) <= nivelPropio) break;
    dentro++;
  }

  if (dentro > 0) {
    return {
      ok: false,
      error:
        `"${fila.nombre}" tiene ${dentro} tarea(s) dentro. Borralas antes, o la ` +
        `EDT se reorganizaria sola: sus hijas pasarian a colgar de la tarea que ` +
        `quede delante.`,
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

    // Al irse una hoja, su paquete puede empezar mas tarde o acabar antes.
    await recalcularResumenes(tx, ctx.vigente!.id);

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
  /// Profundidad en la EDT. 1 es raiz. La pantalla lo pinta como sangria y lo
  /// usa para ofrecer padres.
  nivel: number;
  esResumen: boolean;
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
      nivel: true,
      esResumen: true,
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
