/**
 * panel_admin.js — Las pantallas del panel del administrador.
 *
 * SE DIBUJA EN EL SERVIDOR, a propósito, y las acciones son formularios de
 * toda la vida. No hay una API aparte que asegurar ni JavaScript que pueda
 * quedarse a medias: si la página se ve, es que la sesión valía; si el
 * formulario llega, llega con su cookie. Un panel que se usa cinco veces al día
 * no necesita nada más, y lo que no existe no se puede romper.
 *
 * TODO LO QUE VIENE DE FUERA SE ESCAPA. En estas pantallas se pintan nombres,
 * correos y notas escritos por otras personas. Sin escapar, una nota con
 * etiquetas se ejecutaría dentro del panel —con la sesión del administrador
 * puesta—. `e()` no es cosmética: es la barrera.
 */

const { formatearPrecio } = require('./catalogo');
const { aTextoPrecio } = require('./catalogo_edicion');
const { etiquetaDocumento, llevaFactura } = require('./documentos');

/** Escapa texto para meterlo en HTML. Se usa SIEMPRE, sin excepciones. */
function e(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' });
}

const ESTILO = `
:root{--tinta:#12211f;--suave:#5d6f6c;--linea:#dde5e3;--fondo:#f4f7f6;--papel:#fff;
--acento:#0d7a72;--bien:#1a7f4b;--ojo:#b45309;--mal:#b42318}
*{box-sizing:border-box}
body{margin:0;font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--tinta);background:var(--fondo)}
a{color:var(--acento)}
header{background:var(--papel);border-bottom:1px solid var(--linea);padding:14px 20px;display:flex;
gap:18px;align-items:center;flex-wrap:wrap}
header b{font-size:16px}
header nav{display:flex;gap:14px;flex-wrap:wrap;margin-left:auto}
main{max-width:1000px;margin:0 auto;padding:22px 20px 60px}
h1{font-size:21px;margin:0 0 4px}
h2{font-size:16px;margin:26px 0 10px}
p.guia{color:var(--suave);margin:0 0 18px}
.tarjetas{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 22px}
.tarjeta{background:var(--papel);border:1px solid var(--linea);border-radius:10px;padding:14px 16px;min-width:150px;flex:1}
.tarjeta .n{font-size:26px;font-weight:600;display:block}
.tarjeta .r{color:var(--suave);font-size:13px}
.caja{background:var(--papel);border:1px solid var(--linea);border-radius:10px;padding:16px 18px;margin:0 0 18px}
table{width:100%;border-collapse:collapse;background:var(--papel);border:1px solid var(--linea);border-radius:10px;overflow:hidden}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--linea);vertical-align:top}
th{background:#eef3f2;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--suave)}
tr:last-child td{border-bottom:0}
.tabla-scroll{overflow-x:auto}
.et{display:inline-block;font-size:12px;font-weight:600;padding:2px 9px;border-radius:99px;white-space:nowrap}
.et.entregado{background:#e7f5ec;color:var(--bien)}
.et.pagado{background:#fdf0dc;color:var(--ojo)}
.et.iniciado{background:#eef3f2;color:var(--suave)}
.et.abandonado{background:#f6e9e8;color:var(--mal)}
.et.prueba{background:#eef3f2;color:var(--suave);font-weight:500}
form.linea{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 10px}
input[type=text],input[type=password],textarea{font:inherit;padding:9px 11px;border:1px solid var(--linea);
border-radius:8px;background:var(--papel);color:inherit;min-width:0}
textarea{width:100%;min-height:70px}
button{font:inherit;font-weight:600;padding:9px 16px;border:0;border-radius:8px;background:var(--acento);
color:#fff;cursor:pointer}
button.suave{background:#eef3f2;color:var(--tinta)}
.aviso{border-radius:8px;padding:11px 14px;margin:0 0 16px;font-size:14px}
.aviso.mal{background:#f6e9e8;color:var(--mal)}
.aviso.bien{background:#e7f5ec;color:var(--bien)}
.aviso.ojo{background:#fdf0dc;color:var(--ojo)}
.apagado{color:var(--suave)}
.entrar{max-width:380px;margin:12vh auto;padding:0 20px}
ol.pasos{padding-left:20px;margin:0}
ol.pasos li{margin:0 0 9px}
`;

function pagina(titulo, cuerpo, { sesion = true } = {}) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${e(titulo)} · Panel de ventas</title><style>${ESTILO}</style></head><body>
${sesion ? `<header><b>Panel de la tienda</b><nav>
<a href="/admin">Compras</a>
<a href="/admin/catalogo">Catálogo</a>
<a href="/admin/reclamaciones">Reclamaciones</a>
<a href="/admin/ayuda">Cómo se atiende</a>
<a href="/">Ver la tienda</a>
<form method="post" action="/admin/salir" style="margin:0"><button class="suave">Salir</button></form>
</nav></header>` : ''}
<main>${cuerpo}</main></body></html>`;
}

/* ------------------------------------------------------------------ entrada */

function paginaEntrar({ error = null, espera = 0 } = {}) {
  return pagina('Entrar', `
<div class="entrar">
  <h1>Panel de la tienda</h1>
  <p class="guia">Acceso reservado al administrador.</p>
  ${espera ? `<div class="aviso mal">Demasiados intentos fallidos. Vuelva a probar en ${espera} minuto(s).</div>`
    : error ? `<div class="aviso mal">${e(error)}</div>` : ''}
  <form method="post" action="/admin/entrar">
    <p><input type="password" name="clave" placeholder="Contraseña" autocomplete="current-password"
       required autofocus style="width:100%"></p>
    <p><button style="width:100%">Entrar</button></p>
  </form>
</div>`, { sesion: false });
}

function paginaSinConfigurar() {
  return pagina('Panel no disponible', `
<div class="entrar">
  <h1>El panel no está configurado</h1>
  <p class="guia">Falta <code>ADMIN_PASSWORD</code> en el archivo <code>.env</code> del servidor.
  Hasta que exista, el panel no se abre: es preferible eso a dejar a la vista los datos de los compradores.</p>
</div>`, { sesion: false });
}

/* ------------------------------------------------------------------ compras */

function etiqueta(estado) {
  const texto = { entregado: 'Entregado', pagado: 'Falta entregar', iniciado: 'Sin pagar', abandonado: 'Abandonado' };
  return `<span class="et ${e(estado)}">${e(texto[estado] || estado)}</span>`;
}

function paginaCompras(lista, { filtro = '', mensaje = null } = {}) {
  const pagadosSinEntregar = lista.filter((p) => p.estado === 'pagado');
  const entregados = lista.filter((p) => p.estado === 'entregado');
  const enCurso = lista.filter((p) => p.estado === 'iniciado');
  const cobrado = lista
    .filter((p) => p.pagado && p.modo !== 'TEST')
    .reduce((s, p) => s + (p.importeCentimos || 0), 0);

  const mostradas = filtro ? lista.filter((p) => p.estado === filtro) : lista;

  const filas = mostradas.map((p) => `<tr>
    <td><a href="/admin/pedido/${encodeURIComponent(p.pedido)}"><b>${e(p.pedido)}</b></a><br>
        <span class="apagado">${e(fecha(p.creadoEn))}</span>
        ${p.modo === 'TEST' ? ' <span class="et prueba">prueba</span>' : ''}</td>
    <td>${e(p.nombres || '—')}<br><span class="apagado">${e(p.correo || '—')}</span></td>
    <td>${e(p.productoNombre || '—')}</td>
    <td>${p.importeCentimos == null ? '—' : e(formatearPrecio(p.importeCentimos))}</td>
    <td>${etiqueta(p.estado)}</td>
  </tr>`).join('');

  const enlace = (clave, texto) =>
    `<a href="/admin${clave ? '?estado=' + clave : ''}"${filtro === clave ? ' style="font-weight:700"' : ''}>${texto}</a>`;

  return pagina('Compras', `
${mensaje ? `<div class="aviso bien">${e(mensaje)}</div>` : ''}
<h1>Compras</h1>
<p class="guia">Cada línea es un pedido. Se anota desde que alguien pulsa «Continuar al pago», haya terminado o no.</p>

${pagadosSinEntregar.length
    ? `<div class="aviso ojo"><b>${pagadosSinEntregar.length} compra(s) pagadas sin entregar.</b>
       Entre en cada una y márquela cuando le haya mandado el producto.</div>`
    : '<div class="aviso bien">No hay nada pendiente de entregar.</div>'}

<div class="tarjetas">
  <div class="tarjeta"><span class="n">${pagadosSinEntregar.length}</span><span class="r">Falta entregar</span></div>
  <div class="tarjeta"><span class="n">${entregados.length}</span><span class="r">Entregadas</span></div>
  <div class="tarjeta"><span class="n">${enCurso.length}</span><span class="r">Sin pagar aún</span></div>
  <div class="tarjeta"><span class="n">${e(formatearPrecio(cobrado))}</span><span class="r">Cobrado (sin pruebas)</span></div>
</div>

<p class="apagado">Ver: ${enlace('', 'todas')} ·
${enlace('pagado', 'falta entregar')} ·
${enlace('entregado', 'entregadas')} ·
${enlace('iniciado', 'sin pagar')} ·
${enlace('abandonado', 'abandonadas')}</p>

${mostradas.length ? `<div class="tabla-scroll"><table>
<tr><th>Pedido</th><th>Comprador</th><th>Producto</th><th>Importe</th><th>Estado</th></tr>
${filas}</table></div>`
    : '<div class="caja apagado">No hay compras que enseñar aquí todavía.</div>'}
`);
}

/* -------------------------------------------------------- detalle de un pedido */

function paginaPedido(p, { mensaje = null, mensajeMalo = false, comprobante = null, facturadorListo = false, lineas = [] } = {}) {
  const pagos = p.pagos.map((x) => `<tr>
    <td>${e(fecha(x.registradoEn))}</td>
    <td>${e(x.estado || '—')}${x.detalleEstado ? ` <span class="apagado">(${e(x.detalleEstado)})</span>` : ''}</td>
    <td>${x.importeCentimos == null ? '—' : e(formatearPrecio(x.importeCentimos))}</td>
    <td>${e(x.modo || '—')}</td>
    <td class="apagado">${e(x.origen || '—')}</td>
    <td class="apagado" style="word-break:break-all">${e(x.referencia || '—')}</td>
  </tr>`).join('');

  const eventos = p.eventos.map((x) => `<tr>
    <td>${e(fecha(x.registradoEn))}</td><td>${e(x.tipo)}</td><td>${e(x.detalle || '')}</td>
  </tr>`).join('');

  return pagina(`Pedido ${p.pedido}`, `
${mensaje ? `<div class="aviso ${mensajeMalo ? 'mal' : 'bien'}">${e(mensaje)}</div>` : ''}
<p><a href="/admin">← Volver a las compras</a></p>
<h1>${e(p.pedido)} ${etiqueta(p.estado)}</h1>
<p class="guia">Iniciado el ${e(fecha(p.creadoEn))}${p.modo === 'TEST' ? ' · transacción de PRUEBA' : ''}</p>

${p.huerfano ? `<div class="aviso ojo">De este pedido solo consta el cobro. Es de antes de que se empezaran a
guardar los pedidos al iniciarse, así que faltan los datos que escribió el comprador.</div>` : ''}

<div class="caja">
  <h2 style="margin-top:0">Comprador</h2>
  <table>
    <tr><th>Nombre</th><td>${e(p.nombres || '—')}</td></tr>
    <tr><th>Correo</th><td><a href="mailto:${e(p.correo || '')}">${e(p.correo || '—')}</a></td></tr>
    <tr><th>Documento</th><td>${e(etiquetaDocumento(p.tipoDocumento, p.documento))}
      ${llevaFactura(p.tipoDocumento, p.documento) ? ' <span class="et pagado">lleva factura</span>' : ''}</td></tr>
    <tr><th>Teléfono</th><td>${e(p.telefono || '—')}</td></tr>
    <tr><th>Importe</th><td><b>${p.importeCentimos == null ? '—' : e(formatearPrecio(p.importeCentimos))}</b></td></tr>
    <tr><th>Comprobante</th><td>${comprobante && comprobante.ok
      ? `<b>${e(comprobante.tipo)} ${e(comprobante.serie)}-${e(comprobante.numero)}</b>`
        + (comprobante.estado === 'aceptado' ? ' <span class="et entregado">aceptado por SUNAT</span>'
          : comprobante.estado === 'pendiente_resumen' ? ' <span class="et pagado">en el resumen diario</span>'
          : comprobante.estado === 'fallido' ? ' <span class="et abandonado">rechazado</span>' : '')
        + (comprobante.modo && comprobante.modo !== 'produccion'
          ? ` <span class="et prueba">${e(comprobante.modo)}</span>` : '')
        + (comprobante.sunat ? `<br><span class="apagado">${e(comprobante.sunat)}</span>` : '')
      : e(p.comprobante || 'sin emitir')}</td></tr>
  </table>
</div>

<div class="caja">
  <h2 style="margin-top:0">Qué se compró</h2>
  ${lineas.length ? `<div class="tabla-scroll"><table>
  <tr><th>Producto</th><th style="text-align:right">Cantidad</th>
      <th style="text-align:right">Precio</th><th style="text-align:right">Importe</th></tr>
  ${lineas.map((l) => `<tr>
    <td>${e(l.nombre)}${l.productoId ? `<br><span class="apagado">${e(l.productoId)}</span>` : ''}</td>
    <td style="text-align:right">${e(l.cantidad)}</td>
    <td style="text-align:right">${e(formatearPrecio(l.precioUnitarioCentimos, l.moneda || 'PEN'))}</td>
    <td style="text-align:right"><b>${e(formatearPrecio(l.importeCentimos, l.moneda || 'PEN'))}</b></td>
  </tr>`).join('')}
  <tr><td colspan="3" style="text-align:right"><b>Total</b></td>
      <td style="text-align:right"><b>${e(formatearPrecio(p.importeCentimos || 0, p.moneda || 'PEN'))}</b></td></tr>
  </table></div>
  <p class="apagado" style="margin-bottom:0">Estos importes son los del momento de la compra. Cambiar
  hoy un precio en el catálogo no altera lo que ya se vendió.</p>`
    : '<p class="apagado" style="margin:0">De este pedido no consta el detalle de lo comprado.</p>'}
</div>

<div class="caja">
  <h2 style="margin-top:0">El pago</h2>
  ${p.pagos.length ? `<div class="tabla-scroll"><table>
  <tr><th>Cuándo</th><th>Estado</th><th>Importe</th><th>Modo</th><th>Llegó por</th><th>Referencia</th></tr>
  ${pagos}</table></div>
  <p class="apagado" style="margin-bottom:0">«Llegó por»: <b>ipn</b> es el aviso de Izipay de servidor a
  servidor —el que vale aunque el comprador cierre la pestaña—; <b>navegador</b> es la confirmación en pantalla.
  Las dos comprueban la firma antes de anotar nada.</p>`
    : '<p class="apagado" style="margin:0">Todavía no consta ningún cobro de este pedido.</p>'}
</div>

<div class="caja">
  <h2 style="margin-top:0">Qué hacer con este pedido</h2>
  ${p.pagado ? '' : `<div class="aviso ojo">Aún no consta el pago. <b>No entregue el producto todavía.</b>
    Compruébelo en el Back Office de Izipay antes de nada.</div>`}
  <form class="linea" method="post" action="/admin/pedido/${encodeURIComponent(p.pedido)}/entregado">
    <button${p.entregado ? ' class="suave" disabled' : ''}>
      ${p.entregado ? 'Ya marcado como entregado' : 'Marcar como entregado'}</button>
    <span class="apagado">Púlselo cuando le haya mandado la licencia o el instalador.</span>
  </form>
  ${comprobante && comprobante.ok
    ? `<p class="apagado">El comprobante ya está emitido. No hay que hacer nada más con él.</p>`
    : facturadorListo
      ? `<form class="linea" method="post" action="/admin/pedido/${encodeURIComponent(p.pedido)}/facturar">
           <button${p.pagado ? '' : ' class="suave" disabled'}>Emitir ${
             llevaFactura(p.tipoDocumento, p.documento) ? 'factura' : 'boleta'} ahora</button>
           <span class="apagado">Se emite sola al confirmarse el pago; esto es por si aquella vez falló.</span>
         </form>`
      : `<div class="aviso ojo">La emisión automática está apagada: faltan <code>FACTURACION_URL</code> y
         <code>FACTURACION_CLAVE</code> en el <code>.env</code>. Mientras tanto, emita el comprobante por su
         cuenta y anote aquí su número.</div>`}
  <form method="post" action="/admin/pedido/${encodeURIComponent(p.pedido)}/comprobante" class="linea">
    <input type="text" name="detalle" maxlength="60" placeholder="N.º de un comprobante emitido a mano">
    <button class="suave">Anotar comprobante</button>
  </form>
  <form method="post" action="/admin/pedido/${encodeURIComponent(p.pedido)}/nota">
    <textarea name="detalle" maxlength="600" placeholder="Nota interna: qué se le envió, qué pidió, qué quedó pendiente…"></textarea>
    <p style="margin:8px 0 0"><button class="suave">Guardar nota</button></p>
  </form>
</div>

<div class="caja">
  <h2 style="margin-top:0">Historial</h2>
  ${p.eventos.length
    ? `<table><tr><th>Cuándo</th><th>Qué</th><th>Detalle</th></tr>${eventos}</table>`
    : '<p class="apagado" style="margin:0">Sin movimientos todavía.</p>'}
  <p class="apagado" style="margin-bottom:0">Nada de esto se borra ni se corrige: cada cosa se añade al final.
  Si se equivoca, deje una nota diciéndolo.</p>
</div>
`);
}

/* ------------------------------------------------------------ reclamaciones */

function paginaReclamaciones(hojas) {
  const filas = [...hojas].reverse().map((h) => `<tr>
    <td><b>${e(h.correlativo || '—')}</b><br><span class="apagado">${e(fecha(h.registradaEn))}</span></td>
    <td>${e(h.nombre || '—')}<br>
        <span class="apagado">${e(h.tipoDoc || '')} ${e(h.numDoc || '')}</span><br>
        <a href="mailto:${e(h.correo || '')}">${e(h.correo || '—')}</a>
        ${h.telefono ? `<br><span class="apagado">${e(h.telefono)}</span>` : ''}</td>
    <td>${e(h.tipo || '—')}${h.monto ? `<br><span class="apagado">S/ ${e(h.monto)}</span>` : ''}</td>
    <td><b>Contratado:</b> ${e(h.descripcion || '—')}<br>
        <b>Qué ocurrió:</b> ${e(h.detalle || '—')}<br>
        <b>Qué pide:</b> ${e(h.pedido || '—')}</td>
  </tr>`).join('');

  return pagina('Reclamaciones', `
<h1>Libro de Reclamaciones</h1>
<p class="guia">Hojas registradas, de la más reciente a la más antigua.</p>
<div class="aviso ojo"><b>El plazo es de quince (15) días hábiles</b> desde que se registra la hoja.
La copia al reclamante sale por correo al registrarse; si el envío falla, queda anotado en el registro del
servidor y hay que mandarla a mano.</div>
${hojas.length
    ? `<div class="tabla-scroll"><table>
  <tr><th>Número</th><th>Quién</th><th>Tipo</th><th>Qué dice</th></tr>${filas}</table></div>`
    : '<div class="caja apagado">No hay ninguna hoja registrada.</div>'}
`);
}

/* ----------------------------------------------------------------- catálogo */

/**
 * Lo que se vende: productos y categorías, con lo que hace falta para
 * cambiarlo.
 *
 * El PRECIO va grande y a la derecha, y el estado al lado: son los dos datos
 * por los que se entra aquí. Lo demás —resumen, vigencia, entrega— se ve al
 * abrir el producto.
 */
function paginaCatalogo(productos, cats, { mensaje = null, mensajeMalo = false, errorCat = null } = {}) {
  const cuantos = (id) => productos.filter((p) => p.categoria === id).length;

  const filas = productos.map((p) => {
    const cat = cats.find((c) => c.id === p.categoria);
    return `<tr>
      <td><a href="/admin/catalogo/producto/${encodeURIComponent(p.id)}"><b>${e(p.nombre)}</b></a>
        ${p.resumen ? `<br><span class="apagado">${e(p.resumen)}</span>` : ''}</td>
      <td>${cat ? e(cat.nombre) : '<span class="apagado">sin categoría</span>'}</td>
      <td style="white-space:nowrap"><b>${e(formatearPrecio(p.precioCentimos, p.moneda))}</b>
        <br><span class="apagado">IGV incluido</span></td>
      <td>${p.activo
        ? '<span class="et entregado">a la venta</span>'
        : '<span class="et abandonado">retirado</span>'}</td>
      <td><form method="post" action="/admin/catalogo/producto/${encodeURIComponent(p.id)}/activar" style="margin:0">
        <input type="hidden" name="activo" value="${p.activo ? 'no' : 'si'}">
        <button class="suave">${p.activo ? 'Retirar' : 'Poner a la venta'}</button>
      </form></td>
    </tr>`;
  }).join('');

  const filasCat = cats.map((c) => `<tr>
    <td><b>${e(c.nombre)}</b></td>
    <td class="apagado">${cuantos(c.id)} producto(s)</td>
    <td><form method="post" action="/admin/catalogo/categoria/${encodeURIComponent(c.id)}/borrar" style="margin:0"
      onsubmit="return confirm('¿Borrar la categoría «${e(c.nombre)}»?${cuantos(c.id)
        ? ' Sus ' + cuantos(c.id) + ' producto(s) NO se borran: pasarán a aparecer bajo «Otros».' : ''}')">
      <button class="suave">Borrar</button></form></td>
  </tr>`).join('');

  return pagina('Catálogo', `
${mensaje ? `<div class="aviso ${mensajeMalo ? 'mal' : 'bien'}">${e(mensaje)}</div>` : ''}
<h1>Catálogo</h1>
<p class="guia">Lo que la tienda ofrece. Los precios que ponga aquí son los que se cobran: el navegador
nunca manda un importe, solo el producto elegido.</p>

<p><a href="/admin/catalogo/producto/nuevo"><button>Nuevo producto</button></a></p>

${productos.length ? `<div class="tabla-scroll"><table>
<tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Estado</th><th></th></tr>
${filas}</table></div>`
    : '<div class="caja apagado">Todavía no hay ningún producto.</div>'}

<h2>Categorías</h2>
<p class="guia">Sirven para agrupar los productos en la tienda. Una categoría sin productos a la venta no
se enseña.</p>

<div class="caja">
  ${cats.length ? `<table><tr><th>Nombre</th><th>Contiene</th><th></th></tr>${filasCat}</table>`
    : '<p class="apagado" style="margin:0 0 14px">Todavía no hay categorías.</p>'}
  ${errorCat ? `<div class="aviso mal" style="margin:14px 0 0">${e(errorCat)}</div>` : ''}
  <form class="linea" method="post" action="/admin/catalogo/categoria" style="margin-top:14px">
    <input type="text" name="nombre" maxlength="60" placeholder="Nombre de la categoría" required>
    <button class="suave">Añadir categoría</button>
  </form>
</div>

<div class="caja">
  <h2 style="margin-top:0">Retirar no es borrar</h2>
  <p style="margin:0 0 10px"><b>Retirar</b> quita el producto de la tienda y lo deja aquí: los pedidos
  antiguos se siguen viendo bien y puede volver a ponerlo a la venta cuando quiera. Es lo que se usa
  casi siempre.</p>
  <p style="margin:0" class="apagado">Borrar del todo está dentro de cada producto, y tampoco afecta a
  los pedidos ya hechos: cada pedido guarda su propia copia del nombre y del precio que se cobró.</p>
</div>
`);
}

/** El formulario de un producto. Sirve para crear y para editar. */
function paginaProducto(p, cats, { errores = {}, valores = null, esNuevo = false } = {}) {
  const v = valores || (p ? {
    nombre: p.nombre, resumen: p.resumen, categoria: p.categoria,
    precio: aTextoPrecio(p.precioCentimos), vigencia: p.vigencia, entrega: p.entrega,
    detalle: p.detalle.join('\n'), activo: p.activo ? 'si' : 'no', orden: String(p.orden || ''),
  } : { activo: 'si' });

  const err = (campo) => errores[campo]
    ? `<span style="display:block;color:var(--mal);font-size:13px;margin-top:4px">${e(errores[campo])}</span>` : '';
  const val = (campo) => e(v[campo] ?? '');

  const opciones = ['<option value="">— sin categoría —</option>']
    .concat(cats.map((c) => `<option value="${e(c.id)}"${v.categoria === c.id ? ' selected' : ''}>${e(c.nombre)}</option>`))
    .join('');

  return pagina(esNuevo ? 'Nuevo producto' : p.nombre, `
<p><a href="/admin/catalogo">← Volver al catálogo</a></p>
<h1>${esNuevo ? 'Nuevo producto' : e(p.nombre)}</h1>
${!esNuevo ? `<p class="guia">Identificador: <code>${e(p.id)}</code> — no cambia, porque es lo que viaja
a la pasarela y al comprobante.</p>` : ''}

<form method="post" action="/admin/catalogo/producto${esNuevo ? '' : '/' + encodeURIComponent(p.id)}">
  <div class="caja">
    <p style="margin:0 0 4px"><b>Nombre</b> · sale en la tienda y en el comprobante</p>
    <input type="text" name="nombre" maxlength="120" required style="width:100%" value="${val('nombre')}">
    ${err('nombre')}

    <p style="margin:16px 0 4px"><b>Precio en soles</b> · con el IGV ya dentro</p>
    <input type="text" name="precio" maxlength="14" required placeholder="349.00" value="${val('precio')}"
           style="width:160px" inputmode="decimal">
    ${err('precio')}
    <span class="apagado" style="display:block;margin-top:4px">Es lo que se le cobra al comprador. Sin sumas
    posteriores: el IGV se descuenta de este importe al emitir la boleta o la factura.</span>

    <p style="margin:16px 0 4px"><b>Categoría</b></p>
    <select name="categoria" style="font:inherit;padding:9px 11px;border:1px solid var(--linea);border-radius:8px">
      ${opciones}
    </select>
    ${err('categoria')}

    <p style="margin:16px 0 4px"><b>Resumen</b> · una línea bajo el nombre</p>
    <input type="text" name="resumen" maxlength="200" style="width:100%" value="${val('resumen')}">

    <p style="margin:16px 0 4px"><b>Qué incluye</b> · una cosa por línea</p>
    <textarea name="detalle" style="min-height:120px">${val('detalle')}</textarea>

    <p style="margin:16px 0 4px"><b>Vigencia</b></p>
    <input type="text" name="vigencia" maxlength="120" style="width:100%"
           placeholder="12 meses desde la activación" value="${val('vigencia')}">

    <p style="margin:16px 0 4px"><b>Entrega</b> · qué recibe y cuándo</p>
    <input type="text" name="entrega" maxlength="200" style="width:100%"
           placeholder="Activación en un máximo de 24 horas hábiles" value="${val('entrega')}">

    <p style="margin:16px 0 4px"><b>Estado</b></p>
    <select name="activo" style="font:inherit;padding:9px 11px;border:1px solid var(--linea);border-radius:8px">
      <option value="si"${v.activo !== 'no' ? ' selected' : ''}>A la venta</option>
      <option value="no"${v.activo === 'no' ? ' selected' : ''}>Retirado</option>
    </select>

    <p style="margin:16px 0 4px"><b>Orden</b> · más bajo, más arriba en la tienda</p>
    <input type="text" name="orden" maxlength="4" style="width:90px" inputmode="numeric" value="${val('orden')}">

    <p style="margin:20px 0 0"><button>${esNuevo ? 'Crear el producto' : 'Guardar los cambios'}</button></p>
  </div>
</form>

${esNuevo ? '' : `<div class="caja">
  <h2 style="margin-top:0">Borrar del todo</h2>
  <p style="margin:0 0 12px">Normalmente no hace falta: con <b>retirarlo</b> desaparece de la tienda y
  sigue aquí. Borrarlo no afecta a los pedidos ya hechos —cada pedido guarda su copia del nombre y del
  precio— pero no se puede deshacer.</p>
  <form method="post" action="/admin/catalogo/producto/${encodeURIComponent(p.id)}/borrar"
        onsubmit="return confirm('¿Borrar «${e(p.nombre)}» del catálogo? No se puede deshacer.')">
    <button class="suave">Borrar este producto</button>
  </form>
</div>`}
`);
}

/* -------------------------------------------------------------------- ayuda */

function paginaAyuda({ urlPublica = '' } = {}) {
  return pagina('Cómo se atiende', `
<h1>Cómo se atiende una compra</h1>
<p class="guia">Lo que hay que hacer, en orden, cada vez que entra un pedido.</p>

<div class="caja">
  <h2 style="margin-top:0">1. Comprobar que el pago existe de verdad</h2>
  <ol class="pasos">
    <li>En <b>Compras</b>, el pedido tiene que aparecer como <b>«Falta entregar»</b>. Ese estado solo
      se pone cuando llega un cobro <b>con firma válida</b>: no basta con que alguien diga que pagó.</li>
    <li>Si además la fila del pago dice que llegó por <b>ipn</b>, es la confirmación de Izipay de servidor
      a servidor. Esa es la buena.</li>
    <li>Ante cualquier duda —o si el comprador escribe diciendo que pagó y aquí no consta— búsquelo en el
      Back Office de Izipay por el número de pedido. Lo que diga Izipay manda siempre.</li>
    <li><b>Cuidado con «prueba».</b> Un pedido marcado así no movió dinero: es una transacción de
      certificación, no una venta.</li>
  </ol>
</div>

<div class="caja">
  <h2 style="margin-top:0">2. Entregar el producto</h2>
  <ol class="pasos">
    <li><b>Licencia de la App Web:</b> cree la cuenta del cliente en GCM y mándele por correo su acceso.
      Los Términos prometen la activación en un máximo de <b>24 horas hábiles</b>.</li>
    <li><b>Software autoinstalable:</b> mándele el enlace de descarga y el manual de instalación.</li>
    <li>Escríbale al correo que dejó en el formulario —le llega ya un aviso de compra con su comprobante,
      así que basta con responder a ese mismo hilo— y ponga el número de pedido en el asunto.</li>
    <li>Vuelva al pedido y pulse <b>«Marcar como entregado»</b>. Esa marca es lo que distingue lo hecho
      de lo pendiente.</li>
  </ol>
</div>

<div class="caja">
  <h2 style="margin-top:0">3. El comprobante</h2>
  <ol class="pasos">
    <li><b>Se emite solo</b> en cuanto se confirma el pago, firmado con su certificado y enviado a SUNAT
      directamente. Normalmente no hay nada que hacer.</li>
    <li>Si el comprador escribió un <b>RUC (11 dígitos)</b> sale <b>factura</b>; si dejó DNI o nada,
      <b>boleta</b>. El precio cobrado <b>ya lleva el IGV dentro</b>, así que no se le suma nada.</li>
    <li><b>Normalmente SUNAT lo acepta en el acto</b>, tanto la factura como la boleta, y el pedido lo dice.</li>
    <li>Si una boleta aparece como <b>«en el resumen diario»</b>, es que su envío no llegó a salir: queda
      firmada y válida, y el proceso automático la informa a SUNAT. No hay que hacer nada.</li>
    <li><b>Si falló</b>, el pedido lo dice en su historial y hay un botón para <b>emitirlo ahora</b>. El pago no
      se ve afectado: el dinero ya entró.</li>
  </ol>
</div>

<div class="caja">
  <h2 style="margin-top:0">4. Por dónde le escriben</h2>
  <ol class="pasos">
    <li><b>Correo de la tienda:</b> el que figura en el pie de las páginas legales.</li>
    <li><b>Libro de Reclamaciones:</b> ${urlPublica ? `<a href="${e(urlPublica)}/reclamaciones.html">${e(urlPublica)}/reclamaciones.html</a>` : '<code>/reclamaciones.html</code>'}.
      Se responde en <b>quince días hábiles</b> como máximo. La copia al reclamante y el aviso a usted salen
      solos por correo.</li>
    <li><b>Devoluciones:</b> los plazos y los supuestos están en la página de Políticas de Devolución.
      Una devolución se tramita desde el Back Office de Izipay, no desde aquí.</li>
  </ol>
</div>

<div class="caja">
  <h2 style="margin-top:0">Lo que este panel todavía NO hace</h2>
  <ol class="pasos">
    <li><b>No entrega el producto.</b> Al comprador le llega el aviso de su compra y su comprobante, pero la
      licencia o el instalador se los manda usted a mano.</li>
    <li><b>No manda el producto.</b> La licencia o el instalador se envían a mano; el comprobante sí sale solo.</li>
    <li><b>No devuelve dinero.</b> Eso se hace en el Back Office de Izipay.</li>
  </ol>
</div>
`);
}

module.exports = {
  paginaCatalogo,
  paginaProducto,
  paginaEntrar,
  paginaSinConfigurar,
  paginaCompras,
  paginaPedido,
  paginaReclamaciones,
  paginaAyuda,
};
