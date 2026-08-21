import {
  esNegativo,
  esPositivo,
  multiplicar,
  normalizarDecimal,
  restar,
  sumar,
} from "@/lib/decimal";

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
  /**
   * Con `restar` y no con `sumar([anterior, \`-${actual}\`])`.
   *
   * Esa forma produce "--26821.60" en cuanto `actual` ya es negativo —y en el
   * presupuesto de CRIOCORD hay un descuento comercial de -26.821,60—, `sumar`
   * la descarta en silencio y devuelve el minuendo intacto. Aqui eso no solo
   * daria una diferencia falsa: alimenta `encarece`, o sea que INVIERTE UN
   * BOOLEANO y la pantalla diria que una revision abarata cuando encarece.
   */
  const diferencia = restar(anterior, actual, PRECISION_MONEDA);

  // Un operando corrupto no tiene diferencia correcta, y devolver una de
  // aspecto normal es justo lo que hay que evitar: se declara sin diferencia.
  if (diferencia === null) {
    return { diferenciaSoles: "0.00", diferenciaDolares: null, encarece: false };
  }

  // `esNegativo` y no `startsWith("-")`: una diferencia de "-0.00" empieza por
  // signo y no es ningun encarecimiento.
  const encarece = esNegativo(diferencia);

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

/**
 * La cascada COMERCIAL: la del presupuesto que se firma con el cliente.
 *
 * Convive con `calcularCascada` en vez de sustituirla, y no es un capricho:
 * las lineas base ya congeladas se calcularon con aquella y guardan su
 * `montoTotal`. Cambiarle el orden a la vieja haria que un contrato firmado
 * contradijera su propio total guardado, sin dar ningun error. Los contratos
 * firmados no se reescriben.
 *
 * EL ORDEN, que es distinto al de la v1 (decision del usuario el 20/08):
 *
 *   costo directo            el contractual, ya recargado capitulo a capitulo
 *   + gastos generales       % sobre el COSTO DIRECTO
 *   + utilidad               % sobre el COSTO DIRECTO
 *   = subtotal
 *   - descuento comercial    % sobre el SUBTOTAL
 *   = VALOR DE VENTA         <- la cifra sin IGV
 *   + IGV                    % sobre el valor de venta
 *   = PRECIO DE VENTA
 *
 * En la v1 el descuento entraba ANTES y arrastraba hacia abajo los gastos
 * generales y la utilidad. Aqui no: el descuento sale entero del bolsillo de
 * la constructora.
 *
 * Los porcentajes son FRACCIONES (0.18 son 18%), como los guarda `Baseline`.
 * El recargo por capitulo, en cambio, se guarda como porcentaje: son dos
 * convenciones distintas y por eso existe `porcentajeAFraccion`.
 */

/**
 * Como se presenta la retencion de renta de cuarta categoria.
 *
 * No es un impuesto que se sume al precio: es una RETENCION sobre el recibo
 * por honorarios de quien emite, y la practica el cliente al pagar (cuando el
 * cliente es empresa; una persona natural no retiene).
 *
 * - NINGUNA:    no aparece. Es lo normal cuando factura una constructora.
 * - DESCONTADA: el precio pactado no cambia y abajo se lee cuanto queda
 *               limpio. Es lo que ocurre de verdad.
 * - SUMADA:     el precio se infla para que, despues de retener, quede limpio
 *               lo que se queria cobrar. El cliente ve un precio mas alto.
 */
export type ModoRetencion = "NINGUNA" | "DESCONTADA" | "SUMADA";

export interface ParametrosComercial {
  /// El costo directo del contractual, ya recargado.
  costoDirecto: string;
  /// Fracciones: 0.18 son 18%.
  porcentajeGastosGenerales?: string;
  porcentajeUtilidad?: string;
  porcentajeDescuento?: string;
  porcentajeIgv?: string;
  retencion?: { modo: ModoRetencion; porcentaje: string };
}

export interface CascadaComercial {
  costoDirecto: string;
  gastosGenerales: string;
  utilidad: string;
  subtotal: string;
  /// Negativo: siempre resta.
  descuento: string;
  /// El presupuesto sin IGV. Es la cifra que se controla.
  valorVenta: string;
  igv: string;
  /// Lo que el cliente paga.
  precioVenta: string;
  /// Lo que el cliente retiene al pagar. Cero si no aplica.
  retencionRenta: string;
  /// Lo que entra limpio despues de la retencion.
  netoARecibir: string;
}

export function calcularCascadaComercial(
  p: ParametrosComercial,
): CascadaComercial {
  const cd = p.costoDirecto;

  // Sobre el COSTO DIRECTO, no sobre el subtotal: el descuento que venga
  // despues no puede rebajar la utilidad ni los gastos generales.
  const gg = multiplicar(cd, p.porcentajeGastosGenerales ?? "0", PRECISION_TRABAJO) ?? "0";
  const utilidad = multiplicar(cd, p.porcentajeUtilidad ?? "0", PRECISION_TRABAJO) ?? "0";
  const subtotal = sumar([cd, gg, utilidad], PRECISION_TRABAJO);

  // El descuento se calcula sobre el subtotal porque es un descuento sobre el
  // PRECIO, no sobre el costo: es la estructura que pide SUNAT para una
  // cotizacion (costo directo + GG + utilidad = valor de venta).
  const descuento = multiplicar(subtotal, p.porcentajeDescuento ?? "0", PRECISION_TRABAJO) ?? "0";
  const valorVenta = restar(subtotal, descuento, PRECISION_TRABAJO) ?? subtotal;

  const igv = multiplicar(valorVenta, p.porcentajeIgv ?? "0", PRECISION_TRABAJO) ?? "0";
  const conIgv = sumar([valorVenta, igv], PRECISION_TRABAJO);

  const modo = p.retencion?.modo ?? "NINGUNA";
  const tasa = p.retencion?.porcentaje ?? "0";

  /**
   * El precio que ve el cliente.
   *
   * En SUMADA se hace el camino inverso a la retencion: se divide entre
   * (1 - tasa) para que, despues de que retengan, quede limpio lo que se
   * queria cobrar. Si la tasa no deja dividir —cero, uno o mayor— se cae a
   * no inflar nada: inventar un precio seria peor que no aplicarlo.
   */
  let precio = conIgv;
  if (modo === "SUMADA") {
    const resto = restar("1", tasa, PRECISION_TRABAJO);
    const inflado = resto !== null && esPositivo(resto)
      ? dividir(conIgv, resto, PRECISION_TRABAJO)
      : null;
    if (inflado !== null) precio = inflado;
  }

  const retencion = modo === "NINGUNA"
    ? "0"
    : (multiplicar(precio, tasa, PRECISION_TRABAJO) ?? "0");

  return {
    costoDirecto: sumar([cd], PRECISION_MONEDA),
    gastosGenerales: sumar([gg], PRECISION_MONEDA),
    utilidad: sumar([utilidad], PRECISION_MONEDA),
    subtotal: sumar([subtotal], PRECISION_MONEDA),
    // Se devuelve en negativo: en la hoja se lee como lo que resta.
    descuento: sumar([multiplicar(descuento, "-1", PRECISION_TRABAJO) ?? "0"], PRECISION_MONEDA),
    valorVenta: sumar([valorVenta], PRECISION_MONEDA),
    igv: sumar([igv], PRECISION_MONEDA),
    precioVenta: sumar([precio], PRECISION_MONEDA),
    retencionRenta: sumar([retencion], PRECISION_MONEDA),
    netoARecibir: sumar([restar(precio, retencion, PRECISION_TRABAJO) ?? precio], PRECISION_MONEDA),
  };
}

/// Tasa de la retencion de cuarta categoria en Peru (recibo por honorarios).
export const TASA_RETENCION_RENTA = "0.0800";

/// Los tres regimenes con los que se puede emitir el contractual.
export type TipoImpuestoContractual = "IGV" | "RENTA" | "NINGUNO";

/**
 * Traduce lo que se guarda en la revision a lo que entiende la cascada.
 *
 * En la base viven `tipoImpuesto` y `retencionAsumida`; la cascada quiere un
 * IGV efectivo y un modo de retencion. La traduccion no es obvia en dos
 * puntos, y por eso vive aqui una sola vez:
 *
 * - Sin IGV cuando no se factura con el: un recibo por honorarios no lo
 *   lleva, asi que el porcentaje guardado se ignora y entra un cero. Dejarlo
 *   pasar cobraria un 18% que nadie va a declarar.
 * - `retencionAsumida` decide QUIEN carga con la retencion, no si existe:
 *   asumida = el precio se infla para que quede limpio lo pactado (SUMADA);
 *   no asumida = el precio no cambia y abajo se lee cuanto queda (DESCONTADA).
 *
 * Estaba escrito a mano en el servicio y en el formulario, y tenian que dar
 * lo mismo o la vista previa mentiria respecto de lo que se iba a guardar.
 * Al aparecer un tercer sitio -la propuesta imprimible- se saco aqui.
 */
export function parametrosDeImpuesto(
  tipoImpuesto: TipoImpuestoContractual,
  porcentajeIgv: string,
  retencionAsumida: boolean,
  porcentajeRetencion: string = TASA_RETENCION_RENTA,
): Pick<ParametrosComercial, "porcentajeIgv" | "retencion"> {
  return {
    porcentajeIgv: tipoImpuesto === "IGV" ? porcentajeIgv : "0.0000",
    retencion:
      tipoImpuesto === "RENTA"
        ? {
            modo: retencionAsumida ? "SUMADA" : "DESCONTADA",
            porcentaje: porcentajeRetencion,
          }
        : undefined,
  };
}
