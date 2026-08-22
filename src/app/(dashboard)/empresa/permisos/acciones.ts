"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { obtenerSesion } from "@/services/sesion.service";
import { guardarCambios } from "@/services/permisos.service";

/**
 * Guardado de la matriz de permisos.
 *
 * Viajan como JSON solo las casillas que cambian, no la rejilla entera. Si
 * dos administradores editan a la vez, cada uno aplica lo suyo; mandar la
 * rejilla completa haria que el segundo en guardar deshiciera en silencio lo
 * que acababa de hacer el primero.
 *
 * El servicio vuelve a comparar cada casilla contra lo guardado antes de
 * escribir, asi que una cuenta mal llevada por el navegador no ensucia nada:
 * lo que no cambia de valor, ni se guarda ni se audita.
 *
 * Aqui solo se comprueba la FORMA. Que un permiso exista, que el rol exista
 * y que no sea de los innegociables lo decide el servicio, que es la
 * frontera real.
 */

export interface EstadoPermisos {
  error?: string;
}

const esquemaCambios = z
  .array(
    z.object({
      role: z.enum([
        "ADMIN",
        "RESIDENTE",
        "ADMIN_OBRA",
        "ALMACENERO",
        "CONSULTOR",
        "GERENTE",
      ]),
      permiso: z.string().min(1).max(40),
      concedido: z.boolean(),
    }),
  )
  .min(1);

export async function accionGuardarPermisos(
  _previo: EstadoPermisos,
  datos: FormData,
): Promise<EstadoPermisos> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  let crudo: unknown;
  try {
    crudo = JSON.parse(String(datos.get("cambios") ?? "[]"));
  } catch {
    return { error: "No se pudo leer la matriz de permisos." };
  }

  const cambios = esquemaCambios.safeParse(crudo);
  if (!cambios.success) {
    return { error: "La matriz llego incompleta. Recarga la pagina y repite." };
  }

  const resultado = await guardarCambios(sesion, cambios.data);
  if (!resultado.ok) return { error: resultado.error };

  // Los permisos de cualquiera pueden haber cambiado, y de ellos depende lo
  // que se dibuja en todas las pantallas. Se invalida el area entera.
  revalidatePath("/", "layout");
  redirect(`/empresa/permisos?guardados=${resultado.aplicados}`);
}
