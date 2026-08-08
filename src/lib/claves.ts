/**
 * La politica de contrasenas, en un solo sitio.
 *
 * Antes vivia repetida como un `min(10)` en el esquema de zod del cambio de
 * clave y otro en `auth.service`. Ahora que la recuperacion es una tercera
 * puerta a la misma decision, tenerla escrita tres veces garantizaba que
 * acabaran divergiendo.
 *
 * El minimo es de longitud y nada mas: no se exigen mayusculas ni simbolos.
 * Esas reglas empujan a la gente hacia `Empresa2024!` —que un diccionario
 * revienta— en lugar de hacia una frase larga, que es lo que de verdad
 * aguanta. Es tambien lo que recomienda el NIST desde 2017.
 */

export const LONGITUD_MINIMA_CLAVE = 10;

export const AVISO_CLAVE = `Al menos ${LONGITUD_MINIMA_CLAVE} caracteres. Una frase que recuerdes es mejor que una palabra corta con simbolos.`;

export type ResultadoClave = { ok: true } | { ok: false; error: string };

/**
 * Valida una contrasena nueva. `claveAnterior` es opcional: cuando se conoce
 * —el usuario la tecleo para autenticarse— se rechaza repetirla, porque
 * cambiar una clave por si misma no cambia nada.
 */
export function validarClaveNueva(
  clave: string,
  claveAnterior?: string,
): ResultadoClave {
  if (clave.length < LONGITUD_MINIMA_CLAVE) {
    return {
      ok: false,
      error: `La contrasena debe tener al menos ${LONGITUD_MINIMA_CLAVE} caracteres.`,
    };
  }

  if (claveAnterior !== undefined && clave === claveAnterior) {
    return {
      ok: false,
      error: "La contrasena nueva debe ser distinta de la actual.",
    };
  }

  return { ok: true };
}
