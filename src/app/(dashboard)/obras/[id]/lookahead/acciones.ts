"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  sincronizarLookahead,
  alternarRestriccion,
} from "@/services/lookahead.service";

/**
 * Acciones del Lookahead. Las reglas y el aislamiento por empresa viven en el
 * servicio; aqui solo se resuelve la sesion y se revalida la pantalla para que
 * el cambio se vea al instante.
 */

export async function accionSincronizar(obraId: string): Promise<void> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  await sincronizarLookahead(sesion, obraId);
  revalidatePath(`/obras/${obraId}/lookahead`);
}

export async function accionAlternarRestriccion(
  obraId: string,
  restriccionId: string,
  resuelta: boolean,
): Promise<void> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  await alternarRestriccion(sesion, obraId, restriccionId, resuelta);
  revalidatePath(`/obras/${obraId}/lookahead`);
}
