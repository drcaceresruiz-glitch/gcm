/**
 * pagina_gracias.js — Adónde llega el comprador cuando el pago sale bien.
 *
 * POR QUÉ EXISTE. Antes, al confirmarse el cobro solo aparecía un renglón
 * verde dentro del propio formulario, debajo de los datos de la tarjeta: la
 * página seguía siendo la de pagar, con el carrito y el formulario todavía a
 * la vista. Quien acababa de gastar su dinero se quedaba sin saber qué había
 * comprado exactamente, ni qué pasaba a continuación, ni a quién escribir.
 *
 * QUÉ NO SE ENSEÑA AQUÍ. El número de pedido va en la dirección, así que esta
 * página la puede abrir cualquiera que lo tenga. Por eso NO salen el nombre,
 * el documento ni el teléfono del comprador, y el correo va tapado. Lo que sí
 * sale —qué se compró, cuánto costó y en qué estado va— es lo que esa persona
 * necesita, y no identifica a nadie.
 *
 * Se dibuja en el servidor a propósito: el detalle sale del registro de
 * pedidos, no de lo que traiga la dirección. Cambiar el importe en la URL no
 * cambia lo que se ve.
 */

const { COMERCIO } = require('./comercio');

/** Escapa todo lo que venga de fuera. */
function e(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * Tapa el correo dejando lo justo para reconocerlo.
 *
 * `yudelviscaceresruiz@gmail.com` → `yu•••••@gmail.com`. Sirve para que el
 * comprador confirme que escribió bien su correo sin publicárselo a nadie que
 * abra esta dirección.
 */
function taparCorreo(correo) {
  const texto = String(correo || '');
  const arroba = texto.indexOf('@');
  if (arroba < 1) return '';
  const antes = texto.slice(0, arroba);
  const visible = antes.slice(0, Math.min(2, antes.length));
  return `${visible}${'•'.repeat(Math.max(3, antes.length - visible.length))}${texto.slice(arroba)}`;
}

function dinero(centimos, moneda = 'PEN') {
  const simbolo = moneda === 'USD' ? '$' : 'S/';
  return `${simbolo} ${(Number(centimos || 0) / 100).toFixed(2)}`;
}

/** El envoltorio: la misma cabecera y el mismo pie que el resto de la tienda. */
function envoltorio(titulo, cuerpo) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${e(titulo)} · drcaceresruiz.com</title>
<link rel="icon" href="/icono.svg" type="image/svg+xml">
<link rel="stylesheet" href="/tienda.css">
</head><body>
<header class="barra">
  <div class="contenedor">
    <a class="marca" href="/">
      <span class="sello" aria-hidden="true">DR</span>
      <span><b>drcaceresruiz.com</b><small>Tienda oficial</small></span>
    </a>
    <div class="barra-dcha">
      <a class="volver" href="/">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>
        </svg>
        Seguir comprando
      </a>
    </div>
  </div>
</header>
<main class="contenedor">${cuerpo}</main>
<footer class="pie">
  <div class="contenedor">
    <div class="enlaces">
      <a class="enlace-legal" href="/terminos.html">Términos y Condiciones</a>
      <a class="enlace-legal" href="/devoluciones.html">Políticas de Devolución</a>
      <a class="enlace-legal libro" href="/reclamaciones.html">Libro de Reclamaciones</a>
    </div>
    <div class="pie-abajo">
      <p class="identidad">
        <b>${e(COMERCIO.razonSocial)}</b> · RUC ${e(COMERCIO.ruc)}<br>
        Consultas: <a href="mailto:${e(COMERCIO.correo)}">${e(COMERCIO.correo)}</a>
        · <a href="tel:${e(String(COMERCIO.telefono).replace(/\s/g, ''))}">${e(COMERCIO.telefono)}</a>
      </p>
    </div>
  </div>
</footer>
</body></html>`;
}

/**
 * La página de «gracias por su compra».
 *
 * @param {object|null} pedido  el registro consolidado, o null si no se encontró
 * @param {Array}       lineas  qué se compró
 * @param {object|null} comprobante  la boleta o factura, si ya salió
 */
function paginaGracias({ pedido = null, lineas = [], comprobante = null } = {}) {
  // SIN PEDIDO NO SE INVENTA NADA. Puede pasar si alguien guarda la dirección
  // y vuelve mañana, o si teclea un número al azar. En los dos casos se
  // contesta lo mismo, para no confirmarle a nadie qué números existen.
  if (!pedido) {
    return envoltorio('Compra', `
      <h1 class="titulo">No encontramos esa compra</h1>
      <p class="bajada">Puede que la dirección esté incompleta. Si acaba de pagar y ve este
        mensaje, <b>su pago no se ha perdido</b>: escríbanos a
        <a href="mailto:${e(COMERCIO.correo)}">${e(COMERCIO.correo)}</a> y lo comprobamos.</p>
      <p><a class="btn-enlace" href="/">Volver a la tienda</a></p>`);
  }

  const pagado = pedido.estado === 'pagado' || pedido.estado === 'entregado';
  const total = dinero(pedido.importeCentimos, pedido.moneda);

  const filas = lineas.map((l) => `
    <tr>
      <td>${e(l.nombre)}</td>
      <td class="num">${e(l.cantidad)}</td>
      <td class="num">${e(dinero(l.importeCentimos, l.moneda || pedido.moneda))}</td>
    </tr>`).join('');

  return envoltorio(pagado ? 'Compra confirmada' : 'Su compra', `
  <div class="gracias-cabeza">
    ${pagado ? `<div class="marca-ok" aria-hidden="true">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12.5 5.5 5.5L20 7"/></svg>
    </div>` : ''}
    <h1 class="titulo" style="margin-top:14px">${pagado ? 'Gracias por su compra' : 'Su compra'}</h1>
    <p class="bajada">${pagado
      ? `Su pago se realizó correctamente. Le hemos enviado la confirmación
         ${pedido.correo ? `a <b>${e(taparCorreo(pedido.correo))}</b>` : 'a su correo'}.`
      : 'Todavía no nos consta el pago de este pedido.'}</p>
  </div>

  <section class="panel">
    <h2 style="margin-top:0">Su pedido</h2>
    <table class="detalle-compra">
      <tbody>
        <tr><th>Número de pedido</th><td><b>${e(pedido.pedido)}</b></td></tr>
        <tr><th>Estado del pago</th><td>${pagado
          ? '<b style="color:#0b6b55">Pagado</b>'
          : '<b>Pendiente</b>'}</td></tr>
        <tr><th>Total</th><td><b>${e(total)}</b> <span class="apagado">IGV incluido</span></td></tr>
      </tbody>
    </table>

    ${filas ? `<h3>Qué compró</h3>
    <table class="detalle-compra lineas">
      <thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Importe</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>` : ''}

    <h3>Su comprobante</h3>
    ${comprobante && comprobante.ok
      ? `<p>Se emitió su <b>${e(comprobante.tipo)} ${e(comprobante.serie)}-${e(comprobante.numero)}</b>.
         Se lo enviamos por correo junto con el archivo XML.</p>`
      : `<p>Su boleta o factura electrónica se emite en cuanto se confirma el pago y le llega
         por correo. Si en unos minutos no la ve, revise el correo no deseado o escríbanos.</p>`}

    <h3>Qué pasa ahora</h3>
    <p>Recibirá por correo el acceso o el enlace de descarga de lo que compró. Si es la licencia
      de la app web, la activación puede tardar hasta <b>24 horas hábiles</b>.</p>
    <p class="nota">¿Alguna duda con este pedido? Escríbanos a
      <a href="mailto:${e(COMERCIO.correo)}">${e(COMERCIO.correo)}</a> citando el número
      <b>${e(pedido.pedido)}</b>, o llámenos al ${e(COMERCIO.telefono)}.</p>

    <p style="margin:22px 0 0"><a class="btn-enlace" href="/">Seguir comprando</a></p>
  </section>`);
}

module.exports = { paginaGracias, taparCorreo };
