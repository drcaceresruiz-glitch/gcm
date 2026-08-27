"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { aprobarMeta, eliminarBorrador } from "@/services/meta.service";
import { cargarMetaDesdeExcel } from "@/services/meta-desde-excel";
import { avisoDeRecorte } from "@/lib/meta-excel";

/**
 * Las acciones de la pantalla del presupuesto meta.
 *
 * La LECTURA del Excel no esta aqui: vive en `services/meta-desde-excel.ts`,
 * porque tambien se hace desde el alta de obra —donde se puede adjuntar el
 * archivo y crear la obra con su presupuesto de una vez—. Dos lecturas del
 * mismo archivo se desincronizan a la primera columna nueva.
 */

export interface EstadoMeta {
  error?: string;
}

export async function accionImportarMeta(
  _previo: EstadoMeta,
  datos: FormData,
): Promise<EstadoMeta> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { error: "Falta la obra." };

  const r = await cargarMetaDesdeExcel(sesion, obraId, {
    archivo: datos.get("archivo"),
    modo: String(datos.get("modo") ?? ""),
    mesesPlazo: String(datos.get("mesesPlazo") ?? ""),
    fechaMeta: String(datos.get("fechaMeta") ?? ""),
    notas: String(datos.get("notas") ?? ""),
  });

  if (!r.ok) return { error: r.error };

  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/${obraId}/meta`);
  redirect(
    `/obras/${obraId}/meta?creada=${r.version}${avisoDeRecorte(r.recortadas)}`,
  );
}

export async function accionAprobarMeta(
  _previo: EstadoMeta,
  datos: FormData,
): Promise<EstadoMeta> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const metaId = String(datos.get("metaId") ?? "");
  if (!obraId || !metaId) return { error: "Falta la meta a aprobar." };

  const resultado = await aprobarMeta(sesion, metaId);
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/${obraId}/meta`);
  redirect(`/obras/${obraId}/meta?aprobada=${resultado.version}`);
}

export async function accionEliminarBorradorMeta(
  _previo: EstadoMeta,
  datos: FormData,
): Promise<EstadoMeta> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const metaId = String(datos.get("metaId") ?? "");
  if (!obraId || !metaId) return { error: "Falta la meta a eliminar." };

  const resultado = await eliminarBorrador(sesion, metaId);
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/${obraId}/meta`);
  redirect(`/obras/${obraId}/meta?eliminada=${resultado.version}`);
}
