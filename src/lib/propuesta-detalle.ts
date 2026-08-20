import {
  aportantes,
  calcularProfundidades,
  codigoPadre,
  sumarHojas,
} from "@/lib/jerarquia-partidas";
import { dividir, sumar } from "@/lib/decimal";

/**
 * Cuanto detalle se enseña en la propuesta.
 *
 * No es solo esconder filas. Si se ocultan las partidas, el capitulo tiene que
 * pasar a enseñar SU subtotal o el papel se queda sin una sola cifra; y si se
 * enseñan las dos cosas, el capitulo NO puede llevar importe o el cliente suma
 * la columna y cuenta el mismo dinero dos veces.
 *
 * La regla que resuelve las dos a la vez: **una fila enseña importe solo si no
 * tiene ninguna fila visible por debajo**, y ese importe es la suma de sus
 * hojas costeadas. Las filas con importe forman siempre un corte limpio del
 * arbol, asi que el total sale igual a cualquier profundidad. Eso es lo que
 * fija la prueba.
 */

export type NivelDetalle = "capitulos" | "partidas" | "todo";

export interface LineaPropuesta {
  codigo: string;
  descripcion: string;
  unidad: string | null;
  metrado: string | null;
  precioUnitario: string | null;
  parcial: string | null;
  nivel: number;
  /// Los capitulos son titulos: no llevan cifra propia.
  esCapitulo: boolean;
}

export interface LineaDetalle extends LineaPropuesta {
  /// El importe que se PINTA. null = esta fila no lleva cifra.
  importe: string | null;
  /// El importe cubre filas que no se ven. Se pinta como subtotal, y se
  /// callan metrado y precio unitario: no son de una sola partida.
  esSubtotal: boolean;
}

/// Profundidad maxima que se enseña. `calcularProfundidades` cuenta desde 0,
/// asi que un capitulo es 0 y una partida 1.
const TOPE: Record<NivelDetalle, number> = {
  capitulos: 0,
  partidas: 1,
  todo: Number.POSITIVE_INFINITY,
};

export function aplicarDetalle(
  lineas: readonly LineaPropuesta[],
  nivel: NivelDetalle,
): LineaDetalle[] {
  const codigos = lineas.map((l) => l.codigo);
  const existentes = new Set(codigos);
  const profundidad = calcularProfundidades(codigos);
  const tope = TOPE[nivel];

  const seVe = (codigo: string) => (profundidad.get(codigo) ?? 0) <= tope;

  // Los que de verdad ponen dinero. Es el MISMO criterio con el que se calcula
  // el costo directo de la obra, asi que la columna no puede sumar otra cosa.
  const aporta = aportantes(
    lineas.map((l) => ({ codigo: l.codigo, parcial: l.parcial })),
  );

  const esAportante = new Set(aporta.map((a) => a.codigo));

  /**
   * Cada aportante se cuelga de su ancestro VISIBLE mas profundo.
   *
   * Asi cada importe se cuenta una vez y solo una, se enseñe el detalle que se
   * enseñe.
   *
   * La regla anterior era "una fila lleva cifra si no tiene ninguna visible
   * debajo", y PERDIA DINERO: una partida a suma alzada con hijas descriptivas
   * -que no llevan importe propio- se quedaba sin cifra porque sus hijas se
   * veian, y las hijas no tenian nada que enseñar. En el presupuesto real de
   * 347 partidas eso escondia 9.711,05 de la columna sin dar ningun error.
   */
  const reparto = new Map<string, string[]>();

  for (const a of aporta) {
    let destino = a.codigo;
    const vistos = new Set<string>();

    while (!seVe(destino) && !vistos.has(destino)) {
      vistos.add(destino);
      const padre = codigoPadre(destino, existentes);
      if (padre === null) break;
      destino = padre;
    }

    const lista = reparto.get(destino);
    if (lista) lista.push(a.parcial!);
    else reparto.set(destino, [a.parcial!]);
  }

  return lineas
    .filter((l) => seVe(l.codigo))
    .map((l) => {
      const suyos = reparto.get(l.codigo) ?? [];

      // Sin nada colgado no se inventa un "0.00": un capitulo vacio se deja en
      // blanco, que es lo que dice la verdad.
      const importe = suyos.length === 0 ? null : sumar(suyos, 2);

      // Es subtotal salvo que lo unico que lleve sea su propio importe.
      const esSubtotal =
        importe !== null &&
        !(suyos.length === 1 && esAportante.has(l.codigo));

      return {
        ...l,
        importe,
        esSubtotal,
        // Un subtotal no tiene metrado ni precio unitario propios: son de las
        // partidas que quedaron debajo, y enseñar los de una sola mentiria.
        metrado: esSubtotal ? null : l.metrado,
        precioUnitario: esSubtotal ? null : l.precioUnitario,
        unidad: esSubtotal ? null : l.unidad,
      };
    });
}

/**
 * La moneda en la que se emite.
 *
 * En la base TODO el dinero esta en soles: no hay campo de moneda en ninguna
 * parte. Lo que si hay es el `tipoCambio` de la revision, cuyo comentario en
 * el esquema dice exactamente para que existe -"para expresar el presupuesto
 * en dolares"-, asi que la moneda es una decision de PRESENTACION, como el
 * impuesto: no cambia lo guardado.
 *
 * Sin tipo de cambio en la revision NO se puede emitir en dolares. Inventar
 * una cotizacion del dia seria poner un precio que nadie ha pactado.
 */
export type Moneda = "PEN" | "USD";

export const SIMBOLO: Record<Moneda, string> = {
  PEN: "S/",
  USD: "US$",
};

/**
 * Pasa las lineas a dolares dividiendo por el tipo de cambio.
 *
 * Se convierten las LINEAS, no el total: asi la columna sigue sumando
 * exactamente el costo directo que se imprime abajo. Convertir el total por
 * separado dejaria una diferencia de centimos entre la suma de la columna y
 * la cifra del resumen, que en un papel que firma un cliente es un error.
 *
 * El precio unitario va a 4 decimales y el parcial a 2, la misma regla que en
 * soles: redondear el unitario a centimos desvia el parcial en cuanto el
 * metrado es grande.
 */
export function convertirLineas(
 lineas: readonly LineaPropuesta[],
  tipoCambio: string,
): LineaPropuesta[] {
  const enMoneda = (valor: string | null, escala: number) =>
    valor === null ? null : dividir(valor, tipoCambio, escala);

  return lineas.map((l) => ({
    ...l,
    precioUnitario: enMoneda(l.precioUnitario, 4),
    parcial: enMoneda(l.parcial, 2),
  }));
}

/// El costo directo que de verdad suma la columna, en la moneda que sea.
export function costoDirectoDeLineas(lineas: readonly LineaPropuesta[]): string {
  return sumarHojas(lineas.map((l) => ({ codigo: l.codigo, parcial: l.parcial })));
}
