import { multiplicar, normalizarDecimal, sumar } from "@/lib/decimal";

/**
 * Cascada del presupuesto de obra.
 *
 * El presupuesto no es la suma de partidas. Sobre el costo directo se
 * aplican, en este orden:
 *
 *   costo directo            suma de las partidas
 *   + descuentos             comerciales, negativos
 *   = subtotal
 *   + gastos generales       % sobre el subtotal
 *   + utilidad               % sobre el subtotal
 *   = PRESUPUESTO (sin IGV)  <- la cifra de control
 *   + IGV                    % sobre el presupuesto
 *   = total general
 *
 * El control de obra se lleva SIN IGV. El IGV que facturan los proveedores
 * es credito fiscal, no costo: incluirlo inflaria el costo con dinero que
 * se recupera y haria creer que el margen es menor del que es.
 */

export interface ParametrosCascada {
  costoDirecto: string;
  /// Negativo. Si llega positivo se interpreta igualmente como descuento.
  descuentos?: string;
  porcentajeGastosGenerales?: string;
  porcentajeUtilidad?: string;
  porcentajeIgv?: string;
}

export interface Cascada {
  costoDirecto: string;
  descuentos: string;
  subtotal: string;
  gastosGenerales: string;
  utilidad: string;
  /// Presupuesto sin IGV: la cifra que se controla.
  presupuesto: string;
  igv: string;
  totalGeneral: string;
}

/**
 * Decimales de trabajo.
 *
 * Los pasos intermedios se calculan con mas precision de la que se muestra
 * y solo se redondea al final. Redondear en cada paso arrastra el error:
 * en un presupuesto de un millon, redondear los gastos generales y la
 * utilidad por separado desplaza el total varios centimos.
 */
const PRECISION_TRABAJO = 6;
const PRECISION_MONEDA = 2;

export function calcularCascada(p: ParametrosCascada): Cascada {
  const descuentos = normalizarDescuento(p.descuentos ?? "0");

  // Se trabaja en alta precision hasta el ultimo paso.
  const subtotalPreciso = sumar([p.costoDirecto, descuentos], PRECISION_TRABAJO);

  const gg =
    multiplicar(subtotalPreciso, p.porcentajeGastosGenerales ?? "0", PRECISION_TRABAJO) ??
    "0";
  const utilidad =
    multiplicar(subtotalPreciso, p.porcentajeUtilidad ?? "0", PRECISION_TRABAJO) ?? "0";

  const presupuestoPreciso = sumar(
    [subtotalPreciso, gg, utilidad],
    PRECISION_TRABAJO,
  );

  const igv =
    multiplicar(presupuestoPreciso, p.porcentajeIgv ?? "0", PRECISION_TRABAJO) ?? "0";

  return {
    costoDirecto: sumar([p.costoDirecto], PRECISION_MONEDA),
    descuentos: sumar([descuentos], PRECISION_MONEDA),
    subtotal: sumar([subtotalPreciso], PRECISION_MONEDA),
    gastosGenerales: sumar([gg], PRECISION_MONEDA),
    utilidad: sumar([utilidad], PRECISION_MONEDA),
    presupuesto: sumar([presupuestoPreciso], PRECISION_MONEDA),
    igv: sumar([igv], PRECISION_MONEDA),
    totalGeneral: sumar([presupuestoPreciso, igv], PRECISION_MONEDA),
  };
}

/** Un descuento siempre resta, se escriba con signo o sin el. */
function normalizarDescuento(valor: string): string {
  const limpio = valor.trim();
  if (limpio === "" || limpio === "0") return "0";
  return limpio.startsWith("-") ? limpio : `-${limpio}`;
}

export interface ComparacionRevisiones {
  diferenciaSoles: string;
  diferenciaDolares: string | null;
  /// true si la revision nueva es mas cara que la anterior.
  encarece: boolean;
}

/**
 * Diferencia entre dos revisiones del presupuesto, en soles y en dolares.
 * Reproduce el cuadro de resumen final del presupuesto.
 */
export function compararRevisiones(
  anterior: string,
  actual: string,
  tipoCambio?: string | null,
): ComparacionRevisiones {
  const diferencia = sumar([anterior, `-${actual}`], PRECISION_MONEDA);
  const encarece = diferencia.startsWith("-");

  let diferenciaDolares: string | null = null;
  if (tipoCambio && tipoCambio !== "0") {
    diferenciaDolares = dividir(diferencia, tipoCambio, PRECISION_MONEDA);
  }

  return { diferenciaSoles: diferencia, diferenciaDolares, encarece };
}

/**
 * Division decimal con la precision pedida.
 *
 * Se implementa aqui y no en el modulo decimal porque la division exacta no
 * existe para todo par de numeros: siempre hay que decidir donde cortar.
 */
function dividir(
  dividendo: string,
  divisor: string,
  decimales: number,
): string | null {
  const d = Number(divisor);
  if (!Number.isFinite(d) || d === 0) return null;

  const n = Number(dividendo);
  if (!Number.isFinite(n)) return null;

  // El tipo de cambio tiene 4 decimales y los importes 2: la magnitud es
  // pequena y el resultado se redondea a centimos, muy lejos del limite de
  // precision de la coma flotante.
  return (n / d).toFixed(decimales);
}

/**
 * Decimales de un porcentaje guardado como fraccion.
 *
 * Coincide con el Decimal(6,4) de la base: cuatro posiciones permiten
 * expresar hasta la centesima de punto porcentual (12.34 % -> 0.1234), muy
 * por debajo de lo que distingue cualquier contrato de obra.
 */
const PRECISION_PORCENTAJE = 4;

/**
 * Porcentaje tal como lo escribe una persona -> fraccion para el calculo.
 *
 * En un presupuesto se lee «gastos generales 12 %», pero la cascada
 * multiplica por 0.12 y la base guarda la fraccion. La conversion se hace
 * con aritmetica exacta y no dividiendo entre cien en coma flotante: en JS
 * `12 / 100` da 0.12 pero `12.1 / 100` da 0.12100000000000001, y ese ruido
 * termina desplazando centimos en la utilidad de un presupuesto de un
 * millon.
 *
 * Devuelve null si la entrada no es un numero valido.
 */
export function porcentajeAFraccion(entrada: string): string | null {
  // Dos decimales en el porcentaje son los cuatro de la fraccion.
  const normalizado = normalizarDecimal(entrada, 2);
  if (normalizado === null) return null;

  return multiplicar(normalizado, "0.01", PRECISION_PORCENTAJE);
}

/**
 * Fraccion guardada -> porcentaje legible: "0.1200" -> "12".
 *
 * Se recortan los ceros de relleno porque el campo del formulario se
 * rellena con este valor y "12.0000 %" invita a corregirlo.
 */
export function fraccionAPorcentaje(fraccion: string): string {
  const valor = multiplicar(fraccion, "100", PRECISION_PORCENTAJE);
  if (valor === null) return "0";

  // Siempre trae parte decimal, asi que recortar los ceros finales no puede
  // comerse un cero significativo de la parte entera.
  return valor.replace(/\.?0+$/, "");
}
