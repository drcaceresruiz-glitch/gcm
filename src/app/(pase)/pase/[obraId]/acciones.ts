"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  solicitarCodigo,
  verificarCodigoPase,
  olvidarDesafioPase,
  cerrarPase,
} from "@/services/pase.service";
import { ipDeLaPeticion } from "@/lib/ip-peticion";

/**
 * Acciones de la puerta del pase de obra.
 *
 * Ninguna comprueba permisos, porque quien las llama todavia no es nadie: son
 * publicas por definicion. Lo que las hace seguras vive en el servicio —el
 * silencio ante un contacto que no existe, el limite de codigos por ventana,
 * la comparacion en tiempo constante y el tope de intentos—, y por eso aqui
 * no hay logica: traducir el formulario y devolver el resultado.
 */

export type ResultadoAccionPase = { ok: true } | { ok: false; error: string };

/**
 * Pide el codigo. Responde `ok` SIEMPRE, exista el contacto o no.
 *
 * Que devuelva lo mismo en los dos casos no es un descuido: es lo que impide
 * que un desconocido con el QR de la caseta convierta esta pantalla en un
 * detector de quien trabaja en la obra. La pantalla dice «si estas
 * registrado, te llegara un codigo».
 */
export async function accionPedirCodigo(
  obraId: string,
  entrada: string,
): Promise<ResultadoAccionPase> {
  if (!entrada.trim()) {
    return { ok: false, error: "Escribe tu celular o tu correo." };
  }

  await solicitarCodigo(obraId, entrada);
  return { ok: true };
}

/** Comprueba el codigo. Si acierta, el telefono queda reconocido. */
export async function accionVerificarCodigo(
  obraId: string,
  codigo: string,
): Promise<ResultadoAccionPase> {
  const cabeceras = await headers();

  const r = await verificarCodigoPase(obraId, codigo, {
    // Detras de un proxy la IP real viaja en la cabecera; cual de las entradas
    // es la fiable —y por que NO es la primera— lo explica `ipDeLaPeticion`.
    ip: ipDeLaPeticion(cabeceras),
    userAgent: cabeceras.get("user-agent") ?? undefined,
  });

  if (!r.ok) return r;

  redirect(`/pase/${obraId}/cargar`);
}

/** Volver a escribir el contacto: tira el desafio pendiente. */
export async function accionOtroContacto(
  obraId: string,
): Promise<ResultadoAccionPase> {
  await olvidarDesafioPase();
  redirect(`/pase/${obraId}`);
}

/**
 * Salir. Util cuando el telefono es prestado o compartido en la caseta: sin
 * esto, el reconocimiento dura un ano en ese aparato.
 */
export async function accionSalirDelPase(obraId: string): Promise<void> {
  await cerrarPase();
  redirect(`/pase/${obraId}`);
}
