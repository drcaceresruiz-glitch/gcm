import { LARGO_MAXIMO_CODIGO } from "@/lib/jerarquia-partidas";

/**
 * Cerrar los huecos de la numeracion de un presupuesto.
 *
 * Borrar el capitulo 1 no renumera nada: quedan 2, 3, 4. Esto calcula como
 * quedarian si se cerraran los huecos, y NO toca la base: devuelve el mapa
 * viejo -> nuevo para que quien llame lo aplique y lo verifique.
 *
 * Se renumera siguiendo `parentId` —el arbol que se VE en la tabla— y no el
 * que deduce el codigo. Son dos arboles distintos y en los presupuestos
 * importados a veces discrepan; quien llama debe comprobar despues que el
 * total de la obra no se ha movido, porque el dinero lo reparte el codigo.
 */

export interface NodoRenumerable {
  id: string;
  codigo: string;
  parentId: string | null;
  orden: number;
}

/**
 * Una cabecera de grupo termina en ceros y sus hijas viven a su MISMA
 * profundidad: "4.0" tiene hijas "4.1"; "7.02.00", hijas "7.02.01".
 */
function esCabecera(codigo: string): boolean {
  const segmentos = codigo.split(".");
  return segmentos.length > 1 && Number(segmentos.at(-1)) === 0;
}

/** Los segmentos que una hija hereda de su padre. */
function prefijoDe(codigoPadre: string | null): string[] {
  if (codigoPadre === null) return [];
  const segmentos = codigoPadre.split(".");
  return esCabecera(codigoPadre) ? segmentos.slice(0, -1) : segmentos;
}

/**
 * La forma de un codigo, para conservarla al renumerar.
 *
 * Lo unico que cambia es el NUMERO; el numero de segmentos, la anchura con
 * ceros a la izquierda y el sufijo de cabecera se conservan. Cambiar la forma
 * cambiaria quien cuelga de quien —`codigoPadre` deduce la jerarquia del
 * texto— y con ello quien cubre a quien en el reparto del costo directo.
 */
function indiceNumeral(codigo: string): number {
  const segmentos = codigo.split(".");
  return esCabecera(codigo) ? segmentos.length - 2 : segmentos.length - 1;
}

/** El segmento que lleva el numero de orden dentro de su capitulo. */
function numeralDe(codigo: string): string {
  return codigo.split(".")[indiceNumeral(codigo)] ?? "";
}

/** El sufijo que marca una cabecera de grupo: ".0", ".00". */
function sufijoDe(codigo: string): string[] {
  return esCabecera(codigo) ? codigo.split(".").slice(indiceNumeral(codigo) + 1) : [];
}

/**
 * Con cuantos digitos se numera un grupo de hermanas.
 *
 * Sale del GRUPO y no de cada codigo por separado. Tomandolo de cada uno,
 * "1.10" y "1.9" acababan en "1.01" y "1.2": anchuras mezcladas entre
 * hermanas, que es justo lo que hace ilegible un presupuesto.
 *
 * Y solo cuenta como relleno si lleva un cero a la izquierda: "02" numera a
 * dos digitos, pero "10" es simplemente el numero diez.
 */
function anchoDelGrupo(grupo: readonly NodoRenumerable[]): number {
  let ancho = 1;

  for (const nodo of grupo) {
    const numeral = numeralDe(nodo.codigo);
    if (numeral.startsWith("0") && numeral.length > ancho) ancho = numeral.length;
  }

  return ancho;
}

export interface Renumeracion {
  /// Solo los que cambian: viejo -> nuevo.
  cambios: Map<string, string>;
  /// Por que no se puede, si es que no se puede.
  problema: string | null;
}

/**
 * Calcula la renumeracion que cierra los huecos.
 *
 * Las hermanas se numeran 1..n en el orden en que se ven (`orden`), y cada una
 * conserva su forma. Devuelve `problema` en vez de lanzar cuando el resultado
 * no seria valido: un codigo que no cabe en su columna, o dos filas que
 * acabarian con el mismo codigo.
 */
export function calcularRenumeracion(
  nodos: readonly NodoRenumerable[],
): Renumeracion {
  const hijasDe = new Map<string | null, NodoRenumerable[]>();

  for (const nodo of nodos) {
    const grupo = hijasDe.get(nodo.parentId) ?? [];
    grupo.push(nodo);
    hijasDe.set(nodo.parentId, grupo);
  }

  // El orden en que se ven manda; el codigo desempata para que el resultado
  // sea el mismo siempre, aunque dos filas compartan `orden`.
  for (const grupo of hijasDe.values()) {
    grupo.sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo));
  }

  const nuevos = new Map<string, string>();
  const problemas: string[] = [];

  const recorrer = (padreId: string | null, codigoPadre: string | null) => {
    const prefijo = prefijoDe(codigoPadre);
    const grupo = hijasDe.get(padreId) ?? [];
    const ancho = anchoDelGrupo(grupo);

    grupo.forEach((nodo, indice) => {
      const numeral = String(indice + 1).padStart(ancho, "0");
      const nuevo = [...prefijo, numeral, ...sufijoDe(nodo.codigo)].join(".");

      if (nuevo.length > LARGO_MAXIMO_CODIGO) {
        problemas.push(
          `"${nodo.codigo}" pasaria a "${nuevo}", que no cabe en el codigo.`,
        );
      }

      nuevos.set(nodo.id, nuevo);
      recorrer(nodo.id, nuevo);
    });
  };

  recorrer(null, null);

  // Toda fila tiene que haber recibido codigo. Si alguna se queda fuera, su
  // `parentId` apunta a algo que no esta en la lista y el arbol no es tal.
  if (nuevos.size !== nodos.length) {
    return {
      cambios: new Map(),
      problema:
        "Hay partidas que no cuelgan de ninguna otra de esta obra. " +
        "Renumerar dejaria fuera a unas cuantas.",
    };
  }

  // Biyectivo: dos filas con el mismo codigo reventarian contra el indice
  // unico, y peor aun, una taparia a la otra en el reparto del dinero.
  const vistos = new Map<string, string>();
  for (const [id, codigo] of nuevos) {
    const otro = vistos.get(codigo);
    if (otro !== undefined) {
      problemas.push(`Dos partidas acabarian con el codigo "${codigo}".`);
    }
    vistos.set(codigo, id);
  }

  if (problemas.length > 0) {
    return { cambios: new Map(), problema: problemas[0]! };
  }

  const cambios = new Map<string, string>();
  const codigoPorId = new Map(nodos.map((n) => [n.id, n.codigo]));

  for (const [id, nuevo] of nuevos) {
    if (codigoPorId.get(id) !== nuevo) cambios.set(id, nuevo);
  }

  return { cambios, problema: null };
}
