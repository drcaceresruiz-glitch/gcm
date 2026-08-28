/**
 * La obra de ensayo del estudio: veinte semanas simuladas, sin una sola cifra
 * al azar.
 *
 * PARA QUE SIRVE. Antes de implantar GCM en una obra real y esperar seis meses
 * a tener datos, conviene comprobar que el analisis estadistico funciona: que
 * los archivos se cargan en SPSS o JASP, que los valores perdidos entran como
 * perdidos, que las pruebas dan lo que tienen que dar. Esta obra permite hacer
 * ese ensayo completo hoy.
 *
 * ES DETERMINISTA, y no es un detalle: nada de `Math.random`. Dos personas que
 * la generen obtienen exactamente los mismos numeros, asi que un resultado del
 * ensayo se puede reproducir y discutir. Una muestra que cambia en cada
 * ejecucion no sirve para verificar nada.
 *
 * LOS DATOS NO SON PERFECTOS A PROPOSITO. Un piloto con el efecto limpio no
 * enseña nada; lo que hay que ver antes de la obra real es como queda el
 * archivo cuando FALTA algo. Van dentro, deliberadamente:
 *
 *   - una semana sin ninguna restriccion -media y desviacion vacias-,
 *   - otra con una sola -media si, desviacion no-,
 *   - restricciones sin resolver y tareas sin terminar,
 *   - un analisis de causa raiz que funciono, otro que empeoro y otro abierto,
 *   - y una semana mala dentro del periodo bueno, porque un salto perfecto no
 *     existe en obra y no dejaria distinguir tendencia de ruido.
 *
 * Los retrasos llevan ASIMETRIA POSITIVA -muchos de cero y uno, cola larga
 * hasta quince dias-, que es la forma real de esta variable y la que obliga a
 * la prueba de normalidad y a la transformacion antes de calcular capacidad.
 * Con datos normales, ese paso del metodo no se descubriria hasta la obra real.
 */

export const NOMBRE_PILOTO = "PILOTO - datos simulados para la tesis";

/// Semanas antes de implantar GCM, y despues. Diez y diez: por debajo de ocho
/// por fase, una serie temporal no puede separar el cambio del ruido.
export const SEMANAS_PRE = 10;
export const SEMANAS_POST = 10;

export interface SemanaSimulada {
  /// Desde 0. El corte cae en el viernes de esa semana.
  indice: number;
  compromisos: number;
  cumplidos: number;
  /// Antes del punto de interrupcion se declara RECONSTRUIDA.
  reconstruida: boolean;
}

export interface RestriccionSimulada {
  /// Semana en cuyo corte se comprometio.
  semana: number;
  tipo: string;
  /// Dias entre la fecha comprometida y la real. Null = sigue sin resolver.
  retraso: number | null;
}

export interface TareaSimulada {
  uid: number;
  codigo: string;
  nombre: string;
  /// Semana en la que arranca segun el plan.
  semana: number;
  esCritico: boolean;
  /// Dias que se retrasa el fin. Null = sigue en curso.
  desviacion: number | null;
  declarada: boolean;
}

export interface AnalisisSimulado {
  causa: string;
  semanaApertura: number;
  semanaCompromiso: number;
  /// Null = sin cerrar todavia.
  semanaCierre: number | null;
}

export interface Piloto {
  semanas: SemanaSimulada[];
  restricciones: RestriccionSimulada[];
  tareas: TareaSimulada[];
  analisis: AnalisisSimulado[];
  causasPre: string[];
  causasPost: string[];
}

/*
 * El PPC sube de una media de ~58 % a ~81 %. La semana 15 baja a proposito:
 * en obra no hay saltos perfectos, y sin una caida dentro del periodo bueno
 * no se puede comprobar que el analisis distingue tendencia de ruido.
 */
const COMPROMISOS: readonly (readonly [number, number])[] = [
  [12, 7], [14, 8], [11, 6], [13, 8], [15, 8],
  [12, 7], [14, 9], [13, 7], [12, 7], [14, 8],
  [13, 9], [14, 11], [12, 10], [15, 12], [13, 9],
  [14, 12], [12, 10], [15, 13], [13, 11], [14, 12],
];

/// Cola derecha larga: es la forma que tiene esta variable en obra.
const RETRASOS_PRE = [0, 1, 2, 3, 5, 8, 12, 1, 4, 15, 2, 6, 3, 9, 1, 7, 2, 11, 4, 5, 0, 3, 6, 2, 8, 1, 13, 4, 2, 5];
const RETRASOS_POST = [0, 0, 1, 0, 2, 1, 0, 3, 1, 0, 1, 2, 0, 1, 5, 0, 1, 0, 2, 1, 0, 1, 3, 0, 1, 2, 0, 8, 1, 0];

const TIPOS = ["MATERIALES", "MANO_OBRA", "EQUIPOS", "INFORMACION", "ESPACIO", "REQUISITOS", "SEGURIDAD"];

/*
 * En el PRE las causas se reparten por todas partes -el retrato de un proceso
 * sin control-; en el POST se concentran en clima y terceros, que es lo que
 * queda cuando lo evitable ya se resolvio. Es lo que el HHI tiene que
 * detectar, y va al reves de lo que parece: ahi un indice ALTO es buena senal.
 */
const CAUSAS_PRE = ["MATERIALES", "MANO_OBRA", "PRERREQUISITO", "INFORMACION", "EQUIPOS", "CLIENTE_TERCEROS", "CLIMA"];
const CAUSAS_POST = ["CLIMA", "CLIENTE_TERCEROS", "MATERIALES", "CLIMA", "CLIENTE_TERCEROS"];

/// Cuanto se desvia el fin de cada tarea. Las tres ultimas siguen en curso.
const DESVIACIONES = [3, 5, 1, 8, 2, 6, 4, 11, 2, 7, 1, 2, 0, 3, 1, 0, 2, 1, 4, 0, 1, 2, 0, 1];

export function pilotoSimulado(): Piloto {
  const semanas = COMPROMISOS.map(([compromisos, cumplidos], indice) => ({
    indice,
    compromisos,
    cumplidos,
    reconstruida: indice < SEMANAS_PRE,
  }));

  const restricciones: RestriccionSimulada[] = [];
  for (const [fase, retrasos] of [
    [0, RETRASOS_PRE],
    [SEMANAS_PRE, RETRASOS_POST],
  ] as const) {
    retrasos.forEach((r, k) => {
      /*
       * Se reparten por las diez semanas de su fase, y dos se desvian a mano:
       * la quinta del PRE se queda SIN NINGUNA y la tercera con UNA SOLA. Son
       * los dos casos que hay que ver antes de la obra real -media sin
       * desviacion, y semana entera vacia-.
       */
      let semana = fase + (k % SEMANAS_PRE);
      if (fase === 0 && semana === 4) semana = 5;
      if (fase === 0 && semana === 2 && k > 2) semana = 6;

      restricciones.push({
        semana,
        tipo: TIPOS[k % TIPOS.length]!,
        // Una de cada doce sigue abierta: su ciclo no termino.
        retraso: k % 12 === 11 ? null : r,
      });
    });
  }

  const tareas = DESVIACIONES.map((d, k) => ({
    uid: k + 1,
    codigo: `${Math.floor(k / 6) + 1}.${String((k % 6) + 1).padStart(2, "0")}`,
    nombre: `Tarea planificada ${k + 1}`,
    semana: k,
    esCritico: k % 4 === 0,
    desviacion: k >= DESVIACIONES.length - 3 ? null : d,
    declarada: k % 5 === 0,
  }));

  /*
   * Tres analisis con los tres desenlaces que se van a ver en la realidad:
   * uno que hizo desaparecer su causa, otro tras el cual la causa siguio
   * igual o peor, y uno todavia abierto.
   */
  const analisis: AnalisisSimulado[] = [
    { causa: "MATERIALES", semanaApertura: 4, semanaCompromiso: 6, semanaCierre: 6 },
    { causa: "MANO_OBRA", semanaApertura: 7, semanaCompromiso: 9, semanaCierre: 10 },
    { causa: "CLIMA", semanaApertura: 14, semanaCompromiso: 17, semanaCierre: null },
  ];

  return {
    semanas,
    restricciones,
    tareas,
    analisis,
    causasPre: [...CAUSAS_PRE],
    causasPost: [...CAUSAS_POST],
  };
}

/**
 * El viernes de la semana `n`, contando desde el inicio del piloto.
 *
 * Se calcula a partir de una fecha DADA y no de hoy: la funcion tiene que
 * poder probarse, y una que mira el reloj da un resultado distinto cada dia.
 */
export function corteDeSemana(inicio: Date, n: number): Date {
  return new Date(inicio.getTime() + n * 7 * 86_400_000);
}
