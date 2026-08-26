/**
 * comprobantes.js — Pedir la boleta o la factura al servicio de facturación.
 *
 * Aquí NO se emite nada. Emitir exige firmar con el certificado del emisor, y
 * eso vive en otro sitio a propósito: `facturacion/`, un servicio PHP con
 * Greenter, en su propio subdominio, con el certificado en una carpeta cerrada.
 * Este archivo solo le pide el comprobante y anota lo que conteste.
 *
 * POR QUÉ SEPARADO. El certificado es la firma tributaria del emisor. Cuanto
 * menos código pueda tocarlo, mejor: el checkout maneja tarjetas y páginas
 * públicas, y no tiene por qué poder firmar nada ante SUNAT.
 *
 * BOLETA Y FACTURA NO TERMINAN IGUAL, y eso se ve en el estado que vuelve:
 *   · `aceptado`           — la factura se envió y SUNAT la aceptó.
 *   · `pendiente_resumen`  — la boleta está firmada y entregada, pero a SUNAT
 *                            se le informa DESPUÉS, en el resumen diario que
 *                            manda el cron. Es lo normal, no un error.
 *   · `fallido`            — hay que mirarlo.
 *
 * NUNCA TUMBA UN COBRO. Se pide el comprobante después de que el dinero entró.
 * Si el servicio no responde, el pago sigue siendo válido: queda anotado y se
 * reintenta desde el panel.
 */

const fs = require('node:fs');
const path = require('node:path');

const DIRECTORIO = path.join(__dirname, '..', 'datos');
const LIBRO = path.join(DIRECTORIO, 'comprobantes.jsonl');

/** Cuánto se espera al servicio antes de darlo por caído. */
const ESPERA_MS = 25000;

function config() {
  return {
    url: (process.env.FACTURACION_URL || '').replace(/\/+$/, ''),
    clave: (process.env.FACTURACION_CLAVE || '').trim(),
  };
}

function configurado() {
  const c = config();
  return Boolean(c.url && c.clave);
}

function leerLibro() {
  if (!fs.existsSync(LIBRO)) return [];
  const filas = [];
  for (const linea of fs.readFileSync(LIBRO, 'utf8').split('\n')) {
    if (!linea.trim()) continue;
    try { filas.push(JSON.parse(linea)); } catch { /* línea rota */ }
  }
  return filas;
}

function anotar(fila) {
  fs.mkdirSync(DIRECTORIO, { recursive: true });
  fs.appendFileSync(LIBRO, JSON.stringify(fila) + '\n', 'utf8');
}

/** ¿Este pedido ya tiene comprobante? Devuelve el asiento, o null. */
function comprobanteDe(pedido) {
  return leerLibro().find((c) => c.pedido === pedido && c.ok) || null;
}

async function llamar(accion, cuerpo) {
  const c = config();
  const corte = AbortSignal.timeout(ESPERA_MS);
  const r = await fetch(`${c.url}/index.php?accion=${encodeURIComponent(accion)}`, {
    method: 'POST',
    headers: {
      'X-Clave-Facturacion': c.clave,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cuerpo),
    signal: corte,
  });
  let datos;
  try { datos = await r.json(); } catch { datos = { ok: false, error: 'respuesta ilegible' }; }
  return { http: r.status, datos };
}

/** ¿En qué estado está el servicio? Para enseñarlo en el panel. */
async function estadoServicio() {
  if (!configurado()) {
    return { ok: false, motivo: 'Faltan FACTURACION_URL y FACTURACION_CLAVE en .env.' };
  }
  const c = config();
  try {
    const r = await fetch(`${c.url}/index.php?accion=estado`, {
      headers: { 'X-Clave-Facturacion': c.clave },
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, motivo: 'El servicio de facturación no respondió: ' + e.message };
  }
}

/**
 * Pide el comprobante de un pedido.
 *
 * Idempotente por partida doble: se comprueba aquí y el servicio lo comprueba
 * también. Importa más que en ningún otro sitio — dos comprobantes por una
 * misma venta son dos hechos tributarios, y deshacer uno exige una nota de
 * crédito.
 */
async function emitir(pedido) {
  if (!configurado()) {
    return { ok: false, motivo: 'El servicio de facturación no está configurado en este servidor.' };
  }
  const yaEsta = comprobanteDe(pedido.pedido);
  if (yaEsta) return { ...yaEsta, repetido: true };

  if (!pedido.importeCentimos) {
    return { ok: false, motivo: 'El pedido no tiene importe: no hay nada que facturar.' };
  }

  let respuesta;
  try {
    respuesta = await llamar('emitir', {
      pedido: pedido.pedido,
      importeCentimos: pedido.importeCentimos,
      moneda: pedido.moneda || 'PEN',
      tipoDocumento: pedido.tipoDocumento || '',
      documento: pedido.documento || '',
      nombres: pedido.nombres || '',
      correo: pedido.correo || '',
      productoId: pedido.productoId || '',
      productoNombre: pedido.productoNombre || '',
      // Cómo se cobró. El servicio se niega a emitir un comprobante REAL por un
      // pago que no lo fue: la pasarela y la facturación se ponen en producción
      // por separado, y en medio la tienda sigue cobrando con tarjetas de
      // prueba mientras allí ya se emite de verdad.
      modoPago: pedido.modo || '',
      // El detalle, para que el comprobante lleve una línea por producto. El
      // servicio sabe apañárselas sin esto —los pedidos anteriores al carrito
      // no lo tienen— pero entonces sale una sola línea con el resumen.
      lineas: Array.isArray(pedido.lineas) ? pedido.lineas : undefined,
    });
  } catch (err) {
    const fallo = {
      registradoEn: new Date().toISOString(), pedido: pedido.pedido, ok: false,
      motivo: 'El servicio de facturación no respondió: ' + err.message,
    };
    anotar(fallo);
    return fallo;
  }

  const d = respuesta.datos || {};
  if (!d.ok) {
    const fallo = {
      registradoEn: new Date().toISOString(), pedido: pedido.pedido, ok: false,
      serie: d.serie ?? null, numero: d.correlativo ?? null,
      motivo: String(d.motivo || d.error || 'sin detalle').slice(0, 400),
    };
    anotar(fallo);
    return fallo;
  }

  const asiento = {
    registradoEn: new Date().toISOString(),
    pedido: pedido.pedido,
    ok: true,
    tipo: (d.documento === 'factura' ? 'FACTURA' : 'BOLETA'),
    serie: d.serie ?? null,
    numero: d.correlativo ?? null,
    estado: d.estado ?? null,             // aceptado | pendiente_resumen | fallido
    // Solo la factura trae respuesta de SUNAT en el acto; la boleta la tendrá
    // cuando el cron mande el resumen del día.
    aceptadaPorSunat: d.estado === 'aceptado' ? true : null,
    sunat: d.sunatDescripcion ?? (d.estado === 'pendiente_resumen'
      ? 'Firmada y entregada. Se informará a SUNAT en el resumen diario.' : null),
    modo: d.modo ?? null,                 // beta | produccion
  };
  anotar(asiento);
  return asiento;
}

/**
 * Trae el XML firmado de un pedido ya emitido, para adjuntarlo al correo del
 * comprador. Devuelve null si no hay: un correo sin adjunto es mejor que
 * ningún correo.
 */
async function descargarXml(idPedido) {
  if (!configurado()) return null;
  try {
    const r = await llamar('xml', { pedido: idPedido });
    const d = r.datos || {};
    return d.ok && typeof d.xml === 'string' ? d.xml : null;
  } catch (e) {
    console.warn('[comprobante] no se pudo traer el XML de', idPedido, e.message);
    return null;
  }
}

/**
 * La representación impresa, en bytes.
 *
 * El XML es el comprobante; esto es el papel que se le entrega al comprador,
 * porque un XML no lo abre nadie. Viaja en base64 —la interfaz habla JSON— y
 * se devuelve ya decodificado, listo para adjuntar.
 *
 * FALLA EN BLANDO, como el XML: si no se puede componer, el correo sale igual
 * con lo que haya. Quedarse sin avisar de una compra porque no salió un PDF
 * sería mucho peor que un correo sin PDF.
 */
async function descargarPdf(idPedido) {
  if (!configurado()) return null;
  try {
    const r = await llamar('pdf', { pedido: idPedido });
    const d = r.datos || {};
    if (!d.ok || typeof d.pdfBase64 !== 'string') return null;
    return Buffer.from(d.pdfBase64, 'base64');
  } catch (e) {
    console.warn('[comprobante] no se pudo traer el PDF de', idPedido, e.message);
    return null;
  }
}

/** Cómo se llama un comprobante para enseñarlo: «BOLETA B001-7». */
function nombrar(asiento) {
  if (!asiento || !asiento.ok) return null;
  return `${asiento.tipo} ${asiento.serie}-${asiento.numero}`;
}

module.exports = {
  emitir, configurado, comprobanteDe, nombrar, leerLibro, estadoServicio, descargarXml, descargarPdf, LIBRO,
};
