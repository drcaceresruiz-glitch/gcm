"use server";

import { revalidatePath } from "next/cache";
import { obtenerPase } from "@/services/pase.service";
import {
  subirEvidenciaConPase,
  type ResultadoSubida,
} from "@/services/evidencia.service";

/**
 * Subir evidencia CON PASE DE OBRA.
 *
 * Es la gemela de `accionSubirEvidencia`, no una variante suya: la de la obra
 * resuelve una sesion y deja que el servicio compruebe permisos; esta resuelve
 * un pase, que no tiene permisos que comprobar sino UNA obra. Tenerlas
 * separadas es lo que evita el `if` que mezcla dos modelos de autorizacion.
 *
 * El `obraId` que llega del formulario NO se usa para autorizar: sirve solo
 * para comprobar que la pantalla y la cookie hablan de la misma obra. La obra
 * de verdad sale de la fila del pase, dentro del servicio.
 */
export async function accionSubirEvidenciaConPase(
  obraId: string,
  datos: FormData,
): Promise<ResultadoSubida> {
  const pase = await obtenerPase(obraId);
  if (!pase) {
    return {
      ok: false,
      error: "Tu acceso caducó o fue revocado. Vuelve a pedir un código.",
    };
  }

  const archivo = datos.get("archivo");
  if (!(archivo instanceof File)) {
    return { ok: false, error: "No llegó ninguna foto." };
  }

  const restriccionId = datos.get("restriccionId");
  const nota = datos.get("nota");

  // El pase solo adjunta a restricciones del Lookahead. El otro destino
  // posible (la causa de no cumplimiento de un compromiso) se decide al CERRAR
  // la semana, que es un acto de planificacion y no de campo: aceptarlo aqui
  // dejaria que un pase escribiera en el PTS por la puerta de atras.
  if (typeof restriccionId !== "string" || restriccionId === "") {
    return { ok: false, error: "No se indicó a qué adjuntar la foto." };
  }

  const r = await subirEvidenciaConPase(
    pase,
    { restriccionId },
    archivo,
    typeof nota === "string" ? nota : undefined,
  );

  if (r.ok) revalidatePath(`/pase/${obraId}/cargar`);

  return r;
}
