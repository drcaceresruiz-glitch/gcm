"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  fijarCadencia,
  registrarPago,
  type ResultadoPago,
} from "@/services/pagos.service";

/**
 * Acciones de valorizaciones y pagos.
 *
 * Todo el criterio vive en `pagos.service` y en `lib/pagos`: permiso, alcance
 * por obra, obra cerrada, monto, fecha y tipo de comprobante.
 */

/**
 * El comprobante viaja en un `FormData` y no como argumento suelto: es la
 * unica forma de mandar un archivo a una accion de servidor, y ademas evita
 * cargarlo en el payload de React.
 */
export async function accionRegistrarPago(
  obraId: string,
  encargoId: string,
  datos: FormData,
): Promise<ResultadoPago> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const comprobante = datos.get("comprobante");

  const r = await registrarPago(
    sesion,
    obraId,
    encargoId,
    {
      monto: String(datos.get("monto") ?? ""),
      fecha: String(datos.get("fecha") ?? ""),
      nota: String(datos.get("nota") ?? ""),
    },
    comprobante instanceof File ? comprobante : null,
  );

  if (r.ok) revalidatePath(`/obras/${obraId}/valorizaciones`);
  return r;
}

export async function accionFijarCadencia(
  obraId: string,
  encargoId: string,
  dias: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await fijarCadencia(sesion, obraId, encargoId, dias);
  if (r.ok) revalidatePath(`/obras/${obraId}/valorizaciones`);
  return r;
}
