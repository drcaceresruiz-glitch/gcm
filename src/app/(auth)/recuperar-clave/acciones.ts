"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  solicitarRecuperacion,
  restablecerConToken,
} from "@/services/recuperacion.service";
import { LONGITUD_MINIMA_CLAVE } from "@/lib/claves";

/**
 * Acciones del flujo publico de recuperacion. No exigen sesion —quien las usa
 * es justamente quien no puede entrar—, asi que toda la comprobacion vive en
 * el token.
 */

export interface EstadoSolicitud {
  error?: string;
  enviado?: boolean;
}

export interface EstadoNuevaClave {
  error?: string;
}

async function metadatosPeticion() {
  const h = await headers();
  return {
    ip:
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}

const esquemaSolicitud = z.object({
  email: z.string().trim().toLowerCase().email("Correo no valido."),
});

/**
 * Pide el enlace. Responde `enviado` SIEMPRE que el correo tenga forma valida,
 * exista la cuenta o no: lo contrario permitiria averiguar quien tiene cuenta
 * probando direcciones.
 */
export async function accionSolicitarEnlace(
  _estadoPrevio: EstadoSolicitud,
  datos: FormData,
): Promise<EstadoSolicitud> {
  const validacion = esquemaSolicitud.safeParse({ email: datos.get("email") });

  if (!validacion.success) {
    return { error: validacion.error.issues[0]?.message ?? "Datos invalidos." };
  }

  await solicitarRecuperacion(validacion.data.email);

  return { enviado: true };
}

const esquemaNuevaClave = z
  .object({
    token: z.string().min(1),
    claveNueva: z
      .string()
      .min(
        LONGITUD_MINIMA_CLAVE,
        `La contrasena debe tener al menos ${LONGITUD_MINIMA_CLAVE} caracteres.`,
      ),
    confirmacion: z.string(),
  })
  .refine((d) => d.claveNueva === d.confirmacion, {
    message: "La confirmacion no coincide con la contrasena nueva.",
  });

export async function accionFijarClave(
  _estadoPrevio: EstadoNuevaClave,
  datos: FormData,
): Promise<EstadoNuevaClave> {
  const validacion = esquemaNuevaClave.safeParse({
    token: datos.get("token"),
    claveNueva: datos.get("claveNueva"),
    confirmacion: datos.get("confirmacion"),
  });

  if (!validacion.success) {
    return { error: validacion.error.issues[0]?.message ?? "Datos invalidos." };
  }

  const resultado = await restablecerConToken(
    validacion.data.token,
    validacion.data.claveNueva,
    await metadatosPeticion(),
  );

  if (!resultado.ok) return { error: resultado.error };

  redirect("/login?recuperada=ok");
}
