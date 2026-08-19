import { randomBytes } from "node:crypto";

import { normalizarEmail } from "@/lib/contacto";

/**
 * Como una respuesta de correo encuentra la conversacion a la que pertenece.
 *
 * Puro y sin base ni red a proposito: aqui vive la unica decision delicada de
 * toda la funcionalidad —a que obra pertenece un correo— y tiene que poder
 * probarse sola, con casos escritos a mano.
 *
 * EL MECANISMO. Al enviar, GCM fija el `Message-ID` del correo:
 * `<gcm.TOKEN@dominio>`, con un TOKEN aleatorio que guarda en la fila. Cuando
 * el contratista pulsa «Responder», su cliente devuelve ese identificador en
 * `In-Reply-To` (y normalmente tambien en `References`). Ese token es lo que
 * ata la respuesta a SU conversacion: mismo contratista y misma obra.
 *
 * POR QUE NO UNA DIRECCION MARCADA (`obras+TOKEN@dominio`), que seria lo otro
 * evidente: depende de que el proveedor de correo acepte subdirecciones. El
 * que no las acepte rebota la respuesta y la funcionalidad falla en silencio,
 * que es la peor forma de fallar. `In-Reply-To` lo conserva cualquier cliente
 * al responder, sin pedirle nada al servidor de correo.
 *
 * Y LO QUE NUNCA SE HACE: adivinar la obra. Si el token no aparece, la
 * respuesta se guarda en la ficha del contratista SIN obra. Meterla en la obra
 * equivocada es peor que no meterla —una conversacion en el frente que no es
 * se lee como un compromiso que nadie adquirio—.
 */

/// Prefijo de los `Message-ID` que fabrica GCM. Lo que distingue un hilo
/// nuestro de cualquier otro correo del buzon.
const MARCA = "gcm";

/**
 * Un token nuevo para un hilo.
 *
 * ALEATORIO Y NO EL `id` DE LA FILA. Un identificador adivinable dejaria
 * inyectar respuestas falsas: bastaria mandar un correo al buzon de la
 * constructora citando un `Message-ID` inventado para que apareciera en una
 * obra como si el contratista hubiera contestado. Con 16 bytes no se acierta.
 */
export function nuevoTokenDeHilo(): string {
  return randomBytes(16).toString("hex");
}

/**
 * El dominio con el que se firma el `Message-ID`.
 *
 * Sale del correo desde el que escribe la empresa, para que el identificador
 * sea del dominio que de verdad envia. Un `Message-ID` con un dominio ajeno
 * es de las cosas que miran los filtros de spam.
 *
 * ACEPTA LAS DOS FORMAS de la cabecera `From`, porque las dos circulan por
 * aqui: la direccion a secas y `"Razon Social" <correo@dominio>`, que es como
 * la escribe `cabeceraRemitente` en cuanto la empresa tiene buzon propio. Sin
 * los angulos, el remitente de una constructora no daria dominio, no habria
 * `Message-ID`, y sus respuestas no se emparejarian con nada —callando, que es
 * como peor se rompe esto—.
 */
export function dominioDe(direccion: string): string | null {
  const entreAngulos = direccion.match(/<([^>]+)>/)?.[1];
  const limpio = normalizarEmail(entreAngulos ?? direccion);
  if (!limpio) return null;

  const dominio = limpio.split("@")[1];
  return dominio && dominio.length > 0 ? dominio : null;
}

/** El `Message-ID` completo, con sus angulos, tal como va en la cabecera. */
export function mensajeIdDeHilo(token: string, dominio: string): string {
  return `<${MARCA}.${token}@${dominio}>`;
}

/**
 * Los tokens de GCM que aparecen en las cabeceras de un correo entrante.
 *
 * Se miran `In-Reply-To` Y `References`, y no solo la primera: hay clientes
 * que al responder dentro de un hilo largo dejan `In-Reply-To` apuntando al
 * ultimo mensaje y solo conservan el nuestro en `References`.
 *
 * Devuelve los tokens en el orden en que aparecen, sin repetir. Quien llama
 * decide con cual se queda —el primero que conozca— porque solo el sabe
 * cuales existen en esta empresa.
 */
export function tokensEnCabeceras(
  inReplyTo?: string | null,
  references?: string | null,
): string[] {
  const texto = `${inReplyTo ?? ""} ${references ?? ""}`;
  const patron = new RegExp(`<${MARCA}\\.([0-9a-f]{8,64})@[^>]+>`, "gi");

  const vistos = new Set<string>();
  for (const coincidencia of texto.matchAll(patron)) {
    const token = coincidencia[1]?.toLowerCase();
    if (token) vistos.add(token);
  }

  return [...vistos];
}

/**
 * A que se ata un correo entrante. `ninguno` significa que NO se guarda.
 *
 * `motivo` no se le ensena a nadie: sirve para contar en el resumen de la
 * pasada cuantos correos se ignoraron y por que, que es lo que permite saber
 * si el emparejado esta funcionando sin ponerse a leer buzones.
 */
export type Emparejado =
  | { tipo: "hilo"; mensajeId: string; token: string }
  | { tipo: "contratista"; proveedorId: string }
  | { tipo: "ninguno"; motivo: "sin-hilo-ni-remitente" | "remitente-ambiguo" };

export interface EntradaAEmparejar {
  /// Tokens de GCM hallados en las cabeceras del correo.
  tokens: readonly string[];
  /// El `From` del correo, tal cual llego.
  remitente: string | null;
  /// token -> id del mensaje SALIENTE. Solo de esta empresa.
  hilos: ReadonlyMap<string, string>;
  /// correo normalizado -> ids de contratistas con ese correo, en esta empresa.
  contratistasPorCorreo: ReadonlyMap<string, readonly string[]>;
}

/**
 * Decide a que conversacion pertenece un correo entrante.
 *
 * El orden importa y no es negociable:
 *
 * 1. **Por el hilo**: si una cabecera trae un token que existe en esta
 *    empresa, esa es la conversacion. Es la unica via que da la OBRA.
 * 2. **Por el remitente**: si el `From` es el correo de EXACTAMENTE UN
 *    contratista, la respuesta es suya pero no se sabe de que obra. Se guarda
 *    en su ficha, sin obra.
 * 3. **Nada**: se ignora por completo. Ni se guarda ni se toca el correo.
 *
 * Dos contratistas con el mismo correo —pasa: dos empresas de un mismo dueno—
 * cuentan como ambiguo y se ignora. Elegir uno seria inventarse la mitad del
 * dato, y el correo sigue en el buzon para que lo lea una persona.
 */
export function decidirEmparejado(entrada: EntradaAEmparejar): Emparejado {
  for (const token of entrada.tokens) {
    const mensajeId = entrada.hilos.get(token);
    if (mensajeId) return { tipo: "hilo", mensajeId, token };
  }

  const remitente = entrada.remitente
    ? normalizarEmail(entrada.remitente)
    : null;

  if (remitente) {
    const candidatos = entrada.contratistasPorCorreo.get(remitente) ?? [];
    if (candidatos.length === 1) {
      return { tipo: "contratista", proveedorId: candidatos[0]! };
    }
    if (candidatos.length > 1) {
      return { tipo: "ninguno", motivo: "remitente-ambiguo" };
    }
  }

  return { tipo: "ninguno", motivo: "sin-hilo-ni-remitente" };
}

/// Tope del cuerpo que se guarda. Un correo con veinte respuestas citadas
/// debajo llena la pantalla sin anadir nada; y `cuerpo` es TEXT, no infinito.
export const MAX_CUERPO_ENTRANTE = 8000;

/**
 * El cuerpo, recortado y sin los retornos de carro del correo.
 *
 * NO se intenta quitar el texto citado de las respuestas anteriores. Se probo
 * mentalmente y no hay heuristica fiable —cada cliente cita distinto y en cada
 * idioma— y equivocarse ahi borra justo la frase que importaba. Recortar por
 * longitud es tosco pero no pierde el principio, que es donde contesta la
 * gente.
 */
export function cuerpoEntrante(texto: string): string {
  const limpio = texto.replace(/\r\n/g, "\n").trim();
  return limpio.length > MAX_CUERPO_ENTRANTE
    ? `${limpio.slice(0, MAX_CUERPO_ENTRANTE)}\n\n[…]`
    : limpio;
}
