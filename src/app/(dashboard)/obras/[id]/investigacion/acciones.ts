"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import {
  declararAperturaDeAnalisis,
  fijarPuntoDeInterrupcion,
  marcarOrigenDeSemana,
} from "@/services/investigacion.service";

/**
 * Configurar el estudio de una obra.
 *
 * Las dos acciones son de QUIEN OPERA GCM y de nadie mas: no cambian como
 * trabaja la obra, cambian como se clasifican sus datos para una
 * investigacion. Que un administrador de constructora pudiera mover el punto
 * de interrupcion significaria que puede mover la frontera entre el «antes» y
 * el «despues» de un estudio sobre su propia obra.
 */

export interface EstadoEstudio {
  error?: string;
  ok?: true;
}

export async function accionFijarInterrupcion(
  _previo: EstadoEstudio,
  datos: FormData,
): Promise<EstadoEstudio> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { error: "Falta la obra." };

  // Cadena vacia = quitar la fecha, que es como se saca una obra del estudio.
  const fecha = String(datos.get("fecha") ?? "").trim();

  const r = await fijarPuntoDeInterrupcion(sesion, obraId, fecha || null);
  if (!r.ok) return { error: r.error };

  revalidatePath(`/obras/${obraId}/investigacion`);
  return { ok: true };
}

export async function accionMarcarOrigen(
  _previo: EstadoEstudio,
  datos: FormData,
): Promise<EstadoEstudio> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const planId = String(datos.get("planId") ?? "");
  if (!obraId || !planId) return { error: "Falta la semana." };

  // Lista cerrada: lo que llega del formulario no se guarda tal cual.
  const pedido = String(datos.get("origen") ?? "");
  const origen = (["GESTIONADO", "RECONSTRUIDO"] as const).find((o) => o === pedido);
  if (!origen) return { error: "Ese origen no existe." };

  const r = await marcarOrigenDeSemana(sesion, obraId, planId, origen);
  if (!r.ok) return { error: r.error };

  revalidatePath(`/obras/${obraId}/investigacion`);
  return { ok: true };
}

/**
 * Declarar la fecha real de apertura de un analisis de causa raiz.
 *
 * Solo hace falta en los analisis cargados al reconstruir un periodo
 * anterior. Vacio = quitar la declaracion y volver a la fecha de registro.
 */
export async function accionDeclararApertura(
  _previo: EstadoEstudio,
  datos: FormData,
): Promise<EstadoEstudio> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const analisisId = String(datos.get("analisisId") ?? "");
  if (!obraId || !analisisId) return { error: "Falta el análisis." };

  const fecha = String(datos.get("fecha") ?? "").trim();

  const r = await declararAperturaDeAnalisis(sesion, obraId, analisisId, fecha || null);
  if (!r.ok) return { error: r.error };

  revalidatePath(`/obras/${obraId}/investigacion`);
  return { ok: true };
}
