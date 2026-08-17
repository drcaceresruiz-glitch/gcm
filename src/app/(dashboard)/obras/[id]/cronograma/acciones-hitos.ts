"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  asignarResponsable,
  crearHito,
  eliminarHito,
  type NuevoHito,
} from "@/services/hitos.service";

/**
 * Marcar y quitar hitos sobre la EDT.
 *
 * Un fallo de la base sale como mensaje, no como pantalla en blanco: una
 * Server Action que lanza sube al limite de Next y deja la pagina inservible.
 */

export interface RespuestaHito {
  ok: boolean;
  error?: string;
  uid?: number;
  /// Lo que hizo la sincronizacion al colocarlo.
  aviso?: string;
  /// Cierto cuando el borrado se paro para preguntar, no porque fallara.
  pideConfirmacion?: boolean;
}

function mensaje(e: unknown): string {
  const texto = e instanceof Error ? e.message : "";
  if (texto.startsWith("AVISO: ")) return texto.slice(7);
  return "No se pudo completar. Vuelve a intentarlo.";
}

export async function accionCrearHito(
  obraId: string,
  hito: NuevoHito,
): Promise<RespuestaHito> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  try {
    const r = await crearHito(sesion, obraId, hito);
    if (!r.ok) return { ok: false, error: r.error };

    revalidatePath(`/obras/${obraId}`, "layout");
    return { ok: true, uid: r.datos.uid, aviso: r.datos.aviso };
  } catch (e) {
    console.error("[hitos] fallo al crear", e);
    return { ok: false, error: mensaje(e) };
  }
}

/**
 * Pone el nombre de alguien encima de un hito, o se lo quita.
 *
 * `clave` vacia = sin responsable. Un hito sin nombre no es un plan: cuando
 * llegue el aviso, no habra a quien escribirle.
 */
export async function accionAsignarResponsable(
  obraId: string,
  uid: number,
  clave: string | null,
): Promise<RespuestaHito> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  try {
    const r = await asignarResponsable(sesion, obraId, uid, clave || null);
    if (!r.ok) return { ok: false, error: r.error };

    revalidatePath(`/obras/${obraId}`, "layout");
    return { ok: true };
  } catch (e) {
    console.error("[hitos] fallo al asignar responsable", e);
    return { ok: false, error: mensaje(e) };
  }
}

export async function accionEliminarHito(
  obraId: string,
  uid: number,
  confirmado = false,
): Promise<RespuestaHito> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  try {
    const r = await eliminarHito(sesion, obraId, uid, confirmado);

    if (!r.ok) {
      const pide = (r as { datos?: { pideConfirmacion?: boolean } }).datos?.pideConfirmacion;
      return { ok: false, error: r.error, pideConfirmacion: pide === true };
    }

    revalidatePath(`/obras/${obraId}`, "layout");
    return { ok: true };
  } catch (e) {
    console.error("[hitos] fallo al borrar", e);
    return { ok: false, error: mensaje(e) };
  }
}
