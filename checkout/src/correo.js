/**
 * correo.js — Lo que le llega a la gente cuando pasa algo.
 *
 * POR QUÉ IMPORTA MÁS DE LO QUE PARECE. Hasta ahora la tienda le decía al
 * comprador «Le enviamos el comprobante y las instrucciones a su correo» y no
 * salía ningún correo. Y la hoja de reclamación prometía una copia que tampoco
 * salía, cuando el reglamento obliga a entregarla en el acto. Prometer una
 * constancia y no darla es peor que no prometerla.
 *
 * TRES CORREOS, Y CADA UNO TIENE UN DESTINATARIO CON UN DERECHO DISTINTO:
 *
 *   · Al COMPRADOR, cuando el pago se confirma: su comprobante y qué va a
 *     pasar con lo que ha comprado.
 *   · Al ADMINISTRADOR, con cada venta: para que no haya que entrar al panel
 *     a mirar si ha entrado algo.
 *   · Al RECLAMANTE, su copia de la hoja, con el número correlativo.
 *
 * NUNCA TUMBA NADA. Un correo que no sale no puede impedir un cobro, ni una
 * reclamación, ni la emisión de un comprobante. Todo lo de aquí falla en
 * blando: se anota el problema y se sigue. Lo contrario —perder una venta
 * porque el servidor de correo estaba caído— es mucho peor que un correo que
 * hay que reenviar a mano.
 *
 * Y NO ADJUNTA LO QUE NO DEBE. Del comprobante va el XML firmado, que es el
 * documento con valor. Del pago no va nada: aquí nunca ha habido un dato de
 * tarjeta y no va a empezar a haberlo en un correo.
 */

const nodemailer = require('nodemailer');
const { COMERCIO } = require('./comercio');
const { formatearPrecio } = require('./catalogo');
const { lineasDe } = require('./pedidos');
const { etiquetaDocumento } = require('./documentos');

let transporte = null;

function config() {
  return {
    host: (process.env.CORREO_HOST || '').trim(),
    puerto: Number(process.env.CORREO_PUERTO || 465),
    usuario: (process.env.CORREO_USUARIO || '').trim(),
    clave: process.env.CORREO_CLAVE || '',
    desde: (process.env.CORREO_DESDE || process.env.CORREO_USUARIO || '').trim(),
    admin: (process.env.CORREO_ADMIN || COMERCIO.correo).trim(),
  };
}

function configurado() {
  const c = config();
  return Boolean(c.host && c.usuario && c.clave && c.desde);
}

function obtenerTransporte() {
  if (transporte) return transporte;
  const c = config();
  transporte = nodemailer.createTransport({
    host: c.host,
    port: c.puerto,
    // 465 es SMTP sobre TLS desde el principio; 587 empieza en claro y sube a
    // TLS con STARTTLS. Elegir mal deja el envío colgado sin decir por qué.
    secure: c.puerto === 465,
    auth: { user: c.usuario, pass: c.clave },
  });
  return transporte;
}

/** Comprueba que el servidor de correo acepta las credenciales. */
async function comprobar() {
  if (!configurado()) {
    return { ok: false, motivo: 'Faltan CORREO_HOST, CORREO_USUARIO, CORREO_CLAVE o CORREO_DESDE.' };
  }
  try {
    await obtenerTransporte().verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}

/**
 * Manda un correo. Devuelve `{ok}`; NUNCA lanza.
 *
 * Quien llama a esto está normalmente dentro de un cobro o de una reclamación,
 * y ahí una excepción se lleva por delante algo que ya no se puede repetir.
 */
async function enviar({ para, asunto, html, texto, adjuntos = [], responderA }) {
  if (!configurado()) {
    console.warn('[correo] sin configurar, no se envía:', asunto);
    return { ok: false, motivo: 'correo no configurado' };
  }
  if (!para) return { ok: false, motivo: 'sin destinatario' };

  const c = config();
  try {
    await obtenerTransporte().sendMail({
      from: `"${COMERCIO.razonSocial}" <${c.desde}>`,
      to: para,
      replyTo: responderA || c.admin,
      subject: asunto,
      text: texto,
      html,
      attachments: adjuntos,
    });
    console.log(`[correo] enviado a ${para}: ${asunto}`);
    return { ok: true };
  } catch (e) {
    console.error(`[correo] NO se pudo enviar a ${para} (${asunto}):`, e.message);
    return { ok: false, motivo: e.message };
  }
}

/* ------------------------------------------------------------- presentación */

/**
 * Los adjuntos de un comprobante: el PDF para leerlo y el XML que vale.
 *
 * EL ORDEN IMPORTA, aunque parezca cosmetico: el primero es el que los
 * clientes de correo enseñan y previsualizan, y lo que el comprador quiere ver
 * es su boleta, no un archivo de etiquetas. El XML va detras, que es el
 * documento con validez ante SUNAT y hay que entregarlo igual.
 *
 * Cada uno va si esta: que falte el PDF no quita el XML, ni al reves.
 */
function adjuntosDe(comprobante, xml, pdf) {
  if (!comprobante || !comprobante.ok) return [];
  const base = `${COMERCIO.ruc}-${comprobante.serie}-${comprobante.numero}`;
  const lista = [];
  if (pdf) {
    lista.push({ filename: `${base}.pdf`, content: pdf, contentType: 'application/pdf' });
  }
  if (xml) {
    lista.push({ filename: `${base}.xml`, content: xml, contentType: 'application/xml' });
  }
  return lista;
}

function e(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * El armazón de todos los correos.
 *
 * Estilos EN LÍNEA y una tabla por fuera: los clientes de correo descartan las
 * hojas de estilo y muchos ignoran flexbox. Lo que se ve bien en el navegador
 * se ve roto en Outlook si se hace de otra manera.
 */
function plantilla(titulo, cuerpo) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f4f7f6;font:15px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#12211f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
<tr><td style="background:#fff;border:1px solid #dde5e3;border-radius:10px;padding:26px">
<h1 style="margin:0 0 16px;font-size:19px;color:#12211f">${e(titulo)}</h1>
${cuerpo}
</td></tr>
<tr><td style="padding:18px 8px;color:#5d6f6c;font-size:12px;line-height:1.5">
<b>${e(COMERCIO.razonSocial)}</b> · RUC ${e(COMERCIO.ruc)}<br>
${e(COMERCIO.direccion)}<br>
${e(COMERCIO.correo)} · ${e(COMERCIO.telefono)}
</td></tr></table></body></html>`;
}

const FILA = 'padding:7px 0;border-bottom:1px solid #eef3f2;font-size:14px';

function tabla(filas) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">`
    + filas.filter(Boolean).map(([k, v]) =>
      `<tr><td style="${FILA};color:#5d6f6c;width:42%">${e(k)}</td>`
      + `<td style="${FILA}"><b>${v}</b></td></tr>`).join('')
    + '</table>';
}

/**
 * Qué se compró, línea a línea.
 *
 * Con un solo producto se enseña como una fila más, porque una tabla de
 * cantidades para una sola cosa es ruido. Con varios, el comprador tiene
 * derecho a ver qué le cobraron por cada uno.
 */
function detalleCompra(pedido) {
  const lineas = lineasDe(pedido);
  const moneda = pedido.moneda || 'PEN';
  const total = formatearPrecio(pedido.importeCentimos || 0, moneda);

  if (lineas.length <= 1) {
    return tabla([
      ['Producto', e(lineas[0] ? lineas[0].nombre : (pedido.productoNombre || '—'))],
      ['Importe', e(total)],
    ]);
  }

  const filas = lineas.map((l) => `<tr>
    <td style="${FILA}">${e(l.nombre)}${l.cantidad > 1 ? ` <span style="color:#5d6f6c">× ${e(l.cantidad)}</span>` : ''}</td>
    <td style="${FILA};text-align:right;white-space:nowrap">${e(formatearPrecio(l.importeCentimos, moneda))}</td>
  </tr>`).join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">
${filas}
<tr><td style="${FILA};border-bottom:0;padding-top:10px"><b>Total</b></td>
    <td style="${FILA};border-bottom:0;padding-top:10px;text-align:right"><b>${e(total)}</b></td></tr>
</table>`;
}

/* ---------------------------------------------------------------- los tres */

/**
 * Al comprador, cuando el pago se confirma.
 *
 * Se le dice qué comprobante le corresponde y CUÁNDO recibirá el producto,
 * porque la entrega todavía la hace una persona. Prometer «en 24 horas
 * hábiles» es lo que dicen los Términos, así que es lo que se repite aquí.
 */
async function avisarCompra({ pedido, comprobante, xml, pdf }) {
  const nombreDoc = comprobante && comprobante.ok
    ? `${comprobante.tipo} ${comprobante.serie}-${comprobante.numero}` : null;

  const cuerpo = `
<p style="margin:0 0 16px">Hemos recibido su pago. Gracias por su compra.</p>
${detalleCompra(pedido)}
${tabla([
    ['Pedido', e(pedido.pedido)],
    nombreDoc ? ['Comprobante', e(nombreDoc)] : null,
  ])}
<p style="margin:0 0 14px">
  <b>Qué pasa ahora.</b> ${pedido.productoId === 'software-instalable'
    ? 'Le enviaremos el enlace de descarga y el manual de instalación'
    : 'Activaremos su cuenta y le enviaremos sus datos de acceso'}
  en un plazo máximo de <b>24 horas hábiles</b>, a esta misma dirección.</p>
${nombreDoc ? `<p style="margin:0 0 14px;color:#5d6f6c;font-size:13px">
  Su comprobante electrónico va adjunto a este correo en formato XML, que es el
  documento con validez ante SUNAT.</p>` : ''}
<p style="margin:0;color:#5d6f6c;font-size:13px">
  Si algo no cuadra, responda a este correo y lo revisamos.</p>`;

  const adjuntos = adjuntosDe(comprobante, xml, pdf);

  return enviar({
    para: pedido.correo,
    asunto: `Su compra en drcaceresruiz.com · pedido ${pedido.pedido}`,
    html: plantilla('Pago confirmado', cuerpo),
    texto: `Hemos recibido su pago del pedido ${pedido.pedido} `
      + `(${lineasDe(pedido).map((l) => `${l.nombre} x${l.cantidad}`).join('; ')}` 
      + `, ${formatearPrecio(pedido.importeCentimos || 0, pedido.moneda || 'PEN')}).`
      + (nombreDoc ? ` Comprobante: ${nombreDoc}.` : '')
      + ' Le enviaremos lo comprado en un plazo máximo de 24 horas hábiles.',
    adjuntos,
  });
}

/**
 * El comprobante, cuando sale DESPUÉS del aviso de compra.
 *
 * POR QUÉ HACE FALTA UN CORREO APARTE. El aviso de compra se manda en cuanto
 * se confirma el pago, lleve comprobante o no —quien acaba de pagar tiene
 * derecho a saberlo, aunque su boleta tarde—. Pero si la boleta sale más
 * tarde, ese aviso ya se envió, y sin este correo el comprobante NO LLEGABA
 * NUNCA: se quedaba emitido en SUNAT y guardado en el servidor, sin que el
 * comprador lo recibiera. Pasó con la primera venta real, que estuvo un día
 * entera esperando a que SUNAT activara un permiso.
 *
 * Entregar el comprobante no es una cortesía: es obligación de quien vende.
 */
async function avisarComprobante({ pedido, comprobante, xml, pdf }) {
  if (!comprobante || !comprobante.ok) {
    return { ok: false, motivo: 'No hay comprobante que enviar.' };
  }
  const nombreDoc = `${comprobante.tipo} ${comprobante.serie}-${comprobante.numero}`;

  const cuerpo = `
<p style="margin:0 0 16px">Aquí tiene el comprobante electrónico de su compra.</p>
${tabla([
    ['Pedido', e(pedido.pedido)],
    ['Comprobante', e(nombreDoc)],
    ['Importe', e(formatearPrecio(pedido.importeCentimos || 0, pedido.moneda || 'PEN'))],
  ])}
${xml ? `<p style="margin:0 0 14px;color:#5d6f6c;font-size:13px">
  Va adjunto en formato XML, que es el documento con validez ante SUNAT.</p>`
    : `<p style="margin:0 0 14px;color:#5d6f6c;font-size:13px">
  Si necesita el archivo XML, respóndanos y se lo enviamos.</p>`}
<p style="margin:0;color:#5d6f6c;font-size:13px">
  Si algo no cuadra, responda a este correo y lo revisamos.</p>`;

  const adjuntos = adjuntosDe(comprobante, xml, pdf);

  return enviar({
    para: pedido.correo,
    asunto: `Su ${comprobante.tipo.toLowerCase()} ${comprobante.serie}-${comprobante.numero}`
      + ` · pedido ${pedido.pedido}`,
    html: plantilla('Su comprobante', cuerpo),
    texto: `Comprobante ${nombreDoc} del pedido ${pedido.pedido}, por `
      + `${formatearPrecio(pedido.importeCentimos || 0, pedido.moneda || 'PEN')}.`
      + (xml ? ' Va adjunto en XML.' : ''),
    adjuntos,
  });
}

/** Al administrador, con cada venta. Lo que hay que hacer, en el asunto. */
async function avisarAdminCompra({ pedido, comprobante, panelUrl }) {
  const nombreDoc = comprobante && comprobante.ok
    ? `${comprobante.tipo} ${comprobante.serie}-${comprobante.numero}` : 'sin emitir';

  const cuerpo = `
<p style="margin:0 0 16px">Hay una compra pagada pendiente de entregar.</p>
${detalleCompra(pedido)}
${tabla([
    ['Pedido', e(pedido.pedido)],
    ['Comprador', e(pedido.nombres || '—')],
    ['Correo', e(pedido.correo || '—')],
    ['Documento', e(etiquetaDocumento(pedido.tipoDocumento, pedido.documento))],
    ['Comprobante', e(nombreDoc)],
    pedido.modo && pedido.modo !== 'PRODUCTION' ? ['Modo', e(pedido.modo)] : null,
  ])}
${panelUrl ? `<p style="margin:0"><a href="${e(panelUrl)}/admin/pedido/${encodeURIComponent(pedido.pedido)}"
  style="display:inline-block;background:#0d7a72;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Abrir en el panel</a></p>` : ''}`;

  return enviar({
    para: config().admin,
    asunto: `Venta ${pedido.pedido} · ${formatearPrecio(pedido.importeCentimos || 0)} · falta entregar`,
    html: plantilla('Nueva venta', cuerpo),
    texto: `Compra pagada ${pedido.pedido} de ${pedido.correo}: `
      + `${lineasDe(pedido).map((l) => `${l.nombre} x${l.cantidad}`).join('; ')} `
      + `${formatearPrecio(pedido.importeCentimos || 0, pedido.moneda || 'PEN')}. `
      + `Comprobante: ${nombreDoc}. Falta entregar.`,
    responderA: pedido.correo,
  });
}

/**
 * Al reclamante, su copia de la hoja.
 *
 * El reglamento obliga a entregarla, y el número correlativo es lo único que
 * el reclamante tiene en la mano para identificar su caso: va primero.
 */
async function copiaReclamacion({ hoja, constancia }) {
  const cuerpo = `
<p style="margin:0 0 16px">Su hoja quedó registrada. <b>Guarde este número</b>: identifica su caso.</p>
${tabla([
    ['Número', e(constancia.correlativo)],
    ['Fecha', e(constancia.fecha)],
    ['Tipo', hoja.tipo === 'QUEJA' ? 'Queja' : 'Reclamo'],
    ['Nombre', e(hoja.nombre)],
    ['Documento', `${e(hoja.tipoDoc)} ${e(hoja.numDoc)}`],
    hoja.monto ? ['Monto reclamado', `S/ ${e(hoja.monto)}`] : null,
  ])}
<p style="margin:0 0 6px;font-size:14px"><b>Lo contratado</b></p>
<p style="margin:0 0 14px;font-size:14px;white-space:pre-wrap">${e(hoja.descripcion)}</p>
<p style="margin:0 0 6px;font-size:14px"><b>Qué ocurrió</b></p>
<p style="margin:0 0 14px;font-size:14px;white-space:pre-wrap">${e(hoja.detalle)}</p>
<p style="margin:0 0 6px;font-size:14px"><b>Qué solicita</b></p>
<p style="margin:0 0 18px;font-size:14px;white-space:pre-wrap">${e(hoja.pedido)}</p>
<p style="margin:0;color:#5d6f6c;font-size:13px">
  Recibirá respuesta en un plazo máximo de <b>quince (15) días hábiles</b>. La
  presentación de este reclamo no impide acudir a otras vías de solución ni es
  requisito previo para denunciar ante INDECOPI.</p>`;

  return enviar({
    para: hoja.correo,
    asunto: `Copia de su hoja de reclamación ${constancia.correlativo}`,
    html: plantilla('Su hoja de reclamación', cuerpo),
    texto: `Su hoja quedó registrada con el número ${constancia.correlativo}, el ${constancia.fecha}. `
      + 'Guarde este número. Recibirá respuesta en un plazo máximo de 15 días hábiles.',
  });
}

/** Al administrador: hay una reclamación y el plazo ya corre. */
async function avisarAdminReclamacion({ hoja, constancia }) {
  const cuerpo = `
<p style="margin:0 0 16px"><b>El plazo de quince (15) días hábiles empieza hoy.</b></p>
${tabla([
    ['Número', e(constancia.correlativo)],
    ['Tipo', hoja.tipo === 'QUEJA' ? 'Queja' : 'Reclamo'],
    ['Quién', `${e(hoja.nombre)} (${e(hoja.tipoDoc)} ${e(hoja.numDoc)})`],
    ['Correo', e(hoja.correo)],
    ['Teléfono', e(hoja.telefono || '—')],
    hoja.pedidoRef ? ['Pedido', e(hoja.pedidoRef)] : null,
  ])}
<p style="margin:0 0 6px;font-size:14px"><b>Qué ocurrió</b></p>
<p style="margin:0 0 14px;font-size:14px;white-space:pre-wrap">${e(hoja.detalle)}</p>
<p style="margin:0 0 6px;font-size:14px"><b>Qué solicita</b></p>
<p style="margin:0;font-size:14px;white-space:pre-wrap">${e(hoja.pedido)}</p>`;

  return enviar({
    para: config().admin,
    asunto: `Reclamación ${constancia.correlativo} · responder en 15 días hábiles`,
    html: plantilla('Nueva hoja en el Libro de Reclamaciones', cuerpo),
    texto: `Hoja ${constancia.correlativo} de ${hoja.nombre} (${hoja.correo}). `
      + 'Plazo: 15 días hábiles.',
    responderA: hoja.correo,
  });
}

module.exports = {
  configurado, comprobar, enviar,
  avisarCompra,
  avisarComprobante, avisarAdminCompra, copiaReclamacion, avisarAdminReclamacion,
};
