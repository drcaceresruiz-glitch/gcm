import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Reglas de la cola de SMS que no necesitan base de datos ni telefono.
 *
 * El reparto es al reves de lo que parece: GCM no llama al telefono emisor,
 * el telefono pregunta a GCM. Aqui vive lo que se puede probar de eso —leer
 * la credencial de la cabecera, compararla sin filtrar tiempos y decidir si
 * un prestamo caduco—; el resto es una consulta y esta en su servicio.
 */

/**
 * Cuanto vive un SMS en la cola.
 *
 * Diez minutos, lo mismo que el codigo del pase que suele llevar dentro:
 * mandar un SMS con un codigo ya caducado solo sirve para que alguien lo
 * teclee, falle y desconfie del sistema.
 */
export const VIGENCIA_MENSAJE_MINUTOS = 10;

/**
 * Cuanto se le presta un mensaje al emisor antes de volver a ofrecerlo.
 *
 * Noventa segundos: bastante para que un telefono con cobertura mala mande y
 * confirme, y poco para que un telefono que se apago no deje el codigo
 * secuestrado hasta que caduque. Reenviar el mismo codigo dos veces es
 * inofensivo —es el mismo—; no enviarlo, no.
 */
export const GRACIA_PRESTAMO_SEGUNDOS = 90;

/**
 * Cuantos mensajes se entregan de una vez.
 *
 * La cola normal tiene cero o uno. El tope existe para que un atasco no le
 * mande cincuenta SMS de golpe a una SIM personal, que es justo lo que una
 * operadora corta por antispam.
 */
export const MAXIMO_POR_ENTREGA = 5;

/**
 * Cuantas veces se ofrece un mensaje antes de dejarlo por imposible.
 *
 * Sin este tope, un emisor que recoge y nunca confirma —sin saldo, o con el
 * permiso de SMS revocado en Android— reintentaria el mismo mensaje cada
 * noventa segundos hasta que caducara, gastando bateria y datos para nada.
 */
export const MAXIMO_ENTREGAS = 5;

/**
 * La credencial que viene en `Authorization: Bearer <token>`.
 *
 * Devuelve null si falta o no tiene esa forma. No se acepta el token por
 * parametro de la URL a proposito: los servidores registran las URL en sus
 * logs de acceso, y ahi el secreto quedaria escrito en claro para siempre.
 */
export function tokenDeCabecera(cabecera: string | null): string | null {
  if (!cabecera) return null;

  const [tipo, valor] = cabecera.split(" ");
  if (tipo?.toLowerCase() !== "bearer") return null;

  const limpio = valor?.trim();
  return limpio ? limpio : null;
}

/**
 * Compara el token recibido con el esperado en tiempo constante.
 *
 * Se comparan los SHA-256 y no los textos: `timingSafeEqual` exige que las
 * dos partes midan lo mismo, y con los tokens en crudo eso obligaria a
 * rechazar por longitud antes de comparar —lo que ya delata cuanto mide el
 * secreto—. Con el hash siempre son 32 bytes.
 */
export function tokenValido(recibido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recibido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

/**
 * Si un mensaje se puede ofrecer ahora.
 *
 * Se ofrece cuando nadie lo tiene prestado o cuando el prestamo caduco sin
 * confirmacion. Es puro para poder probar el unico caso que de verdad
 * importa: el telefono que recoge y se apaga.
 */
export function sePuedeOfrecer(
  mensaje: {
    tomadoAt: Date | null;
    enviadoAt: Date | null;
    expiraAt: Date;
    entregas: number;
  },
  ahora: Date,
): boolean {
  if (mensaje.enviadoAt) return false;
  if (mensaje.expiraAt <= ahora) return false;
  if (mensaje.entregas >= MAXIMO_ENTREGAS) return false;
  if (!mensaje.tomadoAt) return true;

  const vencePrestamo =
    mensaje.tomadoAt.getTime() + GRACIA_PRESTAMO_SEGUNDOS * 1000;
  return ahora.getTime() >= vencePrestamo;
}

/** Cuando caduca un mensaje que se encola ahora. */
export function caducidadDeMensaje(ahora: Date): Date {
  return new Date(ahora.getTime() + VIGENCIA_MENSAJE_MINUTOS * 60_000);
}
