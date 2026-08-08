/**
 * Filtrado del arbol de partidas.
 *
 * Con 314 filas, buscar es mas rapido que desplegar capitulos a mano. Pero
 * una tabla jerarquica no se filtra como una lista: si se pintan solo las
 * filas que coinciden, `11.02.04` aparece suelta y no dice de que capitulo
 * cuelga ni contra que subtotal cuenta. **Cada coincidencia arrastra a sus
 * ancestros.**
 */

export interface FilaFiltrable {
  id: string;
  codigoPartida: string;
  descripcion: string;
  nivel: number;
}

export interface ResultadoFiltro {
  /// Las que coinciden de verdad. Sirven para el recuento y para resaltarlas.
  coincidencias: Set<string>;
  /// Las que hay que pintar: las coincidencias mas sus ancestros.
  visibles: Set<string>;
}

/** Marcas diacriticas combinables, U+0300 a U+036F. Se construye desde una
 *  cadena escapada para que este fichero siga siendo ASCII. */
const DIACRITICOS = new RegExp("[\\u0300-\\u036F]", "g");

/**
 * Minusculas y sin tildes.
 *
 * El presupuesto viene del Excel del cliente en mayusculas y con tildes
 * —«TABIQUERIA», «CARPINTERIA METALICA»—, y nadie las teclea al buscar.
 */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(DIACRITICOS, "").toLowerCase().trim();
}

/**
 * Devuelve que filas mostrar, o `null` si no hay nada que filtrar.
 *
 * El `null` obliga a distinguir «sin filtro» de «filtro sin resultados»: son
 * dos pantallas distintas y confundirlas deja la tabla vacia sin explicar
 * por que.
 *
 * Un capitulo que coincide por su nombre NO arrastra a sus hijas. Buscar
 * «mampara» con un capitulo llamado «CARPINTERIA DE ALUMINIO Y MAMPARAS»
 * volcaria sus cuarenta partidas encima de las que se buscaban.
 */
export function filtrarPartidas<T extends FilaFiltrable>(
  filas: T[],
  consulta: string,
): ResultadoFiltro | null {
  const buscado = normalizar(consulta);
  if (buscado === "") return null;

  const coincidencias = new Set<string>();
  const visibles = new Set<string>();

  // La lista viene plana y en orden de documento, asi que los ancestros de
  // una fila son las anteriores con `nivel` estrictamente menor. Se mantiene
  // esa cadena en una pila y se resuelve en una sola pasada.
  const cadena: T[] = [];

  for (const fila of filas) {
    let ultimo = cadena.at(-1);
    while (ultimo && ultimo.nivel >= fila.nivel) {
      cadena.pop();
      ultimo = cadena.at(-1);
    }

    const texto = normalizar(`${fila.codigoPartida} ${fila.descripcion}`);

    if (texto.includes(buscado)) {
      coincidencias.add(fila.id);
      visibles.add(fila.id);
      for (const ancestro of cadena) visibles.add(ancestro.id);
    }

    cadena.push(fila);
  }

  return { coincidencias, visibles };
}
