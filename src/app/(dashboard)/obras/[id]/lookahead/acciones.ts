"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  sincronizarLookahead,
  alternarRestriccion,
} from "@/services/lookahead.service";
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

  await alternarRestriccion(sesion, obraId, restriccionId, resuelta);
  revalidatePath(`/obras/${obraId}/lookahead`);
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
