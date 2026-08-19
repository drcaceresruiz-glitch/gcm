"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  altaConstructora,
  alternarConstructora,
  editarConstructora,
  type DatosAltaConstructora,
  type ResultadoAlta,
  type ResultadoEdicion,
  type ResultadoSuspension,
} from "@/services/operador.service";
import type { DatosAltaEmpresa } from "@/lib/empresas";
import { consultarRuc, type ConsultaRuc } from "@/services/sunat.service";

/**
 * Acciones del area de operador.
 *
 * La comprobacion de que quien llama opera GCM se repite aqui y en el
 * servicio, no solo en la pagina: una accion de servidor es un endpoint con
 * un identificador estable, invocable directamente sin haber renderizado
 * jamas la pantalla que la contiene. La guarda del componente de servidor no
 * se ejecuta por ese camino.
 */

export async function accionAltaConstructora(
  datos: DatosAltaConstructora,
): Promise<ResultadoAlta> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await altaConstructora(sesion, datos);
  if (r.ok) revalidatePath("/operador");
  return r;
}

export async function accionEditarConstructora(
  empresaId: string,
  datos: DatosAltaEmpresa,
): Promise<ResultadoEdicion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await editarConstructora(sesion, empresaId, datos);
  // Las dos pantallas: la ficha y el listado, que ensena razon social y RUC.
  if (r.ok) {
    revalidatePath("/operador");
    revalidatePath(`/operador/${empresaId}`);
  }
  return r;
}

export async function accionAlternarConstructora(
  empresaId: string,
  activa: boolean,
): Promise<ResultadoSuspension> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await alternarConstructora(sesion, empresaId, activa);
  if (r.ok) revalidatePath("/operador");
  return r;
}

/**
 * Consulta del RUC para prellenar el alta.
 *
 * Se envuelve de nuevo en vez de reusar la del catalogo de proveedores: esa
 * exige permisos de proveedor, que el operador no tiene por que tener.
 *
 * Es manual y opt-in, nunca automatica al teclear: la aplicacion no tiene
 * limitador de frecuencia para esta API y dar de alta una constructora es una
 * operacion rara.
 */
export async function accionConsultarRucEmpresa(
  ruc: string,
): Promise<ConsultaRuc> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  if (!sesion.esOperador) {
    return { ok: false, motivo: "fallo", detalle: "No autorizado." };
  }

  return consultarRuc(ruc);
}
