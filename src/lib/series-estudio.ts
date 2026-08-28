/**
 * Lo que convierte los datos de la obra en una SERIE TEMPORAL analizable.
 *
 * Logica pura: entra lo que hay guardado y sale lo que Minitab o SPSS
 * necesitan leer. Sin base de datos delante, para poder probar con numeros
 * escritos a mano justo lo que un revisor va a mirar con lupa.
 *
 * TRES DECISIONES QUE AQUI IMPORTAN MAS QUE LAS FORMULAS:
 *
 * 1. **La semana se indexa por FECHA DE CORTE, no por su numero.** El numero
 *    del plan es correlativo de creacion, y en un estudio las semanas
 *    anteriores a la implantacion se cargan DESPUES: recibirian numeros altos
 *    con fechas antiguas y la serie saldria desordenada. Ordenando por fecha,
 *    el indice 1..N es el eje temporal de verdad.
 *
 * 2. **La desviacion estandar es MUESTRAL (n-1)** y vale null con menos de dos
 *    observaciones. Es la que calculan Minitab y SPSS por defecto, y devolver
 *    un cero donde no hay dispersion medible meteria un punto falso en el
 *    grafico de control: parece una semana perfecta y es una semana sin datos.
 *
 * 3. **Una semana sin observaciones existe igual.** Se emite con `n = 0` y las
 *    medidas vacias, en lugar de desaparecer del archivo. Una serie temporal
 *    con huecos invisibles se analiza como si fuera continua, y ahi es donde
 *    un cambio de tendencia se inventa solo.
 */

export type FaseEstudio = "PRE" | "POST" | "SIN_CLASIFICAR";

/**
 * En que lado del punto de interrupcion cae una semana.
 *
 * La semana del punto de interrupcion cuenta como POST: es la primera que se
 * gestiona con la herramienta. Es un criterio, no una verdad, y por eso se
 * dice aqui y se documenta en la exportacion: quien analice tiene que poder
 * reproducir la clasificacion exactamente.
 */
export function faseDeLaSemana(
  fechaCorte: Date,
  interrupcion: Date | null,
): FaseEstudio {
  if (interrupcion === null) return "SIN_CLASIFICAR";
  return fechaCorte < interrupcion ? "PRE" : "POST";
}

export interface Resumen {
  n: number;
  media: number | null;
  desviacion: number | null;
  minimo: number | null;
  maximo: number | null;
  mediana: number | null;
}

const VACIO: Resumen = {
  n: 0,
  media: null,
  desviacion: null,
  minimo: null,
  maximo: null,
  mediana: null,
};

/** Media, desviacion muestral, extremos y mediana de una serie de valores. */
export function resumir(valores: readonly number[]): Resumen {
  const v = valores.filter((x) => Number.isFinite(x));
  if (v.length === 0) return { ...VACIO };

  const n = v.length;
  const media = v.reduce((s, x) => s + x, 0) / n;

  /*
   * n-1 y no n: es la desviacion MUESTRAL, la que usan por defecto Minitab y
   * SPSS. Con una sola observacion no hay dispersion que medir y se devuelve
   * null en vez de cero, para que la semana no aparezca como perfecta en un
   * grafico de control cuando lo que pasa es que no hay datos.
   */
  const desviacion =
    n < 2
      ? null
      : Math.sqrt(v.reduce((s, x) => s + (x - media) ** 2, 0) / (n - 1));

  const ordenados = [...v].sort((a, b) => a - b);
  const medio = Math.floor(n / 2);
  const mediana =
    n % 2 === 1
      ? (ordenados[medio] ?? null)
      : ((ordenados[medio - 1] ?? 0) + (ordenados[medio] ?? 0)) / 2;

  return {
    n,
    media,
    desviacion,
    minimo: ordenados[0] ?? null,
    maximo: ordenados[n - 1] ?? null,
    mediana,
  };
}

/**
 * Numero con los decimales que se piden, o cadena vacia si no hay valor.
 *
 * PUNTO DECIMAL SIEMPRE, aunque el archivo se abra en un Excel en espanol. Un
 * numero con coma decimal entra en SPSS como texto y el analisis se cae sin
 * decir por que; el separador de COLUMNAS si se puede elegir, que es lo que de
 * verdad se pelea con el Excel local.
 */
export function num(valor: number | null | undefined, decimales = 4): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "";
  return valor.toFixed(decimales);
}

/**
 * El codigo numerico de cada causa de no cumplimiento.
 *
 * SPSS y Minitab tratan mejor una variable nominal codificada 1..9 que una
 * cadena, y el diccionario de variables lleva la equivalencia. Se emiten LAS
 * DOS columnas -codigo y etiqueta- para que el archivo se pueda leer sin el
 * diccionario delante, que es como se revisa un anexo a las once de la noche.
 *
 * El orden NO se toca nunca una vez publicado: un estudio que cite «causa 3»
 * tiene que seguir apuntando a la misma causa dentro de dos anos.
 */
export const CODIGO_CAUSA: Record<string, number> = {
  PRERREQUISITO: 1,
  MATERIALES: 2,
  MANO_OBRA: 3,
  EQUIPOS: 4,
  INFORMACION: 5,
  CLIENTE_TERCEROS: 6,
  CLIMA: 7,
  REPROGRAMACION: 8,
  OTRA: 9,
};

export interface SemanaOrdenable {
  fechaCorte: Date;
}

/**
 * Indexa las semanas por orden cronologico: 1, 2, 3...
 *
 * Es el eje temporal del analisis. Se devuelve un mapa de fecha -> indice para
 * que cada archivo -compromisos, restricciones, consolidado- use EL MISMO
 * indice para la misma semana; si cada uno se numerara por su cuenta, no se
 * podrian cruzar.
 */
export function indicePorSemana(
  semanas: readonly SemanaOrdenable[],
): Map<number, number> {
  const orden = [...semanas].sort(
    (a, b) => a.fechaCorte.getTime() - b.fechaCorte.getTime(),
  );
  const mapa = new Map<number, number>();
  orden.forEach((s, i) => mapa.set(s.fechaCorte.getTime(), i + 1));
  return mapa;
}
