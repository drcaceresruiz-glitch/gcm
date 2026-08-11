"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { marcarAvisosLeidos } from "@/services/avisos-bandeja";

/**
 * Acciones de la bandeja de avisos.
 *
 * No hay permiso que comprobar: cada quien marca LO SUYO, y el `userId` de la
 * sesion es el filtro. El servicio lo lleva en el `where`, asi que pasar el id
 * de un aviso ajeno no marca nada en vez de marcar el de otro.
 */
export async function accionMarcarLeidos(
  ids?: string[],
): Promise<{ marcados: number }> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await marcarAvisosLeidos(sesion, ids);

  revalidatePath("/avisos");
  // El contador de la campanita vive en el layout: sin esto seguiria en el
  // numero de antes hasta la siguiente navegacion completa.
  revalidatePath("/", "layout");

  return r;
}
