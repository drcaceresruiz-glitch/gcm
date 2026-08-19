import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { firmar, firmaValida } from "@/lib/respaldo-manifiesto";

/**
 * El respaldo que SI cruza de una instalacion a otra.
 *
 * EL PROBLEMA QUE RESUELVE. El respaldo de obra se firma con
 * `HKDF(APP_SECRET, companyId)` y al restaurar se exigen las dos cosas: que la
 * firma valide con el `APP_SECRET` LOCAL y que el `companyId` sea el de esta
 * instalacion. Es la garantia mas fuerte posible mientras el archivo no salga
 * de casa... y por eso mismo un respaldo de la web NUNCA puede restaurarse en
 * la version instalable, que tendra otro secreto y otra empresa. Sin esto, un
 * cliente que se pase al programa instalado deja sus obras atras.
 *
 * LA SOLUCION, Y POR QUE ESTA Y NO OTRA. Hacen falta tres cosas a la vez:
 * que el archivo siga siendo a prueba de manipulacion, que se pueda verificar
 * en una maquina que no comparte ningun secreto con el origen, y que **GCM no
 * tenga que operar nada** —ni un servicio de firma, ni una clave publica que
 * alguien mantenga—, porque el producto instalable se vende y no se opera.
 *
 * Lo unico que cumple las tres es una **frase que elige quien exporta** y que
 * teclea quien importa. No la sabe GCM, viaja fuera del archivo (por telefono,
 * en persona, como sea) y sin ella el zip no se puede dar por bueno.
 *
 * LO QUE ESTO GARANTIZA Y LO QUE NO, para no venderlo de mas:
 *
 * - SI: que el archivo no ha cambiado desde que se exporto, y que quien lo
 *   importa conoce la frase que puso quien lo exporto.
 * - NO: que venga de una instalacion concreta. Cualquiera con la frase puede
 *   fabricar uno. Es integridad y acuerdo entre dos partes, no procedencia.
 *   El respaldo de obra, que no cruza, sigue siendo el que da procedencia.
 */

/// Marca de formato. Va DENTRO del texto firmado, asi que un archivo de
/// migracion no puede hacerse pasar por un respaldo de obra ni al reves.
export const TIPO_MIGRACION = "gcm.migracion.empresa";

/**
 * Coste de derivacion de la frase.
 *
 * `scrypt` y no HKDF, y es la diferencia que importa: HKDF sirve para estirar
 * un secreto que YA es fuerte —`APP_SECRET` son 32 bytes aleatorios—, pero una
 * frase la elige una persona y hay que encarecer cada intento. Con estos
 * parametros una prueba cuesta decimas de segundo, lo que hace inviable
 * recorrer un diccionario contra el archivo.
 */
const COSTE = { N: 16384, r: 8, p: 1 };

/// 16 bytes, como la sal de `password.ts`.
const BYTES_SAL = 16;

/// Cuanto tiene que medir la frase. Corta se adivina; y esto no protege una
/// sesion sino un archivo que alguien puede probar sin limite y sin ruido.
export const MINIMO_FRASE = 12;

export type FraseValida = { ok: true } | { ok: false; error: string };

export function validarFrase(frase: string): FraseValida {
  if (frase.trim().length < MINIMO_FRASE) {
    return {
      ok: false,
      error: `La frase necesita al menos ${MINIMO_FRASE} caracteres. Quien reciba el archivo tendrá que teclearla, así que es mejor una frase que recuerdes que un revoltijo.`,
    };
  }
  return { ok: true };
}

/**
 * La clave de firma, derivada de la frase y de una sal PROPIA DEL ARCHIVO.
 *
 * La sal es aleatoria y viaja en claro dentro del manifiesto: su trabajo no es
 * ser secreta sino que dos exportaciones con la misma frase no den la misma
 * clave, y que una tabla precalculada no sirva para todos los archivos de
 * todos los clientes.
 */
export function claveDeMigracion(frase: string, salBase64: string): Buffer {
  return scryptSync(frase.normalize("NFKC"), Buffer.from(salBase64, "base64"), 32, COSTE);
}

/** Una sal nueva para cada exportacion. */
export function nuevaSal(): string {
  return randomBytes(BYTES_SAL).toString("base64");
}

/**
 * Firma el manifiesto de una migracion.
 *
 * El tipo entra en lo firmado —no solo el manifiesto— para que un archivo de
 * migracion no pueda presentarse como otra cosa aunque su JSON encaje.
 */
export function firmarMigracion(
  manifiestoJson: string,
  frase: string,
  salBase64: string,
): string {
  return firmar(
    `${TIPO_MIGRACION}\n${salBase64}\n${manifiestoJson}`,
    claveDeMigracion(frase, salBase64),
  );
}

/**
 * Comprueba la firma de una migracion. En tiempo constante, via `firmaValida`.
 *
 * Devuelve un booleano y no el motivo: distinguir «frase equivocada» de
 * «archivo alterado» le diria a quien prueba cual de las dos cosas acertar.
 */
export function migracionValida(
  manifiestoJson: string,
  firmaRecibida: string,
  frase: string,
  salBase64: string,
): boolean {
  return firmaValida(
    `${TIPO_MIGRACION}\n${salBase64}\n${manifiestoJson}`,
    firmaRecibida,
    claveDeMigracion(frase, salBase64),
  );
}

/**
 * Compara dos huellas de frase en tiempo constante.
 *
 * Se exporta porque el servicio de importacion la necesita y no debe
 * reimplementar una comparacion de secretos con `===`.
 */
export function igualEnTiempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
