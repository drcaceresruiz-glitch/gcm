/**
 * Coherencia entre lo que se muestra y lo que se dice.
 *
 * Una pantalla puede mentir sin equivocarse en ningun calculo. Paso en el
 * valor ganado: "se ha ganado S/ 79,775.23 de un plan de S/ 79,859.05 —
 * ATRASADO (SPI 1.00)". El SPI real era 0.99895, asi que la comparacion
 * `spi >= 1` daba falso y salia la palabra "atrasado"; pero el numero, ya
 * redondeado a dos decimales para ensenarlo, decia 1.00. La cifra y la
 * palabra se contradecian en la misma linea.
 *
 * La misma enfermedad en el tablero: un desfase de -0.04 puntos se pintaba
 * ambar y se escribia "-0.0 pts" —un cero con signo menos, que no significa
 * nada para nadie—.
 *
 * REGLA: la palabra, el color y el signo se deciden sobre el valor REDONDEADO
 * A LOS DECIMALES QUE SE VEN. Si al que mira le ensenas 1.00, para el es 1.00.
 * La alternativa —ensenar mas decimales— es peor: nadie necesita saber que va
 * al 99.895% del plan.
 */

/**
 * Redondea a los decimales que se van a mostrar, y de paso mata el cero
 * negativo.
 *
 * `Math.round(-0.04 * 10) / 10` es `-0` en JavaScript, y `(-0).toFixed(1)` da
 * "0.0" pero `(-0.04).toFixed(1)` da "-0.0". Sumar cero convierte `-0` en `0`
 * y deja el resto igual.
 */
export function redondearA(valor: number, decimales: number): number {
  if (!Number.isFinite(valor)) return valor;
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor + 0;
}

/**
 * Compara contra una referencia SEGUN LO QUE SE VE: 1 por encima, -1 por
 * debajo, 0 si al redondear son el mismo numero.
 *
 * Ese 0 es el motivo de existir de esta funcion. Sin el, todo indicador acaba
 * clasificado como "por debajo" en cuanto le falta una millonesima, y la
 * pantalla contradice a su propia cifra.
 */
export function comparadoCon(
  valor: number,
  referencia: number,
  decimales: number,
): -1 | 0 | 1 {
  const v = redondearA(valor, decimales);
  const r = redondearA(referencia, decimales);
  if (v > r) return 1;
  if (v < r) return -1;
  return 0;
}

/**
 * Numero con signo explicito, coherente con lo que se muestra: "+1.5", "-2.3",
 * y "0.0" a secas cuando redondea a cero.
 *
 * Un "+0.0" es tan raro de leer como un "-0.0": si no hay diferencia, no hay
 * signo que poner.
 */
export function conSignoFijo(valor: number, decimales: number): string {
  if (!Number.isFinite(valor)) return "—";
  const v = redondearA(valor, decimales);
  return `${v > 0 ? "+" : ""}${v.toFixed(decimales)}`;
}
