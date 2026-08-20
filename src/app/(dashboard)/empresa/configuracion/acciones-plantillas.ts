"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import {
  guardarPlantilla,
  retirarPlantilla,
  type ResultadoPlantilla,
} from "@/services/plantillas-mensaje.service";

/**
 * Las plantillas de mensaje, desde la configuracion de la empresa.
 *
 * En su propio archivo y no dentro de `acciones.ts`, igual que las del
 * remitente de correo: la pantalla de configuracion ya agrupa cosas que no
 * tienen nada que ver entre si, y mezclar sus acciones haria que tocar una
 * obligara a leer las otras.
 */

export async function accionGuardarPlantilla(
  datos: { id?: string; nombre: string; asunto: string; cuerpo: string },
): Promise<ResultadoPlantilla> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await guardarPlantilla(sesion, datos);
  if (r.ok) revalidatePath("/empresa/configuracion");
  return r;
}

export async function accionRetirarPlantilla(
  id: string,
): Promise<ResultadoPlantilla> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await retirarPlantilla(sesion, id);
  if (r.ok) revalidatePath("/empresa/configuracion");
  return r;
}
