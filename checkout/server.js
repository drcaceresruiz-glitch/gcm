/**
 * server.js — Servidor del checkout de GCM.
 *
 * QUÉ HACE. Sirve la página del checkout y habla con Izipay:
 *
 *   GET  /api/catalogo         qué se vende y a qué precio (lo dice el servidor)
 *   POST /api/create-payment   pide a Izipay el formToken del pago
 *   POST /api/validate-payment comprueba la firma de la vuelta por el navegador
 *   POST /api/ipn              la notificación de servidor a servidor
 *   ANY  /retorno              adonde vuelve el comprador tras pagar
 *   POST /api/reclamacion      el Libro de Reclamaciones
 *
 * LAS TRES FIRMAS, QUE ES LO QUE MÁS CUESTA VER. Un pago se puede confirmar por
 * dos caminos y cada uno se firma con una clave distinta:
 *
 *   · navegador (validate-payment y /retorno) → clave HMAC-SHA-256
 *   · notificación (api/ipn)                  → CONTRASEÑA de la API REST
 *
 * Quien manda es el IPN: el navegador puede no volver nunca —el comprador
 * cierra la pestaña— y entonces el cobro existiría sin que nadie se enterase.
 * La vuelta por el navegador solo sirve para enseñarle el resultado a la
 * persona; ninguna decisión cuelga de ella.
 *
 * LO QUE ESTE SERVIDOR NO HACE TODAVÍA, y hay que añadir antes de cobrar de
 * verdad (está razonado en docs/plan-cobro-licencia.md):
 *   · Guardar el pedido ANTES de mandar a la pasarela, con su clave de
 *     idempotencia. Hoy el pago se anota cuando vuelve, no cuando sale, así que
 *     un pago iniciado y nunca terminado no deja rastro.
 *   · La emisión del comprobante electrónico.
 *
 * Se arranca con:  npm start   (o npm run dev)
 */

require('dotenv').config();

const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const {
  buscarCualquierProducto, catalogoPublico, formatearPrecio,
  categorias, todosLosProductos, productosALaVenta,
} = require('./src/catalogo');
const catalogoEdicion = require('./src/catalogo_edicion');
const { revisarCarrito, lineasPublicas } = require('./src/carrito');
const { revisarHoja, registrarHoja } = require('./src/reclamaciones');
const { verificarFirma, resumirPago, registrarPago, LIBRO_PAGOS } = require('./src/pagos');
const { paginaRetorno } = require('./src/pagina_retorno');
const { registrarPedido, registrarEvento, consolidar, leerLineas, lineasDe } = require('./src/pedidos');
const { LIBRO: LIBRO_RECLAMACIONES } = require('./src/reclamaciones');
const comprobantes = require('./src/comprobantes');
const correo = require('./src/correo');
const sesion = require('./src/admin_sesion');
const panel = require('./src/panel_admin');

const app = express();
const PUERTO = process.env.PORT || 3001;

/**
 * Dónde queda publicado esto de cara a internet. Solo sirve para IMPRIMIR las
 * URL exactas que hay que pegar en el Back Office de Izipay: nada del
 * funcionamiento depende de ella. Se pide porque escribir a mano una URL de
 * notificación es de las cosas que se equivocan una vez y cuestan una tarde.
 */
const URL_PUBLICA = (process.env.URL_PUBLICA || '').replace(/\/+$/, '');

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

/**
 * La RAÍZ enseña la tienda.
 *
 * Sin esto, entrar a https://pagos.drcaceresruiz.com devolvía el «Cannot GET /»
 * de Express: la página existía, pero solo en /checkout.html. Eso no es un
 * detalle estético — es lo que ve Izipay cuando comprueba la URL declarada de la
 * tienda, y lo que le hace responder «dominio desconocido o inaccesible».
 * También es lo que vería cualquiera que teclee la dirección sin la página.
 *
 * Se sirve el archivo, no un redirect: un comprobador automático que sigue la
 * dirección tiene que encontrar la tienda ahí mismo, con un 200, sin saltos.
 */
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

// ---------------------------------------------------------------------------
//  Credenciales
// ---------------------------------------------------------------------------
// Se leen una vez y se comprueban al arrancar. Un checkout desplegado sin
// credenciales no debe fallar en la cara del comprador a mitad del pago: es
// mejor que no arranque, o que lo diga en su primer aviso.

const IZIPAY = {
  endpoint: process.env.IZIPAY_ENDPOINT || 'https://api.micuentaweb.pe',
  usuario: process.env.IZIPAY_USERNAME || '',      // número de tienda
  clave: process.env.IZIPAY_PASSWORD || '',        // la del modo en que opera
  clavePublica: process.env.IZIPAY_PUBLIC_KEY || '',
  hmac: process.env.IZIPAY_HMAC_SHA256 || '',
  // La MISMA URL de notificación sirve a test y a producción, pero cada modo
  // firma con SU contraseña. Sin esta segunda, el día que se active producción
  // las notificaciones reales se rechazarían por firma —con el checkout
  // aparentemente bien— y el fallo parecería cualquier otra cosa.
  claveAlterna: process.env.IZIPAY_PASSWORD_ALTERNA || '',
  hmacAlterna: process.env.IZIPAY_HMAC_SHA256_ALTERNA || '',
};

/**
 * En qué modo opera este servidor, leído de su propia contraseña: Izipay las
 * emite con el prefijo `testpassword_` o `prodpassword_`. Solo se usa como
 * respaldo cuando la respuesta del pago no trae `mode`, para que en el libro
 * nunca se confunda una prueba con una venta.
 */
const MODO = IZIPAY.clave.startsWith('prodpassword_') ? 'PRODUCTION'
           : IZIPAY.clave.startsWith('testpassword_') ? 'TEST'
           : null;

/** Las claves con las que se puede verificar una notificación entrante. */
const CLAVES_VERIFICACION = {
  password: [IZIPAY.clave, IZIPAY.claveAlterna],
  hmac: [IZIPAY.hmac, IZIPAY.hmacAlterna],
};

const FALTAN = Object.entries({
  IZIPAY_USERNAME: IZIPAY.usuario,
  IZIPAY_PASSWORD: IZIPAY.clave,
  IZIPAY_PUBLIC_KEY: IZIPAY.clavePublica,
  IZIPAY_HMAC_SHA256: IZIPAY.hmac,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

/** Cabecera Basic que exige la API de Izipay. */
function autorizacionBasic() {
  return 'Basic ' + Buffer.from(`${IZIPAY.usuario}:${IZIPAY.clave}`).toString('base64');
}

// ---------------------------------------------------------------------------
//  Validación de lo que manda el formulario
// ---------------------------------------------------------------------------
// Se valida en el servidor aunque el navegador ya valide: lo del navegador es
// comodidad para quien rellena, no una defensa. Cualquiera puede saltárselo.

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function limpiar(valor, maximo) {
  return String(valor ?? '').trim().slice(0, maximo);
}

/**
 * Revisa los datos del comprador. Devuelve { datos } o { errores }.
 *
 * Solo el correo es obligatorio —es a donde va el comprobante y, en el caso del
 * instalable, el enlace de descarga—. El resto se acepta vacío antes que
 * inventado: un DNI obligatorio que la gente rellena con ceros es peor dato que
 * un campo en blanco.
 */
function revisarComprador(cuerpo) {
  const errores = {};

  const correo = limpiar(cuerpo.correo, 120).toLowerCase();
  if (!correo) errores.correo = 'Indique su correo electrónico.';
  else if (!RE_CORREO.test(correo)) errores.correo = 'Ese correo no parece válido.';

  const nombres = limpiar(cuerpo.nombres, 120);
  const documento = limpiar(cuerpo.documento, 20);
  const telefono = limpiar(cuerpo.telefono, 25);

  // DNI son 8 dígitos y RUC son 11. Si escribieron algo, tiene que ser una de
  // las dos cosas; si no escribieron nada, se deja pasar.
  if (documento && !/^\d{8}$|^\d{11}$/.test(documento)) {
    errores.documento = 'El DNI tiene 8 dígitos y el RUC, 11.';
  }
  if (telefono && !/^[\d\s+()-]{6,25}$/.test(telefono)) {
    errores.telefono = 'Ese teléfono no parece válido.';
  }

  if (Object.keys(errores).length) return { errores };
  return { datos: { correo, nombres, documento, telefono } };
}

/**
 * Parte «Nombres Apellidos» en dos, porque Izipay pide los campos separados.
 *
 * Con una sola palabra, va entera al nombre y el apellido queda vacío: repetir
 * la misma palabra en los dos campos ensuciaría el dato en la pasarela.
 */
function partirNombre(completo) {
  const trozos = completo.split(/\s+/).filter(Boolean);
  if (trozos.length === 0) return { nombre: '', apellido: '' };
  if (trozos.length === 1) return { nombre: trozos[0], apellido: '' };
  return { nombre: trozos.slice(0, -1).join(' '), apellido: trozos.at(-1) };
}

/** Referencia del pedido. Lleva la fecha para poder buscarlo por el día. */
function referenciaPedido() {
  const f = new Date();
  const ymd = [
    f.getFullYear(),
    String(f.getMonth() + 1).padStart(2, '0'),
    String(f.getDate()).padStart(2, '0'),
  ].join('');
  return `GCM-${ymd}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// ---------------------------------------------------------------------------
//  Rutas
// ---------------------------------------------------------------------------

/** Configuración que el navegador necesita para cargar el formulario de Izipay. */
app.get('/api/config', (_req, res) => {
  res.json({
    clavePublica: IZIPAY.clavePublica,
    endpoint: IZIPAY.endpoint,
    configurado: FALTAN.length === 0,
  });
});

/** El catálogo. Los precios salen de aquí, nunca del navegador. */
app.get('/api/catalogo', (_req, res) => {
  // Se manda AGRUPADO por categoría y también en plano. La página necesita lo
  // primero para pintar y lo segundo para buscar el elegido sin recorrer
  // grupos; calcularlo aquí evita que la página tenga que aplanar nada.
  res.json({ grupos: catalogoPublico(), productos: productosALaVenta() });
});

/**
 * Emite la boleta o la factura de un pedido que acaba de pagarse.
 *
 * NO SE ESPERA A QUE TERMINE, y no es descuido. Esto se llama justo después de
 * anotar un cobro, dentro del webhook de Izipay: si nos quedáramos esperando a
 * NubeFact, un facturador lento haría que Izipay diera la notificación por
 * fallida y la reintentara —o peor, que el comprador viera un error en una
 * compra que salió bien—. El dinero ya entró; el comprobante puede tardar unos
 * segundos más.
 *
 * Por eso tampoco propaga nunca un error: cada intento, salga bien o mal, deja
 * su evento en el historial del pedido, y desde el panel se reintenta.
 */
function facturar(idPedido, origen = 'automático') {
  if (!idPedido) return;

  setImmediate(async () => {
    try {
      const registro = compras().find((p) => p.pedido === idPedido);
      if (!registro) return;

      // 1. El comprobante.
      let asiento = comprobantes.comprobanteDe(idPedido);
      if (!asiento && comprobantes.configurado()) {
        asiento = await comprobantes.emitir(registro);
        if (asiento.ok) {
          registrarEvento({
            pedido: idPedido,
            tipo: 'comprobante',
            detalle: comprobantes.nombrar(asiento),
            quien: origen,
          });
          console.log(`[comprobante] ${comprobantes.nombrar(asiento)} para ${idPedido}`);
        } else {
          registrarEvento({
            pedido: idPedido,
            tipo: 'nota',
            detalle: 'No se pudo emitir el comprobante: ' + (asiento.motivo || 'sin detalle'),
            quien: origen,
          });
          console.error(`[comprobante] ${idPedido} falló:`, asiento.motivo);
        }
      }

      // 2. Los correos. VAN AUNQUE EL COMPROBANTE HAYA FALLADO: el comprador
      // acaba de pagar y tiene derecho a saber que su pago llegó, aunque su
      // factura tenga que salir más tarde. Callarse porque falló otra cosa es
      // lo peor que se puede hacer aquí.
      if (!correo.configurado()) return;

      const xml = asiento && asiento.ok ? await comprobantes.descargarXml(idPedido) : null;
      const yaAvisado = registro.eventos.some((ev) => ev.tipo === 'correo_comprador');
      if (!yaAvisado) {
        const r = await correo.avisarCompra({ pedido: registro, comprobante: asiento, xml });
        registrarEvento({
          pedido: idPedido,
          tipo: r.ok ? 'correo_comprador' : 'nota',
          detalle: r.ok
            ? `Aviso de compra enviado a ${registro.correo}`
            : 'No se pudo avisar al comprador: ' + (r.motivo || 'sin detalle'),
          quien: origen,
        });
      }
      await correo.avisarAdminCompra({ pedido: registro, comprobante: asiento, panelUrl: URL_PUBLICA });
    } catch (e) {
      console.error('[comprobante] error inesperado con', idPedido, e);
    }
  });
}

/**
 * POST /api/create-payment
 *
 * Recibe el producto elegido y los datos del comprador; devuelve el formToken
 * con el que el navegador dibuja el formulario de tarjeta. El importe NO viaja
 * en la petición: se busca en el catálogo por el identificador del producto.
 */
app.post('/api/create-payment', async (req, res) => {
  if (FALTAN.length) {
    return res.status(503).json({
      error: 'La pasarela todavía no está configurada en este servidor.',
      faltan: FALTAN,
    });
  }

  // El navegador manda QUÉ y CUÁNTO; los precios y el total salen del catálogo.
  const carrito = revisarCarrito(req.body ?? {});
  if (carrito.error) {
    return res.status(400).json({ error: carrito.error });
  }

  const revision = revisarComprador(req.body ?? {});
  if (revision.errores) {
    return res.status(400).json({ error: 'Revise los datos del formulario.', campos: revision.errores });
  }
  const { correo, nombres, documento, telefono } = revision.datos;
  const { nombre, apellido } = partirNombre(nombres);

  const pedido = referenciaPedido();

  // EL PEDIDO SE ANOTA ANTES DE HABLAR CON LA PASARELA, no cuando vuelve. Un
  // comprador al que le rechacen la tarjeta, o que cierre la pestaña delante
  // del formulario, dejaba de existir para nosotros: no había a quién
  // responderle ni forma de saber cuántos lo intentan y no lo consiguen —que es
  // el número que dice si el checkout está roto—.
  //
  // Falla en blando: si no se puede escribir el registro, el cobro sigue
  // adelante. Perder la anotación de un pedido es malo; impedir una venta por
  // eso es peor.
  try {
    registrarPedido({
      pedido,
      lineas: carrito.lineas,
      totalCentimos: carrito.totalCentimos,
      moneda: carrito.moneda,
      comprador: { correo, nombres, documento, telefono },
      modo: MODO,
    });
  } catch (err) {
    console.error('[pedidos] no se pudo anotar el pedido', pedido, err);
  }

  const carga = {
    amount: carrito.totalCentimos,     // el importe lo pone el servidor
    currency: carrito.moneda,
    orderId: pedido,
    customer: {
      email: correo,
      reference: documento || correo,
      billingDetails: {
        firstName: nombre || undefined,
        lastName: apellido || undefined,
        phoneNumber: telefono || undefined,
        identityCode: documento || undefined,
        country: 'PE',
        language: 'es',
      },
      shoppingCart: {
        // Una entrada por línea: así el comprador ve en el formulario de
        // Izipay lo mismo que puso en el carrito. `productAmount` es el
        // precio UNITARIO —la cantidad va aparte—, no el importe de la línea.
        cartItemInfo: carrito.lineas.map((l) => ({
          productLabel: l.nombre,
          productAmount: String(l.precioUnitarioCentimos),
          productQty: l.cantidad,
          productRef: l.productoId,
        })),
      },
    },
  };

  try {
    const r = await fetch(`${IZIPAY.endpoint}/api-payment/V4/Charge/CreatePayment`, {
      method: 'POST',
      headers: {
        Authorization: autorizacionBasic(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(carga),
    });

    const cuerpo = await r.json();

    // Izipay responde 200 incluso cuando rechaza: lo que manda es `status`.
    if (!r.ok || cuerpo.status !== 'SUCCESS' || !cuerpo.answer?.formToken) {
      // El detalle se registra en el servidor y NO se le devuelve al navegador:
      // los mensajes de la pasarela describen la configuración de la tienda.
      console.error('[izipay] CreatePayment rechazado:', JSON.stringify(cuerpo));
      return res.status(502).json({ error: 'No se pudo iniciar el pago. Inténtelo de nuevo en unos minutos.' });
    }

    return res.json({
      formToken: cuerpo.answer.formToken,
      clavePublica: IZIPAY.clavePublica,
      pedido,
      lineas: lineasPublicas(carrito.lineas, carrito.moneda),
      totalCentimos: carrito.totalCentimos,
      totalTexto: formatearPrecio(carrito.totalCentimos, carrito.moneda),
    });
  } catch (e) {
    console.error('[izipay] CreatePayment no respondió:', e);
    return res.status(502).json({ error: 'La pasarela no respondió. Inténtelo de nuevo en unos minutos.' });
  }
});

/**
 * POST /api/validate-payment
 *
 * Comprueba que la respuesta del pago viene de Izipay y no la escribió alguien.
 * Se firma `kr-answer` TAL CUAL llegó —sin volver a serializarlo— porque el
 * HMAC se calculó sobre esos bytes exactos: reordenar una clave del JSON al
 * pasarlo por JSON.parse/stringify cambia la firma y todo pago válido pasaría
 * a rechazado.
 */
app.post('/api/validate-payment', (req, res) => {
  if (FALTAN.length) {
    return res.status(503).json({ error: 'La pasarela todavía no está configurada en este servidor.' });
  }

  const respuesta = req.body?.['kr-answer'];
  const firma = req.body?.['kr-hash'];
  const claveUsada = req.body?.['kr-hash-key'];
  if (typeof respuesta !== 'string' || typeof firma !== 'string') {
    return res.status(400).json({ error: 'Respuesta de pago incompleta.' });
  }

  // Izipay firma con la clave HMAC o con la contraseña de la API, y dice cuál en
  // `kr-hash-key`. Aquí solo se acepta la HMAC: si no se mirara, bastaría con
  // decir «lo firmé con la otra» para que la comprobación se hiciera contra una
  // clave distinta de la que estamos usando.
  if (claveUsada && claveUsada !== 'sha256_hmac') {
    console.warn('[izipay] validate-payment con clave inesperada:', claveUsada);
    return res.status(400).json({ error: 'La firma del pago no es válida.' });
  }

  const calculada = crypto.createHmac('sha256', IZIPAY.hmac).update(respuesta).digest('hex');

  // timingSafeEqual exige longitudes iguales, así que se comprueba antes.
  const a = Buffer.from(calculada);
  const b = Buffer.from(firma);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    console.warn('[izipay] firma inválida en validate-payment');
    return res.status(400).json({ error: 'La firma del pago no es válida.' });
  }

  let datos;
  try {
    datos = JSON.parse(respuesta);
  } catch {
    return res.status(400).json({ error: 'La respuesta del pago no se pudo leer.' });
  }

  const estado = datos.orderStatus;   // PAID | UNPAID | RUNNING …

  // SE ANOTA TAMBIÉN AQUÍ, aunque el que manda siga siendo el IPN.
  //
  // El formulario embebido nunca pasa por `/retorno`: `KR.onSubmit` devuelve
  // false y la página no se recarga. Así que, sin regla de notificación
  // configurada, un pago bueno no dejaba NINGÚN rastro en el servidor — el
  // comprador veía «Pago confirmado», Izipay mandaba su correo, y aquí no
  // había línea que enseñar. Pasó en la primera prueba real.
  //
  // Esto no convierte al navegador en la fuente de verdad: la firma ya está
  // comprobada arriba, `registrarPago` es idempotente por referencia de
  // transacción, y el IPN —que llega aunque el comprador cierre la pestaña—
  // seguirá anotando lo que falte sin duplicar lo ya anotado.
  if (estado === 'PAID') {
    try {
      const anotado = registrarPago(resumirPago(respuesta, MODO), 'navegador');
      if (anotado.nuevo) facturar(anotado.pedido);
    } catch (e) {
      // Que no se pueda anotar no puede tumbar la confirmación en pantalla:
      // el cobro ya está hecho y el IPN lo recuperará.
      console.error('[izipay] pago confirmado pero no anotado:', e);
    }
  }

  return res.json({
    pagado: estado === 'PAID',
    estado,
    pedido: datos.orderDetails?.orderId ?? null,
  });
});

/**
 * POST /api/reclamacion
 *
 * El Libro de Reclamaciones. No depende de la pasarela: alguien puede tener algo
 * que reclamar precisamente porque el pago falló, así que esta ruta funciona
 * aunque Izipay no esté configurado. Por eso no lleva la comprobación de
 * credenciales que sí llevan las otras dos.
 */
app.post('/api/reclamacion', (req, res) => {
  const revision = revisarHoja(req.body ?? {});
  if (revision.errores) {
    return res.status(400).json({ error: 'Revise los datos señalados.', campos: revision.errores });
  }

  try {
    const constancia = registrarHoja(revision.datos, {
      ip: req.ip,
      agente: String(req.get('user-agent') || '').slice(0, 200),
    });
    // Se registra en el servidor para que la copia se pueda mandar a mano
    // mientras no haya correo configurado. Sin esto, una reclamación podría
    // quedarse esperando sin que nadie se entere de que llegó.
    console.log(`[libro] hoja ${constancia.correlativo} de ${revision.datos.correo}`);

    // LA COPIA SE MANDA DESPUÉS DE REGISTRAR Y SIN ESPERARLA. El reglamento
    // obliga a entregarla, pero un servidor de correo caído no puede impedir
    // que se registre una reclamación: eso dejaría al consumidor sin las dos
    // cosas. Queda anotado en el log, y la hoja está guardada de todas formas.
    setImmediate(async () => {
      const r = await correo.copiaReclamacion({ hoja: revision.datos, constancia });
      if (!r.ok) {
        console.error(`[libro] ¡COPIA NO ENVIADA! ${constancia.correlativo} → `
          + `${revision.datos.correo}. Mándela a mano. Motivo: ${r.motivo}`);
      }
      await correo.avisarAdminReclamacion({ hoja: revision.datos, constancia });
    });

    return res.json(constancia);
  } catch (e) {
    console.error('[libro] no se pudo registrar la hoja:', e);
    return res.status(500).json({
      error: 'No pudimos registrar su hoja. Escríbanos a drcaceresruiz@gmail.com y la registramos nosotros.',
    });
  }
});

/**
 * POST /api/ipn — La notificación instantánea de Izipay (webhook).
 *
 * ESTE es el que manda. La validación del navegador puede no llegar nunca —el
 * comprador cierra la pestaña— pero esta notificación llega siempre, de
 * servidor a servidor, y se reintenta si no respondemos.
 *
 * Tres cosas que este manejador hace a propósito:
 *
 *  1. RESPONDE RÁPIDO y siempre 200 cuando la firma es buena, aunque el pago
 *     venga rechazado: el 200 significa «recibí la notificación», no «el pago
 *     salió bien». Devolver error por un pago rechazado hace que Izipay
 *     reintente eternamente algo que ya está decidido.
 *  2. VERIFICA LA FIRMA ANTES de mirar el contenido. Sin firma válida, 400 y no
 *     se toca nada: esta URL es pública y cualquiera puede llamarla diciendo
 *     que un pedido está pagado.
 *  3. ES IDEMPOTENTE. La notificación repetida es lo normal, no la excepción.
 *
 * Llega como formulario (`application/x-www-form-urlencoded`), no como JSON,
 * de ahí el middleware propio de la ruta.
 */
app.post('/api/ipn', express.urlencoded({ extended: false, limit: '64kb' }), (req, res) => {
  // SONDEO, NO NOTIFICACIÓN. Antes de aceptar una regla de notificación, Izipay
  // llama a esta URL desde sus servidores con una petición VACÍA para ver si
  // existe. Contestarle 400 («firma invalida») hacía que la marcase como «Esta
  // URL no es accesible» y no dejase guardar la regla, con todo bien puesto.
  //
  // Un cuerpo sin NINGÚN campo kr-* no es una notificación mal firmada: es que
  // no hay notificación. Se responde 200 y no se toca nada. Esto no afloja la
  // seguridad —lo que sigue exigiendo firma válida es REGISTRAR un pago—: una
  // notificación de verdad con firma mala se sigue rechazando abajo.
  const cuerpo = req.body ?? {};
  const traeAlgo = Object.keys(cuerpo).some((k) => k.startsWith('kr-'));
  if (!traeAlgo) {
    return res.status(200).type('text/plain').send('IPN de GCM operativo.');
  }

  const firma = verificarFirma(cuerpo, CLAVES_VERIFICACION);
  if (!firma.ok) {
    console.warn('[ipn] notificación rechazada:', firma.motivo);
    return res.status(400).send('firma invalida');
  }

  let resumen;
  try {
    resumen = resumirPago(cuerpo['kr-answer']);
  } catch (e) {
    console.error('[ipn] kr-answer ilegible pese a firma válida:', e);
    return res.status(400).send('respuesta ilegible');
  }

  try {
    const r = registrarPago(resumen, 'ipn');
    console.log(`[ipn] ${resumen.estado} pedido=${resumen.pedido} ref=${resumen.referencia}` +
                (r.nuevo ? '' : ' (repetida, no se vuelve a registrar)'));
    if (r.nuevo && resumen.estado === 'PAID') facturar(resumen.pedido);
  } catch (e) {
    // Si no se pudo escribir, se devuelve error A PROPÓSITO: así Izipay
    // reintenta y el cobro no se pierde en silencio.
    console.error('[ipn] no se pudo registrar el pago:', e);
    return res.status(500).send('no registrado');
  }

  return res.status(200).send('OK');
});

/**
 * GET /api/ipn — Solo para que se pueda COMPROBAR que la dirección existe.
 *
 * El Back Office avisa de que «las URL deben ser localizables desde nuestros
 * servidores», y antes de dejar guardar la regla, Izipay visita la dirección con
 * un GET normal. Sin esta ruta respondía 404 y el panel contestaba «Ha ocurrido
 * un error de validación», que no dice cuál ni dónde: se pierde media tarde
 * buscando un fallo de configuración que no existe.
 *
 * No hace nada más. Las notificaciones de verdad llegan por POST, firmadas, y
 * las atiende el manejador de arriba. Este responde en texto plano y no revela
 * nada de la tienda.
 */
app.get('/api/ipn', (_req, res) => {
  res.status(200).type('text/plain').send('IPN de GCM operativo. Las notificaciones se reciben por POST.');
});

/**
 * /retorno — Adonde vuelve el COMPRADOR al pulsar «Volver a la tienda».
 *
 * No confundir con el IPN de arriba: esta la abre una persona en su navegador y
 * puede no abrirla nunca. Aquí no se decide nada; se le enseña cómo quedó su
 * compra. Se registra igual que el IPN, con origen distinto, por si llega antes
 * que la notificación.
 *
 * Acepta POST (que es como la llama Izipay) y GET, para que abrir la URL a mano
 * al configurarla no devuelva un 404 desconcertante.
 */
const manejarRetorno = (req, res) => {
  const cuerpo = { ...(req.body ?? {}), ...(req.query ?? {}) };
  let resumen = null;

  if (cuerpo['kr-answer'] && cuerpo['kr-hash']) {
    const firma = verificarFirma(cuerpo, CLAVES_VERIFICACION);
    if (firma.ok) {
      try {
        resumen = resumirPago(cuerpo['kr-answer']);
        registrarPago(resumen, 'retorno');
      } catch (e) {
        console.error('[retorno] no se pudo leer o registrar el pago:', e);
        resumen = null;
      }
    } else {
      // No se le enseña un resultado que no podemos probar: la página cae al
      // mensaje de «no pudimos leer el resultado», que es la verdad.
      console.warn('[retorno] firma inválida:', firma.motivo);
    }
  }

  res.status(200).type('html').send(paginaRetorno(resumen));
};

app.post('/retorno', express.urlencoded({ extended: false, limit: '64kb' }), manejarRetorno);
app.get('/retorno', manejarRetorno);

// ---------------------------------------------------------------------------
//  El panel del administrador
// ---------------------------------------------------------------------------
/**
 * Todo lo que cuelga de /admin exige sesión, y la sesión exige que exista una
 * contraseña en el `.env`. Sin ella el panel no se abre: enseña nombres,
 * documentos, correos y teléfonos de compradores, y eso no puede quedar
 * accesible porque alguien olvidara rellenar una variable.
 *
 * Se dibuja en el servidor y las acciones son formularios normales. Un panel
 * que se mira cinco veces al día no necesita una API aparte que asegurar.
 */
const formularioAdmin = express.urlencoded({ extended: false, limit: '32kb' });

/** El estado de todas las compras, recalculado en cada visita. */
function compras() {
  return consolidar(leerLineas(LIBRO_PAGOS));
}

// Ni buscadores ni intermediarios deben guardar nada de aquí.
app.use('/admin', (_req, res, siguiente) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');
  siguiente();
});

app.get('/admin/entrar', (_req, res) => res.redirect('/admin'));

app.post('/admin/entrar', formularioAdmin, (req, res) => {
  if (!sesion.claveConfigurada()) {
    return res.status(503).type('html').send(panel.paginaSinConfigurar());
  }
  const espera = sesion.frenado(req);
  if (espera) {
    return res.status(429).type('html').send(panel.paginaEntrar({ espera }));
  }
  if (!sesion.claveCorrecta(req.body?.clave)) {
    sesion.anotarFallo(req);
    // El mensaje no distingue «contraseña incorrecta» de nada más: no hay nada
    // que confirmarle a quien está probando.
    return res.status(401).type('html').send(panel.paginaEntrar({ error: 'No se pudo entrar.' }));
  }
  sesion.olvidarFallos(req);
  res.set('Set-Cookie', sesion.cookieDeEntrada());
  return res.redirect('/admin');
});

app.post('/admin/salir', formularioAdmin, (_req, res) => {
  res.set('Set-Cookie', sesion.cookieDeSalida());
  return res.redirect('/admin');
});

/** De aquí para abajo, sin sesión no se pasa. */
app.use('/admin', (req, res, siguiente) => {
  if (!sesion.claveConfigurada()) {
    return res.status(503).type('html').send(panel.paginaSinConfigurar());
  }
  if (!sesion.sesionValida(req)) {
    return res.status(401).type('html').send(panel.paginaEntrar({ espera: sesion.frenado(req) }));
  }
  return siguiente();
});

app.get('/admin', (req, res) => {
  const filtro = String(req.query.estado || '');
  res.type('html').send(panel.paginaCompras(compras(), {
    filtro,
    mensaje: req.query.ok ? String(req.query.ok).slice(0, 120) : null,
  }));
});

/* ----------------------------------------------------------------- catálogo */
/**
 * Lo que se vende, editable.
 *
 * Cambiar un precio aquí cambia lo que se le cobra a la siguiente persona: por
 * eso vive detrás de la misma puerta que el resto del panel y no en un archivo
 * suelto. La regla de que el importe lo pone el servidor no se toca — solo
 * cambia de dónde lo saca el servidor.
 */
app.get('/admin/catalogo', (req, res) => {
  res.type('html').send(panel.paginaCatalogo(todosLosProductos(), categorias(), {
    mensaje: req.query.ok ? String(req.query.ok).slice(0, 200)
      : req.query.err ? String(req.query.err).slice(0, 200) : null,
    mensajeMalo: Boolean(req.query.err),
  }));
});

app.get('/admin/catalogo/producto/nuevo', (_req, res) => {
  res.type('html').send(panel.paginaProducto(null, categorias(), { esNuevo: true }));
});

app.get('/admin/catalogo/producto/:id', (req, res) => {
  const producto = buscarCualquierProducto(req.params.id);
  if (!producto) return res.redirect('/admin/catalogo?err=' + encodeURIComponent('Ese producto ya no existe.'));
  res.type('html').send(panel.paginaProducto(producto, categorias(), {}));
});

/** Alta y edición comparten manejador: el identificador decide cuál es cuál. */
function guardarProducto(esNuevo) {
  return (req, res) => {
    const id = esNuevo ? null : req.params.id;
    const anterior = esNuevo ? null : buscarCualquierProducto(id);
    if (!esNuevo && !anterior) {
      return res.redirect('/admin/catalogo?err=' + encodeURIComponent('Ese producto ya no existe.'));
    }

    const revision = catalogoEdicion.revisarProducto(req.body ?? {}, { id });
    if (revision.errores) {
      return res.status(400).type('html').send(panel.paginaProducto(anterior, categorias(), {
        errores: revision.errores,
        valores: req.body ?? {},
        esNuevo,
      }));
    }

    try {
      const guardado = catalogoEdicion.guardarProducto(revision.datos);
      const aviso = esNuevo ? `Creado: ${guardado.nombre}.` : `Guardado: ${guardado.nombre}.`;
      return res.redirect('/admin/catalogo?ok=' + encodeURIComponent(aviso));
    } catch (e) {
      console.error('[catalogo] no se pudo guardar el producto:', e);
      return res.redirect('/admin/catalogo?err=' + encodeURIComponent('No se pudo guardar: ' + e.message));
    }
  };
}

app.post('/admin/catalogo/producto', formularioAdmin, guardarProducto(true));
app.post('/admin/catalogo/producto/:id', formularioAdmin, guardarProducto(false));

app.post('/admin/catalogo/producto/:id/activar', formularioAdmin, (req, res) => {
  const producto = buscarCualquierProducto(req.params.id);
  if (!producto) return res.redirect('/admin/catalogo');
  const activo = req.body?.activo === 'si';
  try {
    catalogoEdicion.activarProducto(producto.id, activo);
  } catch (e) {
    console.error('[catalogo] no se pudo cambiar el estado:', e);
    return res.redirect('/admin/catalogo?err=' + encodeURIComponent('No se pudo cambiar: ' + e.message));
  }
  const aviso = activo ? `«${producto.nombre}» ya está a la venta.` : `«${producto.nombre}» queda retirado.`;
  return res.redirect('/admin/catalogo?ok=' + encodeURIComponent(aviso));
});

app.post('/admin/catalogo/producto/:id/borrar', formularioAdmin, (req, res) => {
  const producto = buscarCualquierProducto(req.params.id);
  if (!producto) return res.redirect('/admin/catalogo');
  try {
    catalogoEdicion.borrarProducto(producto.id);
  } catch (e) {
    console.error('[catalogo] no se pudo borrar el producto:', e);
    return res.redirect('/admin/catalogo?err=' + encodeURIComponent('No se pudo borrar: ' + e.message));
  }
  return res.redirect('/admin/catalogo?ok=' + encodeURIComponent(`Borrado: ${producto.nombre}.`));
});

app.post('/admin/catalogo/categoria', formularioAdmin, (req, res) => {
  const revision = catalogoEdicion.revisarCategoria(req.body ?? {});
  if (revision.errores) {
    return res.status(400).type('html').send(panel.paginaCatalogo(todosLosProductos(), categorias(), {
      errorCat: revision.errores.nombre,
    }));
  }
  try {
    catalogoEdicion.guardarCategoria(revision.datos);
  } catch (e) {
    console.error('[catalogo] no se pudo guardar la categoría:', e);
    return res.redirect('/admin/catalogo?err=' + encodeURIComponent('No se pudo guardar: ' + e.message));
  }
  return res.redirect('/admin/catalogo?ok=' + encodeURIComponent(`Categoría «${revision.datos.nombre}» añadida.`));
});

app.post('/admin/catalogo/categoria/:id/borrar', formularioAdmin, (req, res) => {
  const cuantos = catalogoEdicion.productosDeCategoria(req.params.id);
  try {
    catalogoEdicion.borrarCategoria(req.params.id);
  } catch (e) {
    console.error('[catalogo] no se pudo borrar la categoría:', e);
    return res.redirect('/admin/catalogo?err=' + encodeURIComponent('No se pudo borrar: ' + e.message));
  }
  const aviso = cuantos
    ? `Categoría borrada. Sus ${cuantos} producto(s) aparecen ahora bajo «Otros».`
    : 'Categoría borrada.';
  return res.redirect('/admin/catalogo?ok=' + encodeURIComponent(aviso));
});

app.get('/admin/ayuda', (_req, res) => {
  res.type('html').send(panel.paginaAyuda({ urlPublica: URL_PUBLICA }));
});

app.get('/admin/reclamaciones', (_req, res) => {
  res.type('html').send(panel.paginaReclamaciones(leerLineas(LIBRO_RECLAMACIONES)));
});

app.get('/admin/pedido/:pedido', (req, res) => {
  const registro = compras().find((p) => p.pedido === req.params.pedido);
  if (!registro) return res.status(404).type('html').send(panel.paginaCompras(compras(), {}));
  res.type('html').send(panel.paginaPedido(registro, {
    mensaje: req.query.ok ? String(req.query.ok).slice(0, 300)
      : req.query.err ? String(req.query.err).slice(0, 300) : null,
    mensajeMalo: Boolean(req.query.err),
    comprobante: comprobantes.comprobanteDe(registro.pedido),
    facturadorListo: comprobantes.configurado(),
    lineas: lineasDe(registro),
  }));
});

/**
 * Las tres acciones sobre un pedido. Ninguna corrige nada: las tres AÑADEN un
 * evento. Por eso marcar dos veces «entregado» no rompe nada y el historial
 * enseña que se hizo dos veces, que es la verdad.
 */
function accionSobrePedido(tipo, mensaje) {
  return (req, res) => {
    const existe = compras().some((p) => p.pedido === req.params.pedido);
    if (!existe) return res.redirect('/admin');
    const detalle = String(req.body?.detalle ?? '').trim().slice(0, 600) || null;
    if (tipo !== 'entregado' && !detalle) {
      return res.redirect(`/admin/pedido/${encodeURIComponent(req.params.pedido)}`);
    }
    try {
      registrarEvento({ pedido: req.params.pedido, tipo, detalle });
    } catch (e) {
      console.error('[panel] no se pudo anotar el evento:', e);
    }
    return res.redirect(
      `/admin/pedido/${encodeURIComponent(req.params.pedido)}?ok=${encodeURIComponent(mensaje)}`);
  };
}

/**
 * Emitir a mano el comprobante que no salió solo: NubeFact caído, un dato del
 * comprador que hubo que corregir, o el correlativo desincronizado. Espera a la
 * respuesta —aquí sí, porque hay alguien mirando la pantalla— y devuelve el
 * resultado escrito en el aviso.
 */
app.post('/admin/pedido/:pedido/facturar', formularioAdmin, async (req, res) => {
  const volver = `/admin/pedido/${encodeURIComponent(req.params.pedido)}`;
  const registro = compras().find((p) => p.pedido === req.params.pedido);
  if (!registro) return res.redirect('/admin');

  let asiento;
  try {
    asiento = await comprobantes.emitir(registro);
  } catch (e) {
    console.error('[comprobante] error emitiendo a mano', req.params.pedido, e);
    asiento = { ok: false, motivo: 'Error inesperado: ' + e.message };
  }

  if (asiento.ok && !asiento.repetido) {
    registrarEvento({
      pedido: req.params.pedido,
      tipo: 'comprobante',
      detalle: comprobantes.nombrar(asiento),
      quien: 'administrador',
    });
  }
  const aviso = asiento.ok
    ? (asiento.repetido ? `Este pedido ya tenía ${comprobantes.nombrar(asiento)}.`
      : `Emitido: ${comprobantes.nombrar(asiento)}.`)
    : `No se pudo emitir: ${asiento.motivo}`;
  // Un fallo se enseña en rojo. Salió verde la primera vez que SUNAT rechazó
  // un comprobante, y un error con aspecto de éxito es peor que ningún aviso.
  const parametro = asiento.ok ? 'ok' : 'err';
  return res.redirect(`${volver}?${parametro}=${encodeURIComponent(aviso)}`);
});

app.post('/admin/pedido/:pedido/entregado', formularioAdmin,
  accionSobrePedido('entregado', 'Marcado como entregado.'));
app.post('/admin/pedido/:pedido/comprobante', formularioAdmin,
  accionSobrePedido('comprobante', 'Comprobante anotado.'));
app.post('/admin/pedido/:pedido/nota', formularioAdmin,
  accionSobrePedido('nota', 'Nota guardada.'));

// ---------------------------------------------------------------------------
//  Arranque
// ---------------------------------------------------------------------------

app.listen(PUERTO, () => {
  console.log(`Checkout de GCM escuchando en http://localhost:${PUERTO}/checkout.html`);
  const base = URL_PUBLICA || `http://localhost:${PUERTO}`;
  console.log('');
  console.log('  Para pegar en el Back Office de Izipay:');
  console.log(`    URL de notificación al final del pago (IPN):  ${base}/api/ipn`);
  console.log(`    URL de retorno de la tienda:                  ${base}/retorno`);
  if (!URL_PUBLICA) {
    console.log('    ↑ son las locales. Ponga URL_PUBLICA en .env para ver las de verdad.');
  }
  console.log('');
  console.log(`  Panel del administrador:  ${base}/admin`);
  if (!comprobantes.configurado()) {
    console.warn('    ⚠  boletas y facturas a mano: falta FACTURACION_URL / FACTURACION_CLAVE en .env');
  }
  if (!correo.configurado()) {
    console.warn('    ⚠  NO SALE NINGÚN CORREO: falta CORREO_HOST / CORREO_USUARIO / CORREO_CLAVE en .env');
    console.warn('       El comprador no recibirá su comprobante y la copia de las');
    console.warn('       hojas de reclamación hay que mandarla a mano.');
  }
  if (!sesion.claveConfigurada()) {
    console.warn('    ⚠  cerrado: falta ADMIN_PASSWORD en .env');
  }
  console.log('');
  if (FALTAN.length) {
    console.warn('  ⚠  Faltan credenciales en .env: ' + FALTAN.join(', '));
    console.warn('     La página carga, pero /api/create-payment devolverá 503.');
    console.warn('     Copie .env.example a .env y pegue las credenciales de prueba.');
    console.warn('');
  }
});

module.exports = app;
