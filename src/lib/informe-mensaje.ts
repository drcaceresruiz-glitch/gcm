import type { DatosCsvInforme } from "./informe-csv";
import { fechaCsv } from "./informe-documento";
import { resumenParaCorreo, UMBRAL_AL_DIA } from "./informe-correo";
import { aAscii, acortar, MAX_SMS } from "./texto-sms";

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
 * El limite del SMS y la transcripcion a ASCII viven en `lib/texto-sms`, que
 * es de donde beben tambien los mensajes a contratistas. Se reexportan para
 * que lo que ya los importaba de aqui siga funcionando igual.
 */
export { aAscii, MAX_SMS } from "./texto-sms";

/// Por debajo de esto el nombre de la obra deja de identificarla y el mensaje
/// no sirve para nada.
const MINIMO_NOMBRE_OBRA = 8;

/// Tope sano del texto de WhatsApp: viaja dentro de una URL.
export const MAX_WHATSAPP = 1000;

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
 * El enlace para compartir el informe, SIN destinatario: el chat se elige en
 * el propio WhatsApp. Exigir el celular obligaria a tener registrado el de
 * cada cliente para algo que se resuelve en dos toques.
 *
 * El texto lo compone el SERVIDOR y llega hecho: si lo armara el navegador, un
 * mensaje con el membrete de GCM podria decir cifras que GCM no ha medido. Es
 * la misma regla que ya sigue el envio por correo.
 */
export { enlaceWhatsApp } from "./whatsapp";
