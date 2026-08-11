"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  sincronizarLookahead,
  alternarRestriccion,
  fijarFlujos,
  marcarSinRestricciones,
  levantarTodasDeTareas,
  type ResultadoAnalisis,
} from "@/services/lookahead.service";
import type { ModoFlujos } from "@/lib/lookahead";
import type { TipoRestriccion } from "@/generated/prisma/enums";
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
  if (r.ok) revalidar(obraId);
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
  if (r.ok) revalidar(obraId);
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
  if (r.ok) revalidar(obraId);
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
