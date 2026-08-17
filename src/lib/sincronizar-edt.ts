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
/**
 * Donde va cada hito: detras de TODA la rama de la partida que lo ancla.
 *
 * No basta con ponerlo en la fila siguiente. La jerarquia del cronograma sale
 * del nivel MAS el orden del documento, asi que un hito colado justo detras de
 * un capitulo le robaria las partidas —pasarian a colgar del hito— y el
 * capitulo dejaria de ser resumen. Va despues de su ultima descendiente, y al
 * MISMO nivel que su ancla: asi es hermano de lo que cierra, que es lo que un
 * hito significa —«fin de estructuras» va con las estructuras, no dentro de
 * una de ellas—.
 *
 * Y nunca a un nivel mas profundo que el ancla: eso convertiria en resumen a
 * la fila de delante, y si esa fila lleva dinero se caeria de la valorizacion.
 */
function posicionDelHito(
  edt: readonly FilaEdt[],
  anclaCodigo: string,
): { indice: number; nivel: number } | null {
  const i = edt.findIndex((f) => f.codigo === anclaCodigo);
  if (i < 0) return null;

  const nivel = edt[i]!.nivel;
  let fin = i + 1;
  while (fin < edt.length && edt[fin]!.nivel > nivel) fin++;

  return { indice: fin, nivel };
}

export function planSincronizacion(
  edt: readonly FilaEdt[],
  tareas: readonly TareaExistente[],
  /// Los hitos de la obra y la partida tras la que va cada uno.
  hitos: readonly { uid: number; anclaCodigo: string | null }[] = [],
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
  const porUid = new Map(tareas.map((t) => [t.uid, t]));

  // Los hitos que encuentran su ancla se intercalan; los que no, caen al final
  // como cualquier otra suelta —y ahi se ven, que es la idea—.
  const hitosEn = new Map<number, { uid: number; nivel: number }[]>();
  const anclados = new Set<number>();

  for (const h of hitos) {
    if (!h.anclaCodigo) continue;
    const pos = posicionDelHito(edt, h.anclaCodigo);
    if (!pos) continue;
    hitosEn.set(pos.indice, [
      ...(hitosEn.get(pos.indice) ?? []),
      { uid: h.uid, nivel: pos.nivel },
    ]);
    anclados.add(h.uid);
  }

  type Entrada =
    | { tipo: "edt"; fila: FilaEdt }
    | { tipo: "hito"; uid: number; nivel: number };

  const documento: Entrada[] = [];
  for (let i = 0; i <= edt.length; i++) {
    // Van ANTES de la fila `i` porque su posicion es «detras de la rama», y esa
    // rama termina justo donde empieza la fila `i`.
    for (const h of hitosEn.get(i) ?? []) documento.push({ tipo: "hito", ...h });
    if (i < edt.length) documento.push({ tipo: "edt", fila: edt[i]! });
  }

  documento.forEach((entrada, i) => {
    const fila = i + 1;

    if (entrada.tipo === "hito") {
      const t = porUid.get(entrada.uid);
      if (!t) return;
      const cambio: CambioEdt = { uid: t.uid };
      if (t.fila !== fila) cambio.fila = fila;
      if (t.nivel !== entrada.nivel) cambio.nivel = entrada.nivel;
      // Un hito no agrupa nada: si venia marcado como resumen, se corrige.
      if (t.esResumen) cambio.esResumen = false;
      if (Object.keys(cambio).length > 1) cambios.push(cambio);
      return;
    }

    const f = entrada.fila;
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
    .filter((t) => !anclados.has(t.uid))
    .filter((t) => t.codigo === null || !deLaEdt.has(t.codigo))
    .sort((a, b) => a.fila - b.fila);

  /**
   * Y SUBEN TODAS A RAIZ, conservando su jerarquia relativa.
   *
   * No es cosmetico: en el cronograma una fila es RESUMEN cuando la siguiente
   * cuelga mas adentro. Si la primera suelta conserva un nivel profundo —una
   * subpartida cuya madre desaparecio—, se traga a la ultima fila de la EDT y
   * la convierte en resumen. Y una partida costeada marcada como resumen
   * queda excluida de la valorizacion en nueve sitios del sistema SIN dar
   * ningun error: es el mismo agujero que ya costo una revision entera,
   * entrando por otra puerta.
   *
   * Se desplazan todas por el MISMO salto para que la minima quede en 1: asi
   * el bloque de sueltas no puede tocar a la EDT, y entre ellas se conserva
   * quien colgaba de quien —que es lo unico que hay que respetar de lo que
   * alguien tecleo a mano—. Si ya estaban a raiz, no se toca nada.
   */
  const nivelMinimo = sueltas.reduce(
    (min, t) => Math.min(min, t.nivel),
    Number.POSITIVE_INFINITY,
  );
  const salto = sueltas.length > 0 ? 1 - nivelMinimo : 0;

  sueltas.forEach((t, i) => {
    // Detras de TODO el documento, que ya incluye los hitos intercalados.
    const fila = documento.length + i + 1;
    const nivel = t.nivel + salto;
    const cambio: CambioEdt = { uid: t.uid };
    if (t.fila !== fila) cambio.fila = fila;
    if (t.nivel !== nivel) cambio.nivel = nivel;
    if (Object.keys(cambio).length > 1) cambios.push(cambio);
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
