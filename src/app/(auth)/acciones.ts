"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { iniciarSesion, cambiarClave } from "@/services/auth.service";
import { obtenerSesion, cerrarSesion } from "@/services/sesion.service";

/**
 * Acciones de servidor del flujo de acceso.
 *
 * Se usan Server Actions en lugar de rutas de API porque Next incluye
 * proteccion CSRF de origen en ellas, y porque el formulario sigue
 * funcionando aunque el navegador no ejecute JavaScript.
 */

export interface EstadoFormulario {
  error?: string;
}

const esquemaLogin = z.object({
  email: z.string().trim().toLowerCase().email("Correo no valido."),
  clave: z.string().min(1, "Ingresa tu contrasena."),
});

async function metadatosPeticion() {
  const h = await headers();
  return {
    // El servidor esta detras de Apache: la IP real viaja en la cabecera.
    ip:
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}

export async function accionIniciarSesion(
  _estadoPrevio: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const validacion = esquemaLogin.safeParse({
    email: datos.get("email"),
    clave: datos.get("clave"),
  });

  if (!validacion.success) {
    return { error: validacion.error.issues[0]?.message ?? "Datos invalidos." };
  }

  const resultado = await iniciarSesion(
    validacion.data.email,
    validacion.data.clave,
    await metadatosPeticion(),
  );

  if (!resultado.ok) return { error: resultado.error };

  redirect(resultado.mustChangePassword ? "/cambiar-clave" : "/panel");
}

const esquemaCambio = z
  .object({
    claveActual: z.string().min(1, "Ingresa tu contrasena actual."),
    claveNueva: z
      .string()
      .min(10, "La nueva contrasena debe tener al menos 10 caracteres."),
    confirmacion: z.string(),
  })
  .refine((d) => d.claveNueva === d.confirmacion, {
    message: "La confirmacion no coincide con la nueva contrasena.",
  });

export async function accionCambiarClave(
  _estadoPrevio: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const validacion = esquemaCambio.safeParse({
    claveActual: datos.get("claveActual"),
    claveNueva: datos.get("claveNueva"),
    confirmacion: datos.get("confirmacion"),
  });

  if (!validacion.success) {
    return { error: validacion.error.issues[0]?.message ?? "Datos invalidos." };
  }

  const resultado = await cambiarClave(
    sesion.userId,
    validacion.data.claveActual,
    validacion.data.claveNueva,
  );

  if (!resultado.ok) return { error: resultado.error };

  // El cambio cerro todas las sesiones: hay que volver a entrar.
  redirect("/login?cambio=ok");
}

export async function accionCerrarSesion(): Promise<void> {
  await cerrarSesion();
  redirect("/login");
}
