import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env, isProduction } from "@/lib/env";

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

export interface Correo {
  para: string;
  asunto: string;
  /// Version en texto plano, para clientes que no muestran HTML.
  texto: string;
  html: string;
}

export async function enviarCorreo(correo: Correo): Promise<{ enviado: boolean }> {
  const t = obtenerTransporte();

  if (!t) {
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
    await t.sendMail({
      from: env.SMTP_FROM ?? env.SMTP_USER,
      to: correo.para,
      subject: correo.asunto,
      text: correo.texto,
      html: correo.html,
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

/// El remitente y la marca que encabeza los correos.
const MARCA = "GCM - Gestor de Construccion y Mantenimiento";

/**
 * Envoltorio HTML comun a todos los correos: una caja centrada, sobria, sin
 * imagenes remotas (que muchos clientes bloquean) ni dependencias externas.
 */
function plantilla(titulo: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f1f5f6;font-family:Arial,Helvetica,sans-serif;color:#1b2733;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#0f7186;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:bold;">
      ${MARCA}
    </div>
    <div style="background:#fff;border:1px solid #d9e2e5;border-top:none;border-radius:0 0 12px 12px;padding:20px;">
      <h1 style="font-size:18px;margin:0 0 12px;">${titulo}</h1>
      ${cuerpo}
    </div>
    <p style="color:#6b7a82;font-size:12px;margin:16px 4px;">
      Este es un correo automatico de ${MARCA}. No respondas a este mensaje.
    </p>
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
    `<p>Hola <strong>${datos.nombre}</strong>,</p>
     <p>Se ha creado tu cuenta. Estos son tus datos de acceso:</p>
     <table style="width:100%;border-collapse:collapse;margin:12px 0;">
       <tr><td style="padding:6px 0;color:#6b7a82;">Acceso</td><td style="padding:6px 0;"><a href="${url}" style="color:#0f7186;">${url}</a></td></tr>
       <tr><td style="padding:6px 0;color:#6b7a82;">Usuario</td><td style="padding:6px 0;">${datos.email}</td></tr>
       <tr><td style="padding:6px 0;color:#6b7a82;">Clave temporal</td><td style="padding:6px 0;font-family:monospace;font-size:16px;letter-spacing:1px;">${datos.claveTemporal}</td></tr>
     </table>
     <p style="color:#6b7a82;font-size:13px;">Por seguridad, deberas cambiarla la primera vez que entres.</p>`,
  );

  return { asunto: `Acceso a ${MARCA}`, texto, html };
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
    `<p>Hola <strong>${datos.nombre}</strong>,</p>
     <p>Un administrador ha restablecido tu clave. Entra con esta clave temporal:</p>
     <table style="width:100%;border-collapse:collapse;margin:12px 0;">
       <tr><td style="padding:6px 0;color:#6b7a82;">Acceso</td><td style="padding:6px 0;"><a href="${url}" style="color:#0f7186;">${url}</a></td></tr>
       <tr><td style="padding:6px 0;color:#6b7a82;">Usuario</td><td style="padding:6px 0;">${datos.email}</td></tr>
       <tr><td style="padding:6px 0;color:#6b7a82;">Nueva clave</td><td style="padding:6px 0;font-family:monospace;font-size:16px;letter-spacing:1px;">${datos.claveTemporal}</td></tr>
     </table>
     <p style="color:#6b7a82;font-size:13px;">Deberas cambiarla al entrar. Si no pediste esto, avisa a tu administrador: tus sesiones anteriores ya se cerraron.</p>`,
  );

  return { asunto: `Clave restablecida — ${MARCA}`, texto, html };
}
