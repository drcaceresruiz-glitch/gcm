/**
 * pagina_retorno.js — La página a la que vuelve el comprador.
 *
 * QUÉ ES. Cuando alguien termina de pagar y pulsa «Volver a la tienda», Izipay
 * lo trae aquí con el resultado del pago. NO es el webhook: son dos caminos
 * distintos y el Back Office avisa de que no se confundan.
 *
 *   · Esta página la abre el COMPRADOR, en su navegador. Puede no llegar nunca
 *     —si cierra la pestaña, no vuelve— así que aquí NO se decide nada
 *     importante: solo se le enseña cómo quedó su compra.
 *   · El IPN llega SIEMPRE, de servidor a servidor. Ese es el que manda.
 *
 * Por eso esta página registra el pago igual que el IPN pero marcándolo con
 * origen 'retorno': si el comprador llega antes que la notificación, no se
 * pierde el dato; y si llega después, la idempotencia hace que no se duplique.
 *
 * Se dibuja en el servidor, no en un HTML estático, porque el resultado llega
 * en un POST de Izipay: una página estática no puede leerlo.
 */

const ESTADOS = {
  PAID: {
    tono: 'bien',
    titulo: 'Pago confirmado',
    texto: 'Gracias por su compra. Le enviamos el comprobante y las instrucciones al correo indicado.',
  },
  UNPAID: {
    tono: 'malo',
    titulo: 'El pago no se completó',
    texto: 'No se realizó ningún cargo a su tarjeta. Puede intentarlo de nuevo, con esa tarjeta u otra.',
  },
  RUNNING: {
    tono: 'espera',
    titulo: 'Su pago se está procesando',
    texto: 'La operación quedó en curso. En cuanto el banco la confirme le escribimos al correo indicado; no vuelva a pagar.',
  },
  ABANDONED: {
    tono: 'espera',
    titulo: 'Compra no finalizada',
    texto: 'La operación se dejó a medias y no se realizó ningún cargo. Puede empezar de nuevo cuando quiera.',
  },
};

const DESCONOCIDO = {
  tono: 'espera',
  titulo: 'No pudimos leer el resultado',
  texto: 'Si el importe aparece cargado en su tarjeta, escríbanos con el número de pedido y lo verificamos. No vuelva a pagar.',
};

const escapar = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * El HTML de la página de retorno.
 *
 * @param {object|null} resumen  lo que devolvió resumirPago(), o null si no se
 *                               pudo verificar la firma
 */
function paginaRetorno(resumen) {
  const cara = resumen ? (ESTADOS[resumen.estado] || DESCONOCIDO) : DESCONOCIDO;
  const pedido = resumen?.pedido;
  const importe = resumen?.importeCentimos != null
    ? new Intl.NumberFormat('es-PE', { style: 'currency', currency: resumen.moneda || 'PEN' })
        .format(resumen.importeCentimos / 100)
    : null;

  const filas = [
    pedido && ['N.º de pedido', escapar(pedido)],
    importe && ['Importe', escapar(importe)],
    resumen?.correo && ['Correo', escapar(resumen.correo)],
  ].filter(Boolean);

  return `<!doctype html>
<html lang="es-PE">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Resultado de su pago · drcaceresruiz.com</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/icono.svg" type="image/svg+xml">
<link rel="stylesheet" href="/legal.css">
<style>
  .resultado { max-width: 560px; margin: 52px auto 0; text-align: center; }
  .marca-estado {
    width: 62px; height: 62px; border-radius: 50%; margin: 0 auto 20px;
    display: grid; place-items: center;
  }
  .bien   .marca-estado { background: oklch(0.62 0.15 150 / .13); color: oklch(0.45 0.14 150); }
  .malo   .marca-estado { background: oklch(0.58 0.19 25 / .11);  color: oklch(0.48 0.17 25); }
  .espera .marca-estado { background: oklch(0.78 0.16 75 / .16);  color: oklch(0.52 0.12 75); }
  .resultado h1 { font-size: 26px; margin: 0 0 10px; letter-spacing: -.015em; }
  .resultado > p { margin: 0 auto; color: var(--apagado); max-width: 46ch; }
  .ficha {
    margin: 28px auto 0; text-align: left; max-width: 420px;
    background: var(--tarjeta); border: 1px solid var(--linea);
    border-radius: 12px; padding: 6px 18px;
  }
  .ficha div {
    display: flex; justify-content: space-between; gap: 16px;
    padding: 12px 0; border-bottom: 1px solid var(--linea); font-size: 14px;
  }
  .ficha div:last-child { border-bottom: 0; }
  .ficha span { color: var(--apagado); }
  .ficha b { font-variant-numeric: tabular-nums; font-weight: 600; }
  .acciones { margin-top: 30px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  .accion {
    display: inline-block; padding: 12px 22px; border-radius: 10px;
    font-size: 15px; font-weight: 600; text-decoration: none;
  }
  .accion.principal { background: var(--marca-600); color: #fff; }
  .accion.principal:hover { background: var(--marca-700); }
  .accion.suave { border: 1px solid var(--linea); color: var(--tinta); }
  .accion.suave:hover { border-color: var(--marca-600); color: var(--marca-700); }
  .ayuda { margin-top: 30px; font-size: 13px; color: var(--apagado); }
</style>
</head>
<body>

<header class="barra">
  <div class="contenedor">
    <a class="marca" href="/checkout.html">
      <span class="sello" aria-hidden="true">DR</span>
      <span><b>drcaceresruiz.com</b><small>Tienda oficial</small></span>
    </a>
    <a class="volver" href="/checkout.html">← Volver a la tienda</a>
  </div>
</header>

<main class="contenedor">
  <div class="resultado ${cara.tono}">
    <div class="marca-estado">
      ${cara.tono === 'bien'
        ? '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
        : cara.tono === 'malo'
        ? '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
        : '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'}
    </div>
    <h1>${escapar(cara.titulo)}</h1>
    <p>${escapar(cara.texto)}</p>

    ${filas.length ? `<div class="ficha">
      ${filas.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('\n      ')}
    </div>` : ''}

    <div class="acciones">
      ${resumen?.estado === 'PAID'
        ? '<a class="accion principal" href="/checkout.html">Volver a la tienda</a>'
        : '<a class="accion principal" href="/checkout.html">Intentar de nuevo</a>'}
      <a class="accion suave" href="mailto:drcaceresruiz@gmail.com">Escribirnos</a>
    </div>

    <p class="ayuda">
      ${pedido
        ? 'Guarde el número de pedido: es el que identifica su compra si necesita escribirnos.'
        : 'Si tiene cualquier duda sobre su pago, escríbanos y lo verificamos.'}
    </p>
  </div>
</main>

<footer class="pie">
  <div class="contenedor">
    <a href="/terminos.html">Términos y Condiciones</a> ·
    <a href="/devoluciones.html">Políticas de Devolución</a> ·
    <a href="/reclamaciones.html">Libro de Reclamaciones</a>
  </div>
</footer>

</body>
</html>`;
}

module.exports = { paginaRetorno };
