"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  abrirAnalisis,
  cerrarAnalisis,
  type DatosAnalisis,
  type ResultadoAnalisis,
} from "@/services/causa-raiz.service";
import {
  crearPlanSemanal,
  guardarCompromisos,
  cerrarPlanSemanal,
  reabrirPlanSemanal,
  corregirFechaCorte,
  eliminarPlanSemanal,
  type ResultadoPlan,
  type ResultadoCrearPlan,
  type ResultadoCerrarPlan,
  type DatosCompromiso,
  type Evaluacion,
} from "@/services/plan-semanal.service";

/**
 * Server actions del Plan Semanal. Como las de encargos: reciben objetos
 * tipados (no FormData), delegan el permiso y la validacion al servicio, y solo
 * repintan al confirmar. La pantalla navega por su cuenta.
 */

export async function accionCrearPlanSemanal(
  obraId: string,
  fechaCorte: string,
  /// Segunda pasada: el residente ya vio el aviso de numeracion y sigue.
  confirmado = false,
  /// Solo la PRIMERA semana de la obra: el dia en que empieza, si arranca
  /// antes de los siete dias que terminan en el corte.
  fechaInicio?: string,
): Promise<ResultadoCrearPlan> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await crearPlanSemanal(sesion, obraId, {
    fechaCorte,
    confirmado,
    fechaInicio,
  });
  if (r.ok) revalidatePath(`/obras/${obraId}/plan-semanal`);
  return r;
}

export async function accionGuardarCompromisos(
  obraId: string,
  planId: string,
  compromisos: DatosCompromiso[],
): Promise<ResultadoPlan> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await guardarCompromisos(sesion, obraId, planId, compromisos);
  if (r.ok) {
    revalidatePath(`/obras/${obraId}/plan-semanal`);
    revalidatePath(`/obras/${obraId}/plan-semanal/${planId}`);
  }
  return r;
}

export async function accionCerrarPlanSemanal(
  obraId: string,
  planId: string,
  evaluaciones: Evaluacion[],
  /// El residente ya vio que hay cumplidos sin avance y cierra igual.
  confirmado = false,
): Promise<ResultadoCerrarPlan> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await cerrarPlanSemanal(sesion, obraId, planId, evaluaciones, confirmado);
  if (r.ok) {
    revalidatePath(`/obras/${obraId}/plan-semanal`);
    revalidatePath(`/obras/${obraId}/plan-semanal/${planId}`);
  }
  return r;
}

export async function accionReabrirPlanSemanal(
  obraId: string,
  planId: string,
): Promise<ResultadoPlan> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await reabrirPlanSemanal(sesion, obraId, planId);
  if (r.ok) {
    revalidatePath(`/obras/${obraId}/plan-semanal`);
    revalidatePath(`/obras/${obraId}/plan-semanal/${planId}`);
  }
  return r;
}

/**
 * Corrige el dia en que cierra una semana abierta.
 *
 * Repinta tambien el tablero de la obra: de la fecha de corte cuelga cual es
 * «la ultima semana», y con las fechas cruzadas eso senalaba a otra.
 */
export async function accionCorregirFechaCorte(
  obraId: string,
  planId: string,
  fecha: string,
): Promise<ResultadoPlan> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await corregirFechaCorte(sesion, obraId, planId, fecha);
  if (r.ok) {
    revalidatePath(`/obras/${obraId}/plan-semanal`);
    revalidatePath(`/obras/${obraId}/plan-semanal/${planId}`);
    revalidatePath(`/obras/${obraId}`);
  }
  return r;
}

/**
 * Elimina la semana y vuelve a la lista. Como la semana deja de existir, no
 * tiene sentido quedarse en su detalle: al confirmar, redirige. Si falla,
 * devuelve el error para que el boton lo muestre.
 */
export async function accionEliminarPlanSemanal(
  obraId: string,
  planId: string,
): Promise<ResultadoPlan> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await eliminarPlanSemanal(sesion, obraId, planId);
  if (!r.ok) return r;

  revalidatePath(`/obras/${obraId}/plan-semanal`);
  redirect(`/obras/${obraId}/plan-semanal`);
}

export async function accionAbrirAnalisis(
  obraId: string,
  datos: DatosAnalisis,
): Promise<ResultadoAnalisis> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await abrirAnalisis(sesion, obraId, datos);
  if (resultado.ok) revalidatePath(`/obras/${obraId}/plan-semanal`);
  return resultado;
}

export async function accionCerrarAnalisis(
  obraId: string,
  analisisId: string,
): Promise<ResultadoAnalisis> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const resultado = await cerrarAnalisis(sesion, analisisId);
  // Se revalida la ruta de la OBRA que llega por parametro, no la del analisis:
  // el servicio ya comprobo que ese analisis es de la empresa de la sesion, y
  // aqui solo se refresca una pantalla.
  if (resultado.ok) revalidatePath(`/obras/${obraId}/plan-semanal`);
  return resultado;
}
