import {
  dividir,
  esNegativo,
  multiplicar,
  normalizarDecimal,
  sumar,
} from "@/lib/decimal";

/**
 * Que impuesto lleva la orden. Espeja el enum del esquema; se declara aqui
 * para que `lib/` no dependa del cliente de Prisma.
 */
export type TipoImpuesto = "IGV" | "RENTA" | "NINGUNO";

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
 * LA SEGUNDA: contra que cifra cuenta la orden depende del IMPUESTO. Con IGV
 * el costo es el NETO, porque el IGV es credito fiscal y se recupera; meterlo
 * en el costo inflaria la obra con dinero que vuelve. Con retencion de renta
 * es al reves: no se recupera, sale y no vuelve, asi que el costo es el
 * TOTAL. Tratar una retencion como si fuera IGV deja fuera del costo un 8 %
 * que si se paga.
 */

/** Los tres estados por los que pasa una orden. */
export type EstadoDeOrden = "BORRADOR" | "APROBADA" | "ANULADA";

/**
 * Que permiso hace falta para BORRAR una orden en cada estado, o `null` si no
 * se puede borrar.
 *
 * La regla que sostiene esto: el comprometido solo cuenta las APROBADAS, asi
 * que borrar un borrador o una anulada no revierte ninguna cifra —ya valian
 * cero— y lo unico que se pierde es el registro. Una aprobada SI cuenta, y
 * para dejar de contar existe anular, que ademas conserva la orden con su
 * motivo. Por eso una aprobada no se borra nunca.
 *
 * El permiso cambia con el estado a proposito: descartar un borrador es parte
 * de redactarlo, mientras que purgar una anulada destruye historia de la obra
 * y va con el mismo permiso que anularla.
 *
 * Vive aqui, con las demas reglas del modulo, para que se pueda probar sin
 * base de datos: es una decision, no una consulta.
 */
export function permisoParaEliminar(
  estado: EstadoDeOrden,
): "orden:crear" | "orden:anular" | null {
  if (estado === "BORRADOR") return "orden:crear";
  if (estado === "ANULADA") return "orden:anular";
  return null;
}

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
  /// El subtotal ya descontado. Con IGV, es ademas el costo de obra.
  neto: string;
  /// El IGV o la retencion, segun el tipo. Nunca las dos cosas.
  impuesto: string;
  /// Lo que sale del banco.
  total: string;
}

/**
 * La cifra contra la que se imputa la orden al presupuesto.
 *
 * Es LA regla del modulo, en una sola linea y en un solo sitio para que no
 * pueda divergir entre el formulario, el servicio y el documento.
 */
export function importeImputable(orden: {
  tipoImpuesto: TipoImpuesto;
  neto: string;
  total: string;
}): string {
  // Solo el IGV se recupera. Todo lo demas que salga del banco es costo.
  return orden.tipoImpuesto === "IGV" ? orden.neto : orden.total;
}

/**
 * La cascada del papel:
 *
 *     SUB-TOTAL 1
 *   - DESCUENTO COMERCIAL
 *   = SUB-TOTAL 2   <- el neto
 *   +/- IMPUESTO
 *   = TOTAL
 *
 * El descuento se recibe en positivo, que es como se lee en el documento, y
 * se resta aqui. En la orden de CABREJO sirve para redondear: 11,564.05 menos
 * 564.05 deja un neto limpio de 11,000.00.
 *
 * El ultimo paso NO es el mismo en los dos impuestos, y ahi esta el detalle
 * que hay que mirar dos veces:
 *
 * - **IGV**: se calcula SOBRE el neto y se suma. 11,000 x 18 % = 1,980, total
 *   12,980. El proveedor cobra los 12,980 enteros.
 * - **RENTA**: se calcula sobre el TOTAL, no sobre el neto, porque lo pactado
 *   es lo que el proveedor cobra LIMPIO. El total sale de dividir el neto
 *   entre (1 - tasa) y la retencion es la diferencia. En la OC 00119:
 *   29,000 / 0.92 = 31,521.74, y la retencion son 2,521.74, que es el 8 %
 *   del total y no del neto. Calcularlo como el IGV daria 2,320 y al
 *   proveedor le faltarian 201.74.
 */
export function calcularCascadaOrden(datos: {
  subtotal: string;
  descuentoComercial?: string;
  tipoImpuesto?: TipoImpuesto;
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

  const tipo = datos.tipoImpuesto ?? "IGV";
  const { impuesto, total } = calcularImpuesto(tipo, neto, datos.porcentajeIgv);

  return { subtotal, descuentoComercial: descuento, neto, impuesto, total };
}

function calcularImpuesto(
  tipo: TipoImpuesto,
  neto: string,
  tasa: string,
): { impuesto: string; total: string } {
  if (tipo === "NINGUNO") return { impuesto: "0.00", total: neto };

  if (tipo === "IGV") {
    // Seis decimales antes de redondear, como la cascada del presupuesto:
    // redondear en cada paso desplaza el total varios centimos.
    const impuesto = sumar([multiplicar(neto, tasa, 6) ?? "0"], 2);
    return { impuesto, total: sumar([neto, impuesto]) };
  }

  // RENTA: el total es el neto elevado para que, tras retener, al proveedor
  // le quede el neto limpio.
  const restante = sumar([multiplicar(tasa, "-1", 6) ?? "0", "1"], 6);

  // Una tasa del 100 % dejaria el divisor en cero. No es un caso real, pero
  // devolver el neto sin tocar es preferible a propagar un null.
  const total = dividir(neto, restante, 2);
  if (total === null) return { impuesto: "0.00", total: neto };

  // La retencion es la diferencia y no un producto: asi el total menos la
  // retencion da el neto EXACTO, sin un centimo de desvio por redondeo.
  return {
    impuesto: sumar([total, multiplicar(neto, "-1", 2) ?? "0"]),
    total,
  };
}

/**
 * Comprueba la invariante que sostiene el modulo: el reparto contra el
 * presupuesto tiene que sumar exactamente el importe imputable de la orden.
 *
 * Es el equivalente a "una reconversion suma cero". Sin ella, el comprometido
 * de las partidas no cuadraria con lo que de verdad se pidio al proveedor, y
 * el descuadre solo se veria al sumar la obra entera.
 *
 * El imputable NO es siempre el neto: con retencion de renta es el total.
 * Quien llame aqui debe pasar lo que devuelva `importeImputable`, nunca el
 * neto a pelo, o las ordenes con retencion cuadraran contra la cifra
 * equivocada.
 *
 * Devuelve null si cuadra, y si no, la diferencia con signo: positivo si se
 * reparte de mas.
 */
export function descuadreDelReparto(
  imputable: string,
  imputaciones: readonly string[],
): string | null {
  const repartido = sumar([...imputaciones]);
  const diferencia = sumar([repartido, multiplicar(imputable, "-1", 2) ?? "0"]);

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

/**
 * La etiqueta del impuesto en el documento impreso: "IGV 18%", "IR 8%", o el
 * nombre a secas cuando la tasa no se deduce con seguridad.
 *
 * La tasa no se guarda, se deduce dividiendo, y cada impuesto se deduce
 * contra SU base: el IGV sobre el neto, la retencion sobre el total. Usarlas
 * al reves imprimiria 8.7 % donde el papel dice 8 %.
 *
 * Aqui SI se usa coma flotante a proposito: no se esta calculando dinero, se
 * esta eligiendo un texto, y ninguna cifra que salga de aqui se suma a nada.
 *
 * Cuando la division no da una tasa entera reconocible se omite el
 * porcentaje. Es preferible un documento que dice menos a uno que le declara
 * al proveedor una tasa que no es la que se le esta aplicando.
 */
export function etiquetaImpuesto(
  tipo: TipoImpuesto,
  cascada: { neto: string; impuesto: string; total: string },
): string {
  if (tipo === "NINGUNO") return "IMPUESTO";

  const nombre = tipo === "IGV" ? "IGV" : "IR";
  const base = Number(tipo === "IGV" ? cascada.neto : cascada.total);
  const impuesto = Number(cascada.impuesto);

  if (!Number.isFinite(base) || !Number.isFinite(impuesto)) return nombre;
  // Sin base no hay tasa que deducir, y dividir daria Infinity o NaN.
  if (base === 0) return nombre;

  const tasa = (impuesto / base) * 100;
  const redondeada = Math.round(tasa);

  // Una tasa de 0 % es real —hay operaciones exoneradas— pero "IGV 0%" y
  // "IGV" con importe 0.00 dicen lo mismo, y el segundo no invita a
  // preguntar.
  if (redondeada <= 0) return nombre;

  return Math.abs(tasa - redondeada) < 0.01
    ? `${nombre} ${redondeada}%`
    : nombre;
}
