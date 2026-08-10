"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  subirEvidencia,
  type ResultadoSubida,
} from "@/services/evidencia.service";

/**
 * Accion de la evidencia fotografica.
 *
 * Es UNA sola para los dos destinos (restriccion del Lookahead y compromiso
 * del PTS) porque la regla es la misma y vive en el servicio: quien puede
 * subir, en que obra, con que tamano y con que hash. Aqui solo se resuelve la
 * sesion, se traduce el FormData y se repintan las dos pantallas donde la foto
 * se ve.
 *
 * Viaja como FormData y no como objeto tipado —al reves que el resto de las
 * acciones del proyecto— porque un `File` no se puede pasar de otra forma.
 */
export async function accionSubirEvidencia(
  obraId: string,
  datos: FormData,
): Promise<ResultadoSubida> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const archivo = datos.get("archivo");
  if (!(archivo instanceof File)) {
    return { ok: false, error: "No llego ninguna foto." };
  }

  const restriccionId = datos.get("restriccionId");
  const compromisoId = datos.get("compromisoId");
  const nota = datos.get("nota");

  // Exactamente uno de los dos. El modelo lo asume (`restriccionId` XOR
  // `compromisoId`) y el servicio elige el permiso segun cual llegue: si
  // llegaran los dos, se subiria comprobando el permiso equivocado.
  const aRestriccion = typeof restriccionId === "string" && restriccionId !== "";
  const aCompromiso = typeof compromisoId === "string" && compromisoId !== "";
  if (aRestriccion === aCompromiso) {
    return { ok: false, error: "No se indico a que adjuntar la foto." };
  }

  const r = await subirEvidencia(
    sesion,
    aRestriccion
      ? { restriccionId: restriccionId as string }
      : { compromisoId: compromisoId as string },
    archivo,
    typeof nota === "string" ? nota : undefined,
  );

  if (r.ok) {
    // La foto de una restriccion se ve en el Lookahead y la de un compromiso
    // en su semana; pero una tarea comprometida aparece en las dos pantallas,
    // y el contador del clip tiene que cuadrar en ambas.
    revalidatePath(`/obras/${obraId}/lookahead`);
    revalidatePath(`/obras/${obraId}/plan-semanal`, "layout");
  }

  return r;
}
