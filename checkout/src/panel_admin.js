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
<title>${e(titulo)} · Panel GCM</title><style>${ESTILO}</style></head><body>
${sesion ? `<header><b>Panel de la tienda</b><nav>
<a href="/admin">Compras</a>
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

function paginaPedido(p, { mensaje = null, comprobante = null, facturadorListo = false } = {}) {
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
${mensaje ? `<div class="aviso bien">${e(mensaje)}</div>` : ''}
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
    <tr><th>DNI / RUC</th><td>${e(p.documento || '—')}
      ${p.documento && p.documento.length === 11 ? ' <span class="et pagado">lleva factura</span>' : ''}</td></tr>
    <tr><th>Teléfono</th><td>${e(p.telefono || '—')}</td></tr>
    <tr><th>Producto</th><td>${e(p.productoNombre || '—')}</td></tr>
    <tr><th>Importe</th><td>${p.importeCentimos == null ? '—' : e(formatearPrecio(p.importeCentimos))}</td></tr>
    <tr><th>Comprobante</th><td>${comprobante && comprobante.ok
      ? `<b>${e(comprobante.tipo)} ${e(comprobante.serie)}-${e(comprobante.numero)}</b>`
        + (comprobante.aceptadaPorSunat === true ? ' <span class="et entregado">aceptado por SUNAT</span>'
          : comprobante.aceptadaPorSunat === false ? ' <span class="et abandonado">rechazado por SUNAT</span>' : '')
        + (comprobante.pdf ? ` · <a href="${e(comprobante.pdf)}" target="_blank" rel="noopener">PDF</a>` : '')
        + (comprobante.enlace ? ` · <a href="${e(comprobante.enlace)}" target="_blank" rel="noopener">ver</a>` : '')
        + (comprobante.sunat ? `<br><span class="apagado">${e(comprobante.sunat)}</span>` : '')
      : e(p.comprobante || 'sin emitir')}</td></tr>
  </table>
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
             String(p.documento || '').length === 11 ? 'factura' : 'boleta'} ahora</button>
           <span class="apagado">Se emite sola al confirmarse el pago; esto es por si aquella vez falló.</span>
         </form>`
      : `<div class="aviso ojo">La emisión automática está apagada: faltan <code>NUBEFACT_RUTA</code> y
         <code>NUBEFACT_TOKEN</code> en el <code>.env</code>. Mientras tanto, emita el comprobante en NubeFact
         y anote aquí su número.</div>`}
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
<div class="aviso ojo"><b>El plazo es de quince (15) días hábiles</b> desde que se registra la hoja, y hoy
<b>la copia al reclamante hay que mandarla a mano</b>: el envío automático de correo todavía no está montado.</div>
${hojas.length
    ? `<div class="tabla-scroll"><table>
  <tr><th>Número</th><th>Quién</th><th>Tipo</th><th>Qué dice</th></tr>${filas}</table></div>`
    : '<div class="caja apagado">No hay ninguna hoja registrada.</div>'}
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
    <li>Escríbale desde su correo al que dejó en el formulario, y ponga el número de pedido en el asunto.</li>
    <li>Vuelva al pedido y pulse <b>«Marcar como entregado»</b>. Esa marca es lo que distingue lo hecho
      de lo pendiente.</li>
  </ol>
</div>

<div class="caja">
  <h2 style="margin-top:0">3. El comprobante</h2>
  <ol class="pasos">
    <li><b>Se emite solo</b>, con NubeFact, en cuanto se confirma el pago. Normalmente no hay nada que hacer.</li>
    <li>Si el comprador escribió un <b>RUC (11 dígitos)</b> sale <b>factura</b>; si dejó DNI o nada,
      <b>boleta</b>. El precio cobrado <b>ya lleva el IGV dentro</b>, así que no se le suma nada.</li>
    <li>En el pedido verá su número, si SUNAT lo aceptó y el enlace al PDF.</li>
    <li><b>Si falló</b> —NubeFact caído, correlativo desincronizado— el pedido lo dice en su historial y hay un
      botón para <b>emitirlo ahora</b>. El pago no se ve afectado: el dinero ya entró.</li>
  </ol>
</div>

<div class="caja">
  <h2 style="margin-top:0">4. Por dónde le escriben</h2>
  <ol class="pasos">
    <li><b>Correo de la tienda:</b> el que figura en el pie de las páginas legales.</li>
    <li><b>Libro de Reclamaciones:</b> ${urlPublica ? `<a href="${e(urlPublica)}/reclamaciones.html">${e(urlPublica)}/reclamaciones.html</a>` : '<code>/reclamaciones.html</code>'}.
      Se responde en <b>quince días hábiles</b> como máximo, y hoy la copia al reclamante se manda a mano.</li>
    <li><b>Devoluciones:</b> los plazos y los supuestos están en la página de Políticas de Devolución.
      Una devolución se tramita desde el Back Office de Izipay, no desde aquí.</li>
  </ol>
</div>

<div class="caja">
  <h2 style="margin-top:0">Lo que este panel todavía NO hace</h2>
  <ol class="pasos">
    <li><b>No manda ningún correo.</b> Ni al comprador ni a usted. Los avisos de compra hay que verlos
      entrando aquí, y la entrega se escribe a mano.</li>
    <li><b>No manda el producto.</b> La licencia o el instalador se envían a mano; el comprobante sí sale solo.</li>
    <li><b>No devuelve dinero.</b> Eso se hace en el Back Office de Izipay.</li>
  </ol>
</div>
`);
}

module.exports = {
  paginaEntrar,
  paginaSinConfigurar,
  paginaCompras,
  paginaPedido,
  paginaReclamaciones,
  paginaAyuda,
};
