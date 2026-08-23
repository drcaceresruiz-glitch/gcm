"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import {
  anadirLineaAMeta,
  editarLineaDeMeta,
  eliminarLineaDeMeta,
} from "@/services/meta-edicion.service";

/**
 * Corregir la meta linea a linea, sin volver al Excel.
 *
 * Los importes que llegan por el formulario son datos que esta persona ya
 * podia escribir en la plantilla —un metrado, un precio—, no cifras
 * calculadas: el parcial NO se acepta cuando hay metrado y precio, se vuelve
 * a multiplicar en el servidor. Es la misma regla que la formula del Excel, y
 * lo que impide que alguien cambie el importe de una linea editando la
 * pagina.
 */

export interface EstadoLinea {
  error?: string;
  /// true solo tras guardar. Es lo que cierra la fila en la pantalla: sin
  /// esto, el formulario se cerraba tambien al fallar y el error no se veia.
  ok?: true;
}

const texto = (datos: FormData, campo: string) => String(datos.get(campo) ?? "");

export async function accionEditarLineaMeta(
  _previo: EstadoLinea,
  datos: FormData,
): Promise<EstadoLinea> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = texto(datos, "obraId");
  const lineaId = texto(datos, "lineaId");
  if (!obraId || !lineaId) return { error: "Falta la línea a corregir." };

  const r = await editarLineaDeMeta(sesion, obraId, lineaId, {
    descripcion: texto(datos, "descripcion"),
    unidad: texto(datos, "unidad"),
    metrado: texto(datos, "metrado"),
    precioUnitario: texto(datos, "precioUnitario"),
    parcial: texto(datos, "parcial"),
  });
  if (!r.ok) return { error: r.error };

  revalidatePath(`/obras/${obraId}/meta`);
  revalidatePath(`/obras/${obraId}/contractual`);
  return { ok: true };
}

export async function accionAnadirLineaMeta(
  _previo: EstadoLinea,
  datos: FormData,
): Promise<EstadoLinea> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = texto(datos, "obraId");
  if (!obraId) return { error: "Falta la obra." };

  const r = await anadirLineaAMeta(sesion, obraId, {
    codigoRef: texto(datos, "codigoRef"),
    descripcion: texto(datos, "descripcion"),
    unidad: texto(datos, "unidad"),
    metrado: texto(datos, "metrado"),
    precioUnitario: texto(datos, "precioUnitario"),
    parcial: texto(datos, "parcial"),
  });
  if (!r.ok) return { error: r.error };

  revalidatePath(`/obras/${obraId}/meta`);
  revalidatePath(`/obras/${obraId}/contractual`);
  return { ok: true };
}

export async function accionEliminarLineaMeta(
  _previo: EstadoLinea,
  datos: FormData,
): Promise<EstadoLinea> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = texto(datos, "obraId");
  const lineaId = texto(datos, "lineaId");
  if (!obraId || !lineaId) return { error: "Falta la línea a quitar." };

  const r = await eliminarLineaDeMeta(sesion, obraId, lineaId);
  if (!r.ok) return { error: r.error };

  revalidatePath(`/obras/${obraId}/meta`);
  revalidatePath(`/obras/${obraId}/contractual`);
  return { ok: true };
}
