/**
 * Escapar texto que se mete dentro de HTML escrito a mano.
 *
 * React escapa solo, asi que en las pantallas esto no hace falta. Donde SI
 * hace falta es en los correos: se arman concatenando cadenas, y ahi entran
 * nombres de obra, notas del remitente y nombres de tarea que salen de un XML
 * que sube el usuario.
 *
 * Sin escapar, un nombre de tarea que contenga un enlace se convierte en un
 * enlace de verdad dentro de un correo con el membrete de la empresa, enviado
 * al cliente. Que los clientes de correo no ejecuten JavaScript no arregla
 * eso: el problema no es el script, es el enlace.
 *
 * Se escapan tambien las comillas porque el mismo texto puede acabar dentro de
 * un atributo (`title="..."`), donde una comilla suelta abre la puerta a
 * inyectar atributos nuevos.
 */
export function escaparHtml(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
