"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  sincronizarLookahead,
  configurarVentanaLookahead,
  alternarRestriccion,
  fijarFlujos,
  marcarSinRestricciones,
  levantarTodasDeTareas,
  comprometerRestricciones,
  type ResultadoAnalisis,
  type ResultadoCompromiso,
} from "@/services/lookahead.service";
import { avisarDeHechos, motivosDeHechos } from "@/services/avisos-envio";
import type { ModoFlujos } from "@/lib/lookahead";
import type { TipoRestriccion } from "@/generated/prisma/enums";
import type { SesionActiva } from "@/services/sesion.service";
import {
  comprometerAlPts,
  type DatosComprometer,
  type ResultadoComprometer,
} from "@/services/plan-semanal.service";

/**
 * Acciones del Lookahead. Las reglas y el aislamiento por empresa viven en el
 * servicio; aqui solo se resuelve la sesion y se revalida la pantalla para que
 * el cambio se vea al instante.
 */

export async function accionSincronizar(
  obraId: string,
  /// Las semanas que la pantalla esta mostrando, para no sincronizar una
  /// ventana distinta de la que se ve.
  semanas?: number,
): Promise<void> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  await sincronizarLookahead(sesion, obraId, semanas);
  revalidatePath(`/obras/${obraId}/lookahead`);
}

/**
 * Deja fijada la ventana de la obra.
 *
 * Devuelve el error en vez de tragarselo porque puede fallar por algo que la
 * persona necesita saber -no tiene permiso, o la obra esta cerrada-, y el
 * desplegable habria cambiado a la vista sin que se guardara nada.
 */
export async function accionFijarVentana(
  obraId: string,
  semanas: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await configurarVentanaLookahead(sesion, obraId, semanas);
  if (r.ok) revalidatePath(`/obras/${obraId}/lookahead`);
  return r;
}

export async function accionAlternarRestriccion(
  obraId: string,
  restriccionId: string,
  resuelta: boolean,
): Promise<void> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await alternarRestriccion(sesion, obraId, restriccionId, resuelta);
  if (r.ok) revalidar(obraId);
}


/**
 * Las pantallas que hay que refrescar tras tocar el analisis.
 *
 * El Plan Semanal tambien: el orden de su desplegable y el aviso al
 * comprometer salen de la columna `estado` del Lookahead, asi que sin esto
 * seguiria diciendo "sin liberar" de una tarea que se acaba de dejar lista.
 */
function revalidar(obraId: string): void {
  revalidatePath(`/obras/${obraId}/lookahead`);
  revalidatePath(`/obras/${obraId}/plan-semanal`);
}

/**
 * Avisa de lo que acaba de pasar, sin poder romper lo que acaba de pasar.
 *
 * Va FUERA de la transaccion que guardo el analisis y con su propio manejo de
 * fallos, por la misma razon por la que `enviarCorreo` se traga los suyos: un
 * aviso perdido es un incordio, pero un analisis que no se guardo porque el
 * aviso reviento es un dato falso en la pantalla del residente.
 *
 * Salen los tres canales, pero no cuestan lo mismo. El SMS va por la cola, que
 * es un INSERT: el telefono de la empresa lo recoge despues. El correo si es
 * sincrono —una conversacion SMTP por persona— y por eso lleva un techo bajo
 * dentro de la accion; lo que no quepa lo recoge el resumen del dia, y la
 * campanita ya salio.
 */
async function avisar(
  sesion: SesionActiva,
  obraId: string,
  hechos: { abiertas: { uid: number; tipo: TipoRestriccion }[]; listas: number[] },
): Promise<void> {
  if (hechos.abiertas.length === 0 && hechos.listas.length === 0) return;

  try {
    const contexto = { companyId: sesion.companyId, projectId: obraId };
    const motivos = await motivosDeHechos(obraId, hechos.abiertas, hechos.listas);

    // En serie y no con `Promise.all`: los dos comparten el presupuesto de
    // correo y el tope de SMS, y en paralelo cada uno creeria que lo tiene
    // entero para si.
    const a = await avisarDeHechos(contexto, "ABRIR", motivos.abiertas);
    const b = await avisarDeHechos(contexto, "LISTA", motivos.listas);

    // La campanita se cuenta en el LAYOUT del panel, no en esta pagina, y
    // `revalidatePath` sin tipo solo refresca la pagina. Sin esto el aviso se
    // escribia bien y el numerito se quedaba viejo hasta recargar, que para
    // quien lo mira es exactamente lo mismo que no haber avisado.
    //
    // Solo cuando de verdad se creo alguno: refrescar el layout en cada clic
    // de la matriz seria pagar tres consultas por nada.
    if (a.app + b.app > 0) {
      revalidatePath(`/obras/${obraId}/lookahead`, "layout");
    }
  } catch (e) {
    console.error("[avisos] No se pudo avisar del Lookahead:", e);
  }
}

/**
 * Registra a quien le toca levantar unas restricciones, y para cuando.
 *
 * No avisa: asignar no abre ni cierra nada. Quien reciba el encargo se entera
 * por el recordatorio, que ya lleva la fecha, o porque se lo dijeron —que es lo
 * normal y lo que el sistema debe registrar, no sustituir—.
 */
export async function accionComprometerRestricciones(
  obraId: string,
  datos: { ids: string[]; responsable: string; fecha: string },
): Promise<ResultadoCompromiso> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await comprometerRestricciones(sesion, obraId, datos);
  if (r.ok) revalidar(obraId);
  return r;
}

/**
 * Dice que flujos aplican a las tareas elegidas y las marca como analizadas.
 *
 * Devuelve el resultado —no es `void` como las de arriba— porque la pantalla
 * tiene que poder decir cuantas restricciones se conservaron por tener fotos o
 * estar ya resueltas. Tragarse eso seria borrar en silencio... o peor: no
 * borrar en silencio, y que el usuario crea que si.
 */
export async function accionFijarFlujos(
  obraId: string,
  uids: number[],
  tipos: TipoRestriccion[],
  modo?: ModoFlujos,
): Promise<ResultadoAnalisis> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await fijarFlujos(sesion, obraId, { uids, tipos, modo });
  if (r.ok) {
    await avisar(sesion, obraId, r.hechos);
    revalidar(obraId);
  }
  return r;
}

/** "Revisadas: no les aplica ninguna restriccion." */
export async function accionSinRestricciones(
  obraId: string,
  uids: number[],
): Promise<ResultadoAnalisis> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await marcarSinRestricciones(sesion, obraId, uids);
  if (r.ok) {
    await avisar(sesion, obraId, r.hechos);
    revalidar(obraId);
  }
  return r;
}

/** Levanta todas las restricciones pendientes de las tareas elegidas. */
export async function accionLevantarTodas(
  obraId: string,
  uids: number[],
): Promise<ResultadoAnalisis> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await levantarTodasDeTareas(sesion, obraId, uids);
  if (r.ok) {
    await avisar(sesion, obraId, r.hechos);
    revalidar(obraId);
  }
  return r;
}


/**
 * Lleva las tareas elegidas del Lookahead al Plan Semanal.
 *
 * Devuelve el resultado (no es void como las otras) porque la pantalla necesita
 * saber si el servidor pide confirmacion —hay tareas sin liberar o ya
 * comprometidas— y cuantas entraron de verdad.
 */
export async function accionComprometerAlPts(
  obraId: string,
  datos: DatosComprometer,
): Promise<ResultadoComprometer> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await comprometerAlPts(sesion, obraId, datos);

  if (r.ok) {
    // La tarea pasa a verse en los dos sitios: la matriz la marca como
    // comprometida y la semana gana el compromiso.
    revalidatePath(`/obras/${obraId}/lookahead`);
    revalidatePath(`/obras/${obraId}/plan-semanal`);
    revalidatePath(`/obras/${obraId}/plan-semanal/${r.planId}`);
  }

  return r;
}
