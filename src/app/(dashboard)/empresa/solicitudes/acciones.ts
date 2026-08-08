"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { resolverSolicitud } from "@/services/perfil.service";

export interface EstadoBandeja {
  error?: string;
  ok?: string;
}

/**
 * Aprueba o rechaza una solicitud de cambio de perfil.
 *
 * El boton pulsado manda `decision` = "aprobar" | "rechazar". Rechazar exige
 * motivo, igual que anular una orden.
 */
export async function accionResolver(
  _previo: EstadoBandeja,
  datos: FormData,
): Promise<EstadoBandeja> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const id = String(datos.get("id") ?? "");
  const aprobar = String(datos.get("decision") ?? "") === "aprobar";
  const motivoRechazo = String(datos.get("motivoRechazo") ?? "");

  const resultado = await resolverSolicitud(sesion, id, { aprobar, motivoRechazo });
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/empresa/solicitudes");
  // El nombre puede cambiar en la cabecera al aprobar: se refresca el area.
  revalidatePath("/", "layout");
  return { ok: aprobar ? "Solicitud aprobada." : "Solicitud rechazada." };
}
