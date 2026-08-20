/**
 * Preparar texto para las fuentes estandar del PDF.
 *
 * Las catorce fuentes que todo lector de PDF trae de serie —Helvetica entre
 * ellas— solo saben pintar los caracteres de WinAnsi (Latin-1 ampliado). Eso
 * cubre el castellano entero: tildes, ñ, ¿, ¡, «», y hasta el guion largo y
 * las comillas tipograficas.
 *
 * Lo que NO cubre es todo lo demas, y ahi esta el peligro: `pdf-lib` LANZA al
 * encontrar un caracter que la fuente no puede codificar. Un nombre de tarea
 * con un simbolo raro —un emoji pegado desde WhatsApp, una vineta ✓ copiada
 * de Excel, un espacio duro de Word— tumbaria la generacion del informe
 * entero. Y esos nombres salen de un XML que sube el usuario.
 *
 * Por eso el texto se sanea SIEMPRE antes de dibujarlo: lo representable pasa
 * tal cual, lo demas se sustituye por algo legible. Vale mas un informe con un
 * "?" en un nombre que ningun informe.
 *
 * La alternativa seria empotrar una fuente TrueType con el PDF: son cientos de
 * kilobytes por documento y este servidor ya va justo. Para un informe de obra
 * en castellano no compensa.
 */

/// Sustituciones con sentido, para los que aparecen de verdad en documentos de
/// obra copiados de otras herramientas. El resto cae al interrogante.
const EQUIVALENTES: Record<string, string> = {
  "✓": "OK", // ✓, de las listas de Excel
  "✔": "OK", // ✔
  "✗": "X", // ✗
  "✘": "X", // ✘
  "→": "->", // →
  "←": "<-", // ←
  "≥": ">=", // ≥
  "≤": "<=", // ≤
  " ": " ", // espacio duro de Word
  " ": " ", // espacio fino
  "​": "", // espacio de ancho cero
  "•": "-", // •
  "●": "-", // ●
  // Los de una sola letra: WinAnsi no los tiene, pero si tiene el cuadrado y
  // el cubo sueltos, asi que se cambian por su forma normal en vez de por
  // "m2". El superindice se conserva.
  "㎡": "m²", // ㎡
  "㎥": "m³", // ㎥
  // OJO: ² y ³ (0xB2 y 0xB3) SI estan en WinAnsi y pasan tal cual. Aqui hubo
  // una entrada que convertia ³ en "3" y no la habia para ²: en la misma
  // columna salia "m²" al lado de "m3", con dos criterios tipograficos.
};

/**
 * Los codigos que WinAnsi sabe representar.
 *
 * De 0x20 a 0xFF salvo el hueco de 0x7F-0x9F, donde WinAnsi coloca simbolos
 * propios (comillas tipograficas, guion largo, euro) que SI valen. Se acepta
 * el rango entero de 0xA0 en adelante y se listan aparte los de ese hueco.
 */
const EXTRA_WINANSI = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2013,
  0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

function representable(codigo: number): boolean {
  if (codigo >= 0x20 && codigo <= 0x7e) return true;
  if (codigo >= 0xa0 && codigo <= 0xff) return true;
  return EXTRA_WINANSI.has(codigo);
}

/// El texto listo para dibujar: sin saltos de linea ni caracteres que la
/// fuente no sepa pintar.
export function aWinAnsi(texto: string): string {
  let salida = "";

  for (const caracter of texto) {
    const equivalente = EQUIVALENTES[caracter];
    if (equivalente !== undefined) {
      salida += equivalente;
      continue;
    }

    // Un salto de linea dentro de una celda descoloca la tabla entera: se
    // trata como separacion, y el ajuste de linea ya decidira donde parte.
    if (caracter === "\n" || caracter === "\r" || caracter === "\t") {
      salida += " ";
      continue;
    }

    const codigo = caracter.codePointAt(0) ?? 0;
    salida += representable(codigo) ? caracter : "?";
  }

  return salida;
}

/// Mide el ancho de un texto a un tamano dado. La da la fuente del PDF; se
/// recibe como parametro para que todo esto se pueda probar sin depender de
/// `pdf-lib` ni de una fuente cargada.
export type Medir = (texto: string, tamano: number) => number;

/**
 * Parte un texto en las lineas que caben en un ancho.
 *
 * Corta por palabras. Una palabra mas larga que la columna entera —un codigo
 * pegado sin espacios, una ruta— se parte por caracteres: dejarla salir de la
 * celda pisaria la columna de al lado, y en una tabla de obra eso hace ilegible
 * la fila entera.
 */
export function partirEnLineas(
  texto: string,
  anchoMaximo: number,
  tamano: number,
  medir: Medir,
): string[] {
  const limpio = aWinAnsi(texto).trim();
  if (limpio === "") return [""];

  const lineas: string[] = [];
  let actual = "";

  const empujar = () => {
    if (actual !== "") lineas.push(actual);
    actual = "";
  };

  for (const palabra of limpio.split(/\s+/)) {
    const tentativa = actual === "" ? palabra : `${actual} ${palabra}`;

    if (medir(tentativa, tamano) <= anchoMaximo) {
      actual = tentativa;
      continue;
    }

    empujar();

    if (medir(palabra, tamano) <= anchoMaximo) {
      actual = palabra;
      continue;
    }

    // La palabra sola no cabe: se trocea a lo bruto.
    let trozo = "";
    for (const caracter of palabra) {
      if (medir(trozo + caracter, tamano) > anchoMaximo && trozo !== "") {
        lineas.push(trozo);
        trozo = caracter;
      } else {
        trozo += caracter;
      }
    }
    actual = trozo;
  }

  empujar();
  return lineas.length > 0 ? lineas : [""];
}

/**
 * Reparte el ancho disponible entre las columnas segun lo que llevan dentro.
 *
 * Se pesa por el texto MAS LARGO de cada columna —cabecera incluida—, acotado
 * por arriba: sin el tope, una descripcion de 120 caracteres se comeria la
 * tabla y dejaria las de porcentajes en un hilo. Con el, la columna de nombres
 * se lleva lo suyo y las numericas conservan lo justo para no partir un
 * "100.00" en dos lineas.
 */
export function repartirColumnas(
  cabeceras: readonly string[],
  filas: readonly (readonly string[])[],
  anchoTotal: number,
  topeCaracteres = 45,
): number[] {
  const pesos = cabeceras.map((cabecera, i) => {
    let largo = cabecera.length;
    for (const fila of filas) largo = Math.max(largo, (fila[i] ?? "").length);
    // El +2 evita que una columna vacia acabe con ancho cero y su contenido
    // futuro no quepa jamas.
    return Math.min(largo, topeCaracteres) + 2;
  });

  const suma = pesos.reduce((a, b) => a + b, 0) || 1;
  return pesos.map((p) => (p / suma) * anchoTotal);
}
