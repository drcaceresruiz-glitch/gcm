"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  guardarCelular,
  guardarFotoPerfil,
  solicitarCambio,
  cancelarSolicitud,
} from "@/services/perfil.service";
import { CAMPOS_CONTROLADOS } from "@/lib/perfil";

export interface EstadoPerfil {
  error?: string;
  ok?: string;
}

/** El unico campo libre: se guarda al instante, sin aprobacion. */
export async function accionGuardarCelular(
  _previo: EstadoPerfil,
  datos: FormData,
): Promise<EstadoPerfil> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await guardarCelular(sesion, String(datos.get("celular") ?? ""));
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/perfil");
  return { ok: "Telefono guardado." };
}

/** Guarda o quita la foto de perfil. Libre, sin aprobacion. */
export async function accionGuardarFoto(
  _previo: EstadoPerfil,
  datos: FormData,
): Promise<EstadoPerfil> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  // Cadena vacia = quitar la foto.
  const foto = String(datos.get("foto") ?? "");
  const resultado = await guardarFotoPerfil(sesion, foto === "" ? null : foto);
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/perfil");
  return { ok: foto === "" ? "Foto quitada." : "Foto actualizada." };
}

/** Pide cambiar los datos controlados. Queda pendiente de aprobacion. */
export async function accionSolicitarCambio(
  _previo: EstadoPerfil,
  datos: FormData,
): Promise<EstadoPerfil> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const texto = (campo: string) => String(datos.get(campo) ?? "");

  // La propuesta lleva los cinco campos controlados; el servicio se queda
  // solo con los que de verdad cambian.
  const propuesta = Object.fromEntries(
    CAMPOS_CONTROLADOS.map((c) => [c, texto(c)]),
  ) as Record<(typeof CAMPOS_CONTROLADOS)[number], string>;

  const resultado = await solicitarCambio(sesion, propuesta, texto("motivo"));
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/perfil");
  return { ok: "Solicitud enviada. Un administrador la revisara." };
}

/** Retira la solicitud pendiente propia. */
export async function accionCancelarSolicitud(
  _previo: EstadoPerfil,
  datos: FormData,
): Promise<EstadoPerfil> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await cancelarSolicitud(sesion, String(datos.get("id") ?? ""));
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/perfil");
  return { ok: "Solicitud retirada." };
}
