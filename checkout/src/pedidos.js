/**
 * pedidos.js — El pedido, desde que empieza y no desde que termina.
 *
 * EL PROBLEMA QUE RESUELVE. Hasta ahora una compra solo dejaba rastro cuando
 * salía bien: se anotaba el COBRO, en `pagos.jsonl`, y siempre al volver. Un
 * comprador que llena sus datos, llega al formulario de la tarjeta y se cae —se
 * le rechaza la tarjeta, se le va la conexión, cierra la pestaña— no existía
 * para nosotros. Ni para responderle, ni para saber cuántos lo intentan y no
 * lo consiguen, que es el número que dice si el checkout está roto.
 *
 * Así que el pedido se anota ANTES de mandar nada a la pasarela.
 *
 * DOS ARCHIVOS, LOS DOS SOLO CRECEN. Igual que el Libro de Reclamaciones:
 *
 *   · `pedidos.jsonl` — una línea por pedido, escrita al empezar. No se
 *     reescribe nunca. Lo que pasó después no se corrige encima: se añade.
 *   · `eventos.jsonl` — una línea por cosa que le ocurre a un pedido
 *     («entregado», una nota, el número de comprobante). También solo crece.
 *
 * Por qué no se edita la línea del pedido: porque entonces el archivo dejaría
 * de ser un registro y pasaría a ser un estado, y un estado corrupto se lleva
 * por delante la historia. Reescribir una línea en medio de un archivo obliga
 * además a reescribir el archivo entero, y ahí es donde se pierden ventas —un
 * corte a media escritura y el libro queda a medias—. Añadir al final es
 * atómico en la práctica y no puede estropear lo ya escrito.
 *
 * EL ESTADO SE CALCULA, NO SE GUARDA. `consolidar()` lee los tres archivos
 * —pedidos, pagos y eventos— y deduce en qué punto está cada compra. Si mañana
 * hay una base de datos, cambia de dónde sale la información, no qué es.
 */

const fs = require('node:fs');
const path = require('node:path');

const DIRECTORIO = path.join(__dirname, '..', 'datos');
const LIBRO_PEDIDOS = path.join(DIRECTORIO, 'pedidos.jsonl');
const LIBRO_EVENTOS = path.join(DIRECTORIO, 'eventos.jsonl');

/** Un pedido sin pagar más viejo que esto se da por abandonado. */
const MINUTOS_PARA_ABANDONO = 60;

/** Lee un `.jsonl` entero. Una línea ilegible se salta: no tumba el panel. */
function leerLineas(archivo) {
  if (!fs.existsSync(archivo)) return [];
  const filas = [];
  for (const linea of fs.readFileSync(archivo, 'utf8').split('\n')) {
    if (!linea.trim()) continue;
    try { filas.push(JSON.parse(linea)); } catch { /* línea rota, se ignora */ }
  }
  return filas;
}

function anotar(archivo, fila) {
  fs.mkdirSync(DIRECTORIO, { recursive: true });
  fs.appendFileSync(archivo, JSON.stringify(fila) + '\n', 'utf8');
}

/**
 * Anota un pedido que acaba de empezar.
 *
 * NO GUARDA EL PRECIO QUE DIJO EL NAVEGADOR: guarda el del catálogo, que es el
 * único que vale. Y no guarda nada de la tarjeta, que aquí no llega nunca.
 */
function registrarPedido({ pedido, producto, comprador, modo }) {
  anotar(LIBRO_PEDIDOS, {
    creadoEn: new Date().toISOString(),
    pedido,
    modo: modo ?? null,
    productoId: producto.id,
    productoNombre: producto.nombre,
    importeCentimos: producto.precioCentimos,
    moneda: producto.moneda,
    nombres: comprador.nombres || null,
    correo: comprador.correo,
    documento: comprador.documento || null,
    telefono: comprador.telefono || null,
  });
}

/**
 * Anota algo que le pasa a un pedido: se entregó, se emitió su comprobante, o
 * simplemente quedó una nota.
 *
 * `quien` se guarda para que dentro de un año se sepa quién marcó qué. Hoy es
 * siempre el administrador, pero el día que haya dos personas atendiendo, el
 * dato ya estará ahí en vez de haber que inventárselo.
 */
function registrarEvento({ pedido, tipo, detalle = null, quien = 'administrador' }) {
  anotar(LIBRO_EVENTOS, {
    registradoEn: new Date().toISOString(),
    pedido,
    tipo,
    detalle,
    quien,
  });
}

/**
 * Junta pedidos, pagos y eventos, y devuelve en qué punto está cada compra.
 *
 * Ordenado del más reciente al más antiguo, que es como se mira un panel.
 *
 * Un pago cuyo pedido no está en `pedidos.jsonl` NO se descarta: se enseña
 * igual, marcado como huérfano. Los cobros de antes de que existiera este
 * archivo son exactamente ese caso, y esconderlos sería peor que enseñarlos
 * incompletos — es dinero que entró.
 */
function consolidar(pagos = []) {
  const pedidos = new Map();

  for (const p of leerLineas(LIBRO_PEDIDOS)) {
    pedidos.set(p.pedido, { ...p, pagos: [], eventos: [], huerfano: false });
  }

  for (const pago of pagos) {
    const clave = pago.pedido;
    if (!clave) continue;
    if (!pedidos.has(clave)) {
      pedidos.set(clave, {
        creadoEn: pago.registradoEn,
        pedido: clave,
        modo: pago.modo ?? null,
        productoId: null,
        productoNombre: null,
        importeCentimos: pago.importeCentimos ?? null,
        moneda: pago.moneda ?? null,
        nombres: null,
        correo: pago.correo ?? null,
        documento: pago.documento ?? null,
        telefono: null,
        pagos: [],
        eventos: [],
        huerfano: true,
      });
    }
    pedidos.get(clave).pagos.push(pago);
  }

  for (const e of leerLineas(LIBRO_EVENTOS)) {
    const registro = pedidos.get(e.pedido);
    if (registro) registro.eventos.push(e);
  }

  const ahora = Date.now();
  const lista = [];
  for (const registro of pedidos.values()) {
    registro.pagos.sort((a, b) => String(a.registradoEn).localeCompare(String(b.registradoEn)));
    registro.eventos.sort((a, b) => String(a.registradoEn).localeCompare(String(b.registradoEn)));

    const pagado = registro.pagos.some((p) => p.estado === 'PAID');
    const entregado = registro.eventos.some((e) => e.tipo === 'entregado');
    const comprobante = [...registro.eventos].reverse().find((e) => e.tipo === 'comprobante') || null;
    const viejo = ahora - Date.parse(registro.creadoEn || 0) > MINUTOS_PARA_ABANDONO * 60000;

    registro.pagado = pagado;
    registro.entregado = entregado;
    registro.comprobante = comprobante ? comprobante.detalle : null;
    // El orden importa: entregado implica pagado, y abandonado solo se mira
    // cuando no hay pago. Un pedido pagado nunca se marca abandonado por viejo.
    registro.estado = entregado ? 'entregado'
      : pagado ? 'pagado'
      : viejo ? 'abandonado'
      : 'iniciado';
    lista.push(registro);
  }

  lista.sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn)));
  return lista;
}

/** Lo que hay que atender: pagado y todavía sin entregar. */
function pendientes(consolidados) {
  return consolidados.filter((p) => p.estado === 'pagado');
}

module.exports = {
  registrarPedido,
  registrarEvento,
  consolidar,
  pendientes,
  leerLineas,
  LIBRO_PEDIDOS,
  LIBRO_EVENTOS,
  MINUTOS_PARA_ABANDONO,
};
