/**
 * Reglas de la verificacion en dos pasos que no necesitan base de datos.
 *
 * El codigo son seis cifras. Es poca entropia —un millon de combinaciones—,
 * y por eso lo que de verdad lo sostiene es el limite de intentos y la
 * caducidad corta, no la longitud: con cinco intentos y diez minutos, las
 * probabilidades de acertar a ciegas son de cinco entre un millon.
 *
 * Seis cifras y no ocho porque esto se teclea desde el movil mirando el
 * correo en otra ventana, y cada cifra de mas es un error de tecleo mas.
 */

export const LONGITUD_CODIGO = 6;

/** Vigencia del codigo. Corta: se pide y se usa en el momento. */
export const VIGENCIA_CODIGO_MINUTOS = 10;

/** Intentos antes de tirar el desafio y volver a empezar por la clave. */
export const MAX_INTENTOS_CODIGO = 5;

/**
 * Deja el codigo tal como se compara: solo cifras.
 *
 * La gente pega el codigo desde el correo con espacios delante y detras, y
 * algunos clientes lo parten como "123 456". Rechazar eso seria culpar al
 * usuario de un formato que no eligio.
 */
export function normalizarCodigo(entrada: string): string {
  return entrada.replace(/\D/g, "");
}

export function codigoBienFormado(entrada: string): boolean {
  return normalizarCodigo(entrada).length === LONGITUD_CODIGO;
}
