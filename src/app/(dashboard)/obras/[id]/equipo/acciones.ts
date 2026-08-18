"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  asignarAObra,
  quitarDeObra,
  type ResultadoEquipo,
} from "@/services/equipo.service";

/**
 * Acciones del equipo de la obra.
 *
 * Todo el criterio —permiso, empresa, usuario activo, quien ya lo ve todo—
 * vive en `equipo.service`. Aqui solo se resuelve la sesion y se repinta.
 *
 * Se revalida `/panel` ademas de la pantalla: asignar una obra cambia lo que
 * esa persona ve en la lista de obras y en las cifras de cabecera.
 */

export async function accionAsignarAObra(
  obraId: string,
  userId: string,
): Promise<ResultadoEquipo> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await asignarAObra(sesion, obraId, userId);
  if (r.ok) {
    revalidatePath(`/obras/${obraId}/equipo`);
    revalidatePath("/panel");
  }

  return r;
}

export async function accionQuitarDeObra(
  obraId: string,
  userId: string,
): Promise<ResultadoEquipo> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await quitarDeObra(sesion, obraId, userId);
  if (r.ok) {
    revalidatePath(`/obras/${obraId}/equipo`);
    revalidatePath("/panel");
  }

  return r;
}
