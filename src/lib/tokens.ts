import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * Tokens opacos para sesiones y recuperacion de clave.
 *
 * En la base se guarda unicamente el SHA-256 del token, nunca el token en
 * claro. Asi, quien obtenga un volcado de la base no puede suplantar a
 * ningun usuario: tendria los hashes, no las llaves.
 *
 * Se usa SHA-256 y no scrypt a proposito. Aqui el secreto son 32 bytes
 * aleatorios, no una contrasena elegida por una persona: no hay nada que
 * adivinar por fuerza bruta, y el hash debe ser rapido porque se verifica
 * en cada peticion.
 */

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Clave temporal para el alta de un usuario nuevo.
 *
 * Se excluyen los caracteres ambiguos (O/0, I/l/1) porque esta clave se
 * dicta por telefono o se copia a mano desde un correo.
 */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function generateTemporaryPassword(longitud = 12): string {
  let salida = "";
  for (let i = 0; i < longitud; i++) {
    salida += ALFABETO[randomInt(ALFABETO.length)];
  }
  return salida;
}

/**
 * Codigo numerico para la verificacion en dos pasos.
 *
 * `randomInt` y no `Math.random()`: este numero es una credencial, y
 * `Math.random` es predecible si se observan suficientes salidas.
 *
 * Se rellena con ceros por la izquierda para que siempre tenga la misma
 * longitud. Sin eso, uno de cada diez codigos empezaria por cero, saldria
 * como cinco cifras y la gente creeria que llego cortado.
 */
export function generateNumericCode(longitud = 6): string {
  let salida = "";
  for (let i = 0; i < longitud; i++) salida += randomInt(10).toString();
  return salida;
}
