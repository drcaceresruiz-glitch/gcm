/**
 * Lo que un SMS aguanta, y como hacer que quepa.
 *
 * Vive aparte porque ya son DOS los modulos que mandan SMS con texto venido
 * del usuario —el informe de obra y los mensajes a contratistas— y la regla
 * del alfabeto no puede estar escrita en uno de ellos: el segundo que la
 * copie sera el que se olvide de actualizarla. Es el mismo movimiento que se
 * hizo con `lib/contacto`, y por eso `lib/informe-mensaje` lo reexporta: nada
 * de lo que ya lo importaba tiene que cambiar.
 */

/**
 * Lo que cabe en UN SMS. Pasarse no lo alarga: lo parte en dos, que se cobran
 * como dos y pueden llegar desordenados.
 *
 * Y hay una trampa peor que la longitud. Un SMS con solo caracteres del
 * alfabeto GSM cabe en 160; en cuanto entra UNA letra fuera de el —una «ó» de
 * «Cimentación», por ejemplo— el mensaje entero pasa a UCS-2 y el limite cae a
 * SETENTA. Los textos de los codigos ya se escribian a mano sin tildes; con
 * texto que teclea una persona o que sale de un XML no vale esa disciplina.
 * Por eso se transcribe a ASCII antes de medir nada.
 */
export const MAX_SMS = 160;

/**
 * A ASCII, para que el SMS quepa en 160 y no en 70.
 *
 * `normalize("NFD")` separa la letra de su tilde y luego se tiran las tildes.
 * Lo que no es una letra acentuada —comillas angulares, la raya del correo, el
 * punto medio— se cambia a mano, y lo que quede fuera de ASCII se descarta:
 * mejor perder un simbolo raro que mandar setenta caracteres.
 */
export function aAscii(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[«»“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/·/g, "-")
    .replace(/…/g, "...")
    .replace(/[¿¡]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

/// Recorta sin partir una palabra por la mitad si se puede evitar.
export function acortar(texto: string, tope: number): string {
  if (texto.length <= tope) return texto;
  const cortado = texto.slice(0, tope - 3);
  const ultimoEspacio = cortado.lastIndexOf(" ");
  const base = ultimoEspacio > tope / 2 ? cortado.slice(0, ultimoEspacio) : cortado;
  return `${base.trimEnd()}...`;
}
