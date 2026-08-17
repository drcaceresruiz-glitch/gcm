import type { FilaEdt } from "@/lib/edt-desde-presupuesto";

/**
 * Reconciliar la EDT del cronograma con el presupuesto.
 *
 * El presupuesto ES la EDT, pero el presupuesto sigue vivo: se anaden
 * partidas, se corrigen importes, se agrupa a suma alzada. Sin esto la EDT se
 * queda en la foto del dia que se genero, y las dos versiones de la misma
 * estructura empiezan a discrepar en silencio.
 *
 * TRES REGLAS, y ninguna es negociable:
 *
 * 1. NO SE BORRA NADA. Lo que sobra se informa, no se destruye. Una tarea
 *    lleva colgados avance, enlaces con el presupuesto, tareas del lookahead
 *    con sus restricciones y fotos, compromisos semanales y fotos de galeria,
 *    todos anclados al `uid` SIN clave ajena: nadie los arrastraria y nadie
 *    avisaria. Borrar es otra operacion, con su confirmacion.
 *
 * 2. LO QUE SE TECLEO A MANO NO SE TOCA. Una tarea cuyo codigo no es de
 *    ninguna partida —«Movilizacion», «Entrega de terreno»— la escribio
 *    alguien a proposito y no sale del presupuesto. Se queda donde esta.
 *
 * 3. EL CONJUNTO ENLAZADO ES EXACTAMENTE `aportantes`. Es la misma invariante
 *    del generador: la suma de lo enlazado tiene que ser el costo directo. Por
 *    eso hay que quitar enlaces —una partida que gana subpartidas deja de
 *    llevar el dinero— ademas de ponerlos.
 */

export interface TareaExistente {
  uid: number;
  /// El codigo de partida, si lo tiene. Es la llave con el presupuesto.
  codigo: string | null;
  nombre: string;
  nivel: number;
  fila: number;
  esResumen: boolean;
}

export interface AltaEdt {
  fila: FilaEdt;
}

export interface CambioEdt {
  uid: number;
  /// Solo lo que de verdad cambia. Si esta vacio, no se escribe.
  nombre?: string;
  nivel?: number;
  esResumen?: boolean;
  fila?: number;
}

export interface PlanSincronizacion {
  altas: FilaEdt[];
  cambios: CambioEdt[];
  /**
   * Tareas cuyo codigo ya no es de ninguna partida. NO se borran: se informan.
   * Van al final del documento para que no partan la lectura de la EDT viva.
   */
  sobrantes: TareaExistente[];
  /// Codigos que deben quedar enlazados: exactamente los aportantes.
  enlacesDeseados: string[];
}

/**
 * Compara la EDT que sale del presupuesto contra las tareas que hay.
 *
 * El emparejamiento es POR CODIGO, no por uid ni por nombre: el uid lo asigna
 * el cronograma y el nombre se edita, pero el codigo de partida es lo que
 * significa «esta tarea es esta partida». Es la misma llave que usa
 * `MapeoTareaPartida`.
 *
 * El `fila` se reasigna a TODAS las filas de la EDT en su orden, y las que no
 * salen del presupuesto van detras conservando su orden relativo. Sin esto la
 * jerarquia se rompe: en el cronograma la pertenencia sale del `nivel` MAS el
 * orden del documento, asi que una fila nueva insertada en mitad sin recolocar
 * al resto cambia de quien cuelgan las siguientes.
 */
export function planSincronizacion(
  edt: readonly FilaEdt[],
  tareas: readonly TareaExistente[],
): PlanSincronizacion {
  const porCodigo = new Map<string, TareaExistente>();
  for (const t of tareas) {
    // Si dos tareas comparten codigo —no deberia—, manda la primera del
    // documento; la otra cae en sobrantes y se informa.
    if (t.codigo !== null && !porCodigo.has(t.codigo)) porCodigo.set(t.codigo, t);
  }

  const deLaEdt = new Set(edt.map((f) => f.codigo));

  const altas: FilaEdt[] = [];
  const cambios: CambioEdt[] = [];

  edt.forEach((f, i) => {
    const fila = i + 1;
    const existente = porCodigo.get(f.codigo);

    if (!existente) {
      altas.push({ ...f, fila });
      return;
    }

    const cambio: CambioEdt = { uid: existente.uid };
    if (existente.nombre !== f.nombre) cambio.nombre = f.nombre;
    if (existente.nivel !== f.nivel) cambio.nivel = f.nivel;
    if (existente.esResumen !== f.esResumen) cambio.esResumen = f.esResumen;
    if (existente.fila !== fila) cambio.fila = fila;

    if (Object.keys(cambio).length > 1) cambios.push(cambio);
  });

  /**
   * Lo que no sale del presupuesto va detras, en su orden de siempre.
   *
   * Aqui caen dos cosas distintas que se tratan igual: lo tecleado a mano
   * —que es legitimo y se queda— y lo que fue partida y dejo de serlo. La
   * diferencia entre las dos la sabe quien tiene los enlaces delante, no este
   * calculo; por eso `sobrantes` solo lista, y el servicio decide que contar.
   */
  const sueltas = tareas
    .filter((t) => t.codigo === null || !deLaEdt.has(t.codigo))
    .sort((a, b) => a.fila - b.fila);

  sueltas.forEach((t, i) => {
    const fila = edt.length + i + 1;
    if (t.fila !== fila) cambios.push({ uid: t.uid, fila });
  });

  return {
    altas,
    cambios,
    sobrantes: sueltas,
    // El conjunto enlazado es exactamente el de las hojas, que por
    // construccion del generador son los aportantes al costo directo.
    enlacesDeseados: edt.filter((f) => !f.esResumen).map((f) => f.codigo),
  };
}
