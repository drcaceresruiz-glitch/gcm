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
 *     comprometido en ordenes aprobadas —"comprometido, no devengado"—.
 *
 * CUIDADO CON EL AC AL PRINCIPIO. Se penso que sesgaria el CPI A LA BAJA (se
 * compromete antes de ejecutar), y en CRIOCORD paso lo contrario: con una sola
 * orden aprobada de 11 mil frente a 62 mil ya ganados, el CPI salia en 5,6 y
 * el EAC en 138 mil sobre un presupuesto de 772 mil. Es decir, la pantalla
 * anunciaba en verde un ahorro de 634 mil soles, el 82% del presupuesto.
 *
 * No era un error de formula: era proyectar el final de la obra desde un costo
 * que todavia no representa el trabajo hecho. Por eso hay una compuerta —ver
 * `hayBaseParaProyectar`— y en su lugar se devuelve null con el motivo.
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
  /// Indice de costo EV/AC. Null sin base de costo: ver `motivoSinCosto`.
  cpi: number | null;
  /// Costo estimado al termino = BAC x AC/EV. Null sin base.
  eac: string | null;
  /// Variacion al termino = BAC - EAC. Lo que sobraria (o faltaria) al final.
  vac: string | null;
  /// % del presupuesto ya ganado = EV/BAC.
  avance: number;
  /// Por que no hay CPI/EAC/VAC. Null cuando si los hay. La pantalla lo usa
  /// para explicar el hueco en vez de dejar un guion sin motivo.
  motivoSinCosto: MotivoSinCosto | null;
}

export type MotivoSinCosto =
  | "sin_permiso"
  | "sin_gasto"
  | "avance_insuficiente"
  | "costo_rezagado";

/**
 * Cuando el avance es demasiado pequeno para proyectar el final.
 *
 * Por debajo de este punto el indice de costo oscila muchisimo con cada orden
 * que entra: es doctrina conocida del valor ganado que el CPI no se estabiliza
 * hasta unos veinte puntos de obra.
 */
export const AVANCE_MINIMO_PROYECCION = 15;

/**
 * Cuanto del valor ganado tiene que estar respaldado por costo registrado.
 *
 * Las ordenes van por detras de la ejecucion: se trabaja y se ordena despues.
 * Mientras el costo registrado no cubra al menos la mitad de lo ganado, no
 * refleja la obra hecha y dividir por el da un indice de fantasia.
 */
export const RESPALDO_MINIMO_COSTO = 0.5;

/**
 * Si el costo registrado da para calcular indices y proyectar el final.
 *
 * Se prefiere no decir nada a decir algo bonito: un "+S/ 634,000" en verde
 * invita a relajarse justo cuando no hay con que sostenerlo.
 */
export function hayBaseParaProyectar(
  ac: string | null,
  ev: string,
  bac: string,
): { ok: true } | { ok: false; motivo: MotivoSinCosto } {
  if (ac === null) return { ok: false, motivo: "sin_permiso" };

  const acNum = Number(ac) || 0;
  const evNum = Number(ev) || 0;
  const bacNum = Number(bac) || 0;

  if (acNum <= 0 || evNum <= 0) return { ok: false, motivo: "sin_gasto" };

  const avance = bacNum > 0 ? (evNum / bacNum) * 100 : 0;
  if (avance < AVANCE_MINIMO_PROYECCION) {
    return { ok: false, motivo: "avance_insuficiente" };
  }

  if (acNum < evNum * RESPALDO_MINIMO_COSTO) {
    return { ok: false, motivo: "costo_rezagado" };
  }

  return { ok: true };
}

/**
 * Todas las metricas a partir de las tres cifras base.
 *
 * Los importes (SV, CV, EAC, VAC) van por aritmetica decimal exacta; los
 * indices (SPI, CPI) son numeros —se leen a dos decimales y no son dinero—.
 * Cada division se protege de su cero: sin PV no hay SPI, sin AC no hay CPI ni
 * costo, sin EV no hay EAC. Devolver un indice inventado seria peor que no
 * devolver ninguno.
 *
 * La mitad de PLAZO (SV, SPI) sale siempre: no depende del AC. La de COSTO se
 * divide en dos: CV es un hecho —lo ganado menos lo gastado, hoy— y se muestra
 * siempre que haya AC; CPI, EAC y VAC son PROYECCIONES y pasan por la
 * compuerta.
 */
export function metricasEvm(e: EntradaEvm): MetricasEvm {
  const pvNum = Number(e.pv) || 0;
  const evNum = Number(e.ev) || 0;
  const bacNum = Number(e.bac) || 0;

  const spi = pvNum > 0 ? evNum / pvNum : null;

  const base = hayBaseParaProyectar(e.ac, e.ev, e.bac);

  // EAC = BAC x AC/EV, exacto: el producto con margen de decimales y luego la
  // division. Solo con base: proyectar el final desde un costo que aun no
  // representa el trabajo hecho es lo que producia el "ahorro" de 634 mil.
  const eac =
    base.ok && e.ac !== null
      ? dividir(multiplicar(e.bac, e.ac, 6) ?? "0", e.ev, 2)
      : null;

  const acNum = e.ac === null ? null : Number(e.ac) || 0;

  return {
    bac: e.bac,
    pv: e.pv,
    ev: e.ev,
    ac: e.ac,
    sv: restar(e.ev, e.pv) ?? "0.00",
    cv: e.ac === null ? null : (restar(e.ev, e.ac) ?? "0.00"),
    spi,
    cpi: base.ok && acNum !== null && acNum > 0 ? evNum / acNum : null,
    eac,
    vac: eac === null ? null : (restar(e.bac, eac) ?? "0.00"),
    avance: bacNum > 0 ? (evNum / bacNum) * 100 : 0,
    motivoSinCosto: base.ok ? null : base.motivo,
  };
}

/**
 * El texto que va en el hueco donde irian CPI, EAC y VAC.
 *
 * Se explica el motivo en vez de dejar un guion: un dato ausente sin razon se
 * lee como un fallo del sistema, y la gente acaba pidiendo el numero malo.
 */
export function textoSinCosto(motivo: MotivoSinCosto): string {
  switch (motivo) {
    case "sin_permiso":
      return "No tienes permiso para ver costos, asi que solo se muestra el control de plazo.";
    case "sin_gasto":
      return "Todavia no hay costo registrado en ordenes aprobadas: no hay con que proyectar el resultado.";
    case "avance_insuficiente":
      return `Con menos del ${AVANCE_MINIMO_PROYECCION}% de avance la proyeccion de costo salta con cada orden; se mostrara cuando la obra tenga mas recorrido.`;
    case "costo_rezagado":
      return "El costo registrado va muy por detras de lo ejecutado (las ordenes se aprueban despues del trabajo), asi que proyectar el resultado daria un ahorro falso.";
  }
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
