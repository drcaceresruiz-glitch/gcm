/**
 * Las columnas de la tabla del presupuesto.
 *
 * Un descriptor y no marcado suelto porque cabecera y celdas tienen que
 * ocultarse a la vez: si se llevan por separado, esconder una acaba
 * desplazando toda la fila un hueco sin que salte nada.
 */

export interface Columna {
  clave: string;
  etiqueta: string;
  /**
   * Las que no se pueden ocultar. Sin codigo no se sabe de que partida se
   * habla, sin descripcion no se sabe que es, y sin importe la tabla deja de
   * ser un presupuesto.
   */
  fija: boolean;
  alineadaDerecha: boolean;
}

/**
 * Los dos campos van escritos en todas las entradas, aunque sean `false`.
 * Con `as const` y propiedades omitidas, TypeScript da a cada entrada un
 * tipo distinto y `c.fija` deja de existir en la mitad de ellas.
 */
export const COLUMNAS = [
  { clave: "codigo", etiqueta: "Código", fija: true, alineadaDerecha: false },
  { clave: "descripcion", etiqueta: "Descripción", fija: true, alineadaDerecha: false },
  { clave: "modalidad", etiqueta: "Modalidad", fija: false, alineadaDerecha: false },
  { clave: "unidad", etiqueta: "Und.", fija: false, alineadaDerecha: false },
  { clave: "metrado", etiqueta: "Metrado", fija: false, alineadaDerecha: true },
  { clave: "precioUnitario", etiqueta: "P. Unitario", fija: false, alineadaDerecha: true },
  { clave: "parcial", etiqueta: "Parcial", fija: true, alineadaDerecha: true },
] as const satisfies readonly Columna[];

export type ClaveColumna = (typeof COLUMNAS)[number]["clave"];

/** Lo que se esconde de entrada en una pantalla estrecha. */
export const OCULTAS_EN_MOVIL: ClaveColumna[] = [
  "modalidad",
  "unidad",
  "metrado",
  "precioUnitario",
];
