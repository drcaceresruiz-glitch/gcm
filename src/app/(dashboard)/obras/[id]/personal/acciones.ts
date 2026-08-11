"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  crearPase,
  editarPase,
  eliminarPase,
  cambiarEstadoPase,
  generarCodigoParaEntregar,
  type ResultadoPase,
  type ResultadoCodigo,
} from "@/services/pase.service";
import type { DatosAltaPase } from "@/lib/pase";

/**
 * Acciones del personal con pase de obra.
 *
 * Todo el criterio —permiso, empresa, contacto repetido, limites— vive en
 * `pase.service`. Aqui solo se resuelve la sesion y se repinta la pantalla.
 */

export async function accionCrearPase(
  obraId: string,
  datos: DatosAltaPase,
): Promise<ResultadoPase> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await crearPase(sesion, obraId, datos);
  if (r.ok) revalidatePath(`/obras/${obraId}/personal`);

  return r;
}

export async function accionEditarPase(
  obraId: string,
  paseId: string,
  datos: DatosAltaPase,
): Promise<ResultadoPase> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await editarPase(sesion, obraId, paseId, datos);
  if (r.ok) revalidatePath(`/obras/${obraId}/personal`);

  return r;
}

/**
 * Borra el pase. Sus fotos NO se van con el: quedan firmadas con su nombre.
 * La pantalla lo dice antes de confirmar, porque desde fuera cualquiera
 * supondria lo contrario.
 */
export async function accionEliminarPase(
  obraId: string,
  paseId: string,
): Promise<ResultadoPase> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await eliminarPase(sesion, obraId, paseId);
  if (r.ok) revalidatePath(`/obras/${obraId}/personal`);

  return r;
}

export async function accionCambiarEstadoPase(
  obraId: string,
  paseId: string,
  activo: boolean,
): Promise<ResultadoPase> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await cambiarEstadoPase(sesion, obraId, paseId, activo);
  if (r.ok) revalidatePath(`/obras/${obraId}/personal`);

  return r;
}

/**
 * Genera un codigo y lo DEVUELVE para dictarlo o mandarlo por WhatsApp.
 *
 * Es la via para quien no tiene correo ni le llega el SMS —que en esta obra
 * sale del telefono de campo y puede estar apagado—. Por eso el codigo viaja
 * de vuelta a la pantalla en claro: lo pide alguien que ya tiene permiso
 * sobre la obra y lo va a leer en voz alta.
 */
export async function accionGenerarCodigo(
  obraId: string,
  paseId: string,
): Promise<ResultadoCodigo> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  return generarCodigoParaEntregar(sesion, obraId, paseId);
}
