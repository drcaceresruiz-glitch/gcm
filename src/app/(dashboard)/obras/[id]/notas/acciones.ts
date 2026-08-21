"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  alternarAtendida,
  crearNota,
  editarNota,
  eliminarNota,
  type DatosNota,
  type ResultadoNota,
} from "@/services/notas.service";
import type { CategoriaNota } from "@/generated/prisma/enums";

/**
 * Acciones de las notas. Traducen FormData, resuelven la sesion y delegan:
 * quien puede, sobre que obra, lo decide el servicio.
 *
 * Revalidan `/notas` Y `/tablero`: el widget de proximos recordatorios lee
 * la misma tabla, y sin la segunda revalidacion se quedaria mostrando lo
 * viejo hasta la siguiente navegacion.
 */

function datosDeFormulario(datos: FormData): DatosNota {
  const fecha = datos.get("fechaRecordatorio");
  return {
    categoria: String(datos.get("categoria") ?? "") as CategoriaNota,
    titulo: String(datos.get("titulo") ?? ""),
    cuerpo: String(datos.get("cuerpo") ?? ""),
    fechaRecordatorio:
      typeof fecha === "string" && fecha.trim() ? fecha : undefined,
  };
}

function revalidar(obraId: string): void {
  revalidatePath(`/obras/${obraId}/notas`);
  revalidatePath(`/obras/${obraId}/tablero`);
}

export async function accionCrearNota(
  obraId: string,
  datos: FormData,
): Promise<ResultadoNota> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await crearNota(sesion, obraId, datosDeFormulario(datos));
  if (r.ok) revalidar(obraId);
  return r;
}

export async function accionEditarNota(
  obraId: string,
  notaId: string,
  datos: FormData,
): Promise<ResultadoNota> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await editarNota(sesion, obraId, notaId, datosDeFormulario(datos));
  if (r.ok) revalidar(obraId);
  return r;
}

export async function accionAlternarAtendidaNota(
  obraId: string,
  notaId: string,
  atendida: boolean,
): Promise<ResultadoNota> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await alternarAtendida(sesion, obraId, notaId, atendida);
  if (r.ok) revalidar(obraId);
  return r;
}

export async function accionEliminarNota(
  obraId: string,
  notaId: string,
): Promise<ResultadoNota> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await eliminarNota(sesion, obraId, notaId);
  if (r.ok) revalidar(obraId);
  return r;
}
