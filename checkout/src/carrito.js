/**
 * carrito.js — Varios productos en un mismo pedido.
 *
 * LO QUE NO CAMBIA, Y ES LO IMPORTANTE: el importe lo sigue poniendo el
 * servidor. El navegador manda QUÉ y CUÁNTO —identificadores y cantidades—,
 * nunca un precio ni un total. Si el total viajara desde el navegador,
 * cualquiera compraría el carrito entero por un sol desde la consola.
 *
 * Aquí se toma esa lista, se busca cada producto en el catálogo, se calcula lo
 * que vale de verdad, y se devuelve algo que el resto del checkout puede usar
 * sin volver a preguntarse nada.
 *
 * SE RECHAZA EL CARRITO ENTERO si algo no cuadra —un producto que se retiró,
 * una cantidad imposible—. Cobrar «lo que sí estaba disponible» y callarse el
 * resto es peor que no cobrar: la persona pagó creyendo que llevaba otra cosa.
 *
 * TODO EN CÉNTIMOS. El importe de una línea es `precio × cantidad` en enteros,
 * y el total es la suma de las líneas. Multiplicar soles con decimales y sumar
 * después es la receta para que el total no cuadre con el comprobante.
 */

const { buscarProducto, formatearPrecio } = require('./catalogo');

/** Nadie compra 500 licencias sin hablar antes con una persona. */
const CANTIDAD_MAXIMA = 99;
/** Distintos productos en un mismo pedido. */
const LINEAS_MAXIMAS = 20;

/**
 * Revisa un carrito y lo convierte en líneas con sus importes.
 *
 * Admite las dos formas para no romper nada mientras convive con lo anterior:
 * `{ producto: 'x' }` —un producto suelto, como se compraba hasta ahora— y
 * `{ carrito: [{ producto, cantidad }] }`.
 *
 * @returns {{error: string} | {lineas: Array, totalCentimos: number, moneda: string}}
 */
function revisarCarrito(cuerpo) {
  let pedidos = [];

  if (Array.isArray(cuerpo?.carrito)) {
    pedidos = cuerpo.carrito;
  } else if (cuerpo?.producto) {
    pedidos = [{ producto: cuerpo.producto, cantidad: 1 }];
  }

  if (!pedidos.length) return { error: 'No ha elegido ningún producto.' };
  if (pedidos.length > LINEAS_MAXIMAS) {
    return { error: `No se pueden comprar más de ${LINEAS_MAXIMAS} productos distintos de una vez.` };
  }

  const lineas = [];
  const vistos = new Set();

  for (const item of pedidos) {
    const id = String(item?.producto ?? '');
    const producto = buscarProducto(id);
    // `buscarProducto` solo devuelve los que están a la venta: un producto
    // retirado entre que se puso en el carrito y se pagó cae aquí, que es
    // exactamente donde tiene que caer.
    if (!producto) {
      return { error: 'Uno de los productos ya no está disponible. Revise su carrito.' };
    }
    if (vistos.has(producto.id)) {
      return { error: 'Hay un producto repetido en el carrito.' };
    }
    vistos.add(producto.id);

    // Se exige entero de verdad, no se recorta. Recortar un 2.7 a 2 haría que
    // el mensaje —«tienen que ser números enteros»— y lo que ocurre de verdad
    // se contradigan, y una cantidad con decimales solo llega aquí si algo va
    // mal en el otro lado: mejor decirlo que apañarlo en silencio.
    const cantidad = Number(item?.cantidad ?? 1);
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      return { error: 'Las cantidades tienen que ser números enteros de 1 o más.' };
    }
    if (cantidad > CANTIDAD_MAXIMA) {
      return { error: `No se pueden comprar más de ${CANTIDAD_MAXIMA} unidades de un mismo producto.` };
    }

    lineas.push({
      productoId: producto.id,
      nombre: producto.nombre,
      cantidad,
      precioUnitarioCentimos: producto.precioCentimos,
      importeCentimos: producto.precioCentimos * cantidad,
      moneda: producto.moneda,
    });
  }

  // Una sola moneda por pedido: la pasarela cobra en una, y el comprobante se
  // emite en una. Mezclarlas exigiría un tipo de cambio y otra conversación.
  const monedas = new Set(lineas.map((l) => l.moneda));
  if (monedas.size > 1) {
    return { error: 'No se pueden comprar juntos productos en monedas distintas.' };
  }

  const totalCentimos = lineas.reduce((s, l) => s + l.importeCentimos, 0);
  if (totalCentimos <= 0) return { error: 'El importe del carrito no es válido.' };

  return { lineas, totalCentimos, moneda: lineas[0].moneda };
}

/**
 * Cómo se llama un pedido de varias líneas en una sola frase.
 *
 * Se usa donde antes iba el nombre del producto: el asunto de un correo, la
 * columna «Producto» del panel, la descripción del cobro. Con una línea es el
 * nombre a secas; con varias, algo que se entiende de un vistazo.
 */
function resumirLineas(lineas) {
  if (!lineas || !lineas.length) return '';
  if (lineas.length === 1) {
    const l = lineas[0];
    return l.cantidad > 1 ? `${l.nombre} × ${l.cantidad}` : l.nombre;
  }
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
  return `${lineas.length} productos (${unidades} unidades)`;
}

/** Las líneas tal como las enseña el navegador, con importes ya formateados. */
function lineasPublicas(lineas, moneda = 'PEN') {
  return lineas.map((l) => ({
    ...l,
    precioUnitarioTexto: formatearPrecio(l.precioUnitarioCentimos, moneda),
    importeTexto: formatearPrecio(l.importeCentimos, moneda),
  }));
}

module.exports = { revisarCarrito, resumirLineas, lineasPublicas, CANTIDAD_MAXIMA, LINEAS_MAXIMAS };
