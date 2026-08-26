/**
 * pagos.js — El registro de los cobros, y la firma que los avala.
 *
 * POR QUÉ EXISTE EL WEBHOOK, SI YA VALIDAMOS EN EL NAVEGADOR. Porque el
 * navegador se cierra. Si alguien paga y cierra la pestaña antes de que el
 * `KR.onSubmit` llegue a nuestro servidor, el cobro se hizo y nadie se entera:
 * el dinero está y el cliente no tiene su licencia. El propio Back Office de
 * Izipay lo dice sin rodeos — «para analizar el resultado de la transacción
 * debe SIEMPRE basarse en la URL de notificación instantánea».
 *
 * DOS CAMINOS, DOS CLAVES. Es el error que más cuesta encontrar, así que queda
 * escrito aquí:
 *
 *   · Vuelta por el NAVEGADOR (`kr-answer` de KR.onSubmit) → se firma con la
 *     clave HMAC-SHA-256, y el campo `kr-hash-key` vale `sha256_hmac`.
 *   · NOTIFICACIÓN de servidor a servidor (IPN) → se firma con la CONTRASEÑA
 *     de la API REST, y `kr-hash-key` vale `password`.
 *
 * Verificar el IPN con la clave HMAC no falla «a veces»: falla siempre, y el
 * síntoma es un webhook que rechaza todos los pagos buenos.
 *
 * IDEMPOTENCIA. Izipay reintenta la notificación si no respondemos rápido o si
 * respondemos mal. Llegan repetidas — no es una posibilidad remota, es lo
 * normal. Por eso cada pago se guarda con la referencia de su transacción y,
 * si ya estaba, la segunda notificación no vuelve a registrar nada.
 *
 * DÓNDE SE GUARDA. En `datos/pagos.jsonl`, un archivo que solo crece, igual que
 * el Libro de Reclamaciones. No es una base de datos y no pretende serlo: es el
 * registro mínimo para poder responder «¿qué se cobró, cuándo y a quién?»
 * mientras el modelo `PagoLicencia` de docs/plan-cobro-licencia.md no exista.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DIRECTORIO = path.join(__dirname, '..', 'datos');
const LIBRO_PAGOS = path.join(DIRECTORIO, 'pagos.jsonl');

/**
 * ¿La firma de esta notificación es de Izipay?
 *
 * Se firma `kr-answer` TAL COMO LLEGÓ. Volver a serializarlo con JSON.parse y
 * JSON.stringify reordena las claves y cambia el resultado: la firma dejaría de
 * cuadrar en pagos perfectamente válidos.
 *
 * TEST Y PRODUCCIÓN TIENEN CONTRASEÑAS DISTINTAS, y la misma URL de
 * notificación sirve a las dos. Por eso `password` puede ser una lista: se
 * prueban todas las configuradas. Aquí sí es correcto probar varias, al revés
 * que con la HMAC: las dos contraseñas son de la misma tienda y las dos son
 * nuestras, así que aceptar cualquiera no abre ninguna puerta. Lo que no se
 * puede es mezclar contraseña con clave HMAC, que son roles distintos.
 *
 * @param {object} cuerpo   campos kr-* recibidos
 * @param {object} claves   { password: string|string[], hmac: string|string[] }
 * @returns {{ok: boolean, motivo?: string}}
 */
function verificarFirma(cuerpo, claves) {
  const respuesta = cuerpo['kr-answer'];
  const firma = cuerpo['kr-hash'];
  const tipoClave = cuerpo['kr-hash-key'];
  const algoritmo = cuerpo['kr-hash-algorithm'];

  if (typeof respuesta !== 'string' || typeof firma !== 'string') {
    return { ok: false, motivo: 'faltan kr-answer o kr-hash' };
  }
  if (algoritmo && algoritmo !== 'sha256_hmac') {
    return { ok: false, motivo: 'algoritmo inesperado: ' + algoritmo };
  }

  // El TIPO de clave no se adivina: lo dice kr-hash-key y se respeta. Firmar
  // con la HMAC y declarar `password` tiene que seguir fallando.
  let candidatas;
  if (tipoClave === 'password') candidatas = claves.password;
  else if (tipoClave === 'sha256_hmac') candidatas = claves.hmac;
  else return { ok: false, motivo: 'kr-hash-key desconocida: ' + tipoClave };

  candidatas = (Array.isArray(candidatas) ? candidatas : [candidatas]).filter(Boolean);
  if (!candidatas.length) return { ok: false, motivo: 'no hay clave configurada para ' + tipoClave };

  const recibida = Buffer.from(firma);
  for (const secreto of candidatas) {
    const calculada = Buffer.from(crypto.createHmac('sha256', secreto).update(respuesta).digest('hex'));
    if (calculada.length === recibida.length && crypto.timingSafeEqual(calculada, recibida)) {
      return { ok: true };
    }
  }
  return { ok: false, motivo: 'la firma no coincide con ninguna clave configurada' };
}

/**
 * Saca de la respuesta de Izipay lo poco que necesitamos guardar.
 *
 * NO se guarda la respuesta entera: trae datos de la tarjeta (los cuatro
 * últimos dígitos, la marca, el país del emisor) que aquí no hacen ninguna
 * falta. Lo que no se guarda no se puede filtrar.
 */
function resumirPago(respuestaJson, modoPorDefecto = null) {
  const d = JSON.parse(respuestaJson);
  const tx = Array.isArray(d.transactions) && d.transactions.length ? d.transactions[0] : {};
  return {
    pedido: d.orderDetails?.orderId ?? null,
    estado: d.orderStatus ?? null,            // PAID | UNPAID | RUNNING …
    // La respuesta que vuelve POR EL NAVEGADOR no siempre trae `mode`: en la
    // primera prueba real se anotó `"modo":null`, y así una prueba y una venta
    // de verdad quedan iguales en el libro. De ahí el respaldo: el modo en que
    // opera el servidor, deducido de sus propias claves.
    modo: d.mode ?? modoPorDefecto,           // TEST | PRODUCTION
    referencia: tx.uuid ?? null,              // el id del cargo en Izipay
    importeCentimos: tx.amount ?? d.orderDetails?.orderTotalAmount ?? null,
    moneda: tx.currency ?? d.orderDetails?.orderCurrency ?? null,
    correo: d.customer?.email ?? null,
    documento: d.customer?.billingDetails?.identityCode ?? null,
    detalleEstado: tx.detailedStatus ?? null,
  };
}

/** ¿Ya habíamos registrado esta transacción? */
function yaRegistrado(referencia) {
  if (!referencia || !fs.existsSync(LIBRO_PAGOS)) return false;
  const lineas = fs.readFileSync(LIBRO_PAGOS, 'utf8').split('\n').filter(Boolean);
  for (const linea of lineas) {
    try {
      if (JSON.parse(linea).referencia === referencia) return true;
    } catch { /* una línea ilegible no debe dar por nuevo un pago que ya está */ }
  }
  return false;
}

/**
 * Anota el pago. Devuelve { nuevo: false } si la notificación estaba repetida.
 *
 * Se escribe la línea entera de una vez: un pago se registra completo o no se
 * registra, y nunca queda media línea en el archivo.
 */
function registrarPago(resumen, origen = 'ipn') {
  if (yaRegistrado(resumen.referencia)) return { nuevo: false, ...resumen };

  fs.mkdirSync(DIRECTORIO, { recursive: true });
  const fila = { registradoEn: new Date().toISOString(), origen, ...resumen };
  fs.appendFileSync(LIBRO_PAGOS, JSON.stringify(fila) + '\n', 'utf8');
  return { nuevo: true, ...resumen };
}

module.exports = { verificarFirma, resumirPago, registrarPago, yaRegistrado, LIBRO_PAGOS };
