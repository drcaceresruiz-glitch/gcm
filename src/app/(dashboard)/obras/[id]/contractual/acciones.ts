"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { generarContractualDesdeReal } from "@/services/contractual.service";
import { ajustarRecargosDeLaMeta } from "@/services/meta.service";

export interface EstadoContractual {
  error?: string;
}

/**
 * Confirma la generacion del contractual.
 *
 * El segundo paso de la vista previa. No recibe ninguna CIFRA DE DINERO del
 * formulario a proposito: los importes se vuelven a calcular en el servidor
 * desde el presupuesto real. Si viajaran en el formulario, cualquiera podria
 * cambiar el precio de un contrato editando la pagina.
 *
 * Lo que si puede llegar son los RECARGOS que el usuario haya movido en la
 * vista previa, y no rompe esa regla: un recargo es un dato de entrada que
 * esta persona ya podia escribir en la plantilla de Excel, no una cifra
 * calculada. Se GUARDA primero en la meta -con su permiso y sus guardas- y
 * solo despues se genera, recalculando el dinero desde la base como siempre.
 * Asi el contractual nunca sale de un numero que vino por la red.
 */
export async function accionGenerarContractual(
  _previo: EstadoContractual,
  datos: FormData,
): Promise<EstadoContractual> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { error: "Falta la obra." };

  const crudo = String(datos.get("recargos") ?? "").trim();
  if (crudo) {
    let recargos: Record<string, string>;
    try {
      const leido: unknown = JSON.parse(crudo);
      if (typeof leido !== "object" || leido === null || Array.isArray(leido)) {
        return { error: "Los recargos llegaron mal formados." };
      }
      recargos = Object.fromEntries(
        Object.entries(leido as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
      );
    } catch {
      return { error: "Los recargos llegaron mal formados." };
    }

    const ajuste = await ajustarRecargosDeLaMeta(sesion, obraId, recargos);
    if (!ajuste.ok) return { error: ajuste.error };
  }

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
