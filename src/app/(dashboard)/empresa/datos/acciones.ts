"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { actualizarEmpresa } from "@/services/empresa.service";
import { quitarLogo, subirLogo } from "@/services/logo.service";

/**
 * Guardado de los datos de la empresa.
 *
 * Se invalidan tambien las obras porque de ahi cuelgan las ordenes, y son
 * ellas las que imprimen estos datos: cambiar el telefono y seguir viendo el
 * viejo en el documento parece que no se guardo.
 */

export interface EstadoEmpresa {
  error?: string;
}

export interface EstadoLogo {
  ok: boolean;
  error?: string;
}

export async function accionGuardarEmpresa(
  _previo: EstadoEmpresa,
  datos: FormData,
): Promise<EstadoEmpresa> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const texto = (campo: string) => String(datos.get(campo) ?? "");

  const resultado = await actualizarEmpresa(sesion, {
    razonSocial: texto("razonSocial"),
    direccion: texto("direccion"),
    telefono: texto("telefono"),
    email: texto("email"),
    representanteLegal: texto("representanteLegal"),
    cargoRepresentante: texto("cargoRepresentante"),
    observacionesOrden: texto("observacionesOrden"),
  });

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/empresa/datos");
  revalidatePath("/obras", "layout");
  redirect("/empresa/datos?guardada=1");
}

/**
 * El logo. Va en acciones propias y no en `accionGuardarEmpresa` porque no es
 * un campo mas del formulario: llega como archivo, se sube por su cuenta y no
 * tiene que obligar a guardar el resto para verse.
 *
 * Se invalida tambien el layout del dashboard: el logo esta en la cabecera de
 * TODAS las pantallas, asi que sin esto se cambia y se sigue viendo el viejo
 * hasta recargar a mano.
 */
export async function accionSubirLogo(datos: FormData): Promise<EstadoLogo> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const archivo = datos.get("logo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Elige un archivo." };
  }

  const r = await subirLogo(sesion, archivo);
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath("/empresa/datos");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function accionQuitarLogo(): Promise<EstadoLogo> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await quitarLogo(sesion);
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath("/empresa/datos");
  revalidatePath("/", "layout");
  return { ok: true };
}
