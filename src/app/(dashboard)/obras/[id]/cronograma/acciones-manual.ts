"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  crearTareaManual,
  editarTareaManual,
  eliminarTareaManual,
  type TareaAMano,
} from "@/services/cronograma-manual.service";
import { generarEdtDesdePresupuesto } from "@/services/edt.service";

export interface RespuestaEdt {
  ok: boolean;
  error?: string;
  tareas?: number;
  enlazadas?: number;
}

/**
 * Genera el cronograma desde el presupuesto.
 *
 * El presupuesto YA es la EDT; esto la copia al cronograma y deja puesto el
 * enlace con el dinero, que es lo que hoy hay que casar a mano en
 * `/cronograma/mapeo`.
 */
export async function accionGenerarEdt(obraId: string): Promise<RespuestaEdt> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  let datos: { tareas: number; enlazadas: number } | null = null;

  const r = await intentar(async () => {
    const hecho = await generarEdtDesdePresupuesto(sesion, obraId);
    if (hecho.ok) datos = { tareas: hecho.datos.tareas, enlazadas: hecho.datos.enlazadas };
    return hecho;
  });

  if (!r.ok) return r;

  revalidatePath(`/obras/${obraId}/cronograma`);
  return { ok: true, ...(datos ?? {}) };
}

export interface RespuestaTarea {
  ok: boolean;
  error?: string;
  /// El uid que se acaba de dar, para poder senalar la fila nueva.
  uid?: number;
  /// Cierto cuando el borrado se paro para preguntar, no porque fallara.
  pideConfirmacion?: boolean;
}

/**
 * Igual que en el presupuesto: un fallo de la base sale como mensaje, no como
 * pantalla en blanco. Una Server Action que lanza no se ve como un error —sube
 * al limite de Next y deja la pagina inservible—.
 */
async function intentar(
  operacion: () => Promise<{ ok: boolean; error?: string }>,
): Promise<RespuestaTarea> {
  try {
    const r = await operacion();
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  } catch (e) {
    console.error("[cronograma manual] fallo no previsto", e);
    return {
      ok: false,
      error:
        "No se pudo guardar el cambio. Si vuelve a pasar, avisa indicando que tarea estabas tocando.",
    };
  }
}

export async function accionCrearTareaManual(
  obraId: string,
  tarea: TareaAMano,
): Promise<RespuestaTarea> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  let uid: number | undefined;

  const r = await intentar(async () => {
    const hecho = await crearTareaManual(sesion, obraId, tarea);
    if (hecho.ok) uid = hecho.datos.uid;
    return hecho;
  });

  if (!r.ok) return r;

  revalidatePath(`/obras/${obraId}/cronograma`);
  return { ok: true, uid };
}

export async function accionEditarTareaManual(
  obraId: string,
  uid: number,
  tarea: TareaAMano,
): Promise<RespuestaTarea> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await intentar(() => editarTareaManual(sesion, obraId, uid, tarea));
  if (!r.ok) return r;

  revalidatePath(`/obras/${obraId}/cronograma`);
  return { ok: true, uid };
}

/**
 * Borra una tarea escrita a mano.
 *
 * En dos pasos: la primera llamada, si algo cuelga de la tarea, NO borra y
 * devuelve `pideConfirmacion` con el detalle de lo que se perderia. Ni el
 * avance ni el mapeo tienen clave ajena contra ella, asi que sin esto
 * desaparecerian sin dejar rastro.
 */
export async function accionEliminarTareaManual(
  obraId: string,
  uid: number,
  confirmado = false,
): Promise<RespuestaTarea> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  let paroParaPreguntar = false;

  const r = await intentar(async () => {
    const hecho = await eliminarTareaManual(sesion, obraId, uid, confirmado);
    // Se distingue «no se puede» de «hace falta que lo confirmes».
    if (!hecho.ok && !confirmado && hecho.error?.includes("Confirma")) {
      paroParaPreguntar = true;
    }
    return hecho;
  });

  if (!r.ok) return { ...r, pideConfirmacion: paroParaPreguntar };

  revalidatePath(`/obras/${obraId}/cronograma`);
  return { ok: true, uid };
}
