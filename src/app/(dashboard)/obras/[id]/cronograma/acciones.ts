"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { registrarAvance } from "@/services/cronograma.service";

export interface RespuestaAvance {
  ok: boolean;
  error?: string;
  /// UID de la tarea reportada, para que la tabla sepa cual acaba de cambiar.
  uid?: number;
}

/**
 * Reporta el avance de una tarea desde la tabla del cronograma.
 *
 * No redirige: la tabla se queda donde esta y el usuario sigue reportando
 * otras filas. `revalidatePath` basta para que la pantalla se repinte con el
 * dato nuevo.
 */
export async function accionRegistrarAvance(
  _previo: RespuestaAvance,
  datos: FormData,
): Promise<RespuestaAvance> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const uid = Number(datos.get("uid"));

  if (!obraId || !Number.isSafeInteger(uid)) {
    return { ok: false, error: "Falta la tarea o la obra." };
  }

  const resultado = await registrarAvance(sesion, obraId, {
    uid,
    porcentaje: String(datos.get("porcentaje") ?? ""),
    fecha: String(datos.get("fecha") ?? ""),
    nota: String(datos.get("nota") ?? ""),
  });

  if (!resultado.ok) return { ok: false, error: resultado.error, uid };

  revalidatePath(`/obras/${obraId}/cronograma`);
  return { ok: true, uid };
}
