"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import {
  resolverDeduccion,
  solicitarDeduccion,
} from "@/services/deducciones.service";

/**
 * Las dos firmas de una deduccion de costo propio, como acciones.
 *
 * Los permisos NO se comprueban aqui: los comprueba el servicio, que es la
 * frontera de verdad. Una accion nueva que se olvidara de mirar seguiria
 * estando protegida.
 */

export interface EstadoDeduccionUI {
  error?: string;
  ok?: boolean;
  /// El numero que le toco, para poder decir «Deduccion 3 registrada».
  numero?: number;
}

function texto(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? "").trim();
}

/**
 * La meta -donde vive la bolsa- y el panel de gerencia, que lista lo que
 * espera firma. Sin lo segundo, aprobar desde gerencia dejaria la fila
 * pendiente en pantalla hasta la siguiente navegacion.
 */
function repintar(obraId: string): void {
  revalidatePath(`/obras/${obraId}/meta`);
  revalidatePath("/gerencia");
}

export async function accionSolicitarDeduccion(
  _previo: EstadoDeduccionUI,
  datos: FormData,
): Promise<EstadoDeduccionUI> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = texto(datos, "obraId");
  if (!obraId) return { error: "Falta la obra." };

  /*
   * El importe se limpia de signo aqui.
   *
   * En la deduccion no hay «clase» que elegir -siempre es dejar de gastar- y
   * el campo pide un numero positivo. Un menos delante colado por copiar y
   * pegar daria un importe negativo que el servicio rechaza con un mensaje
   * sobre versiones de la meta, y eso confundiria mas de lo que ayuda.
   */
  const r = await solicitarDeduccion(sesion, obraId, {
    metaItemId: texto(datos, "metaItemId"),
    importe: texto(datos, "importe").replace(/^[+-]/, ""),
    motivo: texto(datos, "motivo"),
  });
  if (!r.ok) return { error: r.error };

  repintar(obraId);
  return { ok: true, numero: r.numero };
}

export async function accionResolverDeduccion(
  _previo: EstadoDeduccionUI,
  datos: FormData,
): Promise<EstadoDeduccionUI> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = texto(datos, "obraId");
  const deduccionId = texto(datos, "deduccionId");
  if (!obraId || !deduccionId) return { error: "Falta la deducción." };

  const r = await resolverDeduccion(sesion, obraId, deduccionId, {
    aprobar: texto(datos, "decision") === "APROBAR",
    motivoRechazo: texto(datos, "motivoRechazo") || null,
  });
  if (!r.ok) return { error: r.error };

  repintar(obraId);
  return { ok: true };
}
