/**
 * La EDT del cronograma sale del PRESUPUESTO, no se teclea aparte.
 *
 *   CAPITULO IV                    rama de la EDT
 *     4.1 Concreto en zapatas      PAQUETE DE TRABAJO / entregable
 *         4.1.1 Encofrado          tarea
 *         4.1.2 Acero              tarea
 *         4.1.3 Vaciado            tarea
 *
 * Lo unico que se anade encima del presupuesto son las FECHAS, y solo en las
 * hojas: un paquete toma el inicio de su primera tarea y el fin de la ultima,
 * y un capitulo lo mismo respecto a sus paquetes. Asi cada fecha vive en un
 * solo sitio y no puede discrepar consigo misma.
 */

export interface FilaPresupuesto {
  id: string;
  codigoPartida: string;
  descripcion: string;
  parentId: string | null;
  orden: number;
}

export interface FilaEdt {
  /// La partida de la que sale. Es tambien la llave del enlace con el dinero.
  codigo: string;
  nombre: string;
  /// Profundidad en la EDT: 1 es capitulo raiz.
  nivel: number;
  /// Posicion en el documento. La pertenencia sale del nivel MAS este orden.
  fila: number;
  /**
   * Agrupa a otras. En el cronograma una tarea resumen no lleva fechas
   * propias: las hereda de lo que contiene.
   */
  esResumen: boolean;
}

/**
 * Aplana el arbol del presupuesto en filas de EDT, en orden de documento.
 *
 * El recorrido es en PROFUNDIDAD siguiendo `parentId`, y no el `orden` plano de
 * la tabla: en un presupuesto importado las filas pueden venir en cualquier
 * orden dentro de la lista, y lo que define la EDT es de quien cuelga cada una.
 *
 * Una partida sin subpartidas es a la vez el paquete y su unica tarea: una
 * sola fila, no dos identicas.
 */
export function edtDesdePresupuesto(
  filas: readonly FilaPresupuesto[],
): FilaEdt[] {
  const hijasDe = new Map<string | null, FilaPresupuesto[]>();

  for (const fila of filas) {
    const grupo = hijasDe.get(fila.parentId) ?? [];
    grupo.push(fila);
    hijasDe.set(fila.parentId, grupo);
  }

  for (const grupo of hijasDe.values()) {
    grupo.sort(
      (a, b) => a.orden - b.orden || a.codigoPartida.localeCompare(b.codigoPartida),
    );
  }

  const salida: FilaEdt[] = [];
  const visitados = new Set<string>();

  const recorrer = (padreId: string | null, nivel: number) => {
    for (const fila of hijasDe.get(padreId) ?? []) {
      // Proteccion ante un ciclo por datos corruptos: mejor una EDT a medias
      // que un proceso colgado.
      if (visitados.has(fila.id)) continue;
      visitados.add(fila.id);

      const hijas = hijasDe.get(fila.id) ?? [];

      salida.push({
        codigo: fila.codigoPartida,
        nombre: fila.descripcion,
        nivel,
        fila: salida.length + 1,
        esResumen: hijas.length > 0,
      });

      recorrer(fila.id, nivel + 1);
    }
  };

  recorrer(null, 1);

  return salida;
}

export interface Programada {
  nivel: number;
  fila: number;
  esResumen: boolean;
  /// "YYYY-MM-DD", o null si esa hoja aun no se ha programado.
  inicio: string | null;
  fin: string | null;
}

/**
 * Sube las fechas de las hojas a sus resumenes.
 *
 * Un paquete empieza cuando empieza su primera tarea y termina cuando acaba la
 * ultima, aunque no sea la ultima de la lista: se compara la FECHA, no la
 * posicion. Las cadenas "YYYY-MM-DD" se comparan como texto y ordenan igual
 * que el calendario, sin pasar por ninguna zona horaria.
 *
 * Devuelve las mismas filas con las de resumen ya rellenadas. Una rama sin una
 * sola hoja programada se queda en nulo: inventarle fechas seria decir que hay
 * un plan donde no lo hay.
 */
export function subirFechas<T extends Programada>(filas: readonly T[]): T[] {
  const salida = filas.map((f) => ({ ...f }));

  for (let i = 0; i < salida.length; i++) {
    const actual = salida[i]!;
    if (!actual.esResumen) continue;

    let inicio: string | null = null;
    let fin: string | null = null;

    // Sus descendientes son las siguientes seguidas de nivel mayor; la primera
    // de nivel igual o menor ya es de otra rama.
    for (let j = i + 1; j < salida.length; j++) {
      const otra = salida[j]!;
      if (otra.nivel <= actual.nivel) break;
      // Solo las HOJAS aportan fecha. Un resumen intermedio ya se calculo o se
      // calculara con las suyas, y contarlo seria contar dos veces lo mismo.
      if (otra.esResumen) continue;

      if (otra.inicio && (inicio === null || otra.inicio < inicio)) inicio = otra.inicio;
      if (otra.fin && (fin === null || otra.fin > fin)) fin = otra.fin;
    }

    actual.inicio = inicio;
    actual.fin = fin;
  }

  return salida;
}
