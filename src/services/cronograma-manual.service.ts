import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { normalizarDecimal } from "@/lib/decimal";
import { diasLaborablesEntre } from "@/lib/calendario";
import { calcularRutaCritica, type TipoEnlace } from "@/lib/ruta-critica";
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
  /**
   * De que tareas depende para PODER EMPEZAR (fin-comienzo, sin desfase):
   * la mas comun con diferencia en un cronograma real, y la unica que este
   * editor ofrece —a proposito, para que el formulario siga siendo el de
   * una obra sin planificador—. Quien necesite comienzo-comienzo,
   * fin-fin o un desfase en dias sigue teniendo el Excel o MS Project.
   *
   * Distinto de `padreUid`: el padre es jerarquia EDT (de que capitulo
   * cuelga), esto es PRECEDENCIA (que tiene que terminar antes). Una tarea
   * puede depender de varias a la vez.
   */
  dependeDeUids?: readonly number[];
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

  const predecesoras = await predecesorasValidas(
    ctx.vigente?.id ?? null,
    null,
    tarea.dependeDeUids,
  );
  if (!predecesoras.ok) return predecesoras;

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
        // Punto de partida sin dependencias. Si `predecesoras.uids` trae
        // algo, `recalcularRutaCritica` de mas abajo lo corrige en el
        // mismo paso.
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

    if (predecesoras.uids.length > 0) {
      await escribirDependenciasManual(tx, cronogramaId, uid, predecesoras.uids);
    }

    // Las fechas de los paquetes y capitulos son la envoltura de sus hojas: en
    // cuanto entra o cambia una hoja, hay que volver a subirlas.
    await recalcularResumenes(tx, cronogramaId);
    await recalcularRutaCritica(tx, cronogramaId, obraId);

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
 * Recalcula esCritico/holguraDias de todo el cronograma tras cualquier
 * cambio que pueda mover la red: crear, editar o borrar una tarea manual,
 * o solo cambiar sus dependencias.
 *
 * Corre SIEMPRE, no solo cuando la tarea tocada tiene dependencias: quitar
 * el ultimo enlace de todo el cronograma tiene que devolver a
 * `esCritico:false`/`holguraInferida:true` a quien antes salia critico, y
 * solo recorriendolo entero se sabe si sigue quedando alguna dependencia.
 *
 * SOLO ESCRIBE filas `origen: MANUAL`. La red que le da de comer al CPM
 * incluye tareas IMPORTADAS si estan enlazadas (sus fechas ya son reales y
 * ayudan a situar a las manuales), pero su `esCritico`/`holguraDias` sigue
 * viniendo del archivo siempre —no se pisa con un calculo propio—, mismo
 * principio que ya rige en todo el modulo de ruta critica: lo que trajo un
 * archivo se respeta, lo que no tiene archivo se calcula.
 */
async function recalcularRutaCritica(
  tx: Parameters<typeof recalcularResumenes>[0],
  cronogramaId: string,
  projectId: string,
): Promise<void> {
  const [obra, calendarioFilas, filas, enlaces] = await Promise.all([
    tx.project.findFirst({ where: { id: projectId }, select: { fechaInicio: true } }),
    tx.workCalendar.findMany({
      where: { projectId },
      select: { diaSemana: true, laborable: true, horas: true },
    }),
    tx.tareaCronograma.findMany({
      where: { cronogramaId },
      select: { uid: true, duracionDias: true, esResumen: true, esHito: true, origen: true },
    }),
    tx.dependenciaTarea.findMany({
      where: { cronogramaId },
      select: { tareaUid: true, predecesoraUid: true, tipo: true, desfaseDias: true },
    }),
  ]);

  if (!obra) return;

  if (enlaces.length === 0) {
    // Ninguna dependencia en todo el cronograma: nadie manual puede seguir
    // marcado como critico de una red que ya no existe.
    await tx.tareaCronograma.updateMany({
      where: { cronogramaId, origen: "MANUAL" },
      data: { esCritico: false, holguraDias: "0.00", holguraInferida: true },
    });
    return;
  }

  const calendario = calendarioFilas.map((d) => ({ ...d, horas: d.horas.toString() }));

  const cpm = calcularRutaCritica(
    filas.map((f) => ({
      uid: f.uid,
      duracionDias: f.duracionDias.toString(),
      esResumen: f.esResumen,
      esHito: f.esHito,
    })),
    // `tipo` es texto libre en la base (@db.VarChar(2), no un enum de
    // Prisma) porque `DependenciaTarea` es compartida con el importador de
    // MS Project/Excel; ahi ya se valida contra los cuatro tipos al leer
    // el archivo, y aqui solo se crea con "FC" a mano, asi que el cast es
    // seguro.
    enlaces.map((e) => ({
      ...e,
      tipo: e.tipo as TipoEnlace,
      desfaseDias: e.desfaseDias.toString(),
    })),
    obra.fechaInicio,
    calendario,
  );

  // Un ciclo no se puede resolver: se deja todo como estaba, no se finge
  // un numero. Nada impide crear uno a mano —A depende de B y B de A—,
  // asi que esto SI puede pasar, a diferencia del padre (que no admite
  // ciclos por construccion).
  if (cpm.ciclo) return;

  for (const f of filas) {
    if (f.esResumen || f.origen !== "MANUAL") continue;
    const critico = cpm.esCritico.get(f.uid);
    const holgura = cpm.holguraDias.get(f.uid);
    if (critico === undefined || holgura === undefined) continue;

    await tx.tareaCronograma.updateMany({
      where: { cronogramaId, uid: f.uid },
      data: { esCritico: critico, holguraDias: holgura, holguraInferida: false },
    });
  }
}

/**
 * Que las tareas de las que se quiere depender existan en este cronograma.
 *
 * Se comprueba ANTES de abrir la transaccion, mismo patron que el padre
 * unas lineas mas arriba: aqui se puede decir cual falta, dentro de la
 * transaccion solo cabria lanzar. Descarta la auto-referencia y los
 * duplicados en vez de rechazarlos —es el tipo de error que se comete
 * tildando dos veces la misma casilla, no una intencion que corregir—.
 */
async function predecesorasValidas(
  cronogramaId: string | null,
  propioUid: number | null,
  dependeDeUids: readonly number[] | undefined,
): Promise<{ ok: true; uids: number[] } | { ok: false; error: string }> {
  const pedidas = Array.from(
    new Set((dependeDeUids ?? []).filter((p) => p !== propioUid)),
  );
  if (pedidas.length === 0) return { ok: true, uids: [] };

  if (!cronogramaId) {
    return { ok: false, error: "Esta obra no tiene cronograma del que colgar la tarea." };
  }

  const existentes = await prisma.tareaCronograma.findMany({
    where: { cronogramaId, uid: { in: pedidas } },
    select: { uid: true },
  });
  if (existentes.length !== pedidas.length) {
    return { ok: false, error: "Una de las tareas de las que depende ya no existe." };
  }

  return { ok: true, uids: pedidas };
}

/**
 * Deja las dependencias de una tarea EXACTAMENTE como diga `predecesoras`:
 * borra las que hubiera y crea las nuevas. Reemplazar el conjunto entero,
 * no ir sumando, es lo que permite QUITAR una dependencia desde el
 * formulario sin un boton aparte para cada enlace. No valida —quien llama
 * ya lo hizo con `predecesorasValidas`—.
 */
async function escribirDependenciasManual(
  tx: Parameters<typeof recalcularResumenes>[0],
  cronogramaId: string,
  uid: number,
  predecesoras: readonly number[],
): Promise<void> {
  await tx.dependenciaTarea.deleteMany({ where: { cronogramaId, tareaUid: uid } });

  if (predecesoras.length > 0) {
    await tx.dependenciaTarea.createMany({
      data: predecesoras.map((predecesoraUid) => ({
        cronogramaId,
        tareaUid: uid,
        predecesoraUid,
        tipo: "FC",
        desfaseDias: "0.00",
      })),
    });
  }
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

  const predecesoras = await predecesorasValidas(ctx.vigente.id, uid, tarea.dependeDeUids);
  if (!predecesoras.ok) return predecesoras;

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

    await escribirDependenciasManual(tx, ctx.vigente!.id, uid, predecesoras.uids);

    // Cambiar la fecha de una hoja mueve la envoltura de todo lo que la
    // contiene, hasta el capitulo.
    await recalcularResumenes(tx, ctx.vigente!.id);
    await recalcularRutaCritica(tx, ctx.vigente!.id, obraId);

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
    // Y la red de precedencias tambien pierde un nodo: quien dependia de
    // esta tarea puede dejar de estar en la ruta critica, o entrar en ella.
    await recalcularRutaCritica(tx, ctx.vigente!.id, obraId);

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
  /// Solo tiene sentido cuando `!holguraInferida`: viene de
  /// `recalcularRutaCritica`, no del archivo (esta tarea no tiene archivo).
  esCritico: boolean;
  holguraDias: string;
  holguraInferida: boolean;
  /// De que tareas depende para poder empezar. Uids, no ids: es lo que la
  /// pantalla usa para pre-marcar las casillas al editar.
  dependeDeUids: number[];
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
      esCritico: true,
      holguraDias: true,
      holguraInferida: true,
    },
  });

  // Las dependencias de las MANUALES: una predecesora puede ser importada
  // (situar una tarea tecleada contra el plan real es justo el caso de
  // uso), pero esta pantalla solo edita filas manuales, asi que solo hace
  // falta traer los enlaces que SALEN de una.
  const uids = tareas.map((t) => t.uid);
  const enlaces = uids.length
    ? await prisma.dependenciaTarea.findMany({
        where: { cronogramaId: vigente.id, tareaUid: { in: uids } },
        select: { tareaUid: true, predecesoraUid: true },
      })
    : [];
  const predecesorasPorUid = new Map<number, number[]>();
  for (const e of enlaces) {
    const lista = predecesorasPorUid.get(e.tareaUid) ?? [];
    lista.push(e.predecesoraUid);
    predecesorasPorUid.set(e.tareaUid, lista);
  }

  return tareas.map((t) => ({
    ...t,
    inicio: t.inicio.toISOString().slice(0, 10),
    fin: t.fin.toISOString().slice(0, 10),
    duracionDias: t.duracionDias.toString(),
    porcentajePlaneado: t.porcentajePlaneado.toString(),
    holguraDias: t.holguraDias.toString(),
    dependeDeUids: predecesorasPorUid.get(t.uid) ?? [],
  }));
}
