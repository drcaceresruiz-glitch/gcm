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
