"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { generarContractualDesdeReal } from "@/services/contractual.service";

export interface EstadoContractual {
  error?: string;
}

/**
 * Confirma la generacion del contractual.
 *
 * El segundo paso de la vista previa. No recibe ningun numero del formulario
 * a proposito: las cifras se vuelven a calcular en el servidor desde el
 * presupuesto real. Si viajaran en el formulario, cualquiera podria cambiar
 * el precio de un contrato editando la pagina.
 */
export async function accionGenerarContractual(
  _previo: EstadoContractual,
  datos: FormData,
): Promise<EstadoContractual> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { error: "Falta la obra." };

  const resultado = await generarContractualDesdeReal(
    sesion,
    obraId,
    datos.get("reemplazar") === "on",
  );

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/${obraId}/contractual`);
  redirect(`/obras/${obraId}?importadas=${resultado.partidas}`);
}
