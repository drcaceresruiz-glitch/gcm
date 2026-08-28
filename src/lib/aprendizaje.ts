/**
 * Los cuatro indicadores de aprendizaje organizacional, tal y como los define
 * el estudio.
 *
 * Miden si la obra APRENDE, no si cumple: el PPC dice si se hizo lo prometido
 * y estos dicen si los fallos dejan de repetirse. Salen de datos que el
 * sistema ya guarda -las causas de no cumplimiento y los analisis de causa
 * raiz- sin pedir nada nuevo a nadie.
 *
 * Las formulas vienen dadas y se implementan tal cual, sin "mejorarlas": un
 * indicador que no coincide con el que la tesis declara no vale, por bien
 * calculado que este.
 */

/**
 * TRC — Tasa de recurrencia de causa.
 *
 *     TRC = (f_post / f_pre) x 100
 *
 * Compara la frecuencia SEMANAL PROMEDIO de una causa despues del cierre del
 * analisis contra la de antes de su apertura. Cerca de 0 % es aprendizaje
 * efectivo: el patron dejo de repetirse. Por encima de 100 %, empeoro.
 *
 * SE DIVIDE POR SEMANAS Y NO POR EVENTOS, y ahi esta el detalle que importa:
 * si el «antes» dura tres semanas y el «despues» diez, comparar totales diria
 * que el problema crecio aunque su ritmo se hubiera hundido. Por eso entran
 * las ventanas, no los conteos.
 *
 * `null` cuando no hay con que comparar -ninguna semana antes, o ninguna
 * despues-. Un cero ahi seria un exito inventado.
 */
export function trc(
  eventosAntes: number,
  semanasAntes: number,
  eventosDespues: number,
  semanasDespues: number,
): number | null {
  if (semanasAntes <= 0 || semanasDespues <= 0) return null;

  const fPre = eventosAntes / semanasAntes;
  const fPost = eventosDespues / semanasDespues;

  // Sin fallos antes no hay recurrencia que medir: no se abrio el analisis por
  // un patron, o el patron esta fuera de la ventana observada.
  if (fPre === 0) return null;

  return (fPost / fPre) * 100;
}

/**
 * LRO — Latencia de reaccion organizacional.
 *
 *     LRO = t_ACR - t_falla_0
 *
 * Semanas entre el PRIMER evento de un patron y la apertura formal de su
 * analisis de causa raiz. Mide cuanto tarda el equipo en darse cuenta de que
 * algo se repite. Baja cuando la organizacion aprende a mirarse.
 *
 * Se cuenta en indices de semana de la serie, no en dias: la unidad del
 * estudio es la semana, y mezclar unidades en un mismo indicador obliga a
 * convertir en el analisis, que es donde se cuelan los errores.
 */
export function lro(
  semanaPrimerEvento: number | null,
  semanaApertura: number | null,
): number | null {
  if (semanaPrimerEvento === null || semanaApertura === null) return null;
  return semanaApertura - semanaPrimerEvento;
}

export interface AccionCorrectiva {
  /// Cuando se comprometio a cerrarse. Sin fecha no hay compromiso que juzgar.
  fechaCompromiso: Date | null;
  cerradoAt: Date | null;
}

export interface Tcac {
  /// Cerradas sobre comprometidas, en porcentaje.
  general: number | null;
  /// Solo las cerradas DENTRO de su fecha comprometida.
  oportuno: number | null;
  comprometidas: number;
  cerradas: number;
  cerradasATiempo: number;
}

/**
 * TCAC — Tasa de cierre de acciones correctivas.
 *
 *     TCAC = (AC_cerradas / AC_comprometidas) x 100
 *
 * Y su version exigente, la que de verdad distingue: contar en el numerador
 * solo las que se cerraron con `t_real_cierre <= t_comprometida`. La primera
 * mide si el equipo termina lo que empieza; la segunda, si lo termina cuando
 * dijo. Se devuelven las dos porque una organizacion que cierra todo tarde
 * tiene un problema distinto de una que no cierra.
 *
 * EL DENOMINADOR SON LAS COMPROMETIDAS, no todos los analisis abiertos: una
 * accion sin fecha comprometida no se puede juzgar por su cumplimiento, y
 * meterla en el denominador castigaria al equipo por algo que nadie fijo.
 */
export function tcac(acciones: readonly AccionCorrectiva[]): Tcac {
  const comprometidas = acciones.filter((a) => a.fechaCompromiso !== null);
  const cerradas = comprometidas.filter((a) => a.cerradoAt !== null);
  const aTiempo = cerradas.filter(
    (a) => a.cerradoAt !== null && a.cerradoAt <= a.fechaCompromiso!,
  );

  const total = comprometidas.length;

  return {
    general: total === 0 ? null : (cerradas.length / total) * 100,
    oportuno: total === 0 ? null : (aTiempo.length / total) * 100,
    comprometidas: total,
    cerradas: cerradas.length,
    cerradasATiempo: aTiempo.length,
  };
}

/**
 * HHI — Indice de concentracion de causas (Herfindahl-Hirschman).
 *
 *     HHI = suma(i=1..N) p_i^2
 *
 * Donde `p_i` es la proporcion de la causa i sobre el total de fallos de la
 * semana. Va de 1/N -los fallos repartidos por igual entre todas las
 * categorias- a 1,0 -todos por la misma causa-.
 *
 * COMO SE LEE, que es lo contrario de lo que parece: un HHI ALTO es buena
 * senal en un sistema maduro. Significa que los fallos evitables ya se
 * resolvieron y lo que queda se concentra en una causa, normalmente externa
 * -el clima, un tercero-. Un HHI bajo dice que la obra falla por todo un poco,
 * que es el retrato de un proceso sin control.
 *
 * `null` sin fallos: una semana perfecta no tiene concentracion que medir, y
 * devolver 0 la pondria en el mismo sitio que la peor semana posible.
 */
export function hhi(frecuencias: readonly number[]): number | null {
  const total = frecuencias.reduce((s, n) => s + n, 0);
  if (total <= 0) return null;

  return frecuencias.reduce((s, n) => s + (n / total) ** 2, 0);
}
