"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { decidirGastosGenerales } from "@/services/criterio-obra.service";

export interface EstadoCriterio {
  error?: string;
}

/**
 * Guarda si los gastos generales entran en la bolsa.
 *
 * Al decidir se vuelve a la obra: la decision no es un destino, es lo que
 * desbloquea el camino. Dejar al usuario en esta pantalla despues de elegir
 * seria dejarlo mirando una pregunta ya contestada.
 */
export async function accionDecidirGastosGenerales(
  _previo: EstadoCriterio,
  datos: FormData,
): Promise<EstadoCriterio> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const valor = String(datos.get("incluir") ?? "");

  if (valor !== "si" && valor !== "no") {
    return { error: "Elige una de las dos opciones." };
  }

  const r = await decidirGastosGenerales(sesion, obraId, valor === "si");
  if (!r.ok) return { error: r.error };

  // La obra entera cambia de aspecto: se levanta el bloqueo y la bolsa se
  // recalcula. Se revalida el arbol completo de la obra, no una pantalla.
  revalidatePath(`/obras/${obraId}`, "layout");
  redirect(`/obras/${obraId}`);
}
