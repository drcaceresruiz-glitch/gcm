"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { guardarEleccionDeEmpresa } from "@/services/plantilla-informe.service";
import type { EstadoPlantilla } from "@/components/informe/ElegirPlantillaInforme";

/**
 * La plantilla de informe por defecto de la constructora.
 *
 * `getAll` y no `get`: las secciones apagadas son casillas con el mismo
 * nombre, y con `get` solo llegaria la primera marcada -que es como se pierde
 * en silencio todo lo que el usuario apago menos una cosa-.
 */
export async function accionPlantillaInformeEmpresa(
  _previo: EstadoPlantilla,
  datos: FormData,
): Promise<EstadoPlantilla> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await guardarEleccionDeEmpresa(
    sesion,
    String(datos.get("plantilla") ?? ""),
    datos.getAll("apagadas").map(String),
  );

  if (!r.ok) return { error: r.error };

  revalidatePath("/empresa/configuracion");
  return { ok: "Guardado. Los informes nuevos saldrán así." };
}
