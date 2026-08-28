/**
 * Deducir cuando arranco y cuando termino de verdad una tarea, a partir de los
 * reportes de avance.
 *
 * Es logica pura: entra lo que ya se sabia de la tarea y el reporte que acaba
 * de llegar, y sale que fechas hay que guardar. Sin base de datos delante se
 * puede probar el caso raro —el reporte que llega con fecha anterior, la
 * correccion que baja del cien— que es justo donde estas deducciones fallan.
 *
 * POR QUE SE DEDUCE Y NO SE PIDE. Pedir la fecha de inicio y la de fin en cada
 * tarea es trabajo administrativo que nadie hace en obra: se rellenaria a
 * ojo al final del mes, y una fecha rellenada a ojo mide peor que una deducida.
 * Se deduce de lo que ya se reporta, se marca como DERIVADA, y quien quiera
 * precision puede declararla a mano —entonces manda la persona y esto no la
 * pisa nunca-.
 *
 * LO QUE UNA FECHA DERIVADA NO ES: no es el dia en que se empezo a trabajar,
 * es el dia del PRIMER REPORTE con avance. Si el residente reporta los
 * viernes, todas las tareas de esa semana empiezan el viernes. Por eso viaja
 * la marca de origen: para poder separarlas al analizar y no meter el habito
 * de reporte dentro de la varianza del proceso.
 */

export type OrigenFecha = "DECLARADA" | "DERIVADA";

export interface EjecucionConocida {
  inicioReal: Date | null;
  finReal: Date | null;
  origenInicio: OrigenFecha | null;
  origenFin: OrigenFecha | null;
}

export interface Reporte {
  fecha: Date;
  /// El porcentaje reportado, ya normalizado a numero.
  porcentaje: number;
}

/// Lo que hay que escribir. Vacio si el reporte no cambia nada.
export interface CambioEjecucion {
  inicioReal?: Date | null;
  finReal?: Date | null;
  origenInicio?: OrigenFecha;
  origenFin?: OrigenFecha;
}

function mismoDia(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

export function ejecucionTrasAvance(
  conocida: EjecucionConocida,
  reporte: Reporte,
): CambioEjecucion {
  const cambio: CambioEjecucion = {};

  /*
   * EL INICIO ES EL PRIMER REPORTE CON ALGO DE AVANCE, y se queda con el mas
   * ANTIGUO de los que lleguen. Los partes no siempre entran en orden: se
   * reporta el lunes lo del jueves anterior, y si el inicio se fijara con el
   * primero que llega, ese retraso administrativo pasaria a ser el arranque de
   * la tarea.
   *
   * El cero no cuenta: reportar «0 %» es decir que NO ha empezado.
   */
  if (reporte.porcentaje > 0) {
    if (conocida.origenInicio !== "DECLARADA") {
      if (conocida.inicioReal === null || reporte.fecha < conocida.inicioReal) {
        cambio.inicioReal = reporte.fecha;
        cambio.origenInicio = "DERIVADA";
      }
    }
  }

  if (conocida.origenFin === "DECLARADA") return cambio;

  /*
   * EL FIN SE PONE AL LLEGAR AL CIEN Y SE QUITA SI SE BAJA DE AHI.
   *
   * Lo segundo importa tanto como lo primero: una tarea que se dio por
   * terminada y luego se corrige a 90 % NO termino, y dejarle la fecha de fin
   * puesta produciria una duracion real mas corta que la verdadera. Es el tipo
   * de dato que nadie vuelve a mirar y que envenena una media.
   */
  if (reporte.porcentaje >= 100) {
    if (conocida.finReal === null || !mismoDia(conocida.finReal, reporte.fecha)) {
      cambio.finReal = reporte.fecha;
      cambio.origenFin = "DERIVADA";
    }
  } else if (conocida.finReal !== null) {
    cambio.finReal = null;
  }

  return cambio;
}

/**
 * Dias entre dos fechas de calendario. Positivo = la segunda va despues.
 *
 * A MEDIODIA Y NO A MEDIANOCHE, y no es un detalle: las fechas de calendario
 * se guardan a medianoche UTC, y restar dos medianoches a traves de un cambio
 * de hora da 0,958 dias en vez de 1. Redondear eso arrastra un dia de error
 * justo en las tareas de una semana, que son la mayoria.
 */
export function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate(), 12);
  const b = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate(), 12);
  return Math.round((b - a) / 86_400_000);
}
