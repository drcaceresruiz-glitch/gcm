import { format, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Fechas en formato peruano.
 *
 * La obra se controla por dias calendario, no por horas: comparar con la
 * hora incluida haria que una partida programada para hoy apareciera como
 * vencida a las 00:01. Por eso las comparaciones usan dias calendario.
 */

/** "03/08/2026" */
export function fechaCorta(fecha: Date | string): string {
  return format(new Date(fecha), "dd/MM/yyyy");
}

/** "lun 03/08/26" — el formato del cronograma de MS Project. */
export function fechaCronograma(fecha: Date | string): string {
  return format(new Date(fecha), "EEE dd/MM/yy", { locale: es });
}

/** "03 de agosto de 2026" — cabeceras de informe. */
export function fechaLarga(fecha: Date | string): string {
  return format(new Date(fecha), "dd 'de' MMMM 'de' yyyy", { locale: es });
}

/** "03/08" — eje horizontal de la Curva S. */
export function fechaEje(fecha: Date | string): string {
  return format(new Date(fecha), "dd/MM");
}

/** Dias de calendario entre dos fechas, ignorando la hora. */
export function diasEntre(desde: Date | string, hasta: Date | string): number {
  return differenceInCalendarDays(new Date(hasta), new Date(desde));
}

/**
 * Avance de calendario de la obra en porcentaje, acotado entre 0 y 100.
 * Es la referencia temporal contra la que se contrasta el avance real.
 */
export function avanceCalendario(
  inicio: Date | string,
  fin: Date | string,
  corte: Date | string = new Date(),
): number {
  const total = diasEntre(inicio, fin);
  if (total <= 0) return 100;
  const transcurrido = diasEntre(inicio, corte);
  return Math.min(100, Math.max(0, (transcurrido / total) * 100));
}
