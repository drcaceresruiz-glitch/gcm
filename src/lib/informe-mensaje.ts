import type { DatosCsvInforme } from "./informe-csv";
import { fechaCsv } from "./informe-documento";
import { resumenParaCorreo, UMBRAL_AL_DIA } from "./informe-correo";

/**
 * El informe dicho en un mensaje: uno para WhatsApp y otro para SMS.
 *
 * Sale de `resumenParaCorreo`, y eso no es comodidad sino la unica forma de que
 * el umbral de «al dia» y el criterio de que partidas son graves no puedan
 * divergir entre lo que se manda por correo y lo que se manda por el movil.
 * Ver [[cambios-propagan]]: aqui ya paso con el CSV y el papel.
 *
 * LOS DOS CANALES NO SE PARECEN EN NADA, y por eso son dos textos:
 *
 * - WhatsApp lo escribe la persona desde SU telefono, cabe largo, admite
 *   tildes y negritas, y GCM no envia nada: solo prepara el texto.
 * - El SMS sale de GCM, se cobra por tramo y lo escribe una maquina.
 */

/**
 * Lo que cabe en UN SMS. Pasarse no lo alarga: lo parte en dos, que se cobran
 * como dos y pueden llegar desordenados.
 *
 * Y hay una trampa peor que la longitud. Un SMS con solo caracteres del
 * alfabeto GSM cabe en 160; en cuanto entra UNA letra fuera de el —una «ó» de
 * «Cimentación», por ejemplo— el mensaje entero pasa a UCS-2 y el limite cae a
 * SETENTA. Los textos de los codigos ya se escribian a mano sin tildes; aqui no
 * vale, porque dentro va el nombre de la obra y de las partidas, que salen del
 * XML del usuario. Por eso se transcribe a ASCII antes de medir nada.
 */
export const MAX_SMS = 160;

/// Por debajo de esto el nombre de la obra deja de identificarla y el mensaje
/// no sirve para nada.
const MINIMO_NOMBRE_OBRA = 8;

/// Tope sano del texto de WhatsApp: viaja dentro de una URL.
export const MAX_WHATSAPP = 1000;

/**
 * A ASCII, para que el SMS quepa en 160 y no en 70.
 *
 * `normalize("NFD")` separa la letra de su tilde y luego se tiran las tildes.
 * Lo que no es una letra acentuada —comillas angulares, la raya del correo, el
 * punto medio— se cambia a mano, y lo que quede fuera de ASCII se descarta:
 * mejor perder un simbolo raro que mandar setenta caracteres.
 */
export function aAscii(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[«»“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/·/g, "-")
    .replace(/…/g, "...")
    .replace(/[¿¡]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

/// Recorta sin partir una palabra por la mitad si se puede evitar.
function acortar(texto: string, tope: number): string {
  if (texto.length <= tope) return texto;
  const cortado = texto.slice(0, tope - 3);
  const ultimoEspacio = cortado.lastIndexOf(" ");
  const base = ultimoEspacio > tope / 2 ? cortado.slice(0, ultimoEspacio) : cortado;
  return `${base.trimEnd()}...`;
}

/**
 * El informe en un SMS: sin tildes, sin enlaces y sin pasar de 160.
 *
 * SIN ENLACES a proposito, y no por longitud: las operadoras marcan como spam
 * los SMS con URL, asi que el que lleve enlace es el que no llega. Es la misma
 * regla que ya siguen los codigos de acceso.
 *
 * QUE SE SACRIFICA CUANDO NO CABE, en este orden: primero las partidas graves,
 * luego el PPC, y el ultimo recurso es acortar el NOMBRE de la obra. Nunca una
 * cifra: un «45.2» recortado a «45.» sigue leyendose como un numero, y un
 * informe que miente es peor que uno que no llega.
 */
export function textoSms(d: DatosCsvInforme): string {
  const r = resumenParaCorreo(d);
  const desviacion = Number(d.desviacion);

  // El rotulo es corto, pero QUE rotulo toca lo decide el mismo umbral que el
  // correo: si divergieran, el SMS diria «atrasada» de una obra que el correo
  // da por al dia.
  const estado =
    Math.abs(desviacion) < UMBRAL_AL_DIA
      ? "al dia"
      : desviacion > 0
        ? `+${desviacion.toFixed(2)} pts`
        : `-${Math.abs(desviacion).toFixed(2)} pts`;

  const nucleo = (obra: string) =>
    aAscii(
      `GCM ${obra} al ${fechaCsv(d.fechaCorte)}: real ${d.real}%, plan ${d.planeado}% (${estado}).`,
    );

  // Se añaden solo si caben ENTEROS. Media frase de PPC no informa de nada.
  const extras: string[] = [];

  // El null de `r.ppc` es la regla, no el dato: con la semana abierta el PPC no
  // se menciona ni aqui ni en el correo.
  const ppc = d.lastPlanner?.semana?.ppc ?? null;
  if (r.ppc !== null && ppc !== null) extras.push(`PPC ${ppc}%.`);

  const graves = d.alertas.filter((a) => a.severidad === "alta").length;
  if (graves > 0) {
    extras.push(graves === 1 ? "1 partida grave." : `${graves} partidas graves.`);
  }

  let obra = aAscii(d.obra);
  let mensaje = nucleo(obra);

  // Si ni el nucleo cabe, lo unico que se recorta es el nombre de la obra.
  if (mensaje.length > MAX_SMS) {
    const sobra = mensaje.length - MAX_SMS;
    obra = acortar(obra, Math.max(MINIMO_NOMBRE_OBRA, obra.length - sobra));
    mensaje = acortar(nucleo(obra), MAX_SMS);
  }

  for (const extra of extras) {
    const candidato = `${mensaje} ${aAscii(extra)}`;
    if (candidato.length <= MAX_SMS) mensaje = candidato;
  }

  return mensaje;
}

/**
 * El informe en un mensaje de WhatsApp.
 *
 * Aqui SI van tildes: WhatsApp no tiene el problema del alfabeto GSM, y quitar
 * los acentos en un mensaje que va al cliente parece descuido, no ahorro.
 * Los asteriscos son negrita en WhatsApp.
 *
 * TAMPOCO lleva enlace, y esta vez no es por las operadoras: el informe esta
 * detras de la sesion, asi que a quien no sea de la obra un enlace solo le
 * enseña una pantalla de acceso. Lo que se comparte es el resumen.
 */
export function textoWhatsApp(d: DatosCsvInforme): string {
  const r = resumenParaCorreo(d);

  const lineas = [
    `*Informe de obra — ${d.obra}*`,
    `Corte al ${fechaCsv(d.fechaCorte)}`,
    "",
    r.estado,
    ...r.cifras.map((c) => `• ${c.etiqueta}: ${c.valor}`),
  ];

  if (r.ppc !== null) lineas.push("", r.ppc);

  if (r.masGraves.length > 0) {
    lineas.push("", "*Partidas más atrasadas*");
    for (const g of r.masGraves) lineas.push(`• ${g.partida}: ${g.detalle}`);
    if (r.gravesOmitidas > 0) {
      lineas.push(
        r.gravesOmitidas === 1
          ? "…y 1 más en el informe completo."
          : `…y ${r.gravesOmitidas} más en el informe completo.`,
      );
    }
  }

  return acortar(lineas.join("\n"), MAX_WHATSAPP);
}

/**
 * El enlace que abre WhatsApp con el mensaje ya escrito.
 *
 * SIN numero a proposito: `wa.me/?text=` deja elegir el chat en el propio
 * WhatsApp. Exigir el celular obligaria a tener registrado el de cada cliente
 * para algo que la persona resuelve en dos toques.
 *
 * El texto lo compone el SERVIDOR y llega hecho: si lo armara el navegador,
 * un mensaje con el membrete de GCM podria decir cifras que GCM no ha medido.
 * Es la misma regla que ya sigue el envio por correo.
 */
export function enlaceWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
