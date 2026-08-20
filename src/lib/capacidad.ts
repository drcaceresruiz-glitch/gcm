/**
 * Cuanto cabe en una semana, medido en el historial de ESTA obra.
 *
 * Last Planner pide dos condiciones para comprometer: que el trabajo este
 * liberado y que QUEPA. GCM implementaba la primera con rigor y la segunda no
 * existia. El diagnostico lo llamo el unico enfoque en cero.
 *
 * Aqui esta la segunda, por la via barata: no hace falta saber cuantas horas
 * caben si se sabe cuantos compromisos cumple esta obra de forma sostenida.
 * La capacidad se OBSERVA en vez de calcularse, y por eso no hace falta ni
 * dotacion ni rendimientos —que GCM no guarda— para empezar a avisar.
 *
 * Lo que sale de aqui es una comparacion contra uno mismo, no contra un
 * estandar: «prometes el doble de lo que sueles cumplir». Ningun catalogo
 * externo diria eso mejor.
 */

/** Una semana ya cerrada: lo que se prometio y lo que se cumplio. */
export interface SemanaCerrada {
  numero: number;
  comprometidos: number;
  cumplidos: number;
}

export type NivelAmbicion = "cabe" | "ambicioso" | "sobrecarga";

export interface Ambicion {
  /// Media de compromisos CUMPLIDOS por semana. La capacidad observada.
  rendimiento: number;
  /// Cuantas semanas cerradas sostienen esa media. Viaja SIEMPRE con ella:
  /// «3,5 de media» no dice lo mismo con tres semanas que con seis.
  semanas: number;
  /// Lo que se esta prometiendo ahora.
  comprometidos: number;
  /// comprometidos / rendimiento.
  indice: number;
  nivel: NivelAmbicion;
}

/**
 * Cuantas semanas cerradas se promedian como maximo.
 *
 * Seis: mas atras el equipo, el frente y hasta la fase de obra ya son otros,
 * y la media dejaria de describir a la obra de hoy.
 */
export const VENTANA_SEMANAS = 6;

/**
 * Cuantas hacen falta para decir algo.
 *
 * Tres. Con menos, la media es una anecdota. Se eligio tres y no seis —que
 * seria mas solido— porque esperar seis semanas cerradas deja a la obra mes y
 * medio sin el aviso, y el exceso de compromiso duele justo al principio,
 * cuando nadie sabe todavia el ritmo del equipo. El numero de semanas viaja
 * en el resultado para que quien lo lea sepa de cuanto se fia.
 */
export const SEMANAS_MINIMAS = 3;

/// Hasta aqui, lo prometido cabe segun el propio historial.
export const UMBRAL_AMBICIOSO = 1.0;
/// A partir de aqui, es sobrecarga probable.
export const UMBRAL_SOBRECARGA = 1.4;

function nivelDe(indice: number): NivelAmbicion {
  if (indice <= UMBRAL_AMBICIOSO) return "cabe";
  return indice <= UMBRAL_SOBRECARGA ? "ambicioso" : "sobrecarga";
}

const UN_DECIMAL = (n: number) => Math.round(n * 10) / 10;

/**
 * Que tan ambicioso es lo que se esta prometiendo.
 *
 * Devuelve null —y no un numero prudente— en los tres casos en que no hay con
 * que responder:
 *
 *  - Menos de `SEMANAS_MINIMAS` cerradas: no hay historial.
 *  - Nada comprometido todavia: no hay nada que juzgar.
 *  - Rendimiento cero: la obra no ha cumplido NI UN compromiso en la ventana.
 *    Dividir por cero daria «infinitamente ambicioso», que suena a hallazgo y
 *    es solo una division imposible. De ese caso ya avisa el PPC, que estara
 *    en el suelo, y decirlo dos veces con distinta cara seria confundir.
 *
 * Es la misma regla que rige el EAC y la demora por flujo: antes callar que
 * publicar una cifra que no se sostiene.
 */
export function ambicionDelPlan(
  cerradas: readonly SemanaCerrada[],
  comprometidos: number,
): Ambicion | null {
  if (comprometidos <= 0) return null;

  /**
   * Una semana cerrada SIN compromisos no es evidencia de nada.
   *
   * Se puede crear una semana y cerrarla vacia —la obra paro, o se creo por
   * error y se prefirio cerrarla a borrarla—, y GCM lo permite a proposito.
   * Pero al promediarla aportaba `cumplidos: 0` y **hundia el rendimiento**:
   * con tres semanas cumpliendo 4, una vacia baja la media de 4,0 a 3,0 y
   * prometer 5 pasa de «ambicioso» (1,3) a «sobrecarga» en rojo (1,7). El
   * equipo no cambio; cambio que alguien cerro una semana sin planificar.
   *
   * Se descarta ANTES de recortar la ventana: si se filtrara despues, una
   * semana vacia seguiria ocupando plaza entre las seis y expulsaria a una
   * real, que es el mismo daño por otra puerta.
   *
   * OJO al limite: una semana donde SI se prometio y no se cumplio nada
   * (`comprometidos > 0`, `cumplidos: 0`) es evidencia legitima de rendimiento
   * y tiene que seguir contando. De ese caso ya se ocupa `rendimiento <= 0`
   * mas abajo, devolviendo null en vez de una cifra imposible.
   */
  const conTrabajo = cerradas.filter((s) => s.comprometidos > 0);

  // Las mas recientes. Se ordena aqui y no se confia en como lleguen: el
  // servicio que las trae puede cambiar su orden sin saber que esto depende.
  const ventana = [...conTrabajo]
    .sort((a, b) => b.numero - a.numero)
    .slice(0, VENTANA_SEMANAS);

  if (ventana.length < SEMANAS_MINIMAS) return null;

  const rendimiento =
    ventana.reduce((suma, s) => suma + s.cumplidos, 0) / ventana.length;

  if (rendimiento <= 0) return null;

  const indice = comprometidos / rendimiento;

  return {
    rendimiento: UN_DECIMAL(rendimiento),
    semanas: ventana.length,
    comprometidos,
    indice: UN_DECIMAL(indice),
    nivel: nivelDe(indice),
  };
}
