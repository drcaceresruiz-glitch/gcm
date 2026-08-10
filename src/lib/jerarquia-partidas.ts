import { sumar, esPositivo, esNegativo } from "@/lib/decimal";

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

  /**
   * Se sube por la jerarquia hasta encontrar un ancestro que exista.
   *
   * En los presupuestos reales faltan filas de grupo: en CRIOCORD estan
   * "11.11.02" a "11.11.19" pero no la cabecera "11.11". Sin esta busqueda
   * hacia arriba, esas 18 partidas quedarian colgando de la raiz, fuera de
   * su capitulo y fuera de su subtotal.
   */
  let recorte = esCabeceraDeGrupo ? segmentos.slice(0, -2) : segmentos.slice(0, -1);

  while (recorte.length > 0) {
    const directo = recorte.join(".");
    if (existentes.has(directo)) return directo;

    // El ancestro tambien puede estar escrito como cabecera de grupo.
    const ultimoRecorte = recorte.at(-1) ?? "";
    for (const relleno of ["0", "0".repeat(ultimoRecorte.length)]) {
      const comoCabecera = [...recorte, relleno].join(".");
      if (existentes.has(comoCabecera)) return comoCabecera;
    }

    recorte = recorte.slice(0, -1);
  }

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
  return sumar(aportantes(nodos).map((n) => n.parcial!));
}

/**
 * Los nodos que APORTAN al costo directo: los que tienen importe y no quedan
 * cubiertos por una descendiente costeada.
 *
 * Es el mismo criterio que aplica `sumarHojas`, expuesto por separado porque
 * los movimientos presupuestales necesitan saberlo POR PARTIDA y no solo el
 * total: la columna BASE de cada fila debe ser la que efectivamente conto,
 * o la suma de las bases no cuadraria con el costo directo de la linea base.
 *
 * Tambien define que partidas pueden recibir un ajuste: reconvertir dinero
 * de una partida cubierta seria moverlo de un sitio donde no estaba.
 */
export function aportantes<T extends NodoImporte>(
  nodos: readonly T[],
): T[] {
  const codigos = new Set(nodos.map((n) => n.codigo));

  // Ancestros que quedan cubiertos por alguna descendiente con importe.
  const cubiertos = new Set<string>();

  for (const nodo of nodos) {
    /**
     * Solo un importe positivo cubre a su ancestro.
     *
     * Un descuento no sustituye a la partida de la que cuelga: la ajusta.
     * En CRIOCORD, "7.09.00 GASTOS VARIOS" lleva 779,10 a suma alzada y su
     * unica hija con cifra es un descuento comercial. Tratar ese descuento
     * como si reemplazara al padre hacia desaparecer los 779,10 del
     * presupuesto.
     */
    if (nodo.parcial === null || !esPositivo(nodo.parcial)) continue;

    let padre = codigoPadre(nodo.codigo, codigos);
    while (padre) {
      cubiertos.add(padre);
      padre = codigoPadre(padre, codigos);
    }
  }

  return nodos.filter((n) => n.parcial !== null && !cubiertos.has(n.codigo));
}

/**
 * Cuanto vale cada rama: el subtotal de un capitulo, de un subcapitulo o de
 * cualquier nodo que agrupe.
 *
 * Un capitulo no tiene precio propio —es un titulo—, pero la suma de lo que
 * cuelga de el si significa algo, y es lo que uno quiere leer al mirar el
 * presupuesto: "Estructuras cuesta 340 mil".
 *
 * Se CALCULA, nunca se guarda. Un subtotal almacenado en una columna
 * empezaria a mentir en cuanto entrara un adicional, se corrigiera un
 * metrado o se reimportara el Excel; y un numero de dinero que miente es
 * peor que no tener el numero.
 *
 * Se apoya en `aportantes` a proposito: asi el subtotal NO PUEDE contradecir
 * al total de la obra. Si un capitulo lleva importe propio a suma alzada y
 * ademas sus hijas tienen importes, `aportantes` ya decidio cual de los dos
 * cuenta, y aqui se respeta esa decision en vez de tomar otra.
 *
 * Invariante del que depende todo: la suma de los subtotales de los nodos
 * raiz es exactamente `sumarHojas` de la lista entera. Esta fijado por un
 * test.
 */
export function subtotalesPorRama(
  nodos: readonly NodoImporte[],
): Map<string, string> {
  const existentes = new Set(nodos.map((n) => n.codigo));

  // Se parte de cero para TODOS, tambien para los que no reciben nada: un
  // capitulo vacio debe leerse "0.00", no quedarse en blanco como si el dato
  // no existiera.
  const partes = new Map<string, string[]>();
  for (const codigo of existentes) partes.set(codigo, []);

  for (const nodo of aportantes(nodos)) {
    // El nodo aporta a su propia rama...
    partes.get(nodo.codigo)?.push(nodo.parcial!);

    // ...y a la de cada uno de sus ancestros. Se sube por la cadena real de
    // padres (`codigoPadre`), no cortando el codigo por los puntos: en los
    // presupuestos de verdad faltan filas intermedias y hay cabeceras de
    // grupo terminadas en ceros.
    const vistos = new Set<string>([nodo.codigo]);
    let padre = codigoPadre(nodo.codigo, existentes);
    while (padre && !vistos.has(padre)) {
      partes.get(padre)?.push(nodo.parcial!);
      vistos.add(padre);
      padre = codigoPadre(padre, existentes);
    }
  }

  const salida = new Map<string, string>();
  for (const [codigo, valores] of partes) salida.set(codigo, sumar(valores));
  return salida;
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
    // Los importes en cero se ignoran: varias filas a cero seguidas no
    // delatan ninguna formula arrastrada, solo partidas sin valorizar.
    // Senalarlas seria ruido que resta credibilidad a los avisos reales.
    const importe = racha[0]?.parcial ?? null;
    const tieneValor =
      importe !== null && (esPositivo(importe) || esNegativo(importe));

    if (racha.length >= 2 && tieneValor) {
      grupos.push({
        filas: racha.map((r) => r.fila),
        codigos: racha.map((r) => r.codigo),
        importe,
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

/**
 * Profundidad real de cada nodo, contando su cadena de padres.
 *
 * No se puede deducir del numero de segmentos del codigo: "7.02.00" y
 * "7.02.01" tienen tres segmentos cada uno y pareceria que estan al mismo
 * nivel, pero el primero encabeza al segundo. Usar la cuenta de segmentos
 * hace que el arbol se dibuje plano y que un borrado por niveles intente
 * eliminar a un padre y a su hijo en el mismo paso.
 */
export function calcularProfundidades(
  codigos: readonly string[],
): Map<string, number> {
  const existentes = new Set(codigos);
  const profundidad = new Map<string, number>();

  const resolver = (codigo: string, visitados: Set<string>): number => {
    const cacheado = profundidad.get(codigo);
    if (cacheado !== undefined) return cacheado;

    // Proteccion ante un ciclo por datos corruptos: mejor devolver una
    // profundidad plana que colgar el proceso.
    if (visitados.has(codigo)) return 0;
    visitados.add(codigo);

    const padre = codigoPadre(codigo, existentes);
    const valor = padre === null ? 0 : resolver(padre, visitados) + 1;

    profundidad.set(codigo, valor);
    return valor;
  };

  for (const codigo of codigos) resolver(codigo, new Set());
  return profundidad;
}
