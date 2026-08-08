import { esNegativo, multiplicar, normalizarDecimal, sumar } from "@/lib/decimal";

/**
 * La aritmetica de una orden de compra.
 *
 * Dos reglas, las dos sacadas de las ordenes reales del cliente y las dos
 * capaces de descuadrar el costo en silencio si se hacen mal.
 *
 * LA PRIMERA: las lineas tienen jerarquia y las cabeceras REPITEN la suma de
 * sus hijas. En la orden de FCM, "TOTAL ESTRUCTURAS 34,800.00" va seguida de
 * siete lineas que suman exactamente 34,800; la de SIV AIRE llega a tres
 * niveles. Sumar en plano cuenta ese dinero dos y tres veces. Es el mismo
 * fallo de las celdas combinadas que costo cuadrar el presupuesto del Excel.
 *
 * LA SEGUNDA: el costo de obra es el NETO, sin IGV. El IGV que factura el
 * proveedor es credito fiscal y se recupera; meterlo en el costo inflaria la
 * obra con dinero que vuelve.
 */

/** Una linea tal como se teclea, antes de guardarse. */
export interface LineaOrden {
  /// true si repite la suma de sus hijas. Esas lineas NO suman.
  esAgrupador: boolean;
  importe: string;
}

/**
 * Suma de las lineas que de verdad llevan dinero.
 *
 * Las agrupadoras se descartan. Si alguna vez se quita esta funcion de en
 * medio y se suma la lista entera, el subtotal saldra al doble sin que nada
 * falle: no hay error, solo una cifra mas alta.
 */
export function sumarLineas(lineas: readonly LineaOrden[]): string {
  return sumar(lineas.filter((l) => !l.esAgrupador).map((l) => l.importe));
}

export interface CascadaOrden {
  subtotal: string;
  descuentoComercial: string;
  /// Lo que cuesta la obra. Contra esto se mide el comprometido.
  neto: string;
  igv: string;
  /// Lo que sale del banco.
  total: string;
}

/**
 * La cascada del papel:
 *
 *     SUB-TOTAL 1
 *   - DESCUENTO COMERCIAL
 *   = SUB-TOTAL 2   <- el neto
 *   + IGV 18 %
 *   = TOTAL
 *
 * El descuento se recibe en positivo, que es como se lee en el documento, y
 * se resta aqui. En la orden de CABREJO sirve para redondear: 11,564.05 menos
 * 564.05 deja un neto limpio de 11,000.00.
 */
export function calcularCascadaOrden(datos: {
  subtotal: string;
  descuentoComercial?: string;
  /// Fraccion, no porcentaje: "0.18". La traduccion vive en la frontera,
  /// igual que en el presupuesto.
  porcentajeIgv: string;
}): CascadaOrden {
  const subtotal = sumar([datos.subtotal]);
  const descuento = sumar([datos.descuentoComercial ?? "0"]);

  // Se resta multiplicando por -1 y sumando: `lib/decimal` no tiene resta, y
  // anteponer un "-" al texto produce "--564.05" cuando el valor ya es
  // negativo, que `sumar` descarta EN SILENCIO.
  const neto = sumar([subtotal, multiplicar(descuento, "-1", 2) ?? "0"]);

  // Seis decimales antes de redondear, como la cascada del presupuesto:
  // redondear en cada paso desplaza el total varios centimos.
  const igv = sumar([multiplicar(neto, datos.porcentajeIgv, 6) ?? "0"], 2);

  return {
    subtotal,
    descuentoComercial: descuento,
    neto,
    igv,
    total: sumar([neto, igv]),
  };
}

/**
 * Comprueba la invariante que sostiene el modulo: el reparto contra el
 * presupuesto tiene que sumar exactamente el neto de la orden.
 *
 * Es el equivalente a "una reconversion suma cero". Sin ella, el comprometido
 * de las partidas no cuadraria con lo que de verdad se pidio al proveedor, y
 * el descuadre solo se veria al sumar la obra entera.
 *
 * Devuelve null si cuadra, y si no, la diferencia con signo: positivo si se
 * reparte de mas.
 */
export function descuadreDelReparto(
  neto: string,
  imputaciones: readonly string[],
): string | null {
  const repartido = sumar([...imputaciones]);
  const diferencia = sumar([repartido, multiplicar(neto, "-1", 2) ?? "0"]);

  // `esCero` no vale aqui: hay que distinguir "cuadra" de "no es un numero",
  // y un importe corrupto no debe pasar por cuadrado.
  const cuadra = diferencia === "0.00";
  return cuadra ? null : diferencia;
}

/**
 * Normaliza un importe que viene de un formulario, aceptando el formato
 * peruano. Devuelve null si no es un numero o si es negativo: una orden no
 * lleva importes en negativo, y el descuento comercial se escribe aparte y
 * en positivo.
 */
export function importeDeOrden(entrada: string): string | null {
  const valor = normalizarDecimal(entrada, 2);
  if (valor === null) return null;
  return esNegativo(valor) ? null : valor;
}
