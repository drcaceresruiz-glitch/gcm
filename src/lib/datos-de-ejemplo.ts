import { TOTAL_EJEMPLO } from "@/lib/plantilla-presupuesto";
import {
  TOTAL_COSTO_EJEMPLO,
  TOTAL_GASTOS_EJEMPLO,
} from "@/lib/plantilla-meta";

/**
 * Reconoce las cifras que trae la PLANTILLA como ejemplo.
 *
 * Las tres plantillas de GCM llevan filas de ejemplo didacticas —y estan bien
 * puestas: ensenan la convencion de codigos, que la meta va por debajo del
 * contrato y que puede tener lineas propias—. El problema es que **son datos
 * validos e importables**: quien descarga la plantilla y la sube sin borrarlos
 * carga los ejemplos como si fueran su obra, y GCM los acepta sin decir nada.
 *
 * Paso de verdad, y produjo una pantalla imposible: presupuesto contractual de
 * 18.509 (los ejemplos del presupuesto), meta de 15.478 con 125.700 de gastos
 * generales (los de la meta), y una bolsa operativa de -119.892. Cada cifra
 * era correcta por separado; lo que no cuadraba es que venian de dos ejemplos
 * pensados para obras de tamano distinto.
 *
 * NO se bloquea la carga: probar el sistema con la plantilla es legitimo y es
 * lo primero que hace cualquiera. Lo que no puede pasar es que **no se diga**.
 */

/**
 * El presupuesto contractual son las partidas de ejemplo de la plantilla.
 *
 * Se compara el total y no fila a fila a proposito: alguien puede haber
 * borrado una linea o cambiado un texto, y lo que importa es si las CIFRAS
 * que mueven la obra siguen siendo las del ejemplo. Un total que coincide al
 * centimo con el de la plantilla no es una casualidad de obra.
 */
export function pareceContractualDeEjemplo(costoDirecto: string): boolean {
  return costoDirecto === TOTAL_EJEMPLO;
}

/** La meta son las filas de ejemplo de su plantilla. */
export function pareceMetaDeEjemplo(datos: {
  costoDirectoMeta: string;
  gastosGeneralesMeta: string;
}): boolean {
  return (
    datos.costoDirectoMeta === TOTAL_COSTO_EJEMPLO ||
    datos.gastosGeneralesMeta === TOTAL_GASTOS_EJEMPLO
  );
}

/**
 * Que parte viene del ejemplo, para poder decirlo con precision.
 *
 * Se distingue porque el consejo es distinto: si solo el contractual es de
 * ejemplo, hay que rehacer el presupuesto; si solo la meta, basta con volver
 * a cargarla; y si los dos, la obra entera es una prueba.
 */
export interface OrigenDeEjemplo {
  contractual: boolean;
  meta: boolean;
  /// true si alguna de las dos lo es.
  hay: boolean;
}

export function origenDeEjemplo(datos: {
  costoDirectoContractual: string;
  costoDirectoMeta: string;
  gastosGeneralesMeta: string;
}): OrigenDeEjemplo {
  const contractual = pareceContractualDeEjemplo(datos.costoDirectoContractual);
  const meta = pareceMetaDeEjemplo(datos);
  return { contractual, meta, hay: contractual || meta };
}
