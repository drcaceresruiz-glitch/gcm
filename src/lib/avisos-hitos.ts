import { recortar, tocaRecordar, LIMITE_SMS } from "@/lib/avisos";

/**
 * Cuando avisar de un hito, y de que.
 *
 * Un hito no se avisa como una restriccion. Una restriccion lleva N dias
 * abierta y hay que insistir; un hito tiene FECHA, y lo que importa es
 * enterarse ANTES —cuando todavia se puede hacer algo— y despues seguir
 * insistiendo mientras siga sin cumplirse.
 *
 * De ahi los dos avisos:
 *
 *   SE ACERCA   una sola vez, al entrar en la ventana de antelacion. No se
 *               repite: quien lo sabe ya lo sabe, y repetirlo todos los dias
 *               durante una semana es la forma mas rapida de que alguien
 *               apague los avisos de la obra entera.
 *
 *   VENCIDO     cada N dias mientras no se cumpla, con el MISMO umbral que ya
 *               usa el recordatorio de restricciones —`diasRecordatorio` de
 *               los ajustes de la obra—, para no inventar un ajuste nuevo que
 *               nadie sabria que existe.
 *
 * Logica pura y probada. Vive en `lib/` porque decide a quien se molesta y
 * cuanto dinero de SIM se gasta, y eso no puede quedarse sin prueba.
 */

export type EventoHito = "HITO_CERCA" | "HITO_VENCIDO";

export interface HitoParaAviso {
  uid: number;
  nombre: string;
  /// La fecha del hito, de calendario: "YYYY-MM-DD".
  fecha: string;
  /// Con cuantos dias de antelacion avisar de que se acerca.
  diasAviso: number;
  /// Un hito se da por cumplido al llegar al 100%.
  cumplido: boolean;
  /// "u:" o "c:" mas el id, o nulo si nadie se ha hecho cargo.
  responsableClave: string | null;
}

export interface AvisoDeHito {
  uid: number;
  nombre: string;
  fecha: string;
  evento: EventoHito;
  /// Dias que faltan. Cero es hoy; negativo, vencido.
  diasParaLaFecha: number;
  responsableClave: string | null;
}

/** Dias enteros entre dos fechas de calendario, sin pasar por zona horaria. */
export function diasHasta(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Los hitos que hoy merecen un aviso.
 *
 * Un hito CUMPLIDO no avisa nunca, aunque su fecha ya pasara: se cumplio, y
 * recordarle a alguien algo que ya hizo es la forma mas segura de que deje de
 * leer los avisos.
 *
 * Un hito SIN RESPONSABLE tampoco se descarta: sale igual, y quien lo recibe
 * es la suscripcion por flujo de la obra. Es preferible que lo lea quien no
 * debia a que no lo lea nadie —el fallo seguro de esta casa es «te llega», no
 * «no te llega»—.
 */
export function avisosDeHitos(
  hitos: readonly HitoParaAviso[],
  hoy: string,
  diasRecordatorio: number,
): AvisoDeHito[] {
  const salida: AvisoDeHito[] = [];

  for (const h of hitos) {
    if (h.cumplido) continue;

    const faltan = diasHasta(hoy, h.fecha);

    if (faltan >= 0) {
      // Todavia no ha vencido. Solo cuando entra en la ventana, y el dia que
      // vence tambien: «vence hoy» es justo lo que hay que saber.
      if (faltan <= h.diasAviso) {
        salida.push({
          uid: h.uid,
          nombre: h.nombre,
          fecha: h.fecha,
          evento: "HITO_CERCA",
          diasParaLaFecha: faltan,
          responsableClave: h.responsableClave,
        });
      }
      continue;
    }

    // Vencido y sin cumplir. Se insiste cada N dias, no todos los dias.
    if (tocaRecordar(-faltan, diasRecordatorio)) {
      salida.push({
        uid: h.uid,
        nombre: h.nombre,
        fecha: h.fecha,
        evento: "HITO_VENCIDO",
        diasParaLaFecha: faltan,
        responsableClave: h.responsableClave,
      });
    }
  }

  return salida;
}

/**
 * El texto del aviso.
 *
 * El cuerpo dice QUE SE ROMPE si no se atiende, no el hecho: «el hito X es en
 * 3 dias» no mueve a nadie; «faltan 3 dias y sigue sin cumplirse» si. Es la
 * misma regla que siguen los avisos de restricciones.
 */
export function textoDeHito(aviso: AvisoDeHito): { titulo: string; cuerpo: string } {
  const dias = Math.abs(aviso.diasParaLaFecha);

  if (aviso.evento === "HITO_CERCA") {
    const cuando =
      aviso.diasParaLaFecha === 0
        ? "es HOY"
        : aviso.diasParaLaFecha === 1
          ? "es mañana"
          : `faltan ${dias} días`;

    return {
      titulo: `Hito cerca: ${aviso.nombre}`,
      cuerpo:
        `${aviso.nombre} ${cuando} (${aviso.fecha}) y todavía no está cumplido. ` +
        `Si no se cierra a tiempo, la fecha de la obra se corre desde aquí.`,
    };
  }

  return {
    titulo: `Hito vencido: ${aviso.nombre}`,
    cuerpo:
      `${aviso.nombre} venció el ${aviso.fecha}, hace ${dias} día(s), y sigue ` +
      `sin cumplirse. Todo lo que dependía de esta fecha va con ese retraso.`,
  };
}

/**
 * El mismo aviso en un SMS.
 *
 * Menos de 160 caracteres, CERO enlaces y sin tildes, como todos los SMS de
 * GCM: las operadoras marcan como spam lo que lleva URL, y una tilde saca al
 * mensaje del alfabeto GSM-7 y lo deja en 70 caracteres —o sea, en dos SMS
 * que se cobran como dos—.
 *
 * Lo que se recorta primero es el nombre de la OBRA, no el del hito. Es al
 * reves que en los avisos de restricciones y a proposito: alli lo que hay que
 * saber es que flujo falta, aqui lo unico que hay que saber es QUE fecha se
 * viene encima. Quien recibe esto casi siempre trabaja en una sola obra.
 */
export function textoSmsDeHito(obra: string, aviso: AvisoDeHito): string {
  const dias = Math.abs(aviso.diasParaLaFecha);
  const cual = recortar(aviso.nombre, 60);

  const cuando =
    aviso.diasParaLaFecha === 0
      ? "es HOY"
      : aviso.diasParaLaFecha === 1
        ? "es manana"
        : `es en ${dias} dias`;

  const cola =
    aviso.evento === "HITO_CERCA"
      ? `hito "${cual}" ${cuando} y sigue sin cumplirse. Entra a GCM.`
      : `hito "${cual}" vencio hace ${dias} d y sigue sin cumplirse. Entra a GCM.`;

  const sitio = LIMITE_SMS - cola.length - "GCM : ".length;
  const nombre = recortar(obra, Math.max(1, sitio));

  return recortar(`GCM ${nombre}: ${cola}`, LIMITE_SMS);
}

/**
 * El ancla de la clave anti-repeticion.
 *
 * Lleva el uid del hito y el evento, y NADA MAS. Ni la fecha ni los dias: si
 * llevara la fecha, correr el hito un dia haria que «se acerca» volviera a
 * sonar; y si llevara los dias, sonaria cada dia de la ventana, que es
 * exactamente lo que se quiere evitar.
 */
export function anclaDeHito(uid: number, evento: EventoHito): string {
  return `hito:${uid}:${evento}`;
}
