import { aportantes } from "@/lib/jerarquia-partidas";

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
 *
 * QUIEN ES HOJA LO DECIDE EL DINERO, NO LA FORMA DEL ARBOL. Una revision
 * adversaria tumbo la primera version, que llamaba hoja a "la que no tiene
 * subpartidas colgando". No es lo mismo, y el presupuesto real da los dos
 * casos en que difieren:
 *
 *   - Un capitulo a suma alzada lleva el importe y sus subpartidas son el
 *     ALCANCE, sin cifra. La forma decia que las hojas eran las subpartidas
 *     vacias; el dinero dice que la hoja es el capitulo.
 *   - Una partida costeada con un descuento comercial colgando: el descuento
 *     es negativo y NO cubre a su madre, asi que las dos aportan.
 *
 * Y la diferencia no es cosmetica: `esResumen` excluye a una fila de la
 * valorizacion en nueve sitios del sistema —el mapeo, el tablero, el plan
 * semanal, la curva—, asi que una partida costeada marcada como resumen es
 * dinero que sale del control de avance SIN dar ningun error.
 *
 * De ahi las dos reglas de abajo: aporta ⟺ es hoja, y una hoja jamas tiene
 * hijas en la EDT.
 */

export interface FilaPresupuesto {
  id: string;
  codigoPartida: string;
  descripcion: string;
  parentId: string | null;
  orden: number;
  /// El importe de la fila. Es lo que decide si es hoja: sin el no se puede.
  parcial: string | null;
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
   * Agrupa a otras. En el cronograma una tarea resumen no lleva fechas propias
   * —las hereda de lo que contiene— y NO valoriza.
   *
   * Aqui es exactamente lo contrario de "aporta al costo directo".
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
 * Dos reglas gobiernan que sale y que no:
 *
 *   1. Solo sobrevive la fila que APORTA al costo directo o que tiene alguna
 *      descendiente que aporta. Una subpartida de alcance —sin cifra, bajo una
 *      partida a suma alzada que si la tiene— describe lo que entra en el
 *      precio, no una tarea que ejecutar, y no baja a la EDT.
 *
 *   2. Una fila que aporta NUNCA lleva hijas en la EDT: si alguna descendiente
 *      suya tambien aporta, sube a hermana. Es lo que impide que una partida
 *      costeada acabe marcada como resumen y se caiga de la valorizacion.
 *
 * Juntas garantizan la invariante que de verdad importa: el conjunto de filas
 * NO resumen es exactamente el que devuelve `aportantes`, cuya suma es el costo
 * directo. Ni un sol sin tarea que lo cubra, ni un sol contado dos veces.
 */
export function edtDesdePresupuesto(
  filas: readonly FilaPresupuesto[],
): FilaEdt[] {
  const aporta = new Set(
    aportantes(
      filas.map((f) => ({ codigo: f.codigoPartida, parcial: f.parcial })),
    ).map((n) => n.codigo),
  );

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

  // Regla 1: se queda la que aporta, y la que tiene descendencia que aporta.
  const seQueda = new Set<string>();
  const enCurso = new Set<string>();

  const sirve = (fila: FilaPresupuesto): boolean => {
    if (seQueda.has(fila.id)) return true;
    // Proteccion ante un ciclo por datos corruptos: mejor una EDT a medias que
    // un proceso colgado.
    if (enCurso.has(fila.id)) return false;
    enCurso.add(fila.id);

    let util = aporta.has(fila.codigoPartida);
    for (const hija of hijasDe.get(fila.id) ?? []) {
      if (sirve(hija)) util = true;
    }

    enCurso.delete(fila.id);
    if (util) seQueda.add(fila.id);
    return util;
  };

  for (const fila of filas) sirve(fila);

  /**
   * Las filas que cuelgan de este nivel en la EDT.
   *
   * Salta las que no sirven —bajando a buscar debajo— y aplica la regla 2:
   * tras una fila que aporta van, como hermanas suyas, sus descendientes que
   * tambien aportan.
   */
  const delNivel = (hijas: readonly FilaPresupuesto[]): FilaPresupuesto[] => {
    const salida: FilaPresupuesto[] = [];
    for (const hija of hijas) {
      const dentro = hijasDe.get(hija.id) ?? [];
      if (!seQueda.has(hija.id)) {
        salida.push(...delNivel(dentro));
        continue;
      }
      salida.push(hija);
      if (aporta.has(hija.codigoPartida)) salida.push(...delNivel(dentro));
    }
    return salida;
  };

  const salida: FilaEdt[] = [];
  const visitados = new Set<string>();

  const recorrer = (hijas: readonly FilaPresupuesto[], nivel: number) => {
    for (const fila of delNivel(hijas)) {
      if (visitados.has(fila.id)) continue;
      visitados.add(fila.id);

      const esHoja = aporta.has(fila.codigoPartida);

      salida.push({
        codigo: fila.codigoPartida,
        nombre: fila.descripcion,
        nivel,
        fila: salida.length + 1,
        esResumen: !esHoja,
      });

      // Una hoja no se abre: sus descendientes ya subieron a hermanas.
      if (!esHoja) recorrer(hijasDe.get(fila.id) ?? [], nivel + 1);
    }
  };

  recorrer(hijasDe.get(null) ?? [], 1);

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

/**
 * Quien es resumen segun el ORDEN DEL DOCUMENTO: lo es quien tiene a la
 * siguiente colgando mas adentro.
 *
 * Es la misma regla que aplica el lector de MS Project, y existe aqui porque
 * `esResumen` se guarda en la base y se quedaba PEGADO: al borrar la ultima
 * hija de un paquete, nadie le devolvia la marca a `false`. Esa fila quedaba
 * inservible para siempre —no valoriza, no se puede enlazar con su partida y
 * no hay forma de arreglarla desde la pantalla—, arrastrando ademas las fechas
 * de las tareas ya muertas.
 */
export function resumenesPorOrden<T extends { nivel: number }>(
  filas: readonly T[],
): boolean[] {
  return filas.map((f, i) => {
    const siguiente = filas[i + 1];
    return siguiente !== undefined && siguiente.nivel > f.nivel;
  });
}
