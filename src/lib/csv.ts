/**
 * Escribir CSV que Excel abra bien a la primera, en cualquier maquina.
 *
 * Un CSV «a pelo» —comas y UTF-8 sin mas— se abre mal en la mitad de los
 * ordenadores de una obra: las tildes salen como simbolos y todo el archivo
 * cae en una sola columna. Aqui se resuelven las tres causas de eso:
 *
 * 1. **BOM UTF-8** al principio. Sin el, Excel para Windows lee el archivo con
 *    la pagina de codigos del sistema y «Cimentación» sale «CimentaciÃ³n».
 * 2. **La linea `sep=;`**. Excel elige el separador segun la configuracion
 *    regional del ordenador —coma en Peru, punto y coma en Espana—, asi que un
 *    archivo correcto en una maquina sale en una sola columna en la de al
 *    lado. Esa primera linea se lo impone y deja de depender del ordenador.
 *    No es del estandar, pero es lo que hace que el archivo se abra igual en
 *    la oficina y en la obra. El precio es que Google Sheets no la interpreta
 *    y la ensena como una primera fila con «sep=;» dentro: se asume a
 *    sabiendas, porque borrar una fila es un segundo y rescatar un archivo que
 *    cayo entero en la columna A no lo es.
 * 3. **Fin de linea CRLF**, como pide RFC 4180.
 *
 * El separador es `;` y no `,` a proposito: los nombres de partida llevan comas
 * ("Concreto f'c=210 kg/cm2, incluye encofrado") y aunque el entrecomillado las
 * protege, un archivo lleno de comillas es ilegible si alguien lo abre con el
 * bloc de notas, que es exactamente lo que pasa cuando algo no cuadra.
 */

/// Lo que puede ir en una celda. Fechas y booleanos NO: los formatea quien
/// llama, que es el unico que sabe si un `false` se lee "No" o "Pendiente".
export type CeldaCsv = string | number | null | undefined;

/// El BOM UTF-8, por su codigo y no como caracter literal: literal es
/// invisible, y el primer editor que toque el archivo se lo lleva por delante
/// sin que nadie lo note hasta que las tildes salen mal en la obra.
export const BOM = String.fromCharCode(0xfeff);

/**
 * Caracteres con los que Excel arranca una FORMULA.
 *
 * Un nombre de tarea sale de un XML que sube el usuario. Si empieza por `=`,
 * Excel lo ejecuta al abrir el archivo en vez de ensenarlo: es la inyeccion de
 * formulas de toda la vida, y la unica defensa es neutralizarlo al escribir.
 */
const ARRANQUE_DE_FORMULA = /^[=+\-@\t\r]/;

/// Un texto que Excel leeria como numero no hay que neutralizarlo: "-5.40" es
/// un desfase, no una formula, y el apostrofo lo convertiria en texto.
function esNumero(valor: string): boolean {
  return valor.trim() !== "" && !Number.isNaN(Number(valor));
}

/**
 * Una celda, escapada segun RFC 4180 y a prueba de formulas.
 *
 * Entre comillas si lleva separador, comillas o salto de linea; las comillas
 * de dentro se duplican.
 */
export function celdaCsv(valor: CeldaCsv): string {
  if (valor === null || valor === undefined) return "";

  let texto = String(valor);

  if (ARRANQUE_DE_FORMULA.test(texto) && !esNumero(texto)) {
    texto = `'${texto}`;
  }

  if (/[;"\r\n]/.test(texto)) {
    return `"${texto.replaceAll('"', '""')}"`;
  }

  return texto;
}

/**
 * El archivo entero, listo para descargar.
 *
 * Devuelve el texto CON el BOM y la linea `sep=;` incluidos: quien llama no
 * tiene que acordarse de ninguno de los dos, que es justo lo que se olvida.
 */
export function generarCsv(filas: readonly (readonly CeldaCsv[])[]): string {
  const cuerpo = filas.map((f) => f.map(celdaCsv).join(";")).join("\r\n");
  return `${BOM}sep=;\r\n${cuerpo}\r\n`;
}

/**
 * El mismo archivo, pero para un programa de estadistica y no para Excel.
 *
 * `generarCsv` escribe un BOM y una primera linea `sep=;`. Las dos cosas son
 * correctas para Excel -sin ellas, un Excel en espanol parte mal las columnas
 * y se come las tildes- y las dos ROMPEN a SPSS y a Minitab: el BOM ensucia el
 * nombre de la primera variable y la linea `sep=;` entra como si fuera un caso
 * mas, corriendo todo el archivo una fila.
 *
 * Por eso son dos funciones y no una con un parametro: son dos destinos con
 * exigencias opuestas, y quien exporta para analizar no deberia tener que
 * acordarse de apagar dos cosas.
 *
 * El separador SI se elige, porque ahi no hay una respuesta buena para todos:
 * la coma es lo que esperan SPSS y Minitab por defecto, y el punto y coma es
 * lo que necesita quien vaya a abrir el mismo archivo en un Excel en espanol
 * para echarle un vistazo antes.
 */
export function generarCsvPlano(
  filas: readonly (readonly CeldaCsv[])[],
  separador: "," | ";" = ",",
): string {
  const escapar = (valor: CeldaCsv): string => {
    const texto = celdaCsv(valor);
    // `celdaCsv` entrecomilla mirando el punto y coma. Con coma como
    // separador hay que entrecomillar tambien lo que la lleve dentro, o una
    // descripcion con una coma partiria la fila en dos.
    if (separador === "," && texto.includes(",") && !texto.startsWith('"')) {
      return `"${texto.replaceAll('"', '""')}"`;
    }
    return texto;
  };

  return filas.map((f) => f.map(escapar).join(separador)).join("\r\n") + "\r\n";
}
