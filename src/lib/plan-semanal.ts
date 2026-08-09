import type { CausaNoCumplimiento } from "@/generated/prisma/enums";

/**
 * Plan Semanal (Last Planner): las cuentas del corto plazo, en logica pura.
 *
 *   - PPC (Percent Plan Complete) = compromisos CUMPLIDOS / TOTAL comprometido.
 *     Mide la fiabilidad de la planificacion, no el avance fisico: da igual
 *     cuanto se hizo de mas; lo que cuenta es si se cumplio lo que se prometio.
 *   - CNC (causas de no cumplimiento) = por que fallo cada compromiso no
 *     cumplido. Contadas de mayor a menor son el Pareto que dice donde atacar.
 *
 * Sin base de datos: se prueba sola. El servicio trae los compromisos y aqui
 * solo se cuentan.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

/// Etiquetas legibles del catalogo fijo de causas.
export const ETIQUETA_CNC: Record<CausaNoCumplimiento, string> = {
  PRERREQUISITO: "Prerrequisito / tarea previa",
  MATERIALES: "Materiales",
  MANO_OBRA: "Mano de obra",
  EQUIPOS: "Equipos",
  INFORMACION: "Informacion / RFI",
  CLIENTE_TERCEROS: "Cliente / terceros",
  CLIMA: "Clima",
  REPROGRAMACION: "Reprogramacion",
  OTRA: "Otra",
};

/// El orden fijo de las causas, para el select y el Pareto.
export const CAUSAS_CNC = Object.keys(ETIQUETA_CNC) as CausaNoCumplimiento[];

export interface CompromisoEvaluado {
  /// null = sin evaluar todavia.
  cumplido: boolean | null;
  causa: CausaNoCumplimiento | null;
}

export interface PpcResultado {
  total: number;
  cumplidos: number;
  /// 0..100. null si no hay compromisos (no hay PPC que calcular).
  ppc: number | null;
}

/**
 * El PPC de un plan: cumplidos entre el TOTAL comprometido.
 *
 * El denominador es todo lo comprometido, no solo lo evaluado: un compromiso
 * sin marcar cuenta como no cumplido, que es lo honesto —no cerrar la semana no
 * sube el PPC—.
 */
export function ppcDePlan(compromisos: readonly CompromisoEvaluado[]): PpcResultado {
  const total = compromisos.length;
  const cumplidos = compromisos.filter((c) => c.cumplido === true).length;
  return { total, cumplidos, ppc: total === 0 ? null : (cumplidos / total) * 100 };
}

export interface FilaPareto {
  causa: CausaNoCumplimiento;
  conteo: number;
}

/**
 * Cuenta las causas de los compromisos NO cumplidos, de mayor a menor.
 *
 * Solo entran los que fallaron y tienen causa: un compromiso cumplido, o uno
 * fallido sin causa anotada, no aporta al Pareto.
 */
export function paretoCausas(
  compromisos: readonly CompromisoEvaluado[],
): FilaPareto[] {
  const conteo = new Map<CausaNoCumplimiento, number>();

  for (const c of compromisos) {
    if (c.cumplido === false && c.causa) {
      conteo.set(c.causa, (conteo.get(c.causa) ?? 0) + 1);
    }
  }

  return [...conteo.entries()]
    .map(([causa, n]) => ({ causa, conteo: n }))
    .sort((a, b) => b.conteo - a.conteo);
}

export interface PuntoPpc {
  fecha: Date;
  ppc: number;
}

/**
 * La serie de PPC por semana, del mas antiguo al mas reciente, saltando las
 * semanas sin PPC (abiertas o vacias). Es lo que dibuja la tendencia.
 */
export function tendenciaPpc(
  planes: readonly { fecha: Date; ppc: number | null }[],
): PuntoPpc[] {
  return planes
    .filter((p): p is PuntoPpc => p.ppc !== null)
    .slice()
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}

/**
 * La proxima fecha de corte segun el dia ISO configurado (1=lunes..7=domingo):
 * hoy si hoy ya es ese dia, o el siguiente dia de la semana que coincida.
 *
 * Sirve para proponer la fecha de una semana nueva: se planifica la semana que
 * cierra en el proximo corte.
 */
export function proximoCorte(diaSemana: number, hoy: Date): Date {
  const iso = hoy.getUTCDay() === 0 ? 7 : hoy.getUTCDay();
  const salto = (diaSemana - iso + 7) % 7;
  return new Date(hoy.getTime() + salto * DIA_MS);
}
