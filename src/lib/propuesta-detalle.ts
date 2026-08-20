import {
  aportantes,
  calcularProfundidades,
  codigoPadre,
  sumarHojas,
} from "@/lib/jerarquia-partidas";

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

  // El subarbol de cada codigo, incluido el mismo. Se construye subiendo por
  // la cadena de padres una sola vez por linea; el `vistos` protege de un
  // codigo autorreferente por datos corruptos.
  const subarbol = new Map<string, LineaPropuesta[]>();

  for (const linea of lineas) {
    let actual: string | null = linea.codigo;
    const vistos = new Set<string>();

    while (actual !== null && !vistos.has(actual)) {
      vistos.add(actual);
      const rama = subarbol.get(actual);
      if (rama) rama.push(linea);
      else subarbol.set(actual, [linea]);
      actual = codigoPadre(actual, existentes);
    }
  }

  return lineas
    .filter((l) => seVe(l.codigo))
    .map((l) => {
      const rama = subarbol.get(l.codigo) ?? [l];
      const hayVisibleDebajo = rama.some(
        (o) => o.codigo !== l.codigo && seVe(o.codigo),
      );

      const nodos = rama.map((n) => ({ codigo: n.codigo, parcial: n.parcial }));
      const aporta = aportantes(nodos);

      // Sin nada costeado debajo no se inventa un "0.00": un capitulo vacio se
      // deja en blanco, igual que ahora.
      const importe =
        hayVisibleDebajo || aporta.length === 0 ? null : sumarHojas(nodos);

      const esSubtotal = importe !== null && rama.length > 1;

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
