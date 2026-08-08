"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  crearUsuario,
  editarUsuario,
  cambiarEstadoUsuario,
  resetearClave,
  eliminarUsuario,
  desactivarDosFactoresUsuario,
} from "@/services/usuarios.service";

/**
 * Estado compartido de las acciones de usuarios.
 *
 * `claveTemporal` viaja de vuelta al crear o resetear: se muestra UNA vez para
 * que el admin la comunique. No se guarda en claro en ningun sitio.
 */
export interface EstadoUsuarios {
  error?: string;
  ok?: string;
  claveTemporal?: string;
  /// A quien pertenece la clave mostrada, para el mensaje.
  usuarioClave?: string;
  /// Si la clave ademas se pudo enviar por correo. Sin SMTP configurado sale
  /// false y el mensaje pide comunicarla a mano.
  correoEnviado?: boolean;
}

function texto(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? "");
}

export async function accionCrearUsuario(
  _previo: EstadoUsuarios,
  datos: FormData,
): Promise<EstadoUsuarios> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await crearUsuario(sesion, {
    nombres: texto(datos, "nombres"),
    apellidos: texto(datos, "apellidos"),
    email: texto(datos, "email"),
    tipoDoc: texto(datos, "tipoDoc"),
    numDoc: texto(datos, "numDoc"),
    cargo: texto(datos, "cargo"),
    celular: texto(datos, "celular"),
    role: texto(datos, "role"),
  });

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/empresa/usuarios");
  return {
    ok: `Usuario creado: ${texto(datos, "nombres")} ${texto(datos, "apellidos")}.`,
    claveTemporal: resultado.claveTemporal,
    usuarioClave: texto(datos, "email"),
    correoEnviado: resultado.correoEnviado,
  };
}

export async function accionEditarUsuario(
  _previo: EstadoUsuarios,
  datos: FormData,
): Promise<EstadoUsuarios> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await editarUsuario(sesion, texto(datos, "id"), {
    nombres: texto(datos, "nombres"),
    apellidos: texto(datos, "apellidos"),
    cargo: texto(datos, "cargo"),
    tipoDoc: texto(datos, "tipoDoc"),
    numDoc: texto(datos, "numDoc"),
    celular: texto(datos, "celular"),
    role: texto(datos, "role"),
  });

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/empresa/usuarios");
  revalidatePath("/", "layout");
  return { ok: "Cambios guardados." };
}

export async function accionCambiarEstado(
  _previo: EstadoUsuarios,
  datos: FormData,
): Promise<EstadoUsuarios> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const activar = texto(datos, "activar") === "1";
  const resultado = await cambiarEstadoUsuario(sesion, texto(datos, "id"), activar);

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/empresa/usuarios");
  return { ok: activar ? "Usuario activado." : "Usuario desactivado." };
}

/** Rescate: apaga la verificacion en dos pasos de quien perdio su buzon. */
export async function accionDesactivarDosFactores(
  _previo: EstadoUsuarios,
  datos: FormData,
): Promise<EstadoUsuarios> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await desactivarDosFactoresUsuario(
    sesion,
    texto(datos, "id"),
  );
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/empresa/usuarios");
  return { ok: "Verificacion en dos pasos desactivada para ese usuario." };
}

export async function accionEliminarUsuario(
  _previo: EstadoUsuarios,
  datos: FormData,
): Promise<EstadoUsuarios> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await eliminarUsuario(sesion, texto(datos, "id"));
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/empresa/usuarios");
  return { ok: "Usuario eliminado." };
}

export async function accionResetearClave(
  _previo: EstadoUsuarios,
  datos: FormData,
): Promise<EstadoUsuarios> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await resetearClave(sesion, texto(datos, "id"));

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/empresa/usuarios");
  return {
    ok: "Clave restablecida.",
    claveTemporal: resultado.claveTemporal,
    usuarioClave: texto(datos, "email"),
    correoEnviado: resultado.correoEnviado,
  };
}
