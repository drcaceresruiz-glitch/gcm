"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { actualizarEmpresa } from "@/services/empresa.service";

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
