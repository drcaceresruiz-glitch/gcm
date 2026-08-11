"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  guardarAjustes,
  guardarSuscripcion,
  borrarSuscripcion,
  altaContacto,
  bajaContacto,
  type DatosAjustes,
  type DatosNuevaSuscripcion,
  type ResultadoAviso,
} from "@/services/avisos.service";
import type { DatosContacto } from "@/lib/avisos";

/**
 * Acciones de los avisos de restricciones de una obra.
 *
 * Todo el criterio —permiso, empresa, obra abierta, que el sujeto sea de ESTA
 * obra— vive en `avisos.service`. Aqui solo se resuelve la sesion y se repinta
 * la pantalla, y solo si salio bien: revalidar tras un error borraria del
 * formulario lo que la persona acaba de escribir.
 *
 * Van en su propio archivo y no en `acciones.ts` porque aquel es del pase de
 * obra: son dos dominios que comparten pantalla, no uno solo.
 */

export async function accionGuardarAjustes(
  obraId: string,
  datos: DatosAjustes,
): Promise<ResultadoAviso> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await guardarAjustes(sesion, obraId, datos);
  if (r.ok) revalidatePath(`/obras/${obraId}/personal`);
  return r;
}

export async function accionGuardarSuscripcion(
  obraId: string,
  datos: DatosNuevaSuscripcion,
): Promise<ResultadoAviso> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await guardarSuscripcion(sesion, obraId, datos);
  if (r.ok) revalidatePath(`/obras/${obraId}/personal`);
  return r;
}

export async function accionBorrarSuscripcion(
  obraId: string,
  id: string,
): Promise<ResultadoAviso> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await borrarSuscripcion(sesion, obraId, id);
  if (r.ok) revalidatePath(`/obras/${obraId}/personal`);
  return r;
}

export async function accionAltaContacto(
  obraId: string,
  datos: DatosContacto,
): Promise<ResultadoAviso> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await altaContacto(sesion, obraId, datos);
  if (r.ok) revalidatePath(`/obras/${obraId}/personal`);
  return r;
}

export async function accionBajaContacto(
  obraId: string,
  id: string,
): Promise<ResultadoAviso> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await bajaContacto(sesion, obraId, id);
  if (r.ok) revalidatePath(`/obras/${obraId}/personal`);
  return r;
}
