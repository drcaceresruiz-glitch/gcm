import { sumar } from "@/lib/decimal";

/**
 * Jerarquia de codigos de partida.
 *
 * Conviven varias convenciones en los presupuestos reales:
 *   "4.0"      capitulo, hijas "4.1", "4.2"
 *   "01.02"    subcapitulo S10, hijas "01.02.01"
 *   "7.02.00"  cabecera de grupo, hijas "7.02.01" (misma profundidad)
 *
 * La tercera es la que rompe la intuicion: "7.02.00" y "7.02.01" tienen el
 * mismo numero de segmentos, asi que parecen hermanas, pero la terminacion
 * en ceros marca que la primera encabeza al resto.
 */

/** Devuelve el codigo del padre, o null si el nodo cuelga de la raiz. */
export function codigoPadre(
  codigo: string,
  existentes: ReadonlySet<string>,
): string | null {
  const segmentos = codigo.split(".");
  const ultimo = segmentos.at(-1) ?? "";

  // Una cabecera de grupo ("7.02.00") no cuelga de su propio grupo, sino
  // del nivel superior. Sin esto se colgaria de si misma.
  const esCabeceraDeGrupo = segmentos.length > 1 && Number(ultimo) === 0;

  if (!esCabeceraDeGrupo && segmentos.length >= 2) {
    // Hermana con la misma profundidad terminada en ceros: "7.02.01" -> "7.02.00".
    const hermanaCabecera = [...segmentos.slice(0, -1), "0".repeat(ultimo.length)].join(".");
    if (existentes.has(hermanaCabecera)) return hermanaCabecera;

    // La misma idea con un solo cero, por si el ancho no coincide.
    const conUnCero = [...segmentos.slice(0, -1), "0"].join(".");
    if (existentes.has(conUnCero)) return conUnCero;
  }

  if (segmentos.length < 2) return null;

  // Nivel superior directo: "01.02.01" -> "01.02".
  const recorte = esCabeceraDeGrupo ? segmentos.slice(0, -2) : segmentos.slice(0, -1);
  if (recorte.length === 0) return null;

  const directo = recorte.join(".");
  if (existentes.has(directo)) return directo;

  // El nivel superior tambien puede ser una cabecera terminada en cero.
  const ultimoRecorte = recorte.at(-1) ?? "";
  const comoCabecera = [...recorte.slice(0, -1), ultimoRecorte, "0"].join(".");
  if (existentes.has(comoCabecera)) return comoCabecera;

  return null;
}

export interface NodoImporte {
  codigo: string;
  parcial: string | null;
}

/**
 * Suma el presupuesto contando solo las hojas costeadas.
 *
 * El costo de una rama es la suma de sus hojas. Cuando un grupo lleva su
 * propio importe a suma alzada Y ademas sus hijas tienen importes, sumar
 * ambos cuenta el mismo dinero dos veces: en el presupuesto de CRIOCORD eso
 * inflaba el total de 754 mil a 1.8 millones.
 *
 * Un nodo cuenta si tiene importe y ninguna de sus descendientes lo tiene.
 */
export function sumarHojas(nodos: readonly NodoImporte[]): string {
  const codigos = new Set(nodos.map((n) => n.codigo));
  const tieneImporte = new Map(nodos.map((n) => [n.codigo, n.parcial !== null]));

  // Ancestros que quedan cubiertos por alguna descendiente con importe.
  const cubiertos = new Set<string>();

  for (const nodo of nodos) {
    if (!tieneImporte.get(nodo.codigo)) continue;

    let padre = codigoPadre(nodo.codigo, codigos);
    while (padre) {
      cubiertos.add(padre);
      padre = codigoPadre(padre, codigos);
    }
  }

  return sumar(
    nodos
      .filter((n) => n.parcial !== null && !cubiertos.has(n.codigo))
      .map((n) => n.parcial!),
  );
}

export interface NodoRepetible extends NodoImporte {
  fila: number;
  precioUnitario: string | null;
}

export interface GrupoRepetido {
  /// Filas del Excel implicadas, en orden.
  filas: number[];
  codigos: string[];
  importe: string;
}

/**
 * Detecta importes repetidos en filas consecutivas.
 *
 * Sintoma clasico de una formula arrastrada en Excel sin ajustar las
 * referencias: todas las filas de un grupo acaban mostrando el importe de
 * la primera. En el presupuesto de CRIOCORD, las ocho partidas de DRYWALL
 * mostraban 79.727,33 cada una, mientras el total del capitulo sumaba solo
 * la primera; propagarlo habria inflado el presupuesto en 637 mil soles.
 *
 * No se corrige por cuenta propia: dos partidas pueden costar lo mismo de
 * forma legitima. Se detecta, se avisa y decide una persona.
 */
export function detectarImportesRepetidos(
  nodos: readonly NodoRepetible[],
): GrupoRepetido[] {
  const grupos: GrupoRepetido[] = [];
  let racha: NodoRepetible[] = [];

  const cerrar = () => {
    if (racha.length >= 2 && racha[0]!.parcial) {
      grupos.push({
        filas: racha.map((r) => r.fila),
        codigos: racha.map((r) => r.codigo),
        importe: racha[0]!.parcial,
      });
    }
    racha = [];
  };

  for (const nodo of nodos) {
    const previo = racha.at(-1);

    const continuaLaRacha =
      previo !== undefined &&
      nodo.parcial !== null &&
      nodo.parcial === previo.parcial &&
      nodo.precioUnitario === previo.precioUnitario &&
      nodo.fila === previo.fila + 1;

    if (continuaLaRacha) {
      racha.push(nodo);
      continue;
    }

    cerrar();
    if (nodo.parcial !== null) racha = [nodo];
  }

  cerrar();
  return grupos;
}
