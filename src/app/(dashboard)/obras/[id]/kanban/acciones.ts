"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { marcarEnEjecucion } from "@/services/compromiso-marcha.service";

export interface EstadoMarcha {
  error?: string;
}

/**
 * Mueve un compromiso entre «Comprometida» y «En ejecución».
 *
 * El Kanban se hizo de LECTURA a proposito: cada transicion del flujo tiene su
 * pantalla, con sus reglas y su registro, y duplicarlas aqui las escondia.
 *
 * Esta es la excepcion, y por un motivo concreto: «empezo en obra» NO tiene
 * otra pantalla. Es el unico paso del flujo que no existia en ningun sitio, y
 * hacerlo aqui no duplica nada.
 */
export async function accionMarcarEnEjecucion(
  _previo: EstadoMarcha,
  datos: FormData,
): Promise<EstadoMarcha> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const compromisoId = String(datos.get("compromisoId") ?? "");
  const obraId = String(datos.get("obraId") ?? "");
  const enMarcha = String(datos.get("enMarcha") ?? "") === "si";

  const r = await marcarEnEjecucion(sesion, compromisoId, enMarcha);
  if (!r.ok) return { error: r.error };

  revalidatePath(`/obras/${obraId}/kanban`);
  return {};
}
