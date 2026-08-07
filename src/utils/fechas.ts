import { format, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Fechas en formato peruano.
 *
 * CUIDADO CON LA ZONA HORARIA. Las fechas de obra (inicio, fin programado,
 * fecha de un avance) son fechas de CALENDARIO, no instantes en el tiempo.
 * Se guardan como `@db.Date` y Prisma las devuelve como medianoche UTC.
 *
 * Al formatearlas en horario de Lima (UTC-5) el reloj retrocede cinco horas
 * y el 01/08 se muestra como 31/07. En una obra eso es inadmisible: correria
 * un dia todo el cronograma. Por eso `soloFecha` reconstruye la fecha usando
 * los componentes UTC, preservando el dia del calendario tal como se guardo.
 *
 * Los instantes reales (createdAt, hora de un ingreso) NO deben pasar por
 * `soloFecha`: ahi si interesa la hora local.
 */
function soloFecha(fecha: Date | string): Date {
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** "03/08/2026" */
export function fechaCorta(fecha: Date | string): string {
  return format(soloFecha(fecha), "dd/MM/yyyy");
}

/** "lun 03/08/26" — el formato del cronograma de MS Project. */
export function fechaCronograma(fecha: Date | string): string {
  return format(soloFecha(fecha), "EEE dd/MM/yy", { locale: es });
}

/** "03 de agosto de 2026" — cabeceras de informe. */
export function fechaLarga(fecha: Date | string): string {
  return format(soloFecha(fecha), "dd 'de' MMMM 'de' yyyy", { locale: es });
}

/** "03/08" — eje horizontal de la Curva S. */
export function fechaEje(fecha: Date | string): string {
  return format(soloFecha(fecha), "dd/MM");
}

/** "03/08/2026 14:30" — para registros con hora real (auditoria, ingresos). */
export function fechaHora(instante: Date | string): string {
  return format(new Date(instante), "dd/MM/yyyy HH:mm");
}

/**
 * Fecha de hoy como fecha de calendario.
 *
 * Toma el dia LOCAL del usuario y lo representa igual que las fechas de la
 * base (medianoche UTC), para que ambas sean comparables. Usar `new Date()`
 * directamente reintroduce el desfase de un dia, pero al reves.
 */
export function hoy(): Date {
  const ahora = new Date();
  return new Date(
    Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()),
  );
}

/** Dias de calendario entre dos fechas de obra. */
export function diasEntre(desde: Date | string, hasta: Date | string): number {
  return differenceInCalendarDays(soloFecha(hasta), soloFecha(desde));
}

/**
 * Avance de calendario de la obra en porcentaje, acotado entre 0 y 100.
 * Es la referencia temporal contra la que se contrasta el avance real.
 */
export function avanceCalendario(
  inicio: Date | string,
  fin: Date | string,
  corte: Date | string = hoy(),
): number {
  const total = diasEntre(inicio, fin);
  if (total <= 0) return 100;
  const transcurrido = diasEntre(inicio, corte);
  return Math.min(100, Math.max(0, (transcurrido / total) * 100));
}
