import { esCero, multiplicar, normalizarDecimal, sumar } from "@/lib/decimal";

/**
 * Las cuentas del presupuesto meta, TODAS desde la misma lista.
 *
 * NACE DE UN FALLO REAL, visto el 23 de agosto de 2026. Hasta ese dia la meta
 * llevaba dos listas: los items (hoja «Costo Directo») y una tabla aparte de
 * gastos generales (hoja «Gastos Generales»), cada una con su parser, su
 * tabla y su suma. La pantalla del contractual mostraba un costo total de
 * 600 cuando de verdad eran 700: el sueldo del residente estaba escrito en el
 * Excel, se veia en su hoja, y valia cero en la cuenta. La obra no perdia 200
 * sino 300, y el recargo minimo no era 50 % sino 75 %.
 *
 * La causa concreta se cerro, pero la FORMA de la causa no: mientras hubiera
 * dos listas y dos sumas, una podia quedarse en cero sin que nada chirriara
 * —bastaba con que la hoja no estuviera, y el lector devolvia cero sin un solo
 * error—. Asi que se quito la segunda lista en vez de vigilarla.
 *
 * UN SUELDO YA SE SABIA ESCRIBIR. Un gasto general variable es `meses x monto
 * mensual`, y eso es exactamente `metrado x precio unitario` con la unidad en
 * «mes». No hizo falta un concepto nuevo: hizo falta dejar de tener dos.
 *
 * Todo lo que se puede saber del costo de una meta sale de aqui, de una
 * pasada sobre una unica lista. Dos cifras que salen de la misma funcion no
 * se pueden desincronizar.
 */

/** Lo minimo que hace falta de una linea para sacar las cuentas. */
export interface LineaCosteable {
  /// `null` = linea PROPIA de la meta: cuesta, pero no se le factura al
  /// cliente linea a linea. Ahi viven los sueldos, los alquileres y las
  /// polizas.
  codigoRef: string | null;
  unidad?: string | null;
  /// En una linea por meses, lo que cuesta CADA MES.
  precioUnitario?: string | null;
  parcial: string | null;
}

export interface CifrasMeta {
  /// Suma de las lineas CON codigo: el costo directo en el sentido del
  /// oficio, lo que el contrato desglosa partida a partida.
  costoDirecto: string;
  /// Suma de las lineas SIN codigo: sueldos, alquileres, polizas, fianzas.
  /// Cuesta igual, pero no se le desglosa al cliente.
  costoPropio: string;
  /// Lo que la obra cuesta de verdad. Es la cifra contra la que se mide la
  /// bolsa operativa, y por eso no puede dejarse fuera nada que se pague.
  costoTotal: string;
  /// Lo que cuesta CADA MES de mas: la suma de los precios unitarios de las
  /// lineas propias medidas en meses.
  ///
  /// Es la cifra que convierte «vamos tres semanas tarde» en dinero. Un
  /// importe cerrado no se puede repartir hacia atras; por eso interesa que
  /// un sueldo se escriba como 8 meses x 6.500 y no como 52.000 a secas.
  costeMensualDelAtraso: string;
  /// Cuantas lineas propias se pagan por mes. Sirve para no prometer un
  /// coste de atraso cuando no hay de donde sacarlo.
  lineasPorMes: number;
}

/**
 * Si una unidad significa «al mes».
 *
 * Se acepta singular y plural y se ignoran mayusculas y espacios, porque esto
 * lo teclea una persona en un Excel. No se acepta «mensual» ni «m»: la
 * primera casi no se escribe en la columna de unidad y la segunda es metro.
 */
export function esPorMes(unidad: string | null): boolean {
  const u = (unidad ?? "").trim().toLowerCase();
  return u === "mes" || u === "meses";
}

/** El parcial de una linea, o `null` si no se puede saber. */
function parcialDe(l: LineaCosteable): string | null {
  return l.parcial === null || l.parcial === "" ? null : l.parcial;
}

/** Todas las cuentas de una meta, de una sola pasada. */
export function cifrasDeLaMeta(
  lineas: readonly LineaCosteable[],
): CifrasMeta {
  const conImporte = lineas.filter((l) => parcialDe(l) !== null);

  const costoDirecto = sumar(
    conImporte.filter((l) => l.codigoRef !== null).map((l) => parcialDe(l)!),
  );
  const costoPropio = sumar(
    conImporte.filter((l) => l.codigoRef === null).map((l) => parcialDe(l)!),
  );

  const porMes = lineas.filter(
    (l) =>
      l.codigoRef === null &&
      esPorMes(l.unidad ?? null) &&
      l.precioUnitario !== null &&
      l.precioUnitario !== undefined,
  );

  return {
    costoDirecto,
    costoPropio,
    costoTotal: sumar([costoDirecto, costoPropio]),
    costeMensualDelAtraso: sumar(porMes.map((l) => l.precioUnitario!)),
    lineasPorMes: porMes.length,
  };
}

/**
 * Lo que costaria estirar la obra unos meses mas.
 *
 * Devuelve `null` -y no cero- cuando no hay ninguna linea por meses: cero
 * diria «alargarse no cuesta nada», que es justo lo contrario de lo que pasa
 * y la mentira mas cara que esta pantalla puede contar.
 */
export function sobrecostePorMesesDeMas(
  cifras: CifrasMeta,
  meses: string,
): string | null {
  if (cifras.lineasPorMes === 0) return null;
  if (esCero(cifras.costeMensualDelAtraso)) return null;

  const m = normalizarDecimal(meses, 2);
  if (m === null) return null;

  return multiplicar(cifras.costeMensualDelAtraso, m, 2);
}
