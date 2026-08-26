/**
 * catalogo_edicion.js — Crear, cambiar y retirar lo que se vende.
 *
 * Aparte de `catalogo.js` a propósito: leer un precio lo hace la tienda en cada
 * visita, escribirlo lo hace una persona cinco veces al año. Separarlos deja
 * claro cuál de los dos caminos puede cambiar el estado del negocio.
 *
 * TODO PASA POR `revisar*` ANTES DE GUARDAR. Un precio es lo que se le cobra a
 * alguien: no puede llegar al archivo un «cinco soles» escrito como texto, ni
 * un cero, ni un número negativo. Se valida y se devuelve el error señalando el
 * campo, como en el resto del checkout.
 *
 * EL PRECIO SE GUARDA EN CÉNTIMOS y se escribe en soles. Esa conversión ocurre
 * en UN solo sitio —`aCentimos`— porque hacerla en dos acaba siempre en un
 * producto que cuesta cien veces más de lo que dice.
 *
 * RETIRAR NO ES BORRAR. Lo normal es desactivar: el producto desaparece de la
 * tienda y sigue existiendo para consultar pedidos antiguos. Borrar también se
 * puede, pero es lo excepcional.
 */

const { leer, escribir, buscarCualquierProducto, buscarCategoria } = require('./catalogo');

const LIMITES = {
  nombre: 120,
  resumen: 200,
  vigencia: 120,
  entrega: 200,
  detalleLinea: 200,
  detalleLineas: 12,
  /** S/ 999,999.99. Más que eso es casi seguro un cero de más. */
  precioCentimosMax: 99_999_999,
};

function limpiar(v, max) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * De lo que escribe una persona a céntimos.
 *
 * Admite «5», «5.00», «5,00» y «1,234.50», porque así es como la gente escribe
 * un precio de verdad. Devuelve null si no es un importe.
 */
function aCentimos(texto) {
  let s = String(texto ?? '').trim().replace(/\s/g, '').replace(/^S\/\.?/i, '');
  if (s === '') return null;
  // Separador decimal: el ÚLTIMO punto o coma que tenga dos dígitos detrás.
  // Lo demás son separadores de millares y sobran.
  const m = s.match(/^(.*?)([.,](\d{1,2}))?$/);
  if (!m) return null;
  const entera = (m[1] || '').replace(/[.,]/g, '');
  const dec = (m[3] || '').padEnd(2, '0');
  if (!/^\d+$/.test(entera)) return null;
  const centimos = Number(entera) * 100 + Number(dec);
  return Number.isSafeInteger(centimos) ? centimos : null;
}

/** De céntimos al texto que se pone en un formulario: «5.00». */
function aTextoPrecio(centimos) {
  return (Math.round(Number(centimos) || 0) / 100).toFixed(2);
}

/**
 * Un identificador a partir del nombre: «Licencia Anual» → «licencia-anual».
 *
 * Sin acentos ni eñes, porque acaba en una URL y en el código del comprobante
 * que va a SUNAT.
 */
function idDesde(nombre, existentes = []) {
  const base = String(nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || 'producto';
  if (!existentes.includes(base)) return base;
  // Ya existe: se numera. Nunca se pisa uno que esté en uso.
  for (let n = 2; n < 500; n += 1) {
    if (!existentes.includes(`${base}-${n}`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

/* ------------------------------------------------------------- productos */

function revisarProducto(cuerpo, { id = null } = {}) {
  const errores = {};

  const nombre = limpiar(cuerpo.nombre, LIMITES.nombre);
  if (!nombre) errores.nombre = 'Póngale un nombre al producto.';

  const centimos = aCentimos(cuerpo.precio);
  if (centimos === null) errores.precio = 'Escriba el precio, por ejemplo 349.00';
  else if (centimos <= 0) errores.precio = 'El precio tiene que ser mayor que cero.';
  else if (centimos > LIMITES.precioCentimosMax) errores.precio = 'Ese precio parece un error: es demasiado alto.';

  const categoria = limpiar(cuerpo.categoria, 40);
  if (categoria && !buscarCategoria(categoria)) errores.categoria = 'Esa categoría ya no existe.';

  const detalle = String(cuerpo.detalle ?? '')
    .split('\n').map((l) => limpiar(l, LIMITES.detalleLinea)).filter(Boolean)
    .slice(0, LIMITES.detalleLineas);

  if (Object.keys(errores).length) return { errores };

  return {
    datos: {
      id: id || idDesde(nombre, leer().productos.map((p) => p.id)),
      categoria,
      nombre,
      resumen: limpiar(cuerpo.resumen, LIMITES.resumen),
      detalle,
      precioCentimos: centimos,
      moneda: 'PEN',
      vigencia: limpiar(cuerpo.vigencia, LIMITES.vigencia),
      entrega: limpiar(cuerpo.entrega, LIMITES.entrega),
      igvIncluido: true,
      activo: cuerpo.activo !== 'no',
      orden: Number(cuerpo.orden) || 0,
    },
  };
}

/** Da de alta o actualiza. El identificador NO cambia al editar. */
function guardarProducto(datos) {
  const c = leer();
  const productos = [...c.productos];
  const i = productos.findIndex((p) => p.id === datos.id);
  if (i >= 0) productos[i] = { ...productos[i], ...datos, id: productos[i].id };
  else productos.push({ ...datos, orden: datos.orden || productos.length + 1 });
  escribir({ ...c, productos });
  return buscarCualquierProducto(datos.id);
}

/** Lo habitual: quitarlo de la tienda sin perderlo. */
function activarProducto(id, activo) {
  const c = leer();
  const productos = c.productos.map((p) => (p.id === id ? { ...p, activo: Boolean(activo) } : p));
  escribir({ ...c, productos });
}

/** Lo excepcional. Los pedidos ya hechos no se ven afectados: guardan su copia. */
function borrarProducto(id) {
  const c = leer();
  escribir({ ...c, productos: c.productos.filter((p) => p.id !== id) });
}

/* ------------------------------------------------------------ categorías */

function revisarCategoria(cuerpo, { id = null } = {}) {
  const nombre = limpiar(cuerpo.nombre, 60);
  if (!nombre) return { errores: { nombre: 'Póngale un nombre a la categoría.' } };
  return {
    datos: {
      id: id || idDesde(nombre, leer().categorias.map((c) => c.id)),
      nombre,
      orden: Number(cuerpo.orden) || 0,
    },
  };
}

function guardarCategoria(datos) {
  const c = leer();
  const categorias = [...c.categorias];
  const i = categorias.findIndex((x) => x.id === datos.id);
  if (i >= 0) categorias[i] = { ...categorias[i], ...datos, id: categorias[i].id };
  else categorias.push({ ...datos, orden: datos.orden || categorias.length + 1 });
  escribir({ ...c, categorias });
}

/**
 * Borra la categoría. Sus productos NO se borran: se quedan sin categoría y la
 * tienda los enseña al final, bajo «Otros». Perder un producto porque alguien
 * borró su categoría sería mucho peor que enseñarlo suelto.
 */
function borrarCategoria(id) {
  const c = leer();
  escribir({
    categorias: c.categorias.filter((x) => x.id !== id),
    productos: c.productos.map((p) => (p.categoria === id ? { ...p, categoria: '' } : p)),
  });
}

/** Cuántos productos usan esa categoría. Para avisar antes de borrarla. */
function productosDeCategoria(id) {
  return leer().productos.filter((p) => p.categoria === id).length;
}

module.exports = {
  revisarProducto, guardarProducto, activarProducto, borrarProducto,
  revisarCategoria, guardarCategoria, borrarCategoria, productosDeCategoria,
  aCentimos, aTextoPrecio, idDesde, LIMITES,
};
