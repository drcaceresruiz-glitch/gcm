"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  editarFotoGaleria,
  eliminarFotoGaleria,
  gestionarEnlaceGaleria,
  marcarVisibleCliente,
  subirFotoGaleria,
  type ResultadoEnlace,
  type ResultadoGaleria,
} from "@/services/galeria.service";

/**
 * Acciones de la galeria. Traducen FormData, resuelven la sesion y delegan:
 * quien puede, sobre que obra y con que limites lo decide el servicio.
 *
 * La SUBIDA no revalida a proposito: se suben varias fotos en serie y el
 * componente hace un unico `router.refresh()` al terminar la cola, en vez de
 * repintar la pagina una vez por foto.
 */
export async function accionSubirFotoGaleria(
  obraId: string,
  datos: FormData,
): Promise<ResultadoGaleria> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const archivo = datos.get("archivo");
  if (!(archivo instanceof File)) {
    return { ok: false, error: "No llegó ninguna foto." };
  }

  const descripcion = datos.get("descripcion");
  return subirFotoGaleria(
    sesion,
    obraId,
    archivo,
    typeof descripcion === "string" ? descripcion : undefined,
  );
}

export async function accionEditarFotoGaleria(
  fotoId: string,
  datos: FormData,
): Promise<ResultadoGaleria> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const titulo = datos.get("titulo");
  const descripcion = datos.get("descripcion");

  const r = await editarFotoGaleria(sesion, fotoId, {
    titulo: typeof titulo === "string" ? titulo : undefined,
    descripcion: typeof descripcion === "string" ? descripcion : undefined,
  });

  if (r.ok) revalidatePath("/obras", "layout");
  return r;
}

export async function accionEliminarFotoGaleria(
  fotoId: string,
): Promise<ResultadoGaleria> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await eliminarFotoGaleria(sesion, fotoId);
  if (r.ok) revalidatePath("/obras", "layout");
  return r;
}

export async function accionMarcarVisible(
  fotoId: string,
  visible: boolean,
): Promise<ResultadoGaleria> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await marcarVisibleCliente(sesion, fotoId, visible);
  if (r.ok) revalidatePath("/obras", "layout");
  return r;
}

export async function accionEnlaceGaleria(
  obraId: string,
  orden: "activar" | "desactivar" | "rotar",
): Promise<ResultadoEnlace> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await gestionarEnlaceGaleria(sesion, obraId, orden);
  if (r.ok) revalidatePath(`/obras/${obraId}/galeria`);
  return r;
}
