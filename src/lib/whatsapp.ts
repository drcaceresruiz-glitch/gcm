/**
 * Enlaces que abren WhatsApp con el mensaje ya escrito.
 *
 * GCM no manda nada por WhatsApp —no puede: la API oficial exige una cuenta
 * Business verificada—. Lo que hace es preparar el texto y dejar que lo mande
 * la persona desde SU WhatsApp. Por eso funciona sin contratar nada y sin
 * depender de que la empresa tenga telefono emisor.
 */

/// Peru. Va aparte porque el dia que GCM salga del pais esto deja de valer, y
/// es mejor que se vea que suponerlo escondido dentro de una plantilla.
const CODIGO_PAIS = "51";

/**
 * @param texto El mensaje. Se codifica entero: un salto de linea o un `&`
 *   sin codificar parten la URL y el mensaje llega cortado por la mitad.
 * @param numero Celular de nueve cifras. Sin el, `wa.me` deja elegir el chat
 *   en el propio WhatsApp, que es lo que se quiere al compartir un informe.
 *   Con el, va directo a esa persona.
 */
export function enlaceWhatsApp(texto: string, numero?: string | null): string {
  const destino = numero ? `${CODIGO_PAIS}${numero}` : "";
  return `https://wa.me/${destino}?text=${encodeURIComponent(texto)}`;
}
