import { dividir, multiplicar, sumar } from "@/lib/decimal";

/**
 * Lo que de verdad cuesta un capitulo que se subcontrata.
 *
 * EL PRIMER ESLABON DE LA CADENA, y hasta ahora faltaba. Una constructora no
 * inventa el costo de un capitulo: se lo cotiza un contratista, y esa
 * cotizacion no termina en la suma de las partidas:
 *
 *     partidas cotizadas ........ 20.000
 *       - 5% de descuento ........ -1.000
 *                                  ------  19.000
 *       + 8% de gastos generales . +1.520
 *       + 10% de utilidad ........ +1.900
 *       = A PAGARLE .............. 22.420
 *
 * Esos 22.420 son el COSTO REAL del capitulo, y es sobre ellos —no sobre los
 * 20.000— sobre lo que se calcula despues el recargo que va al cliente. Son
 * dos cascadas ENCADENADAS y no se mezclan: esta mira a lo que se paga, la
 * del contractual a lo que se cobra.
 *
 * EL ORDEN NO ES NEGOCIABLE Y SE ESCRIBE AQUI: el descuento va primero, y los
 * gastos generales y la utilidad se calculan LOS DOS sobre el importe ya
 * descontado, no uno encima del otro. Es la convencion del formato peruano.
 * Con 5%, 8% y 10% la diferencia entre hacerlo bien y encadenarlos es de 152
 * soles en 20.000: no da error, da una cifra creible y equivocada.
 */

/** Los tres porcentajes de un contratista, tal como se escriben: 5 son 5%. */
export interface AjusteContratista {
  /// Lo que rebaja sobre sus partidas. 5 = 5%.
  descuento: string | null;
  /// Sus gastos generales, sobre el importe ya descontado.
  gastosGenerales: string | null;
  /// Su utilidad, sobre el importe ya descontado.
  utilidad: string | null;
}

export const SIN_AJUSTE: AjusteContratista = {
  descuento: null,
  gastosGenerales: null,
  utilidad: null,
};

/** Si los tres estan vacios o en cero, no hay nada que aplicar. */
export function esNeutro(ajuste: AjusteContratista): boolean {
  return (["descuento", "gastosGenerales", "utilidad"] as const).every((k) => {
    const v = ajuste[k];
    return v === null || v === "" || Number(v) === 0;
  });
}

/**
 * El factor por el que hay que multiplicar cada partida del bloque.
 *
 *     (1 - descuento) * (1 + gastos generales + utilidad)
 *
 * SE DEVUELVE UN FACTOR Y NO UN TOTAL a proposito. El costo tiene que quedar
 * repartido EN LAS PARTIDAS, no en una nota al pie del capitulo, porque el
 * avance se valoriza partida a partida: con las partidas en su precio de
 * cotizacion, terminar la obra entera sumaria 20.000 cuando lo pactado son
 * 22.420, y al contratista no se le llegaria a pagar nunca el 100%.
 *
 * Se calcula a 8 decimales y son necesarios: con 6, repartir un factor entre
 * 400 partidas ya desvia centimos del total, y un presupuesto que no cuadra
 * con la cotizacion que lo origino no se puede defender delante de nadie.
 */
export function factorDe(ajuste: AjusteContratista): string {
  const pct = (v: string | null) =>
    v === null || v === "" ? "0" : (dividir(v, "100", 8) ?? "0");

  const trasDescuento = sumar(["1", `-${pct(ajuste.descuento)}`]);
  const conMargen = sumar([
    "1",
    pct(ajuste.gastosGenerales),
    pct(ajuste.utilidad),
  ]);

  return multiplicar(trasDescuento, conMargen, 8) ?? "1";
}

export interface CascadaContratista {
  /// Lo que suman las partidas tal como las cotizo el contratista.
  cotizado: string;
  /// Lo que rebaja el descuento, en negativo.
  descuento: string;
  /// La base sobre la que se calculan los dos margenes.
  baseDeMargenes: string;
  gastosGenerales: string;
  utilidad: string;
  /// Lo que hay que pagarle. Es el costo real del bloque.
  aPagar: string;
  /// Por cuanto se multiplica cada partida para repartirlo.
  factor: string;
}

/**
 * La cascada entera, paso a paso, para poder ENSENARLA.
 *
 * Se devuelven los cinco tramos y no solo el total porque quien carga el
 * presupuesto tiene delante la cotizacion en papel y necesita comparar linea
 * por linea: si el total no cuadra con el del contratista, la diferencia se
 * ve de un vistazo y no hay que rehacer la cuenta a mano.
 */
export function cascadaDelContratista(
  cotizado: string,
  ajuste: AjusteContratista,
): CascadaContratista {
  const pct = (v: string | null) =>
    v === null || v === "" ? "0" : (dividir(v, "100", 8) ?? "0");

  const descuento = multiplicar(cotizado, `-${pct(ajuste.descuento)}`, 2) ?? "0";
  const base = sumar([cotizado, descuento]);
  const gg = multiplicar(base, pct(ajuste.gastosGenerales), 2) ?? "0";
  const util = multiplicar(base, pct(ajuste.utilidad), 2) ?? "0";

  return {
    cotizado,
    descuento,
    baseDeMargenes: base,
    gastosGenerales: gg,
    utilidad: util,
    aPagar: sumar([base, gg, util]),
    factor: factorDe(ajuste),
  };
}

/**
 * Aplica el factor al precio de una partida.
 *
 * A DOS DECIMALES, que es como se guarda el dinero. El resto que deja el
 * redondeo se absorbe en la ultima partida del bloque: ver `repartir`.
 */
export function ajustarImporte(importe: string, factor: string): string | null {
  return multiplicar(importe, factor, 2);
}

/**
 * Reparte el ajuste entre las partidas de un bloque, SIN perder ni un centimo.
 *
 * Multiplicar cada partida por el factor y redondear deja una diferencia
 * contra el total: con 400 partidas, hasta un par de soles. Y un presupuesto
 * que no cuadra con la cotizacion del contratista obliga a explicar la
 * diferencia en cada reunion.
 *
 * Se corrige donde se corrige siempre: **la ultima partida con importe del
 * bloque absorbe el resto**. Es un centimo arriba o abajo en una sola linea, y
 * a cambio el total cuadra exactamente con el papel que firmo el contratista.
 */
export function repartir(
  importes: readonly (string | null)[],
  ajuste: AjusteContratista,
): (string | null)[] {
  if (esNeutro(ajuste)) return [...importes];

  const factor = factorDe(ajuste);
  const ajustados = importes.map((i) =>
    i === null ? null : (ajustarImporte(i, factor) ?? i),
  );

  const cotizado = sumar(importes.filter((i): i is string => i !== null));
  const objetivo = cascadaDelContratista(cotizado, ajuste).aPagar;
  const suma = sumar(ajustados.filter((i): i is string => i !== null));
  const resto = sumar([objetivo, `-${suma}`]);

  if (Number(resto) === 0) return ajustados;

  for (let i = ajustados.length - 1; i >= 0; i--) {
    const v = ajustados[i];
    if (v !== null && v !== undefined) {
      ajustados[i] = sumar([v, resto]);
      break;
    }
  }
  return ajustados;
}
