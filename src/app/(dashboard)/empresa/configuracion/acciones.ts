"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  vincularEmisor,
  cambiarEstadoEmisor,
  eliminarEmisor,
  type ResultadoVinculo,
  type ResultadoEmisor,
} from "@/services/emisor-sms.service";

/**
 * Acciones del tablero de configuracion.
 *
 * Todo el criterio —permiso, empresa, validacion— vive en
 * `emisor-sms.service`. Aqui solo se resuelve la sesion y se repinta.
 *
 * La comprobacion de permiso se repite en el servicio y no solo en la pagina
 * porque una accion de servidor es un endpoint con identificador estable,
 * invocable sin haber renderizado jamas la pantalla que la contiene.
 */

export interface EstadoConfiguracion {
  error?: string;
  ok?: string;
  /// El token recien creado, en claro. Viaja UNA vez hasta la pantalla y no
  /// se guarda en ningun sitio: en la base solo esta su hash.
  token?: string;
  /// El celular de ese emisor, ya normalizado, para poder mandarle los pasos.
  numero?: string | null;
}

export async function accionVincularEmisor(
  _previo: EstadoConfiguracion,
  datos: FormData,
): Promise<EstadoConfiguracion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r: ResultadoVinculo = await vincularEmisor(sesion, {
    etiqueta: String(datos.get("etiqueta") ?? ""),
    numero: String(datos.get("numero") ?? ""),
  });
  if (!r.ok) return { error: r.error };

  revalidatePath("/empresa/configuracion");
  return {
    ok: "Teléfono vinculado. Copia el token ahora: no se puede volver a ver.",
    token: r.token,
    numero: r.numero,
  };
}

export async function accionCambiarEstadoEmisor(
  _previo: EstadoConfiguracion,
  datos: FormData,
): Promise<EstadoConfiguracion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const activo = datos.get("activo") === "si";

  const r: ResultadoEmisor = await cambiarEstadoEmisor(
    sesion,
    String(datos.get("id") ?? ""),
    activo,
  );
  if (!r.ok) return { error: r.error };

  revalidatePath("/empresa/configuracion");
  return {
    ok: activo
      ? "Teléfono reactivado."
      : "Teléfono revocado. Su token deja de servir en el acto.",
  };
}

/**
 * Borra un telefono de la lista.
 *
 * Lo pide el uso real: cada token perdido dejaba una fila revocada para
 * siempre, y con cinco o seis ya no se distingue cual es el que manda los SMS.
 * Quien existio y quien lo puso queda en la auditoria, que es su sitio.
 */
export async function accionEliminarEmisor(
  _previo: EstadoConfiguracion,
  datos: FormData,
): Promise<EstadoConfiguracion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r: ResultadoEmisor = await eliminarEmisor(
    sesion,
    String(datos.get("id") ?? ""),
  );
  if (!r.ok) return { error: r.error };

  revalidatePath("/empresa/configuracion");
  return { ok: "Teléfono eliminado de la lista." };
}
