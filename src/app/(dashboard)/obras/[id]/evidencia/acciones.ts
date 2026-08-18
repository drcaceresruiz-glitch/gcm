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
  const uidBruto = datos.get("uid");
  const fecha = datos.get("fecha");
  const nota = datos.get("nota");

  // Exactamente UNO de los tres anclas. El servicio elige el permiso segun
  // cual llegue, asi que dos a la vez subirian comprobando el equivocado.
  const aRestriccion = typeof restriccionId === "string" && restriccionId !== "";
  const aCompromiso = typeof compromisoId === "string" && compromisoId !== "";
  const aTarea = typeof uidBruto === "string" && uidBruto !== "";
  if ([aRestriccion, aCompromiso, aTarea].filter(Boolean).length !== 1) {
    return { ok: false, error: "No se indico a que adjuntar la foto." };
  }

  let destino;
  if (aRestriccion) {
    destino = { restriccionId: restriccionId as string };
  } else if (aCompromiso) {
    destino = { compromisoId: compromisoId as string };
  } else {
    const uid = Number(uidBruto);
    if (!Number.isSafeInteger(uid) || typeof fecha !== "string" || !fecha) {
      return { ok: false, error: "Falta la tarea o el día de la foto." };
    }
    destino = { obraId, uid, fecha };
  }

  const r = await subirEvidencia(
    sesion,
    destino,
    archivo,
    typeof nota === "string" ? nota : undefined,
  );

  if (r.ok) {
    // La foto de una restriccion se ve en el Lookahead y la de un compromiso
    // en su semana; pero una tarea comprometida aparece en las dos pantallas,
    // y el contador del clip tiene que cuadrar en ambas. La de una tarea, en
    // el parte del dia y en el cronograma (partida en ejecucion).
    revalidatePath(`/obras/${obraId}/lookahead`);
    revalidatePath(`/obras/${obraId}/plan-semanal`, "layout");
    revalidatePath(`/obras/${obraId}/avance`);
    revalidatePath(`/obras/${obraId}/cronograma`);
  }

  return r;
}
