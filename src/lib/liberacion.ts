import type { TipoRestriccion } from "@/generated/prisma/enums";
import { FLUJOS_RESTRICCION } from "@/lib/lookahead";

/**
 * Cuanto tarda en liberarse cada flujo, en ESTA obra.
 *
 * El sistema ya sabia dos cosas de cada restriccion: cuantos dias lleva
 * abierta —para recordar— y si se cumplio la fecha prometida. Lo que no sabia
 * decir es cuanto tarda de media un FLUJO, que es una pregunta distinta y la
 * unica que sirve para decidir por adelantado.
 *
 * La diferencia practica:
 *
 *   «Materiales es mi causa de incumplimiento mas frecuente»
 *      -> diagnostico postumo. Llega despues del fallo.
 *
 *   «Materiales tarda 9 dias de media en liberarse»
 *      -> llega ANTES, y ademas dimensiona la ventana del Lookahead con un
 *         dato en vez de con una costumbre.
 *
 * Aqui no hay base de datos: entran restricciones ya resueltas y sale la
 * lectura. Quien las busca es el servicio.
 */

/** Una restriccion YA resuelta. Las abiertas no miden nada todavia. */
export interface RestriccionLiberada {
  tipo: TipoRestriccion;
  createdAt: Date;
  resueltaAt: Date;
}

export interface DemoraFlujo {
  tipo: TipoRestriccion;
  etiqueta: string;
  /// Media de dias de calendario que tarda en liberarse.
  dias: number;
  /**
   * La mediana, que se muestra al lado de la media a proposito.
   *
   * Una sola restriccion abierta seis meses arrastra la media de todo el
   * flujo. Con la mediana al lado se ve de un vistazo si el numero describe
   * al flujo o a un caso raro, sin tener que abrir nada.
   */
  mediana: number;
  /// Cuantas se promediaron. Sin esto, «9 dias» no dice si son 2 casos o 40.
  casos: number;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/// Dias de calendario entre dos fechas, sin negativos: una resuelta antes de
/// crearse es un dato sucio, y cero es la lectura honesta de "fue inmediata".
function diasDe(r: RestriccionLiberada): number {
  const bruto = (r.resueltaAt.getTime() - r.createdAt.getTime()) / DIA_MS;
  return bruto > 0 ? bruto : 0;
}

function mediana(valores: readonly number[]): number {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 0
    ? (orden[medio - 1]! + orden[medio]!) / 2
    : orden[medio]!;
}

const UN_DECIMAL = (n: number) => Math.round(n * 10) / 10;

/**
 * La demora media por flujo, de mayor a menor.
 *
 * Un flujo sin ninguna restriccion resuelta NO aparece. Mostrarlo con un cero
 * diria "se libera al instante", que es lo contrario de la verdad: lo que
 * pasa es que no hay con que responder. Es la misma regla que ya rige el EAC.
 */
export function demoraPorFlujo(
  liberadas: readonly RestriccionLiberada[],
): DemoraFlujo[] {
  const porTipo = new Map<TipoRestriccion, number[]>();
  for (const r of liberadas) {
    porTipo.set(r.tipo, [...(porTipo.get(r.tipo) ?? []), diasDe(r)]);
  }

  const salida: DemoraFlujo[] = [];
  for (const flujo of FLUJOS_RESTRICCION) {
    const dias = porTipo.get(flujo.tipo);
    if (dias === undefined || dias.length === 0) continue;
    salida.push({
      tipo: flujo.tipo,
      etiqueta: flujo.etiqueta,
      dias: UN_DECIMAL(dias.reduce((s, d) => s + d, 0) / dias.length),
      mediana: UN_DECIMAL(mediana(dias)),
      casos: dias.length,
    });
  }

  // De mayor a menor: arriba lo que mas frena. A igualdad, mas casos primero,
  // que es el dato mas fiable de los dos.
  return salida.sort((a, b) => b.dias - a.dias || b.casos - a.casos);
}

/// Menos casos que esto y la media todavia no describe al flujo.
export const CASOS_MINIMOS_PARA_RECOMENDAR = 3;

/**
 * Cuantas semanas de ventana pide esta obra, segun lo que tarda de verdad.
 *
 * La ventana debe cubrir el flujo mas lento: de nada sirve mirar tres semanas
 * si el acero tarda cinco en llegar. Se redondea HACIA ARRIBA y se acota al
 * rango que admite el Lookahead.
 *
 * Devuelve null mientras ningun flujo tenga casos suficientes. Recomendar una
 * ventana con dos datos seria cambiar una costumbre por otra, disfrazada de
 * medicion.
 */
export function ventanaRecomendada(demoras: readonly DemoraFlujo[]): number | null {
  const fiables = demoras.filter((d) => d.casos >= CASOS_MINIMOS_PARA_RECOMENDAR);
  if (fiables.length === 0) return null;
  const peor = Math.max(...fiables.map((d) => d.dias));
  return Math.min(12, Math.max(1, Math.ceil(peor / 7)));
}
