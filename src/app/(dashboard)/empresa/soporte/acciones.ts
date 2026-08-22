"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { escribirSoporte } from "@/services/soporte.service";

export interface EstadoSoporte {
  error?: string;
  ok?: string;
}

export async function accionEscribirSoporte(
  _previo: EstadoSoporte,
  datos: FormData,
): Promise<EstadoSoporte> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await escribirSoporte(sesion, String(datos.get("cuerpo") ?? ""));
  if (!r.ok) return { error: r.error };

  revalidatePath("/empresa/soporte");
  return { ok: "Enviado." };
}
