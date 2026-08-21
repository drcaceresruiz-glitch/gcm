"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { cambiarVistaPreviaRoles } from "@/services/empresa.service";
import { rolValido } from "@/lib/usuarios";
import { COOKIE_VISTA_ROL } from "@/lib/vista-rol";
import type { Role } from "@/generated/prisma/enums";

/**
 * Acciones del marco del dashboard: lo que cuelga del header y no de una
 * pantalla concreta. Mismo sitio que ya usan `accionCerrarSesion` en
 * `(auth)/acciones.ts`, aunque el header viva en el layout del dashboard.
 */

/**
 * Activa, cambia o apaga la vista previa de rol.
 *
 * `sesion.service.ts` es quien de verdad decide si esta cookie surte
 * efecto —solo si el rol REAL es ADMIN y la empresa lo permite—, asi que
 * aqui no hace falta repetir esa guarda: escribir la cookie sin permiso no
 * concede nada, solo se ignora en la siguiente peticion.
 */
export async function accionVerComo(rol: Role | null): Promise<void> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const almacen = await cookies();

  if (rol === null || !rolValido(rol)) {
    almacen.delete(COOKIE_VISTA_ROL);
  } else {
    almacen.set(COOKIE_VISTA_ROL, rol, {
      // Preferencia de interfaz, no una credencial: la interseccion de
      // `@/lib/vista-rol` hace que tocarla a mano sea inofensivo, asi que
      // no hace falta `httpOnly` ni firmarla.
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  // El arbol entero, no una ruta: el rol efectivo cambia el menu, el
  // tablero, cada permiso de cada pantalla.
  revalidatePath("/", "layout");
}

export interface EstadoVistaPreviaRoles {
  error?: string;
  ok?: string;
}

/// Mismo molde que `accionCambiarEstadoRemitente`: un input oculto con el
/// valor nuevo, para que un solo boton "Encender"/"Apagar" sirva de formulario.
export async function accionCambiarVistaPreviaRoles(
  _previo: EstadoVistaPreviaRoles,
  datos: FormData,
): Promise<EstadoVistaPreviaRoles> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const activar = datos.get("activar") === "1";
  const r = await cambiarVistaPreviaRoles(sesion, activar);
  if (!r.ok) return { error: r.error };

  revalidatePath("/", "layout");
  return {
    ok: activar
      ? "Vista previa de roles encendida."
      : "Vista previa de roles apagada.",
  };
}
