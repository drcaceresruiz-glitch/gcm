import type { CausaNoCumplimiento } from "@/generated/prisma/enums";

/**
 * Cuando toca analizar una causa a fondo, y cuando no.
 *
 * El cierre semanal ya obliga a elegir una CAUSA de un catalogo de nueve, y el
 * Pareto las ordena. Lo que no hay es donde anotar POR QUE paso esa causa ni
 * que se va a hacer para que no vuelva a pasar. Eso es el analisis de causa
 * raiz, y es la segunda mitad de la Fase 4.
 *
 * La decision de diseno que gobierna todo lo demas no es como se ve el
 * formulario: es CUANDO se pide.
 *
 * Pedirlo en cada incumplimiento seria exactamente la burocracia que este
 * sistema mide y combate —el enfoque 6 del diagnostico—. Una semana con seis
 * fallos generaria seis formularios, y a la tercera semana nadie los rellena
 * de verdad: se escribe «falta de material» seis veces y el analisis se
 * convierte en un tramite. Un formulario que se rellena por tramite es peor
 * que no tenerlo, porque ademas ensucia el historial.
 *
 * Asi que se pide cuando la causa demuestra ser un PATRON, no un mal dia. Que
 * una causa salga tres veces en una semana no dice nada: pudo ser el mismo
 * camion que no llego. Que salga en varias semanas distintas si.
 */

export interface IncumplimientoConCausa {
  numeroSemana: number;
  causa: CausaNoCumplimiento;
}

export interface CausaQuePideAnalisis {
  causa: CausaNoCumplimiento;
  /// Incumplimientos que acumula en la ventana.
  veces: number;
  /// En cuantas SEMANAS distintas aparecio. Es lo que la vuelve un patron.
  semanas: number;
}

/**
 * Cuantas semanas cerradas se miran hacia atras.
 *
 * Cuatro: es un mes de obra. Mas atras, el frente y hasta la fase ya son otros
 * y la causa que se repetia pudo dejar de existir sola.
 */
export const VENTANA_SEMANAS = 4;

/**
 * En cuantas semanas distintas tiene que aparecer para considerarse patron.
 *
 * Dos. Con una no se distingue de un mal dia; exigir tres dejaria pasar un mes
 * entero antes de mirar lo que ya se ve venir.
 */
export const SEMANAS_PARA_PATRON = 2;

/**
 * Cuantos incumplimientos tiene que sumar, ademas de repetirse.
 *
 * Tres. Dos fallos repartidos en dos semanas son dos fallos; a partir de tres
 * hay algo que explicar.
 */
export const INCUMPLIMIENTOS_MINIMOS = 3;

/**
 * OTRA no se analiza, y no es un descuido.
 *
 * No es una causa: es la ausencia de una. Cada «OTRA» tuvo su propio motivo,
 * asi que buscarle UNA raiz comun no significa nada.
 *
 * Ahora bien, si OTRA es la que mas se repite, eso SI dice algo —que el
 * catalogo de nueve se esta quedando corto para esta obra—, pero se arregla
 * revisando el catalogo, no rellenando un analisis.
 */
const NO_ANALIZABLES: readonly CausaNoCumplimiento[] = ["OTRA"];

/**
 * Las causas que piden un analisis de raiz, de mas insistente a menos.
 *
 * Recibe los incumplimientos YA filtrados a semanas cerradas. Quien los busca
 * es el servicio; aqui solo esta la regla.
 */
export function causasQuePidenAnalisis(
  incumplimientos: readonly IncumplimientoConCausa[],
): CausaQuePideAnalisis[] {
  const semanas = [...new Set(incumplimientos.map((i) => i.numeroSemana))]
    .sort((a, b) => b - a)
    .slice(0, VENTANA_SEMANAS);
  const enVentana = new Set(semanas);

  const porCausa = new Map<CausaNoCumplimiento, Set<number>>();
  const conteo = new Map<CausaNoCumplimiento, number>();

  for (const i of incumplimientos) {
    if (!enVentana.has(i.numeroSemana)) continue;
    if (NO_ANALIZABLES.includes(i.causa)) continue;

    porCausa.set(
      i.causa,
      (porCausa.get(i.causa) ?? new Set<number>()).add(i.numeroSemana),
    );
    conteo.set(i.causa, (conteo.get(i.causa) ?? 0) + 1);
  }

  const salida: CausaQuePideAnalisis[] = [];
  for (const [causa, susSemanas] of porCausa) {
    const veces = conteo.get(causa) ?? 0;
    if (susSemanas.size < SEMANAS_PARA_PATRON) continue;
    if (veces < INCUMPLIMIENTOS_MINIMOS) continue;
    salida.push({ causa, veces, semanas: susSemanas.size });
  }

  // Primero la que mas se repite; a igualdad, la que toca mas semanas, que es
  // la mas asentada de las dos.
  return salida.sort((a, b) => b.veces - a.veces || b.semanas - a.semanas);
}
