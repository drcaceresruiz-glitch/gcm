/**
 * comprobantes.js — La boleta o la factura, emitida sola.
 *
 * Habla con NUBEFACT (el OSE/PSE ya contratado). Manual de referencia:
 * «MANUAL DE INTEGRACIÓN ARCHIVO .JSON», operación `generar_comprobante`.
 *
 * CÓMO SE LE HABLA. Todo va por POST a la RUTA de la cuenta, con dos
 * cabeceras: `Authorization` con el TOKEN a pelo —sin «Bearer» ni «Token
 * token=», que es el error de bulto que devuelve un 401 sin explicación— y
 * `Content-Type: application/json`.
 *
 * BOLETA O FACTURA, LO DECIDE EL DOCUMENTO. Si el comprador escribió un RUC
 * (11 dígitos) corresponde FACTURA; si dejó DNI o no dejó nada, BOLETA. Es lo
 * que prometen los Términos, y aquí se cumple sin que nadie tenga que elegir.
 *
 * EL IGV YA ESTÁ DENTRO DEL PRECIO. El catálogo publica el precio final, así
 * que el importe gravado no se suma: se DESCUENTA. Y se descuenta en céntimos,
 * no en soles con decimales: `total_gravada + total_igv` tiene que dar
 * exactamente `total`, y con números en coma flotante eso falla el día menos
 * pensado por un céntimo. NubeFact rechaza el comprobante cuando no cuadra.
 *
 * EL CORRELATIVO ES NUESTRO. NubeFact no lo asigna: lo mandamos nosotros y
 * tiene que ir sin huecos ni repeticiones. Se lleva en `comprobantes.jsonl`
 * —que solo crece, como todo lo demás aquí— tomando el mayor emitido de esa
 * serie y sumándole uno.
 *
 * Y AUN ASÍ SE PUEDE CHOCAR: si el archivo se pierde, o si alguien emitió una
 * boleta a mano desde la web de NubeFact, nuestro siguiente número ya existe.
 * Ese caso no es hipotético y el manual le da código propio —23, «Este
 * documento ya existe en NubeFacT»—, así que se reintenta con el número
 * siguiente en vez de dar la venta por no facturada.
 *
 * NUNCA TUMBA UN COBRO. Emitir un comprobante ocurre DESPUÉS de que el dinero
 * entró. Si NubeFact no responde, el pago sigue siendo válido: se anota el
 * fallo y se emite luego desde el panel. Un comprobante tardío se arregla; una
 * venta rechazada porque el facturador estaba caído, no.
 */

const fs = require('node:fs');
const path = require('node:path');

const DIRECTORIO = path.join(__dirname, '..', 'datos');
const LIBRO = path.join(DIRECTORIO, 'comprobantes.jsonl');

const FACTURA = 1;
const BOLETA = 2;

/** Cuántas veces se prueba con el número siguiente cuando el nuestro ya existe. */
const REINTENTOS_POR_CORRELATIVO = 5;

function config() {
  return {
    ruta: (process.env.NUBEFACT_RUTA || '').trim(),
    token: (process.env.NUBEFACT_TOKEN || '').trim(),
    serieFactura: (process.env.NUBEFACT_SERIE_FACTURA || 'FFF1').trim().toUpperCase(),
    serieBoleta: (process.env.NUBEFACT_SERIE_BOLETA || 'BBB1').trim().toUpperCase(),
    // Que NubeFact le mande el PDF al comprador. Se puede apagar si un día se
    // manda desde aquí, pero apagarlo sin sustituirlo deja al cliente sin nada.
    avisarAlCliente: process.env.NUBEFACT_AVISAR_AL_CLIENTE !== 'false',
  };
}

function configurado() {
  const c = config();
  return Boolean(c.ruta && c.token);
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

/** ¿Este pedido ya tiene comprobante emitido? Devuelve el asiento, o null. */
function comprobanteDe(pedido) {
  return leerLibro().find((c) => c.pedido === pedido && c.ok) || null;
}

/** El siguiente número de esa serie: el mayor emitido más uno. */
function siguienteNumero(serie) {
  let mayor = 0;
  for (const c of leerLibro()) {
    if (c.serie === serie && Number.isInteger(c.numero) && c.numero > mayor) mayor = c.numero;
  }
  return mayor + 1;
}

/** Reparte un importe con IGV incluido. TODO en céntimos, para que cuadre. */
function desglosar(totalCentimos, porcentajeIgv = 18) {
  const total = Math.round(Number(totalCentimos) || 0);
  const gravada = Math.round(total / (1 + porcentajeIgv / 100));
  return { total, gravada, igv: total - gravada };
}

const soles = (centimos) => Number((centimos / 100).toFixed(2));

/** DD-MM-YYYY en hora de Lima, que es como lo quiere el manual. */
function fechaDeEmision(cuando = new Date()) {
  const partes = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(cuando);
  const v = (t) => partes.find((p) => p.type === t).value;
  return `${v('day')}-${v('month')}-${v('year')}`;
}

/**
 * Arma el JSON del comprobante a partir de un pedido ya consolidado.
 *
 * `cliente_tipo_de_documento` va como TEXTO porque uno de sus valores válidos
 * es el guion —«VARIOS», para ventas menores de S/ 700 sin documento—, y ese
 * no cabe en un número.
 */
function armar(pedido, { serie, numero }) {
  const documento = String(pedido.documento || '').trim();
  const esFactura = documento.length === 11;
  const { total, gravada, igv } = desglosar(pedido.importeCentimos);

  const tipoDoc = esFactura ? '6' : documento.length === 8 ? '1' : '-';
  const denominacion = (pedido.nombres || '').trim()
    || (esFactura ? 'CLIENTE' : 'CLIENTE VARIOS');

  return {
    operacion: 'generar_comprobante',
    tipo_de_comprobante: esFactura ? FACTURA : BOLETA,
    serie,
    numero,
    sunat_transaction: 1,                     // venta interna
    cliente_tipo_de_documento: tipoDoc,
    cliente_numero_de_documento: documento || '-',
    cliente_denominacion: denominacion.slice(0, 250),
    cliente_direccion: '',
    cliente_email: pedido.correo || '',
    fecha_de_emision: fechaDeEmision(),
    moneda: 1,                                // soles
    porcentaje_de_igv: 18.00,
    total_gravada: soles(gravada),
    total_igv: soles(igv),
    total: soles(total),
    detraccion: false,
    enviar_automaticamente_a_la_sunat: true,
    enviar_automaticamente_al_cliente: config().avisarAlCliente,
    cancelado: true,                          // se cobró antes de emitir
    observaciones: `Pedido ${pedido.pedido}`.slice(0, 250),
    items: [
      {
        unidad_de_medida: 'ZZ',               // servicio
        codigo: (pedido.productoId || 'GCM').slice(0, 20),
        descripcion: (pedido.productoNombre || 'Producto GCM').slice(0, 250),
        cantidad: 1,
        valor_unitario: soles(gravada),
        precio_unitario: soles(total),
        subtotal: soles(gravada),
        tipo_de_igv: 1,                       // gravado, operación onerosa
        igv: soles(igv),
        total: soles(total),
        anticipo_regularizacion: false,
      },
    ],
  };
}

async function llamar(cuerpo) {
  const c = config();
  const r = await fetch(c.ruta, {
    method: 'POST',
    headers: {
      // El TOKEN a pelo. Sin «Bearer», sin «Token token=».
      Authorization: c.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cuerpo),
  });
  let datos;
  try { datos = await r.json(); } catch { datos = { errors: 'respuesta ilegible', codigo: null }; }
  return { http: r.status, datos };
}

/**
 * Emite el comprobante de un pedido. Idempotente: si ya tiene uno, lo devuelve
 * sin volver a emitir.
 *
 * @param {object} pedido  un registro consolidado (ver src/pedidos.js)
 * @returns {Promise<{ok:boolean, ...}>}
 */
async function emitir(pedido) {
  if (!configurado()) {
    return { ok: false, motivo: 'NubeFact no está configurado en este servidor.' };
  }
  const yaEsta = comprobanteDe(pedido.pedido);
  if (yaEsta) return { ...yaEsta, repetido: true };

  if (!pedido.importeCentimos) {
    return { ok: false, motivo: 'El pedido no tiene importe: no hay nada que facturar.' };
  }

  const c = config();
  const esFactura = String(pedido.documento || '').trim().length === 11;
  const serie = esFactura ? c.serieFactura : c.serieBoleta;
  let numero = siguienteNumero(serie);

  for (let intento = 0; intento < REINTENTOS_POR_CORRELATIVO; intento += 1) {
    let respuesta;
    try {
      respuesta = await llamar(armar(pedido, { serie, numero }));
    } catch (err) {
      const fallo = { emitidoEn: new Date().toISOString(), pedido: pedido.pedido, ok: false,
        serie, numero, motivo: 'NubeFact no respondió: ' + err.message };
      anotar(fallo);
      return fallo;
    }

    const d = respuesta.datos || {};

    // 23 = «Este documento ya existe en NubeFacT». Nuestro correlativo se
    // quedó atrás —una emisión a mano desde su web, o un libro perdido—, así
    // que se prueba con el siguiente en vez de dar la venta por no facturada.
    if (d.codigo === 23) {
      numero += 1;
      continue;
    }

    if (d.errors) {
      const fallo = { emitidoEn: new Date().toISOString(), pedido: pedido.pedido, ok: false,
        serie, numero, codigo: d.codigo ?? null, motivo: String(d.errors).slice(0, 400) };
      anotar(fallo);
      return fallo;
    }

    const asiento = {
      emitidoEn: new Date().toISOString(),
      pedido: pedido.pedido,
      ok: true,
      tipo: esFactura ? 'FACTURA' : 'BOLETA',
      serie: d.serie || serie,
      numero: Number.isInteger(d.numero) ? d.numero : numero,
      aceptadaPorSunat: d.aceptada_por_sunat ?? null,
      sunat: d.sunat_description || null,
      enlace: d.enlace || null,
      pdf: d.enlace_del_pdf || null,
      xml: d.enlace_del_xml || null,
    };
    anotar(asiento);
    return asiento;
  }

  const agotado = { emitidoEn: new Date().toISOString(), pedido: pedido.pedido, ok: false,
    serie, numero, codigo: 23,
    motivo: `Los ${REINTENTOS_POR_CORRELATIVO} números probados de la serie ${serie} ya existían en NubeFact. `
      + 'Revise el último correlativo emitido en su cuenta.' };
  anotar(agotado);
  return agotado;
}

/** Cómo se llama un comprobante para enseñarlo: «BOLETA BBB1-7». */
function nombrar(asiento) {
  if (!asiento || !asiento.ok) return null;
  return `${asiento.tipo} ${asiento.serie}-${asiento.numero}`;
}

module.exports = {
  emitir, configurado, comprobanteDe, nombrar, leerLibro,
  desglosar, armar, fechaDeEmision, siguienteNumero, LIBRO,
};
