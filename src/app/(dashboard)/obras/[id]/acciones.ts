"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  actualizarPartida,
  crearPartida,
  eliminarPartida,
  type CamposPartida,
  type NuevaPartida,
} from "@/services/partidas.service";
import { eliminarObra, cambiarEstadoObra } from "@/services/obras.service";

export interface RespuestaEdicion {
  ok: boolean;
  error?: string;
}

export async function accionEditarPartida(
  obraId: string,
  partidaId: string,
  campos: CamposPartida,
): Promise<RespuestaEdicion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await actualizarPartida(sesion, partidaId, campos);
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath(`/obras/${obraId}`);
  return { ok: true };
}

export async function accionCrearPartida(
  obraId: string,
  nueva: NuevaPartida,
): Promise<RespuestaEdicion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await crearPartida(sesion, obraId, nueva);
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath(`/obras/${obraId}`);
  return { ok: true };
}

export async function accionEliminarPartida(
  obraId: string,
  partidaId: string,
): Promise<RespuestaEdicion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await eliminarPartida(sesion, partidaId);
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath(`/obras/${obraId}`);
  return { ok: true };
}

/**
 * Elimina la obra entera. Solo procede en planificacion y sin compromisos; de
 * eso se encarga el servicio. Al lograrlo, la obra ya no existe: se vuelve al
 * panel, y por eso el `redirect` va fuera —no se puede revalidar una ruta que
 * se acaba de borrar—.
 */
export async function accionEliminarObra(
  _previo: RespuestaEdicion,
  datos: FormData,
): Promise<RespuestaEdicion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await eliminarObra(sesion, String(datos.get("id") ?? ""));
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath("/panel");
  redirect("/panel");
}

/** Cambia el estado de la obra por uno de los permitidos desde el actual. */
export async function accionCambiarEstadoObra(
  _previo: RespuestaEdicion,
  datos: FormData,
): Promise<RespuestaEdicion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("id") ?? "");
  const r = await cambiarEstadoObra(sesion, obraId, String(datos.get("estado") ?? ""));
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath(`/obras/${obraId}`, "layout");
  revalidatePath("/panel");
  return { ok: true };
}
