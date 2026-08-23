"use server";

import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import {
  iniciarTurno,
  estadoDeTurno,
  confirmarPropuestaAgente,
  type EstadoTurno,
  type ResultadoConfirmacion,
} from "@/services/agente-conversacion.service";

export interface EstadoEnvioAsistente {
  error?: string;
  conversacionId?: string;
  mensajeAsistenteId?: string;
}

export async function accionEnviarMensajeAsistente(
  _previo: EstadoEnvioAsistente,
  datos: FormData,
): Promise<EstadoEnvioAsistente> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const conversacionId = String(datos.get("conversacionId") ?? "") || null;
  const mensaje = String(datos.get("mensaje") ?? "");

  const r = await iniciarTurno(sesion, conversacionId, mensaje);
  if (!r.ok) return { error: r.error };

  return { conversacionId: r.conversacionId, mensajeAsistenteId: r.mensajeAsistenteId };
}

/** Lo que sondea el cliente cada pocos segundos, mismo patrón que `ProbarSms.tsx`. */
export async function accionEstadoDeTurno(
  mensajeAsistenteId: string,
): Promise<EstadoTurno | null> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  return estadoDeTurno(sesion, mensajeAsistenteId);
}

/**
 * Confirma o cancela una propuesta de escritura del agente. Se llama a
 * mano desde los botones de la tarjeta de confirmación, no por sondeo: la
 * escritura real es una transacción de Prisma, no una llamada al
 * proveedor de IA, así que responde de inmediato.
 */
export async function accionConfirmarPropuesta(
  mensajeAsistenteId: string,
  decision: "confirmar" | "cancelar",
): Promise<ResultadoConfirmacion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  return confirmarPropuestaAgente(sesion, mensajeAsistenteId, decision);
}
