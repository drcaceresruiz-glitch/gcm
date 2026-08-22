"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import {
  guardarProveedorIa,
  eliminarProveedorIa,
  activarProveedorIa,
  probarProveedorIa,
  listarModelosProveedor,
  type RespuestaModelosIa,
} from "@/services/agente-ia.service";

/**
 * Acciones de los proveedores de IA de la empresa.
 *
 * En su propio archivo, igual que `acciones-remitente.ts` y por el mismo
 * motivo: aqui pasa una CLAVE DE API por el formulario.
 *
 * Todo el criterio —permiso, validacion, cifrado— vive en el servicio. La
 * comprobacion se repite alli y no solo aqui porque una accion de servidor
 * es un endpoint invocable sin haber pintado nunca la pantalla.
 */

const RUTA = "/empresa/configuracion/ia";

export interface EstadoProveedorIa {
  error?: string;
  ok?: string;
}

export async function accionGuardarProveedorIa(
  _previo: EstadoProveedorIa,
  datos: FormData,
): Promise<EstadoProveedorIa> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const id = String(datos.get("id") ?? "");

  const r = await guardarProveedorIa(sesion, {
    id: id.length > 0 ? id : undefined,
    tipo: String(datos.get("tipo") ?? ""),
    nombre: String(datos.get("nombre") ?? ""),
    urlBase: String(datos.get("urlBase") ?? ""),
    modelo: String(datos.get("modelo") ?? ""),
    // NO se recorta: una clave de API puede llevar caracteres que un
    // recorte descuidado convertiria en una clave distinta.
    apiKey: String(datos.get("apiKey") ?? ""),
  });

  if (!r.ok) return { error: r.error };

  revalidatePath(RUTA);
  return { ok: "Proveedor guardado. Pruébalo para confirmar que la clave funciona." };
}

export async function accionProbarProveedorIa(
  _previo: EstadoProveedorIa,
  datos: FormData,
): Promise<EstadoProveedorIa> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await probarProveedorIa(sesion, String(datos.get("id") ?? ""));
  revalidatePath(RUTA);

  return r.ok ? { ok: "El proveedor respondió correctamente." } : { error: r.error };
}

export async function accionActivarProveedorIa(
  _previo: EstadoProveedorIa,
  datos: FormData,
): Promise<EstadoProveedorIa> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await activarProveedorIa(sesion, String(datos.get("id") ?? ""));
  if (!r.ok) return { error: r.error };

  revalidatePath(RUTA);
  return { ok: "Listo. El agente de IA usará este proveedor." };
}

/**
 * Le pregunta al proveedor que modelos tiene, con los datos que el
 * formulario tiene EN ESE MOMENTO -tipo, URL, clave-, todavia sin guardar.
 *
 * No es un `useActionState`: se llama a mano desde un boton "Detectar
 * modelos", igual que `accionEstadoDeTurno` en el asistente. No toca
 * Prisma —nunca crea ni guarda nada—, solo reenvia la consulta al
 * proveedor real; el permiso se comprueba aqui de todos modos para que
 * esto no se convierta en un proxy abierto para probar claves ajenas.
 */
export async function accionDetectarModelos(datos: {
  tipo: string;
  urlBase: string;
  apiKey: string;
}): Promise<RespuestaModelosIa> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (!puede(sesion, "configuracion:editar")) {
    return { ok: false, error: "No tienes permiso para configurar los proveedores de IA." };
  }

  const urlBaseTexto = datos.urlBase.trim();
  if (urlBaseTexto && !/^https:\/\//i.test(urlBaseTexto)) {
    return { ok: false, error: 'La URL base tiene que empezar con "https://".' };
  }
  if (!datos.apiKey) {
    return { ok: false, error: "Escribe la clave de API primero." };
  }

  return listarModelosProveedor(datos.tipo, {
    apiKey: datos.apiKey,
    urlBase: urlBaseTexto.length > 0 ? urlBaseTexto.replace(/\/+$/, "") : null,
  });
}

export async function accionEliminarProveedorIa(
  _previo: EstadoProveedorIa,
  datos: FormData,
): Promise<EstadoProveedorIa> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await eliminarProveedorIa(sesion, String(datos.get("id") ?? ""));
  if (!r.ok) return { error: r.error };

  revalidatePath(RUTA);
  return { ok: "Proveedor eliminado." };
}
