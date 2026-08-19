import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * Guardar un secreto que hay que PODER RECUPERAR.
 *
 * Es la primera vez que GCM guarda algo asi, y conviene decir por que rompe
 * la regla de la casa. Todo lo demas —claves de usuario, tokens de pase,
 * emisores de SMS— se guarda HASHEADO, porque solo hay que *verificar* que
 * quien llega sabe el secreto. La contrasena del buzon de una constructora es
 * distinta: GCM tiene que *presentarla* a su servidor SMTP en cada envio, asi
 * que un hash no sirve. Hay que cifrarla y poder descifrarla.
 *
 * De ahi las tres decisiones de este archivo:
 *
 * - **AES-256-GCM**, no CBC. GCM va autenticado: si alguien manipula la fila
 *   en la base, el descifrado FALLA en vez de devolver basura que acabaria
 *   viajando a un servidor de correo.
 * - **La llave vive en el ENTORNO**, nunca en la base. Quien se lleve un
 *   volcado de la base no se lleva las contrasenas; hacen falta las dos
 *   cosas. Es la misma linea que `GCM_OPERADORES`: lo que de verdad abre algo
 *   exige acceso al servidor.
 * - **Sin llave no se cifra y no se descifra**, y las dos cosas fallan hacia
 *   el lado seguro: no se puede guardar un remitente propio, y el que hubiera
 *   guardado deja de usarse y el correo sale por el buzon compartido de
 *   siempre. Nunca «se guarda en claro por si acaso».
 *
 * Node y nada mas: igual que `password.ts` descarto argon2 y bcrypt porque
 * son modulos compilados y el despliegue de cPanel no los aguanta.
 *
 * OJO CON EL FUTURO INSTALABLE. GCM va a venderse primero como web y despues
 * como un ejecutable que se instala en la maquina de la constructora, sin
 * servidor. Eso cambia lo que este cifrado protege:
 *
 * - En la web, la llave (entorno del servidor) y los datos (base) viven en
 *   sitios distintos y hacen falta los dos. La proteccion es real.
 * - En un instalable, los dos estan en el mismo disco del cliente. Quien
 *   tenga esa maquina tiene las dos mitades, y esto pasa a proteger contra un
 *   volcado de la base copiado a otro sitio, no contra quien se sienta
 *   delante. No se puede prometer mas que eso, y por eso se escribe aqui.
 *
 * Lo que si sigue valiendo en las dos formas: el secreto no viaja nunca de
 * vuelta a la pantalla, y una fila manipulada no descifra.
 */

/**
 * La sal de derivacion, fija y publica.
 *
 * Fija a proposito: la llave tiene que salir IGUAL en cada arranque del
 * proceso o lo cifrado ayer no se descifra hoy. Su trabajo no es ser secreta
 * —la secreta es la frase del entorno— sino que la llave derivada no coincida
 * con la de ningun otro sistema que use la misma frase.
 */
const SAL = Buffer.from("gcm-secreto-v1");

/// GCM usa 12 bytes de vector de inicializacion; es lo recomendado y lo que
/// espera `createDecipheriv` sin configuracion extra.
const BYTES_IV = 12;

/// Marca de version del formato. Si algun dia cambia el algoritmo, lo viejo
/// se sigue reconociendo por aqui en vez de descifrarse mal.
const VERSION = "v1";

let llave: Buffer | null | undefined;

/**
 * La llave derivada de la frase del entorno, calculada UNA vez.
 *
 * `scrypt` es lento a proposito —eso es lo que protege una frase corta— y
 * derivarla en cada envio de correo seria pagar ese coste sin motivo: la
 * frase no cambia mientras el proceso vive.
 */
function llaveDeCifrado(): Buffer | null {
  if (llave !== undefined) return llave;

  const frase = process.env["CORREO_CLAVE_CIFRADO"]?.trim();
  if (!frase) {
    llave = null;
    return null;
  }

  llave = scryptSync(frase, SAL, 32);
  return llave;
}

/** Si se puede guardar un secreto, o sea: si hay llave configurada. */
export function hayLlaveDeCifrado(): boolean {
  return llaveDeCifrado() !== null;
}

/**
 * Cifra un texto. Devuelve null si no hay llave configurada.
 *
 * El resultado es `v1$iv$tag$datos`, en base64 y separado por `$` como el
 * formato de `password.ts`, para que se lea igual de un vistazo en la base.
 */
export function cifrar(texto: string): string | null {
  const k = llaveDeCifrado();
  if (!k) return null;

  const iv = randomBytes(BYTES_IV);
  const cifrador = createCipheriv("aes-256-gcm", k, iv);
  const datos = Buffer.concat([
    cifrador.update(texto, "utf8"),
    cifrador.final(),
  ]);

  return [
    VERSION,
    iv.toString("base64"),
    cifrador.getAuthTag().toString("base64"),
    datos.toString("base64"),
  ].join("$");
}

/**
 * Descifra lo que devolvio `cifrar`. null si no se puede, por lo que sea.
 *
 * NUNCA lanza, y es deliberado: quien llama esta a punto de mandar un correo,
 * y las tres formas de fallar aqui —no hay llave, la llave es otra, alguien
 * toco la fila— significan lo mismo para el: este remitente no sirve, sale
 * por el buzon compartido. Una excepcion convertiria eso en un correo que no
 * sale.
 */
export function descifrar(guardado: string): string | null {
  const k = llaveDeCifrado();
  if (!k) return null;

  const partes = guardado.split("$");
  if (partes.length !== 4 || partes[0] !== VERSION) return null;

  try {
    const iv = Buffer.from(partes[1]!, "base64");
    const tag = Buffer.from(partes[2]!, "base64");
    const datos = Buffer.from(partes[3]!, "base64");

    const descifrador = createDecipheriv("aes-256-gcm", k, iv);
    descifrador.setAuthTag(tag);

    return Buffer.concat([
      descifrador.update(datos),
      descifrador.final(),
    ]).toString("utf8");
  } catch {
    // Tag que no cuadra (fila manipulada o llave cambiada), base64 roto, iv
    // de otro tamano. Todo es lo mismo: no se puede.
    return null;
  }
}

/**
 * Olvida la llave derivada. SOLO para las pruebas, que cambian la variable de
 * entorno entre casos y necesitan que se vuelva a leer.
 */
export function olvidarLlave(): void {
  llave = undefined;
}
