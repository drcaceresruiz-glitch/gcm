/**
 * Lo que se le escribe a un contratista, por los tres canales.
 *
 * Aqui vive lo que se puede decidir sin base de datos, sin SMTP y sin
 * telefono: que archivos se admiten, cuanto texto cabe y como queda el
 * mensaje en cada canal. El servicio se queda con lo dificil de probar.
 *
 * LA DIFERENCIA CON EL INFORME, que es de donde sale este patron: alli el
 * texto lo COMPONE GCM a partir de cifras que ha medido, y por eso no se
 * puede recortar un numero. Aqui lo escribe una persona, asi que no hay
 * ninguna cifra que proteger —lo unico que no se puede perder es QUIEN
 * escribe, porque al contratista le llega un SMS de un numero desconocido—.
 */

import { aAscii, acortar, MAX_SMS } from "./texto-sms";

/// Lo que se deja teclear. El correo aguanta mas, pero un mensaje de obra que
/// no cabe en esto probablemente deberia ser un documento adjunto.
export const MAX_CUERPO = 2000;
export const MAX_ASUNTO = 200;

/// Tope sano del texto de WhatsApp: viaja dentro de una URL.
export const MAX_WHATSAPP = 1000;

/**
 * Cuanto se le reserva a quien firma, dentro de los 160 del SMS.
 *
 * No es un adorno: el contratista recibe el mensaje de un numero que no tiene
 * agendado, y sin saber de quien es no puede ni contestar ni hacer caso. Si
 * el nombre de la obra es larguisimo se acorta EL NOMBRE, pero nunca se quita
 * la firma entera.
 */
const RESERVADO_FIRMA = 42;

/**
 * Los tipos de archivo que GCM acepta reenviar, por su MIME.
 *
 * LISTA CERRADA A PROPOSITO. Esto manda correos con el membrete de la
 * constructora y su dominio: sin una lista cerrada, GCM es un rele para
 * repartir ejecutables firmados por la empresa, y el que lo reciba se fiara
 * precisamente porque viene de ella.
 *
 * El MIME manda sobre el nombre, igual que en la galeria: `plano.pdf.exe` se
 * llama .exe y dice llamarse .pdf.
 */
export const MIMES_ADJUNTO: ReadonlyMap<string, string> = new Map([
  ["application/pdf", "PDF"],
  ["image/jpeg", "imagen JPG"],
  ["image/png", "imagen PNG"],
  ["image/webp", "imagen WebP"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "hoja de calculo"],
  ["application/vnd.ms-excel.sheet.macroEnabled.12", "hoja de calculo"],
  ["text/csv", "CSV"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "documento Word"],
]);

/// Por archivo.
export const TAMANO_MAXIMO_ADJUNTO = 5 * 1024 * 1024;

/**
 * Entre todos.
 *
 * Diez y no veinticuatro —el `bodySizeLimit` de Next— por dos razones que se
 * suman: el base64 del correo infla un tercio, y los buzones de destino
 * rechazan por su cuenta bastante antes de eso. Un adjunto que sale de GCM y
 * lo rebota el servidor del contratista es peor que uno que no se deja subir,
 * porque el primero parece enviado.
 */
export const TAMANO_MAXIMO_TOTAL = 10 * 1024 * 1024;

/// Lo justo para decidir: no hace falta el contenido para validar.
export interface AdjuntoPropuesto {
  nombre: string;
  tipo: string;
  tamano: number;
}

export type Validacion = { ok: true } | { ok: false; error: string };

function enMegas(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Si estos archivos se pueden mandar.
 *
 * Nombra SIEMPRE el archivo que falla. «Hay un adjunto demasiado grande» con
 * cinco seleccionados obliga a probar de uno en uno.
 */
export function validarAdjuntos(archivos: readonly AdjuntoPropuesto[]): Validacion {
  let total = 0;

  for (const archivo of archivos) {
    if (archivo.tamano === 0) {
      return { ok: false, error: `«${archivo.nombre}» está vacío.` };
    }

    if (!MIMES_ADJUNTO.has(archivo.tipo)) {
      return {
        ok: false,
        error:
          `«${archivo.nombre}» no es de un tipo que se pueda enviar. ` +
          `Se aceptan PDF, imágenes, hojas de cálculo y documentos de Word.`,
      };
    }

    if (archivo.tamano > TAMANO_MAXIMO_ADJUNTO) {
      return {
        ok: false,
        error:
          `«${archivo.nombre}» pesa ${enMegas(archivo.tamano)} y el máximo por ` +
          `archivo es ${enMegas(TAMANO_MAXIMO_ADJUNTO)}.`,
      };
    }

    total += archivo.tamano;
  }

  if (total > TAMANO_MAXIMO_TOTAL) {
    return {
      ok: false,
      error:
        `Entre todos suman ${enMegas(total)} y el máximo por mensaje es ` +
        `${enMegas(TAMANO_MAXIMO_TOTAL)}. Manda los planos en dos correos.`,
    };
  }

  return { ok: true };
}

/// Quien firma: la obra si el mensaje sale de una, y si no la empresa.
export interface Firma {
  empresa: string;
  obra?: string | null;
}

function comoFirma(firma: Firma): string {
  return aAscii(firma.obra?.trim() || firma.empresa.trim());
}

/**
 * El mensaje en un SMS: sin tildes, sin enlaces y sin pasar de 160.
 *
 * SIN ENLACES a proposito, y no por longitud: las operadoras marcan como spam
 * los SMS con URL. Es la misma regla que ya siguen los codigos de acceso y el
 * informe.
 *
 * QUE SE SACRIFICA CUANDO NO CABE: el texto de quien escribe, nunca la firma.
 * Un SMS anonimo de un numero desconocido no se lee; uno cortado, si —y quien
 * lo manda ve en pantalla cuanto cabe antes de darle a enviar—.
 */
export function textoSmsAlContratista(firma: Firma, cuerpo: string): string {
  const quien = acortar(comoFirma(firma), RESERVADO_FIRMA);
  const separador = ": ";
  const disponible = MAX_SMS - quien.length - separador.length;

  // Los saltos de linea no aportan nada en un SMS y gastan igual.
  //
  // EL ORDEN NO ES INDIFERENTE, y costo una prueba: `aAscii` DESCARTA el
  // salto de linea —esta fuera de ASCII imprimible— en vez de convertirlo en
  // espacio, asi que transcribir primero pegaba la ultima palabra de una
  // linea con la primera de la siguiente («Primero estoY luego»). Se aplasta
  // el espacio en blanco antes, y lo que llega a `aAscii` ya no tiene saltos.
  const texto = aAscii(cuerpo.replace(/\s+/g, " ").trim());

  return `${quien}${separador}${acortar(texto, disponible)}`;
}

/**
 * El mismo mensaje para WhatsApp, que es otro mundo: lo manda la persona desde
 * SU telefono, cabe largo y admite tildes. Quitarlas aqui pareceria descuido,
 * no ahorro.
 *
 * Tampoco lleva enlace, pero por otro motivo que el SMS: lo que hay dentro de
 * GCM vive detras de la sesion, y a un contratista un enlace solo le ensenaria
 * el login.
 */
export function textoWhatsAppAlContratista(firma: Firma, cuerpo: string): string {
  const quien = firma.obra?.trim() || firma.empresa.trim();
  return acortar(`*${quien}*\n\n${cuerpo.trim()}`, MAX_WHATSAPP);
}
