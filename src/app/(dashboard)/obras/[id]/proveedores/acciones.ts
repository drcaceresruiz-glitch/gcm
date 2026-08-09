"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  crearEncargo,
  editarEncargo,
  valorizarEncargo,
  cambiarEstadoEncargo,
  type ResultadoEncargo,
  type DatosEncargo,
} from "@/services/encargos.service";
import type { EstadoEncargo } from "@/generated/prisma/enums";

/**
 * Acciones de los encargos a proveedores.
 *
 * Reciben objetos tipados y no `FormData`: el frente de un encargo es una
 * lista de partidas con su fraccion, que en `FormData` habria que serializar a
 * mano y volver a parsear. La pantalla navega al confirmar; estas solo repintan
 * y devuelven el resultado.
 */

export async function accionCrearEncargo(
  obraId: string,
  datos: DatosEncargo,
): Promise<ResultadoEncargo> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await crearEncargo(sesion, obraId, datos);
  if (resultado.ok) revalidatePath(`/obras/${obraId}/proveedores`);
  return resultado;
}

export async function accionEditarEncargo(
  obraId: string,
  encargoId: string,
  datos: DatosEncargo,
): Promise<ResultadoEncargo> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await editarEncargo(sesion, obraId, encargoId, datos);
  if (resultado.ok) {
    revalidatePath(`/obras/${obraId}/proveedores`);
    revalidatePath(`/obras/${obraId}/proveedores/${encargoId}`);
  }
  return resultado;
}

export async function accionValorizar(
  obraId: string,
  encargoId: string,
  datos: { fecha: string; porcentaje: string; nota?: string },
): Promise<ResultadoEncargo> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await valorizarEncargo(sesion, obraId, encargoId, datos);
  if (resultado.ok) {
    revalidatePath(`/obras/${obraId}/proveedores`);
    revalidatePath(`/obras/${obraId}/proveedores/${encargoId}`);
  }
  return resultado;
}

export async function accionCambiarEstado(
  obraId: string,
  encargoId: string,
  estado: EstadoEncargo,
): Promise<ResultadoEncargo> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await cambiarEstadoEncargo(sesion, obraId, encargoId, estado);
  if (resultado.ok) revalidatePath(`/obras/${obraId}/proveedores`);
  return resultado;
}
