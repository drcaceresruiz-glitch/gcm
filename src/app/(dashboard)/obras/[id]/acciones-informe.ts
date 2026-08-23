"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { guardarEleccionDeObra } from "@/services/plantilla-informe.service";
import type { EstadoPlantilla } from "@/components/informe/ElegirPlantillaInforme";

/**
 * La plantilla de informe de UNA obra, que pisa la de la empresa.
 *
 * Una plantilla vacia significa «vuelve a heredar», y el servicio limpia las
 * dos columnas: dejar las secciones apagadas puestas mientras la plantilla
 * vuelve a nula crearia una obra que hereda pero conserva interruptores que
 * ya nadie ve.
 */
export async function accionPlantillaInformeObra(
  _previo: EstadoPlantilla,
  datos: FormData,
): Promise<EstadoPlantilla> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { error: "Falta la obra." };

  const r = await guardarEleccionDeObra(
    sesion,
    obraId,
    String(datos.get("plantilla") ?? ""),
    datos.getAll("apagadas").map(String),
  );

  if (!r.ok) return { error: r.error };

  revalidatePath(`/obras/${obraId}`, "layout");
  return { ok: "Guardado. El informe de esta obra saldrá así." };
}
