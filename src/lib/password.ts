import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

/**
 * Envoltura tipada de scrypt. No se usa `promisify` porque pierde la
 * sobrecarga que acepta parametros de coste, que es justamente la que
 * necesitamos aqui.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Hashing de contrasenas con scrypt, incluido en Node.
 *
 * Se descartaron argon2 y bcrypt a proposito: ambos son modulos compilados
 * en C/Rust y su binario se construye para un sistema operativo concreto.
 * El servidor donde se compila la aplicacion no es el mismo que CloudLinux,
 * asi que ese binario fallaria al desplegar. scrypt viene dentro de Node,
 * es una funcion de derivacion solida y elimina esa dependencia.
 *
 * Formato almacenado:  scrypt$N$r$p$<salt-base64>$<hash-base64>
 * Guardar los parametros junto al hash permite endurecerlos en el futuro
 * sin invalidar las contrasenas ya existentes.
 */

const N = 16384; // coste de CPU/memoria -> 16 MB por verificacion
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = (await scryptAsync(plain.normalize("NFKC"), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
  })) as Buffer;

  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4] ?? "", "base64");
  const expected = Buffer.from(parts[5] ?? "", "base64");

  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = (await scryptAsync(
    plain.normalize("NFKC"),
    salt,
    expected.length,
    { N: n, r, p },
  )) as Buffer;

  // Comparacion en tiempo constante: una comparacion normal filtra
  // informacion por el tiempo que tarda en encontrar la primera diferencia.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
