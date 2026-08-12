/**
 * Leer una lista de correos escrita a mano.
 *
 * Se teclea en un solo campo, separando como salga —comas, punto y coma,
 * espacios o saltos de linea—, porque lo normal es pegarla de otro sitio y
 * nadie va a normalizarla antes.
 *
 * La validacion es DELIBERADAMENTE simple: lo unico que decide de verdad si
 * una direccion existe es el propio envio. Aqui solo se atrapa lo que
 * claramente no es un correo —un nombre suelto, una direccion sin punto— para
 * no gastar un envio en un error de tecleo evidente.
 */

/// Cuantos caben en un envio. No es una limitacion tecnica: es que una lista
/// mas larga que esto casi siempre significa que alguien esta usando el
/// informe como boletin, y para eso hace falta pensar otra cosa (bajas,
/// registro de quien recibe que) que aqui no existe.
export const MAX_DESTINATARIOS = 10;

const PARECE_CORREO = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

export type ListaDestinatarios =
  | { ok: true; lista: string[] }
  | { ok: false; error: string };

/**
 * Los correos de un campo de texto, sin repetidos.
 *
 * Los duplicados se quitan comparando en minusculas —«Cliente@Empresa.pe» y
 * «cliente@empresa.pe» son el mismo buzon— pero se CONSERVA como se escribio
 * el primero: la parte anterior a la arroba puede distinguir mayusculas en
 * algunos servidores, y no es cosa de esta funcion decidir eso.
 */
export function analizarDestinatarios(
  texto: string,
  maximo: number = MAX_DESTINATARIOS,
): ListaDestinatarios {
  const crudos = texto
    .split(/[,;\s]+/)
    .map((d) => d.trim())
    .filter(Boolean);

  if (crudos.length === 0) {
    return { ok: false, error: "Escribe al menos un correo de destino." };
  }

  const invalido = crudos.find((d) => !PARECE_CORREO.test(d));
  if (invalido !== undefined) {
    return { ok: false, error: `"${invalido}" no parece un correo válido.` };
  }

  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const d of crudos) {
    const clave = d.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    lista.push(d);
  }

  if (lista.length > maximo) {
    return {
      ok: false,
      error: `Como mucho ${maximo} destinatarios por envío. Has escrito ${lista.length}.`,
    };
  }

  return { ok: true, lista };
}
