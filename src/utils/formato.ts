/**
 * Formato peruano para toda la interfaz.
 *
 * Los importes llegan desde Prisma como string, no como number: convertirlos
 * a coma flotante perderia precision justo en las cifras del presupuesto.
 * Por eso estas funciones aceptan string y solo convierten en el ultimo
 * paso, el de mostrar.
 */

type Importe = string | number | { toString(): string };

const MONEDA = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUMERO = new Intl.NumberFormat("es-PE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const METRADO = new Intl.NumberFormat("es-PE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

/** Convierte a number solo para mostrar. Nunca para calcular. */
function aNumero(valor: Importe | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const n = typeof valor === "number" ? valor : Number(valor.toString());
  return Number.isFinite(n) ? n : null;
}

/** "S/ 1,234.56" */
export function soles(valor: Importe | null | undefined, vacio = "—"): string {
  const n = aNumero(valor);
  return n === null ? vacio : MONEDA.format(n);
}

/** "1,234.56" sin simbolo de moneda, para columnas numericas de tablas. */
export function decimal(valor: Importe | null | undefined, vacio = "—"): string {
  const n = aNumero(valor);
  return n === null ? vacio : NUMERO.format(n);
}

/** Metrados: hasta 4 decimales, sin ceros de relleno. "4.25" */
export function metrado(valor: Importe | null | undefined, vacio = "—"): string {
  const n = aNumero(valor);
  return n === null ? vacio : METRADO.format(n);
}

/** "12.5%" */
export function porcentaje(valor: number | null | undefined, decimales = 1): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—";
  return `${valor.toFixed(decimales)}%`;
}

/** Desviacion con signo explicito: "+1.0%" / "-2.3%". */
export function desviacion(valor: number | null | undefined, decimales = 1): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—";
  const signo = valor > 0 ? "+" : "";
  return `${signo}${valor.toFixed(decimales)}%`;
}
