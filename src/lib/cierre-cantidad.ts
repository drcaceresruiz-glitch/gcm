import { restar, esNegativo, esPositivo } from "@/lib/decimal";

/**
 * Si un compromiso se cumplio, deducido de la CANTIDAD ejecutada.
 *
 * Hasta ahora el cierre pedia dos cosas que dicen lo mismo: cuanto se ejecuto
 * —«90 de los 120 m2»— y, aparte, una casilla de cumplido. Registrar el mismo
 * hecho dos veces no solo es trabajo de mas: permite que se contradigan, y
 * «30 de 120 m2, cumplido» es un dato que nadie puede usar despues.
 *
 * El corte es EXACTO: 119 de 120 no esta cumplido. Es la misma dureza que ya
 * rige el PPC —una tarea a medias cuenta como no cumplida— y esta puesta a
 * proposito: el PPC no mide avance, mide si se cumple lo que se promete. Una
 * tolerancia del 95% convertiria el indicador en otra cosa sin avisar.
 *
 * NO es una valorizacion: esta cantidad decide cumplimiento, no mueve dinero.
 * La distincion importa porque el dia que una cantidad ejecutada alimente un
 * importe habra que preguntar antes por la modalidad de la partida —en suma
 * alzada el precio esta cerrado—, y aqui no hace falta.
 */

/// Los metrados son Decimal(14,4) en el esquema; se compara con esa precision.
const DECIMALES_METRADO = 4;

/**
 * `true` o `false` cuando hay con que deducirlo; `null` cuando no lo hay, y
 * entonces manda lo que marque la persona.
 *
 * Devuelve null en tres casos, y ninguno es un fallo:
 *
 *  - Sin cantidad comprometida: el compromiso se pacto en % o a bulto.
 *  - Sin cantidad ejecutada: todavia no se ha escrito.
 *  - Con una cantidad comprometida de cero o negativa: no hay meta contra la
 *    que medir, y cualquier ejecucion la superaria. Dar eso por «cumplido»
 *    seria regalar PPC.
 */
export function cumplidoPorCantidad(
  cantidadPlan: string | null | undefined,
  cantidadEjec: string | null | undefined,
): boolean | null {
  if (!cantidadPlan || !cantidadEjec) return null;
  if (!esPositivo(cantidadPlan)) return null;

  const diferencia = restar(cantidadEjec, cantidadPlan, DECIMALES_METRADO);
  // `restar` devuelve null si alguno no es un decimal legible. Un dato
  // ilegible no se interpreta: se deja que decida la persona.
  if (diferencia === null) return null;

  return !esNegativo(diferencia);
}

/**
 * Lo que se va a guardar como `cumplido`, con la cantidad mandando cuando la
 * hay.
 *
 * Se resuelve en el SERVICIO y no solo en la pantalla a proposito: si lo
 * dedujera unicamente el formulario, cualquier otra via de cierre —una
 * llamada directa, una futura importacion— podria volver a escribir la
 * contradiccion que esto existe para impedir.
 */
export function cumplidoAlCerrar(args: {
  marcado: boolean;
  cantidadPlan: string | null | undefined;
  cantidadEjec: string | null | undefined;
}): boolean {
  return (
    cumplidoPorCantidad(args.cantidadPlan, args.cantidadEjec) ?? args.marcado
  );
}
