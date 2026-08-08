import type { TipoMovimiento } from "@/generated/prisma/enums";

/**
 * Lo que comparten el formulario de movimientos y su accion de servidor.
 *
 * Vive aqui, y no en cada lado, porque las dos piezas tienen que estar de
 * acuerdo: el formulario avisa en vivo de si una reconversion cuadra, y el
 * servidor la rechaza si no cuadra. Si cada uno formara el importe a su
 * manera, la pantalla podria decir «cuadra» sobre unas cifras que el
 * servicio descarta, y el desacuerdo saldria al pulsar guardar.
 */

/** Positivo entra en la partida, negativo sale de ella. */
export type Direccion = "entra" | "sale";

/**
 * Une la direccion y el importe en el valor con signo que espera el dominio.
 *
 * Se descarta cualquier signo que traiga el texto: el campo pide una
 * cantidad y la direccion ya esta elegida al lado. Respetar un "-" escrito
 * a mano en una linea marcada como salida daria una doble negacion, es
 * decir una entrada, que es lo contrario de lo que se ve en pantalla.
 */
export function conSigno(direccion: Direccion, importe: string): string {
  const limpio = importe.trim();
  const sinSigno = limpio.startsWith("-") ? limpio.slice(1).trim() : limpio;
  return direccion === "sale" ? `-${sinSigno}` : sinSigno;
}

/**
 * La direccion que impone el tipo, o null si la elige quien redacta.
 *
 * Un adicional solo suma y un deductivo solo resta, asi que ahi la
 * direccion no es una eleccion: es el tipo. Solo la reconversion tiene las
 * dos, porque mover dinero es sacarlo de un sitio y meterlo en otro.
 */
export function direccionFija(tipo: TipoMovimiento): Direccion | null {
  if (tipo === "ADICIONAL") return "entra";
  if (tipo === "DEDUCTIVO") return "sale";
  return null;
}
