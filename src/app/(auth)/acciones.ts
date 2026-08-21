"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { EmpresaParaElegir } from "@/services/auth.service";
import {
  iniciarSesion,
  cambiarClave,
  completarAccesoConCodigo,
} from "@/services/auth.service";
import { obtenerSesion, cerrarSesion } from "@/services/sesion.service";
import { verificarCodigo, olvidarDesafio } from "@/services/dosFactores.service";
import { codigoBienFormado, LONGITUD_CODIGO } from "@/lib/dosFactores";
import { ipDeLaPeticion } from "@/lib/ip-peticion";
import { rutaConSiguiente, rutaSiguienteSegura } from "@/lib/siguiente";

/**
 * Acciones de servidor del flujo de acceso.
 *
 * Se usan Server Actions en lugar de rutas de API porque Next incluye
 * proteccion CSRF de origen en ellas, y porque el formulario sigue
 * funcionando aunque el navegador no ejecute JavaScript.
 */

export interface EstadoFormulario {
  error?: string;
  /**
   * Las constructoras entre las que hay que elegir.
   *
   * Solo aparece cuando el correo y la clave abren cuenta en varias. La
   * pantalla las pinta y reenvia el formulario con `companyId`; aqui no hay
   * nada abierto todavia.
   */
  elegirEmpresa?: EmpresaParaElegir[];
}

const esquemaLogin = z.object({
  email: z.string().trim().toLowerCase().email("Correo no valido."),
  clave: z.string().min(1, "Ingresa tu contrasena."),
});

async function metadatosPeticion() {
  const h = await headers();
  return {
    // El servidor esta detras de un proxy: la IP real viaja en la cabecera, y
    // cual de las entradas es la fiable lo decide `ipDeLaPeticion`.
    ip: ipDeLaPeticion(h),
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

  /**
   * La constructora, solo cuando ya se pregunto.
   *
   * Viaja en el mismo formulario para no guardar nada a medias en el servidor.
   * No es una credencial: el servicio la usa para acotar la busqueda y vuelve
   * a comprobar la clave contra esa cuenta.
   */
  const empresa = String(datos.get("companyId") ?? "").trim();

  const resultado = await iniciarSesion(
    validacion.data.email,
    validacion.data.clave,
    await metadatosPeticion(),
    empresa === "" ? undefined : empresa,
  );

  if (!resultado.ok) return { error: resultado.error };

  // Ese correo y esa clave abren cuenta en mas de una constructora. Es la
  // unica vez que el acceso pregunta algo de mas, y no llega a quien tiene
  // una sola cuenta.
  if ("elegirEmpresa" in resultado) {
    return { elegirEmpresa: resultado.elegirEmpresa };
  }

  // Adonde volver tras entrar. Viene del campo oculto que puso el login, que
  // a su vez lo copio de la URL: se vuelve a validar aqui porque un campo de
  // formulario lo escribe quien envia la peticion, no la aplicacion.
  const siguiente = rutaSiguienteSegura(datos.get("siguiente"));

  // Con dos pasos, la clave correcta solo abre la pantalla del codigo. El
  // destino tiene que cruzar tambien esa pantalla, o se perderia entre los
  // dos pasos igual que se perdia antes de que existiera `siguiente`.
  if (resultado.requiere2FA) {
    redirect(rutaConSiguiente("/verificar-codigo", siguiente));
  }

  redirect(
    resultado.mustChangePassword ? "/cambiar-clave" : (siguiente ?? "/panel"),
  );
}

/**
 * Segundo paso del acceso. No exige sesion —todavia no hay— sino el desafio
 * abierto, que vive en su propia cookie.
 */
export async function accionVerificarCodigo(
  _estadoPrevio: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const codigo = String(datos.get("codigo") ?? "");

  if (!codigoBienFormado(codigo)) {
    return { error: `El codigo son ${LONGITUD_CODIGO} cifras.` };
  }

  const resultado = await verificarCodigo(codigo);
  const siguiente = rutaSiguienteSegura(datos.get("siguiente"));

  if (!resultado.ok) {
    if (resultado.volverAlLogin) {
      redirect(rutaConSiguiente("/login?codigo=expirado", siguiente));
    }
    return { error: resultado.error };
  }

  const acceso = await completarAccesoConCodigo(
    resultado.userId,
    await metadatosPeticion(),
  );

  if (!acceso) redirect("/login");

  redirect(
    acceso.mustChangePassword ? "/cambiar-clave" : (siguiente ?? "/panel"),
  );
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

/** Abandonar la verificacion y volver a empezar por la clave. */
export async function accionCancelarCodigo(): Promise<void> {
  await olvidarDesafio();
  redirect("/login");
}
