"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { confirmarEnlace, quitarEnlace } from "@/services/mapeo.service";

export interface RespuestaMapeo {
  ok: boolean;
  error?: string;
  /// Tarea sobre la que se actuo, para que la pantalla sepa donde avisar.
  uid?: number;
}

async function actuar(
  datos: FormData,
  operacion: typeof confirmarEnlace,
): Promise<RespuestaMapeo> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const uid = Number(datos.get("uid"));
  const codigoPartida = String(datos.get("codigoPartida") ?? "");

  if (!obraId || !Number.isSafeInteger(uid) || !codigoPartida) {
    return { ok: false, error: "Faltan datos del enlace." };
  }

  const resultado = await operacion(sesion, obraId, uid, codigoPartida);
  if (!resultado.ok) return { ok: false, error: resultado.error, uid };

  // Se revalida tambien el cronograma y el panel: el mapeo cambia el peso con
  // el que se calcula el avance, asi que sus cifras dejan de ser validas.
  revalidatePath(`/obras/${obraId}/cronograma/mapeo`);
  revalidatePath(`/obras/${obraId}/cronograma`);
  revalidatePath("/panel");

  return { ok: true, uid };
}

export async function accionEnlazar(
  _previo: RespuestaMapeo,
  datos: FormData,
): Promise<RespuestaMapeo> {
  return actuar(datos, confirmarEnlace);
}

export async function accionDesenlazar(
  _previo: RespuestaMapeo,
  datos: FormData,
): Promise<RespuestaMapeo> {
  return actuar(datos, quitarEnlace);
}
