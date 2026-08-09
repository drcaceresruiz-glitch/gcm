import { restar, dividir, multiplicar } from "@/lib/decimal";

/**
 * Valor ganado (EVM). Las cuentas del control integrado de plazo y costo, en
 * dinero exacto. Logica pura: se prueba sin base de datos.
 *
 * Las tres cifras de las que sale todo:
 *   - PV (valor planeado): cuanto del presupuesto DEBERIAS haber ganado a la
 *     fecha, segun el plan.
 *   - EV (valor ganado): cuanto has ganado DE VERDAD = presupuesto x %avance.
 *   - AC (costo real): cuanto te ha COSTADO hasta ahora. En GCM el proxy es el
 *     comprometido en ordenes aprobadas —"comprometido, no devengado"—, que
 *     por eso puede sesgar el CPI a la baja al principio: se compromete antes
 *     de ejecutar.
 *
 * De ahi:
 *   - SPI = EV/PV. Mayor que 1, adelantado en plazo.
 *   - CPI = EV/AC. Mayor que 1, por debajo del costo previsto.
 *   - EAC = costo estimado al termino = BAC x AC/EV (si sigues rindiendo asi).
 *
 * El %avance puede venir ponderado por DURACION (lo que trae el archivo) o por
 * DINERO (cuando el mapeo tarea-partida pasa del 60%): a esta libreria le da
 * igual, recibe PV y EV ya calculados. El peso solo cambia su precision, no la
 * formula.
 */

export interface EntradaEvm {
  /// Presupuesto total (Budget At Completion).
  bac: string;
  /// Valor planeado acumulado a la fecha.
  pv: string;
  /// Valor ganado acumulado a la fecha.
  ev: string;
  /// Costo real acumulado. Null cuando no se puede ver —sin permiso de ordenes,
  /// el EVM se queda en su mitad de PLAZO (PV/EV/SPI) y no ensena costo.
  ac: string | null;
}

export interface MetricasEvm {
  bac: string;
  pv: string;
  ev: string;
  ac: string | null;
  /// Variacion de plazo en dinero: EV - PV. Negativo, atrasado.
  sv: string;
  /// Variacion de costo: EV - AC. Negativo, gastas mas de lo ganado. Null sin AC.
  cv: string | null;
  /// Indice de plazo EV/PV. Null si PV es cero (aun no toca nada del plan).
  spi: number | null;
  /// Indice de costo EV/AC. Null sin AC o con AC cero (nada gastado todavia).
  cpi: number | null;
  /// Costo estimado al termino = BAC x AC/EV. Null sin AC o sin avance.
  eac: string | null;
  /// Variacion al termino = BAC - EAC. Lo que sobraria (o faltaria) al final.
  vac: string | null;
  /// % del presupuesto ya ganado = EV/BAC.
  avance: number;
}

/**
 * Todas las metricas a partir de las tres cifras base.
 *
 * Los importes (SV, CV, EAC, VAC) van por aritmetica decimal exacta; los
 * indices (SPI, CPI) son numeros —se leen a dos decimales y no son dinero—.
 * Cada division se protege de su cero: sin PV no hay SPI, sin AC no hay CPI ni
 * costo, sin EV no hay EAC. Devolver un indice inventado seria peor que no
 * devolver ninguno.
 */
export function metricasEvm(e: EntradaEvm): MetricasEvm {
  const pvNum = Number(e.pv) || 0;
  const evNum = Number(e.ev) || 0;
  const bacNum = Number(e.bac) || 0;
  const acNum = e.ac === null ? null : Number(e.ac) || 0;

  const spi = pvNum > 0 ? evNum / pvNum : null;
  const cpi = acNum !== null && acNum > 0 ? evNum / acNum : null;

  // EAC = BAC x AC/EV, exacto: el producto con margen de decimales y luego la
  // division. Necesita AC positivo (sin nada gastado no hay ritmo de costo que
  // proyectar) y algo ganado (sin avance, dividir por EV=0 no da nada).
  const eac =
    e.ac !== null && acNum !== null && acNum > 0 && evNum > 0
      ? dividir(multiplicar(e.bac, e.ac, 6) ?? "0", e.ev, 2)
      : null;

  return {
    bac: e.bac,
    pv: e.pv,
    ev: e.ev,
    ac: e.ac,
    sv: restar(e.ev, e.pv) ?? "0.00",
    cv: e.ac === null ? null : (restar(e.ev, e.ac) ?? "0.00"),
    spi,
    cpi,
    eac,
    vac: eac === null ? null : (restar(e.bac, eac) ?? "0.00"),
    avance: bacNum > 0 ? (evNum / bacNum) * 100 : 0,
  };
}

/**
 * El valor —planeado o ganado— que corresponde a un % de avance sobre el
 * presupuesto. EV = BAC x %/100, y PV igual con el % planeado.
 *
 * Es lo que convierte el %avance del cronograma en dinero para el EVM, sin
 * pasar por coma flotante.
 */
export function valorDeAvance(bac: string, porcentaje: number): string {
  const pct = Math.max(0, porcentaje);
  const producto = multiplicar(bac, pct.toFixed(4), 6);
  if (producto === null) return "0.00";
  return dividir(producto, "100", 2) ?? "0.00";
}
