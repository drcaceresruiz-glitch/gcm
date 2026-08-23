import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env, isProduction } from "@/lib/env";
import { escaparHtml as esc } from "@/lib/html";
import { marcaParaCorreo } from "./logo.service";
import {
  configuracionDeEnvio,
  crearTransporte,
} from "./remitente-correo.service";
import { dominioDe, mensajeIdDeHilo } from "@/lib/correo-entrante";
import {
  CID_LOGO,
  MARCA_GCM as MARCA,
  MARCA_LOGO,
  MARCA_NOMBRE,
  MARCA_PIE,
  rotularCorreo,
} from "@/lib/correo-marca";

/**
 * Envio de correo.
 *
 * Toda la aplicacion manda correo por aqui. El punto clave es que **el correo
 * nunca es imprescindible**: si el buzon SMTP no esta configurado (o falla),
 * `enviarCorreo` no lanza —devuelve `enviado: false`— y quien lo llamo sigue
 * su curso. Asi el alta de un usuario funciona igual sin correo (mostrando la
 * clave para comunicarla a mano), y cuando se configure el SMTP, ademas
 * saldra el correo sin tocar una linea mas.
 *
 * El transporte se crea una sola vez y se guarda: abrir una conexion nueva por
 * cada correo seria un derroche.
 */

let transporte: Transporter | null | undefined;

/**
 * Si esta instalacion tiene un buzon compartido al que caer.
 *
 * Existe para que la pantalla no MIENTA sobre lo que pasa cuando una empresa
 * no configura el suyo. En la version web hay un buzon de la instalacion y el
 * correo sale igual; en la version instalable —GCM vende el programa y no
 * opera nada— NO habra ninguno, y entonces sin buzon propio no sale ni un
 * correo. Las dos cosas son ciertas en su sitio, asi que la pantalla lo
 * pregunta en vez de dar por hecho la primera.
 */
export function hayBuzonCompartido(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);
}

function obtenerTransporte(): Transporter | null {
  // `undefined` = aun no se intento; `null` = se intento y no hay config.
  if (transporte !== undefined) return transporte;

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
    transporte = null;
    return null;
  }

  const puerto = env.SMTP_PORT ?? 465;
  transporte = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: puerto,
    // 465 es SMTPS (TLS directo); 587 usa STARTTLS, que nodemailer negocia
    // solo con `secure: false`.
    secure: puerto === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return transporte;
}

export interface Adjunto {
  nombre: string;
  /// Contenido en base64, sin la cabecera `data:`.
  contenido: string;
  tipo: string;
}

export interface Correo {
  para: string;
  asunto: string;
  /// Version en texto plano, para clientes que no muestran HTML.
  texto: string;
  html: string;
  adjuntos?: Adjunto[];
  /**
   * A donde va la respuesta si el que recibe le da a «Responder».
   *
   * Casi todos los correos de GCM son automaticos y NO lo llevan: van
   * firmados por la empresa y responderlos no serviria de nada, que es lo que
   * dice su pie. Lo usan los que escribe una persona a otra —hoy, los
   * mensajes a contratistas—, donde el contratista responde «no me llego el
   * plano» y eso tiene que llegarle a alguien.
   *
   * Sin esto, la respuesta va al buzon del remitente tecnico (`SMTP_FROM`),
   * que normalmente no lee nadie.
   */
  respuestaA?: string;
  /**
   * De quien sale, para poner su logo en la cabecera.
   *
   * Se resuelve AQUI y no en cada constructor de correo: son ocho, y hacer
   * que cada uno cargue el logo por su cuenta es garantizar que el noveno se
   * olvide. Quien no lo pase manda el correo con el membrete de texto de
   * siempre, que es lo que hacian todos hasta ahora.
   */
  companyId?: string;
  /**
   * Marca este correo como cabecera de un hilo que GCM sabra reconocer.
   *
   * Con el, el `Message-ID` pasa a ser `<gcm.TOKEN@dominio>` en vez del que
   * inventa nodemailer, y cuando el que recibe pulsa «Responder» su cliente
   * devuelve ese identificador en `In-Reply-To`. Es lo unico que ata una
   * respuesta a la conversacion —y por tanto a la obra— que la provoco.
   *
   * SE PASA EL TOKEN Y NO EL `Message-ID` ENTERO porque el dominio lo decide
   * este modulo: puede salir por el buzon de la constructora o por el
   * compartido, y quien llama no sabe cual. Firmarlo con un dominio que no es
   * el que envia es de las cosas que miran los filtros de spam.
   *
   * Si no se puede sacar el dominio, no se pone cabecera y el correo sale
   * igual: se pierde el emparejado de la respuesta, no el mensaje.
   */
  tokenDeHilo?: string;
}

/**
 * El transporte y el remitente que le tocan a este correo.
 *
 * Si la empresa tiene buzon propio activo, sale del suyo; si no, del
 * compartido de la instalacion, que es como funciono siempre. La eleccion se
 * hace aqui y no en cada constructor de correo por lo mismo que el logo: son
 * ocho, y repartir la decision garantiza que el noveno la olvide.
 *
 * NO SE CACHEA el transporte propio, al contrario que el compartido. Son
 * pocos correos —un informe, un aviso— y a cambio un cambio de contrasena
 * surte efecto en el envio siguiente en vez de al reiniciar el proceso. El
 * compartido si se guarda porque lo usa todo y su configuracion solo cambia
 * con un despliegue.
 */
async function transporteYRemitente(
  companyId: string | undefined,
): Promise<{ t: Transporter; desde: string } | null> {
  if (companyId) {
    const propio = await configuracionDeEnvio(companyId);
    if (propio) {
      return { t: crearTransporte(propio), desde: propio.desde };
    }
  }

  const compartido = obtenerTransporte();
  if (!compartido) return null;

  return { t: compartido, desde: env.SMTP_FROM ?? env.SMTP_USER! };
}

export async function enviarCorreo(correo: Correo): Promise<{ enviado: boolean }> {
  const salida = await transporteYRemitente(correo.companyId);

  if (!salida) {
    // Sin SMTP no se envia nada. En desarrollo se deja constancia en consola
    // para poder ver que se HABRIA enviado; en produccion se calla, porque el
    // caso normal es que el correo este configurado y esto no deberia pasar.
    if (!isProduction) {
      console.info(
        `[correo NO enviado — SMTP sin configurar] Para: ${correo.para} | ${correo.asunto}`,
      );
    }
    return { enviado: false };
  }

  try {
    const adjuntos = (correo.adjuntos ?? []).map((a) => ({
      filename: a.nombre,
      content: a.contenido,
      encoding: "base64" as const,
      contentType: a.tipo,
    }));

    /**
     * El logo viaja como ADJUNTO INCRUSTADO (`cid:`), no como `data:`.
     *
     * Es la unica forma que funciona: las imagenes remotas las bloquean casi
     * todos los clientes —por eso esta plantilla nunca las uso— y las
     * incrustadas en base64 dentro del HTML las descarta Gmail, que es lo que
     * ya se aprendio con la curva del informe. Un `cid` es una parte mas del
     * mensaje y se ve sin pedir permiso.
     *
     * Si aun asi no cargara, la cabecera sigue llevando el nombre en texto
     * detras: no queda un hueco vacio.
     */
    const marca = correo.companyId ? await marcaParaCorreo(correo.companyId) : null;
    const logo = marca?.logo ?? null;

    if (logo) {
      adjuntos.push({
        filename: logo.nombre,
        content: logo.contenido,
        encoding: "base64" as const,
        contentType: logo.tipo,
        // @ts-expect-error nodemailer acepta `cid`; el tipo del array de
        // arriba se infiere de los adjuntos normales, que no lo llevan.
        cid: CID_LOGO,
      });
    }

    // La regla —manda la constructora, GCM al pie— vive en `lib/correo-marca`
    // y tiene sus pruebas: aqui dentro no se podria comprobar, porque sin
    // SMTP esta funcion sale mucho antes de llegar a esta linea.
    const html = rotularCorreo(
      correo.html,
      marca ? { razonSocial: marca.razonSocial, conLogo: logo !== null } : null,
    );

    // El dominio sale del remitente REAL, que puede ser el de la constructora
    // o el compartido. Sin dominio no hay cabecera: el correo sale igual y lo
    // unico que se pierde es poder emparejar su respuesta.
    const dominio = dominioDe(salida.desde);
    const messageId =
      correo.tokenDeHilo && dominio
        ? mensajeIdDeHilo(correo.tokenDeHilo, dominio)
        : undefined;

    await salida.t.sendMail({
      from: salida.desde,
      to: correo.para,
      // Si no viene, nodemailer no pone la cabecera y todo sigue como estaba.
      replyTo: correo.respuestaA,
      messageId,
      subject: correo.asunto,
      text: correo.texto,
      html,
      attachments: adjuntos.length > 0 ? adjuntos : undefined,
    });
    return { enviado: true };
  } catch (error) {
    // Un fallo de correo NO puede tumbar la operacion que lo pidio. Se
    // registra y se sigue: el alta, el reseteo o lo que sea ya ocurrio.
    console.error(
      "[GCM] No se pudo enviar el correo:",
      error instanceof Error ? error.message : error,
    );
    return { enviado: false };
  }
}


/**
 * Las tres costuras que deja `plantilla` en el HTML —logo, nombre de quien
 * firma y pie— viven en `lib/correo-marca` junto con la regla de que se pone
 * en cada una, porque alli se pueden PROBAR: aqui dentro no, ya que sin SMTP
 * `enviarCorreo` sale mucho antes de llegar a sustituirlas.
 *
 * Son comentarios HTML a proposito: si nadie los sustituye no se ven, y no
 * queda ni un hueco ni una imagen rota. La alternativa era pasar el logo y el
 * nombre por los ocho constructores de correo; esto es una costura declarada
 * en un sitio, aquello ocho firmas que mantener.
 */

/**
 * Envoltorio HTML comun a todos los correos: una caja centrada, sobria, sin
 * imagenes remotas (que muchos clientes bloquean) ni dependencias externas.
 *
 * @param opciones `seResponde` cambia el pie. Por defecto dice que no se
 *   responda, que es la verdad de casi todos: son avisos automaticos y del
 *   otro lado no hay nadie. Los que SI se responden —los que escribe una
 *   persona a un contratista— lo pasan a `true`, y entonces el pie no puede
 *   seguir diciendo lo contrario de lo que hace la cabecera `Reply-To`.
 */
function plantilla(
  titulo: string,
  cuerpo: string,
  opciones?: { seResponde?: boolean },
): string {
  const pie = opciones?.seResponde
    ? `Enviado desde ${MARCA_NOMBRE}. Puedes responder a este correo.`
    : `Este es un correo automatico de ${MARCA_NOMBRE}. No respondas a este mensaje.`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f1f5f6;font-family:Arial,Helvetica,sans-serif;color:#1b2733;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#0f7186;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:bold;">
      ${MARCA_LOGO}${MARCA_NOMBRE}
    </div>
    <div style="background:#fff;border:1px solid #d9e2e5;border-top:none;border-radius:0 0 12px 12px;padding:20px;">
      <h1 style="font-size:18px;margin:0 0 12px;">${titulo}</h1>
      ${cuerpo}
    </div>
    <p style="color:#6b7a82;font-size:12px;margin:16px 4px;">
      ${pie}
    </p>
    ${MARCA_PIE}
  </div>
</body></html>`;
}

/**
 * Correo de bienvenida al dar de alta un usuario: sus datos de acceso y la
 * clave temporal, con el aviso de cambiarla al entrar.
 */
export function correoBienvenida(datos: {
  nombre: string;
  email: string;
  claveTemporal: string;
}): Omit<Correo, "para"> {
  const url = env.APP_URL;
  const texto = [
    `Hola ${datos.nombre},`,
    ``,
    `Se ha creado tu cuenta en ${MARCA}.`,
    ``,
    `Direccion de acceso: ${url}`,
    `Usuario: ${datos.email}`,
    `Clave temporal: ${datos.claveTemporal}`,
    ``,
    `Por seguridad, deberas cambiar la clave la primera vez que entres.`,
  ].join("\n");

  const html = plantilla(
    "Tu cuenta esta lista",
    `<p>Hola <strong>${esc(datos.nombre)}</strong>,</p>
     <p>Se ha creado tu cuenta. Estos son tus datos de acceso:</p>
     <table style="width:100%;border-collapse:collapse;margin:12px 0;">
       <tr><td style="padding:6px 0;color:#6b7a82;">Acceso</td><td style="padding:6px 0;"><a href="${esc(url)}" style="color:#0f7186;">${esc(url)}</a></td></tr>
       <tr><td style="padding:6px 0;color:#6b7a82;">Usuario</td><td style="padding:6px 0;">${esc(datos.email)}</td></tr>
       <tr><td style="padding:6px 0;color:#6b7a82;">Clave temporal</td><td style="padding:6px 0;font-family:monospace;font-size:16px;letter-spacing:1px;">${esc(datos.claveTemporal)}</td></tr>
     </table>
     <p style="color:#6b7a82;font-size:13px;">Por seguridad, deberas cambiarla la primera vez que entres.</p>`,
  );

  return { asunto: `Acceso a ${MARCA}`, texto, html };
}

/**
 * Aviso de que llego un mensaje nuevo por el canal de soporte.
 *
 * RECORDATORIO, no el canal: nunca lleva el cuerpo del mensaje —evita
 * dejar correspondencia de soporte en una bandeja que no es GCM— y no se
 * puede responder por correo, asi que usa el pie por defecto de
 * `plantilla` ("no respondas a este mensaje"). Sirve para los dos lados:
 * `paraOperador` cambia el saludo y a donde manda.
 */
export function correoNuevoMensajeSoporte(datos: {
  paraOperador: boolean;
  /// Nombre de la constructora, para que quien lee sepa de cual es.
  constructora: string;
  /// A donde entrar a leerlo: `/operador/[id]` o `/empresa/soporte`.
  ruta: string;
}): Omit<Correo, "para"> {
  const url = `${env.APP_URL.replace(/\/$/, "")}${datos.ruta}`;
  const texto = datos.paraOperador
    ? [
        `Nuevo mensaje de soporte de ${datos.constructora}.`,
        ``,
        `Entra a leerlo: ${url}`,
      ].join("\n")
    : [
        `Tienes un mensaje nuevo de soporte de ${MARCA}.`,
        ``,
        `Entra a leerlo: ${url}`,
      ].join("\n");

  const html = plantilla(
    "Mensaje nuevo de soporte",
    datos.paraOperador
      ? `<p>Nuevo mensaje de <strong>${esc(datos.constructora)}</strong>.</p>
         <p><a href="${esc(url)}" style="background:#0f7186;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:bold;">Entrar a leerlo</a></p>`
      : `<p>Tienes un mensaje nuevo de soporte de ${esc(MARCA)}.</p>
         <p><a href="${esc(url)}" style="background:#0f7186;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:bold;">Entrar a leerlo</a></p>`,
  );

  return {
    asunto: datos.paraOperador
      ? `Soporte: mensaje de ${datos.constructora}`
      : `Tienes un mensaje de soporte`,
    texto,
    html,
  };
}

/**
 * Correo cuando un administrador restablece la clave de un usuario: la nueva
 * clave temporal, con el aviso de que las sesiones anteriores se cerraron.
 */
export function correoClaveRestablecida(datos: {
  nombre: string;
  email: string;
  claveTemporal: string;
}): Omit<Correo, "para"> {
  const url = env.APP_URL;
  const texto = [
    `Hola ${datos.nombre},`,
    ``,
    `Un administrador ha restablecido tu clave de acceso a ${MARCA}.`,
    ``,
    `Direccion de acceso: ${url}`,
    `Usuario: ${datos.email}`,
    `Nueva clave temporal: ${datos.claveTemporal}`,
    ``,
    `Deberas cambiarla la primera vez que entres. Si no pediste esto, avisa a`,
    `tu administrador: tus sesiones anteriores ya se cerraron.`,
  ].join("\n");

  const html = plantilla(
    "Tu clave se restablecio",
    `<p>Hola <strong>${esc(datos.nombre)}</strong>,</p>
     <p>Un administrador ha restablecido tu clave. Entra con esta clave temporal:</p>
     <table style="width:100%;border-collapse:collapse;margin:12px 0;">
       <tr><td style="padding:6px 0;color:#6b7a82;">Acceso</td><td style="padding:6px 0;"><a href="${esc(url)}" style="color:#0f7186;">${esc(url)}</a></td></tr>
       <tr><td style="padding:6px 0;color:#6b7a82;">Usuario</td><td style="padding:6px 0;">${esc(datos.email)}</td></tr>
       <tr><td style="padding:6px 0;color:#6b7a82;">Nueva clave</td><td style="padding:6px 0;font-family:monospace;font-size:16px;letter-spacing:1px;">${esc(datos.claveTemporal)}</td></tr>
     </table>
     <p style="color:#6b7a82;font-size:13px;">Deberas cambiarla al entrar. Si no pediste esto, avisa a tu administrador: tus sesiones anteriores ya se cerraron.</p>`,
  );

  return { asunto: `Clave restablecida — ${MARCA}`, texto, html };
}

/**
 * Correo con el enlace para recuperar la clave.
 *
 * Dice explicitamente que se ignore si nadie lo pidio, y cuanto dura el
 * enlace: quien recibe esto sin haberlo pedido merece saber que su cuenta
 * sigue intacta mientras no toque nada.
 */
export function correoRecuperacion(datos: {
  nombre: string;
  enlace: string;
  minutos: number;
  /**
   * De que constructora es la cuenta que este enlace restablece.
   *
   * Va SIEMPRE, tenga la persona una cuenta o cinco. Desde que el correo puede
   * repetirse entre constructoras, quien tenga dos recibe dos mensajes: sin
   * decir cual es cual, son una moneda al aire, y elegir mal deja sin
   * restablecer la clave que hacia falta.
   */
  constructora: string;
}): Omit<Correo, "para"> {
  const texto = [
    `Hola ${datos.nombre},`,
    ``,
    `Alguien pidio restablecer la clave de tu cuenta de ${datos.constructora} en ${MARCA}.`,
    ``,
    `Abre este enlace para elegir una nueva:`,
    datos.enlace,
    ``,
    `El enlace caduca en ${datos.minutos} minutos y sirve una sola vez.`,
    ``,
    `Si no lo pediste, ignora este correo: tu clave sigue siendo la misma`,
    `y nadie ha entrado en tu cuenta.`,
  ].join("\n");

  const html = plantilla(
    "Restablece tu clave",
    `<p>Hola <strong>${esc(datos.nombre)}</strong>,</p>
     <p>Alguien pidio restablecer la clave de tu cuenta de <strong>${esc(datos.constructora)}</strong>. Si fuiste tu, elige una nueva aqui:</p>
     <p style="margin:20px 0;">
       <a href="${esc(datos.enlace)}" style="background:#0f7186;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:bold;">Elegir clave nueva</a>
     </p>
     <p style="color:#6b7a82;font-size:13px;">El enlace caduca en ${datos.minutos} minutos y sirve una sola vez.</p>
     <p style="color:#6b7a82;font-size:13px;">Si no lo pediste, ignora este correo: tu clave sigue siendo la misma y nadie ha entrado en tu cuenta.</p>
     <p style="color:#6b7a82;font-size:12px;word-break:break-all;">Si el boton no funciona, copia esta direccion: ${esc(datos.enlace)}</p>`,
  );

  return {
    asunto: `Restablece tu clave de ${datos.constructora} — ${MARCA}`,
    texto,
    html,
  };
}

/**
 * Correo con el codigo de verificacion en dos pasos.
 *
 * El codigo va grande y espaciado porque se teclea a mano desde el movil
 * mirando esta pantalla, y avisa de que hacer si no fue uno quien entro:
 * recibir este correo sin haberlo pedido significa que alguien sabe la clave.
 */
export function correoCodigoAcceso(datos: {
  nombre: string;
  codigo: string;
  minutos: number;
}): Omit<Correo, "para"> {
  const texto = [
    `Hola ${datos.nombre},`,
    ``,
    `Tu codigo para entrar en ${MARCA} es:`,
    ``,
    datos.codigo,
    ``,
    `Caduca en ${datos.minutos} minutos.`,
    ``,
    `Si no estabas entrando, alguien conoce tu clave: cambiala en cuanto`,
    `puedas y avisa a tu administrador.`,
  ].join("\n");

  const html = plantilla(
    "Tu codigo de acceso",
    `<p>Hola <strong>${esc(datos.nombre)}</strong>,</p>
     <p>Escribe este codigo para terminar de entrar:</p>
     <p style="margin:20px 0;text-align:center;">
       <span style="display:inline-block;background:#f1f5f6;border:1px solid #d9e2e5;border-radius:10px;padding:14px 24px;font-family:monospace;font-size:30px;letter-spacing:8px;font-weight:bold;color:#0f7186;">${esc(datos.codigo)}</span>
     </p>
     <p style="color:#6b7a82;font-size:13px;text-align:center;">Caduca en ${datos.minutos} minutos.</p>
     <p style="color:#6b7a82;font-size:13px;">Si no estabas entrando, alguien conoce tu clave: cambiala en cuanto puedas y avisa a tu administrador.</p>`,
  );

  return { asunto: `Codigo de acceso: ${datos.codigo}`, texto, html };
}

/**
 * Correo de restricciones del Lookahead.
 *
 * Cuatro variantes del mismo formato, una por momento: lo que se acaba de
 * abrir, lo que lleva dias sin levantarse, lo que ya quedo listo y el repaso
 * del dia.
 *
 * Cada linea dice la CONSECUENCIA y no solo el hecho, igual que el panel «Que
 * falta»: "3 restricciones" no mueve a nadie; "estas tres tareas no se van a
 * poder comprometer el lunes" si.
 *
 * NUNCA se manda con varios en el "para". Se envia uno a uno, como la curva de
 * avance: en un correo de obra la lista puede incluir al cliente y al
 * proveedor a la vez, y ninguno tiene por que ver al otro.
 *
 * Este SI lleva enlace, al contrario que el SMS: el correo no tiene el
 * problema de las operadoras marcando como spam lo que lleva URL.
 */
export function correoRestricciones(datos: {
  nombre: string;
  obra: string;
  titulo: string;
  cuerpo: string;
  lineas: { tarea: string; flujo: string; dias: number | null }[];
  /// Las que no caben en la tabla.
  masCuantas: number;
  /// A donde se va a resolverlo. Vacio si no hay direccion publica.
  enlace: string | null;
}): Omit<Correo, "para"> {
  const linea = (l: (typeof datos.lineas)[number]) =>
    `- ${l.tarea} — ${l.flujo}${l.dias !== null && l.dias > 0 ? ` (${l.dias} d)` : ""}`;

  const texto = [
    `Hola ${datos.nombre},`,
    ``,
    `${datos.obra}: ${datos.titulo}`,
    ``,
    datos.cuerpo,
    ``,
    ...datos.lineas.map(linea),
    ...(datos.masCuantas > 0 ? [`- y otras ${datos.masCuantas}`] : []),
    ...(datos.enlace ? [``, datos.enlace] : []),
  ].join("\n");

  const filas = datos.lineas
    .map(
      (l) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e8eef0;">${esc(l.tarea)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e8eef0;color:#0f7186;white-space:nowrap;">${esc(l.flujo)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e8eef0;text-align:right;white-space:nowrap;color:${
          l.dias !== null && l.dias >= 3 ? "#b42318" : "#6b7a82"
        };">${l.dias !== null && l.dias > 0 ? `${l.dias} d` : ""}</td>
      </tr>`,
    )
    .join("");

  const html = plantilla(
    esc(datos.titulo),
    `<p>Hola <strong>${esc(datos.nombre)}</strong>,</p>
     <p style="color:#6b7a82;">${esc(datos.obra)}</p>
     <p>${esc(datos.cuerpo)}</p>
     <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">${filas}</table>
     ${
       datos.masCuantas > 0
         ? `<p style="color:#6b7a82;font-size:13px;">Y otras ${datos.masCuantas} más.</p>`
         : ""
     }
     ${
       datos.enlace
         ? `<p style="margin:20px 0;">
              <a href="${esc(datos.enlace)}" style="background:#0f7186;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:bold;">Ver el Lookahead</a>
            </p>`
         : ""
     }`,
  );

  return { asunto: `${datos.obra}: ${datos.titulo}`, texto, html };
}

/**
 * Correo de un hito de obra.
 *
 * Tiene plantilla propia y no reusa la de restricciones por una diferencia que
 * se ve a simple vista: aquella es una TABLA de tareas con su flujo y sus dias
 * —lo que se lee de un vistazo cuando hay ocho cosas pendientes— y un hito es
 * UNA fecha. Metido en esa tabla, lo importante —el dia— quedaria en una
 * columna estrecha a la derecha, y el boton diria «Ver el Lookahead», que es
 * el sitio donde el hito no esta.
 *
 * Se manda uno a uno, como todos los correos de obra: la lista puede incluir
 * al cliente y al proveedor a la vez, y ninguno tiene por que ver al otro.
 */
export function correoHito(datos: {
  nombre: string;
  obra: string;
  titulo: string;
  cuerpo: string;
  /// El nombre del hito y el dia en que toca, ya en formato de calendario.
  hito: string;
  fecha: string;
  /// Si la fecha ya paso. Cambia el color, que es lo unico que se lee antes
  /// que el texto.
  vencido: boolean;
  /// A donde se va a verlo. Vacio si no hay direccion publica.
  enlace: string | null;
}): Omit<Correo, "para"> {
  const texto = [
    `Hola ${datos.nombre},`,
    ``,
    `${datos.obra}: ${datos.titulo}`,
    ``,
    datos.cuerpo,
    ``,
    `- ${datos.hito} — ${datos.fecha}`,
    ...(datos.enlace ? [``, datos.enlace] : []),
  ].join("\n");

  const color = datos.vencido ? "#b42318" : "#0f7186";

  const html = plantilla(
    esc(datos.titulo),
    `<p>Hola <strong>${esc(datos.nombre)}</strong>,</p>
     <p style="color:#6b7a82;">${esc(datos.obra)}</p>
     <div style="border-left:4px solid ${color};padding:10px 14px;margin:16px 0;background:#f7fafb;">
       <div style="font-weight:bold;font-size:16px;">${esc(datos.hito)}</div>
       <div style="color:${color};font-size:14px;">${esc(datos.fecha)}</div>
     </div>
     <p>${esc(datos.cuerpo)}</p>
     ${
       datos.enlace
         ? `<p style="margin:20px 0;">
              <a href="${esc(datos.enlace)}" style="background:#0f7186;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:bold;">Ver el cronograma</a>
            </p>`
         : ""
     }`,
  );

  return { asunto: `${datos.obra}: ${datos.titulo}`, texto, html };
}

/**
 * Correo con la curva de avance de una obra.
 *
 * La imagen va como ADJUNTO y no incrustada en el HTML: casi todos los
 * clientes de correo bloquean las imagenes remotas, y las incrustadas en
 * base64 dentro del cuerpo las descarta Gmail. Como adjunto llega siempre.
 *
 * Las cifras van ademas en el texto, para que el correo sirva aunque quien lo
 * reciba no abra el adjunto: es lo que se lee de un vistazo en el movil.
 */
export function correoCurvaAvance(datos: {
  obra: string;
  corte: string;
  planeado: string;
  real: string;
  desfase: string;
  ritmo: string;
  termino: string;
  nota?: string;
  remitente: string;
}): Omit<Correo, "para"> {
  const atrasado = datos.desfase.trim().startsWith("-");
  const color = atrasado ? "#b42318" : "#0b804b";

  const texto = [
    `Curva de avance — ${datos.obra}`,
    ``,
    `Corte: ${datos.corte}`,
    `Avance real: ${datos.real}%`,
    `Avance planeado: ${datos.planeado}%`,
    `Desfase: ${datos.desfase}%`,
    `Ritmo actual: ${datos.ritmo} de lo previsto`,
    `Termino proyectado: ${datos.termino}`,
    ...(datos.nota ? ["", `Nota: ${datos.nota}`] : []),
    ``,
    `Enviado por ${datos.remitente} desde ${MARCA}.`,
    `El grafico va adjunto a este correo.`,
  ].join("\n");

  const fila = (etiqueta: string, valor: string, destacado = false) =>
    `<tr>
       <td style="padding:7px 0;color:#6b7a82;">${esc(etiqueta)}</td>
       <td style="padding:7px 0;text-align:right;font-weight:bold;${destacado ? `color:${color};` : ""}">${esc(valor)}</td>
     </tr>`;

  const html = plantilla(
    `Curva de avance — ${esc(datos.obra)}`,
    `<p style="margin:0 0 4px;color:#6b7a82;">Corte del ${esc(datos.corte)}</p>
     <table style="width:100%;border-collapse:collapse;margin:12px 0;">
       ${fila("Avance real", `${datos.real}%`)}
       ${fila("Avance planeado", `${datos.planeado}%`)}
       ${fila("Desfase", `${datos.desfase}%`, true)}
       ${fila("Ritmo actual", `${datos.ritmo} de lo previsto`)}
       ${fila("Termino proyectado", datos.termino)}
     </table>
     ${datos.nota ? `<p style="background:#f1f5f6;border-radius:8px;padding:10px 12px;margin:12px 0;">${esc(datos.nota)}</p>` : ""}
     <p style="color:#6b7a82;font-size:13px;">El grafico va adjunto a este correo.</p>
     <p style="color:#6b7a82;font-size:13px;">Enviado por ${esc(datos.remitente)}.</p>`,
  );

  return { asunto: `Curva de avance — ${datos.obra} (corte ${datos.corte})`, texto, html };
}

/**
 * Correo con el informe de obra al corte, con los datos completos adjuntos.
 *
 * El cuerpo NO repite el informe: da el titular, cuatro cifras y las partidas
 * que justifican abrir el adjunto. Quien lo recibe suele leerlo en el movil, y
 * un volcado de siete tablas ahi no se lee —se archiva—.
 *
 * Van DOS adjuntos: el informe completo en PDF —para leer, imprimir y
 * archivar— y el mismo contenido en hoja de calculo, para quien vaya a
 * cruzarlo con lo suyo. Mandar solo uno obliga a adivinar cual necesita quien
 * lo recibe.
 *
 * Como el de restricciones y el de la curva, se manda UNO A UNO: la lista de
 * un informe de obra puede llevar al cliente y al contratista a la vez, y
 * ninguno tiene por que ver al otro.
 */
/**
 * El presupuesto contractual, camino del cliente.
 *
 * Solo el CONTRACTUAL se manda por aqui, y el servicio que lo llama no acepta
 * otro: el meta y la comparativa llevan el costo y la bolsa, y un correo es
 * exactamente la forma mas facil de que salgan de la empresa por descuido.
 *
 * El correo no repite las cifras del presupuesto. Un total en el cuerpo y otro
 * en el adjunto son dos numeros que alguien tendra que cuadrar el dia que no
 * coincidan; el documento firmado es el PDF, y el correo solo lo presenta.
 */
export function correoPresupuestoContractual(datos: {
  obra: string;
  total: string;
  nota?: string;
  remitente: string;
  adjunto: string;
}): Omit<Correo, "para"> {
  const texto = [
    `Presupuesto — ${datos.obra}`,
    ``,
    `Adjunto el presupuesto contractual de la obra, por ${datos.total}.`,
    ...(datos.nota ? ["", `Nota: ${datos.nota}`] : []),
    ``,
    `Adjunto:`,
    `- ${datos.adjunto}`,
    ``,
    `Enviado por ${datos.remitente} desde ${MARCA}.`,
  ].join("\n");

  // Todo lo que entra aqui se escapa: el nombre de la obra sale de lo que
  // teclea el usuario y la nota la escribe quien envia. Un enlace colado ahi
  // se convertiria en un enlace de verdad dentro de un correo con el membrete
  // de la empresa.
  const html = plantilla(
    `Presupuesto — ${esc(datos.obra)}`,
    `<p style="font-size:15px;">Adjunto el presupuesto contractual de la obra, por
       <strong>${esc(datos.total)}</strong>.</p>
     ${datos.nota ? `<p style="background:#f1f5f6;border-radius:8px;padding:10px 12px;margin:12px 0;">${esc(datos.nota)}</p>` : ""}
     <p style="color:#6b7a82;font-size:13px;margin-top:16px;">
       Adjunto: ${esc(datos.adjunto)}
     </p>`,
  );

  return { asunto: `Presupuesto — ${datos.obra}`, texto, html };
}

export function correoInformeObra(datos: {
  obra: string;
  corte: string;
  estado: string;
  cifras: { etiqueta: string; valor: string }[];
  ppc: string | null;
  masGraves: { partida: string; detalle: string }[];
  gravesOmitidas: number;
  nota?: string;
  remitente: string;
  /// El PDF: el informe para leer.
  adjunto: string;
  /// La hoja de calculo: el mismo informe para cruzar con lo de cada uno.
  adjuntoDatos: string;
}): Omit<Correo, "para"> {
  const texto = [
    `Informe de obra — ${datos.obra}`,
    ``,
    `Corte: ${datos.corte}`,
    datos.estado,
    ``,
    ...datos.cifras.map((c) => `${c.etiqueta}: ${c.valor}`),
    ...(datos.ppc ? ["", datos.ppc] : []),
    ...(datos.masGraves.length > 0
      ? [
          ``,
          `Lo que mas frena:`,
          ...datos.masGraves.map((g) => `- ${g.partida} — ${g.detalle}`),
          ...(datos.gravesOmitidas > 0
            ? [`- y otras ${datos.gravesOmitidas} con atraso grave`]
            : []),
        ]
      : []),
    ...(datos.nota ? ["", `Nota: ${datos.nota}`] : []),
    ``,
    `Adjuntos:`,
    `- ${datos.adjunto}: el informe completo, para leer o imprimir.`,
    `- ${datos.adjuntoDatos}: los mismos datos en hoja de calculo.`,
    ``,
    `Enviado por ${datos.remitente} desde ${MARCA}.`,
  ].join("\n");

  // Todo lo que entra aqui se escapa: el nombre de la obra y el de cada
  // partida salen de un XML que sube el usuario, y la nota la escribe quien
  // envia. Un enlace colado en un nombre de tarea se convertiria en un enlace
  // de verdad dentro de un correo con el membrete de la empresa.
  const fila = (etiqueta: string, valor: string) =>
    `<tr>
       <td style="padding:7px 0;color:#6b7a82;">${esc(etiqueta)}</td>
       <td style="padding:7px 0;text-align:right;font-weight:bold;">${esc(valor)}</td>
     </tr>`;

  const graves = datos.masGraves
    .map(
      (g) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e8eef0;">${esc(g.partida)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e8eef0;color:#b42318;white-space:nowrap;font-size:13px;">${esc(g.detalle)}</td>
      </tr>`,
    )
    .join("");

  const html = plantilla(
    `Informe de obra — ${esc(datos.obra)}`,
    `<p style="margin:0 0 4px;color:#6b7a82;">Corte del ${esc(datos.corte)}</p>
     <p style="font-size:15px;">${esc(datos.estado)}</p>
     <table style="width:100%;border-collapse:collapse;margin:12px 0;">
       ${datos.cifras.map((c) => fila(c.etiqueta, c.valor)).join("")}
     </table>
     ${datos.ppc ? `<p style="background:#f1f5f6;border-radius:8px;padding:10px 12px;margin:12px 0;">${esc(datos.ppc)}</p>` : ""}
     ${
       datos.masGraves.length > 0
         ? `<h2 style="font-size:14px;margin:18px 0 6px;">Lo que más frena</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">${graves}</table>
            ${
              datos.gravesOmitidas > 0
                ? `<p style="color:#6b7a82;font-size:13px;">Y otras ${datos.gravesOmitidas} con atraso grave, en el adjunto.</p>`
                : ""
            }`
         : ""
     }
     ${datos.nota ? `<p style="background:#f1f5f6;border-radius:8px;padding:10px 12px;margin:12px 0;">${esc(datos.nota)}</p>` : ""}
     <p style="color:#6b7a82;font-size:13px;margin-top:16px;">
       Van dos archivos adjuntos:<br>
       <strong>${esc(datos.adjunto)}</strong> — el informe completo, para leer o imprimir.<br>
       <strong>${esc(datos.adjuntoDatos)}</strong> — los mismos datos en hoja de cálculo.
     </p>
     <p style="color:#6b7a82;font-size:13px;">Enviado por ${esc(datos.remitente)}.</p>`,
  );

  return {
    asunto: `Informe de obra — ${datos.obra} (corte ${datos.corte})`,
    texto,
    html,
  };
}

/**
 * Correo de una persona de la obra a un contratista.
 *
 * ES EL PRIMERO QUE NO ES AUTOMATICO, y de ahi todo lo que lo distingue del
 * resto: el cuerpo lo escribe una persona, lleva `Reply-To` a un buzon que
 * alguien lee, y el pie lo dice en vez de pedir que no se responda. Un correo
 * que dice «no respondas» y ademas trae Reply-To se contradice a si mismo.
 *
 * Como todos los de obra, sale UNO A UNO —aqui es literal: hay un solo
 * destinatario— y el tipo lo garantiza devolviendo `Omit<Correo, "para">`.
 *
 * TODO SE ESCAPA. El cuerpo lo teclea el usuario y la razon social viene del
 * catalogo (o de SUNAT): sin escapar, un `<a href>` en cualquiera de los dos
 * sale como enlace de verdad en un correo con el membrete de la empresa. Ya
 * paso una vez con los siete correos anteriores (`dab8a00`).
 */
export function correoAlContratista(datos: {
  contratista: string;
  /// La obra de la que sale, si sale de una. Encabeza el asunto para que el
  /// contratista sepa de cual de sus frentes le hablan.
  obra?: string | null;
  asunto: string;
  cuerpo: string;
  remitente: string;
  /// Solo los nombres: se listan para que se note si el adjunto no llego.
  adjuntos: readonly string[];
}): Omit<Correo, "para"> {
  const encabezado = datos.obra?.trim();
  const asunto = encabezado ? `${encabezado}: ${datos.asunto}` : datos.asunto;

  const texto = [
    datos.cuerpo,
    ``,
    ...(datos.adjuntos.length > 0
      ? [`Adjuntos:`, ...datos.adjuntos.map((a) => `- ${a}`), ``]
      : []),
    `Enviado por ${datos.remitente}${encabezado ? ` — ${encabezado}` : ""}.`,
  ].join("\n");

  // Escapar ANTES de meter los <br>: al reves, el `<br>` recien puesto se
  // escaparia y el correo ensenaria la etiqueta en crudo.
  const cuerpoHtml = esc(datos.cuerpo).replace(/\r?\n/g, "<br>");

  const html = plantilla(
    esc(datos.asunto),
    `${encabezado ? `<p style="margin:0 0 12px;color:#6b7a82;">${esc(encabezado)}</p>` : ""}
     <p style="white-space:pre-wrap;">${cuerpoHtml}</p>
     ${
       datos.adjuntos.length > 0
         ? `<p style="color:#6b7a82;font-size:13px;margin-top:16px;">
              ${datos.adjuntos.length === 1 ? "Va un archivo adjunto" : "Van estos archivos adjuntos"}:<br>
              ${datos.adjuntos.map((a) => `<strong>${esc(a)}</strong>`).join("<br>")}
            </p>`
         : ""
     }
     <p style="color:#6b7a82;font-size:13px;margin-top:16px;">Enviado por ${esc(datos.remitente)}.</p>`,
    { seResponde: true },
  );

  return { asunto, texto, html };
}
