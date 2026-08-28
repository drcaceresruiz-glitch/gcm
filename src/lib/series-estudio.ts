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

/**
 * Si la causa de un incumplimiento la controla la obra o no.
 *
 * PARA QUE UNA PRUEBA DE HOMOGENEIDAD TENGA SENTIDO. Con las nueve categorias
 * sueltas, la tabla de contingencia se llena de celdas con frecuencia esperada
 * menor que cinco -el chi-cuadrado deja de ser valido- y ademas no responde a
 * ninguna pregunta: que MATERIALES baje y CLIMA suba no dice nada por si solo.
 * Agrupadas si: la teoria predice que lo evitable desaparece y queda lo que la
 * obra no controla, y eso es contrastable en una tabla de dos por dos.
 *
 * REPROGRAMACION va en EVITABLE aunque parezca de fuera: reprogramar es una
 * decision de la propia obra, y contarla como externa seria absolver al
 * sistema de planificacion de su propio fallo mas comun.
 *
 * OTRA no se clasifica. Meterla en cualquiera de los dos lados inventaria una
 * atribucion que nadie hizo, y en el analisis se deja fuera del contraste.
 */
export const GRUPO_CAUSA: Record<string, "EVITABLE" | "EXTERNA" | "SIN_CLASIFICAR"> = {
  PRERREQUISITO: "EVITABLE",
  MATERIALES: "EVITABLE",
  MANO_OBRA: "EVITABLE",
  EQUIPOS: "EVITABLE",
  INFORMACION: "EVITABLE",
  REPROGRAMACION: "EVITABLE",
  CLIENTE_TERCEROS: "EXTERNA",
  CLIMA: "EXTERNA",
  OTRA: "SIN_CLASIFICAR",
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

/**
 * Con que trabajo se vivio una semana, y en que proporcion.
 *
 * PARA CONTESTAR LA OBJECION DE LA FASE CONSTRUCTIVA. Una obra no es
 * homogenea en el tiempo: si el periodo previo del estudio cae en estructuras
 * y el posterior en acabados, la mejora observada puede ser del tipo de
 * trabajo y no de la herramienta. Con esta columna en la exportacion, quien
 * analice PUEDE VER la composicion de cada fase en lugar de suponerla.
 *
 * Se emite la fase DOMINANTE y su porcentaje, no la lista entera: una semana
 * suele tener un frente principal y restos de otro, y meter la lista completa
 * en una celda de CSV la vuelve inservible como variable. El porcentaje es lo
 * que avisa de cuando la dominante no representa a la semana -un 40 % dice
 * «esta semana estuvo partida»-.
 *
 * Los compromisos sin fase NO cuentan en el denominador. Si contaran, una
 * semana con dos tareas de estructuras y ocho sin clasificar diria «20 %
 * estructuras», que suena a semana mixta cuando lo que pasa es que nadie
 * relleno la fase. Se devuelve `n` aparte para poder ver sobre cuantos se
 * calculo.
 */
export function faseDominante(
  fases: readonly (string | null | undefined)[],
): { fase: string | null; porcentaje: number | null; n: number } {
  const conocidas = fases.filter(
    (f): f is string => typeof f === "string" && f.trim().length > 0,
  );
  if (conocidas.length === 0) return { fase: null, porcentaje: null, n: 0 };

  const cuenta = new Map<string, number>();
  for (const f of conocidas) cuenta.set(f, (cuenta.get(f) ?? 0) + 1);

  /*
   * Empate: gana la primera por orden alfabetico, no la primera que aparecio.
   * El orden de llegada depende de como se listen los compromisos, y entonces
   * la misma semana daria fases distintas entre dos exportaciones.
   */
  let ganadora = "";
  let maximo = -1;
  for (const nombre of [...cuenta.keys()].sort()) {
    const veces = cuenta.get(nombre) ?? 0;
    if (veces > maximo) {
      maximo = veces;
      ganadora = nombre;
    }
  }

  return {
    fase: ganadora,
    porcentaje: (maximo / conocidas.length) * 100,
    n: conocidas.length,
  };
}
