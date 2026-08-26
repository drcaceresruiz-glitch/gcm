/**
 * catalogo.js — Lo que se vende: categorías, productos y sus precios.
 *
 * ESTE SIGUE SIENDO EL ÚNICO SITIO DONDE VIVE UN PRECIO. El navegador nunca
 * manda un importe: manda un identificador de producto y el servidor busca aquí
 * cuánto cuesta. Que ahora el catálogo se pueda editar desde el panel no
 * cambia esa regla — solo cambia de dónde sale el dato.
 *
 * POR QUÉ UN JSON Y NO UN `.jsonl` COMO TODO LO DEMÁS. Los otros libros
 * —pedidos, pagos, comprobantes, reclamaciones— son REGISTROS: solo crecen,
 * porque anotan hechos y un hecho no se corrige. El catálogo es lo contrario:
 * es ESTADO. Un precio se cambia, un producto se retira. Guardarlo como un
 * libro que solo crece obligaría a releer toda la historia para saber cuánto
 * cuesta algo hoy.
 *
 * SE ESCRIBE ENTERO Y DE GOLPE, con un archivo temporal y un renombrado. Un
 * `rename` en el mismo disco es atómico: o está el catálogo viejo o está el
 * nuevo, nunca medio archivo. Escribir encima del bueno y que se corte la luz
 * a mitad deja la tienda sin catálogo.
 *
 * LA PRIMERA VEZ SE SIEMBRA con los dos productos que hoy están a la venta, en
 * vez de arrancar vacío. Desplegar esto no puede hacer que la tienda se quede
 * sin nada que vender.
 *
 * ⚠️ LOS IMPORTES SEMBRADOS SON DE PRUEBA (S/ 5.00 y S/ 10.00), puestos así
 * para las transacciones de certificación de Izipay. Ahora se cambian desde el
 * panel, sin tocar código.
 */

const fs = require('node:fs');
const path = require('node:path');

const DIRECTORIO = path.join(__dirname, '..', 'datos');
const ARCHIVO = path.join(DIRECTORIO, 'catalogo.json');

/** El catálogo con el que se siembra la primera vez. */
const SEMILLA = {
  categorias: [
    { id: 'licencias', nombre: 'Licencias', orden: 1 },
    { id: 'software', nombre: 'Software', orden: 2 },
  ],
  productos: [
    {
      id: 'licencia-web',
      categoria: 'licencias',
      nombre: 'Licencia de la App Web GCM',
      resumen: 'Acceso a la plataforma en la nube para su constructora.',
      detalle: [
        'Control de obra multiproyecto: presupuesto, avance físico y resultado económico.',
        'Usuarios por obra con sus permisos, desde gerencia hasta el residente.',
        'Actualizaciones y respaldos incluidos mientras la licencia esté vigente.',
        'Soporte por correo en días hábiles.',
      ],
      precioCentimos: 500,
      moneda: 'PEN',
      vigencia: '12 meses desde la activación',
      igvIncluido: true,
      entrega: 'Activación de su cuenta en un plazo máximo de 24 horas hábiles.',
      activo: true,
      orden: 1,
    },
    {
      id: 'software-instalable',
      categoria: 'software',
      nombre: 'Software Descargable Autoinstalable GCM',
      resumen: 'Instalador para ejecutar GCM en el servidor de su empresa.',
      detalle: [
        'Instalador autocontenido: no requiere configurar servidor a mano.',
        'Sus datos quedan en su propia infraestructura.',
        'Manual de instalación y del residente incluidos.',
        'Actualizaciones del año en curso.',
      ],
      precioCentimos: 1000,
      moneda: 'PEN',
      vigencia: 'Licencia perpetua de la versión adquirida',
      igvIncluido: true,
      entrega: 'Enlace de descarga por correo tras la confirmación del pago.',
      activo: true,
      orden: 2,
    },
  ],
};

/* --------------------------------------------------------- leer y escribir */

let memoria = null;
let selloMtime = 0;

/**
 * El catálogo entero.
 *
 * Se cachea en memoria pero se relee si el archivo cambió: el panel y la
 * tienda son el mismo proceso, así que basta con mirar la fecha del archivo
 * para no servir un precio viejo un segundo después de cambiarlo.
 */
function leer() {
  try {
    const stat = fs.statSync(ARCHIVO);
    if (memoria && stat.mtimeMs === selloMtime) return memoria;
    const datos = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
    memoria = normalizar(datos);
    selloMtime = stat.mtimeMs;
    return memoria;
  } catch {
    // No existe (o está ilegible): se siembra y se deja escrito.
    memoria = normalizar(structuredClone(SEMILLA));
    try { escribir(memoria); } catch { /* disco de solo lectura: se sirve igual */ }
    return memoria;
  }
}

/** Rellena lo que falte, para que un archivo editado a mano no rompa nada. */
function normalizar(d) {
  const categorias = Array.isArray(d.categorias) ? d.categorias : [];
  const productos = Array.isArray(d.productos) ? d.productos : [];
  return {
    categorias: categorias.map((c, i) => ({
      id: String(c.id || ''),
      nombre: String(c.nombre || c.id || ''),
      orden: Number.isFinite(c.orden) ? c.orden : i + 1,
    })).filter((c) => c.id),
    productos: productos.map((p, i) => ({
      id: String(p.id || ''),
      categoria: String(p.categoria || ''),
      nombre: String(p.nombre || ''),
      resumen: String(p.resumen || ''),
      detalle: Array.isArray(p.detalle) ? p.detalle.map(String).filter(Boolean) : [],
      precioCentimos: Math.max(0, Math.round(Number(p.precioCentimos) || 0)),
      moneda: String(p.moneda || 'PEN'),
      vigencia: String(p.vigencia || ''),
      entrega: String(p.entrega || ''),
      igvIncluido: p.igvIncluido !== false,
      activo: p.activo !== false,
      orden: Number.isFinite(p.orden) ? p.orden : i + 1,
    })).filter((p) => p.id && p.nombre),
  };
}

/**
 * Guarda el catálogo entero. Atómico: temporal + renombrado.
 *
 * Si se escribiera encima del archivo bueno y se cortara a mitad, la tienda se
 * quedaría sin catálogo. Con el renombrado, o está el viejo o está el nuevo.
 */
function escribir(catalogo) {
  fs.mkdirSync(DIRECTORIO, { recursive: true });
  const temporal = ARCHIVO + '.tmp';
  fs.writeFileSync(temporal, JSON.stringify(catalogo, null, 2) + '\n', 'utf8');
  fs.renameSync(temporal, ARCHIVO);
  memoria = catalogo;
  try { selloMtime = fs.statSync(ARCHIVO).mtimeMs; } catch { selloMtime = 0; }
}

/* ------------------------------------------------------------- consultas */

/** Formatea céntimos como se escribe un precio en Perú: S/ 1,234.00 */
function formatearPrecio(centimos, moneda = 'PEN') {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 2,
  }).format(centimos / 100);
}

/**
 * El producto QUE SE PUEDE COMPRAR, o null.
 *
 * Solo devuelve los activos, y ese es el punto: quien pregunta por un producto
 * para cobrarlo no debe recibir uno retirado. Para el panel —que sí tiene que
 * poder abrir un producto desactivado— está `buscarCualquierProducto`.
 *
 * Devolver null y no lanzar es a propósito: quien llama decide si eso es un
 * 400 del cliente o un fallo suyo.
 */
function buscarProducto(id) {
  return leer().productos.find((p) => p.id === id && p.activo) || null;
}

/** El producto, esté activo o no. Para el panel. */
function buscarCualquierProducto(id) {
  return leer().productos.find((p) => p.id === id) || null;
}

function categorias() {
  return [...leer().categorias].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

function buscarCategoria(id) {
  return leer().categorias.find((c) => c.id === id) || null;
}

/** Todos los productos, activos y retirados, ordenados. Para el panel. */
function todosLosProductos() {
  return [...leer().productos].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

/**
 * El catálogo tal como lo puede ver el navegador: solo lo que está a la venta,
 * agrupado por categoría y en orden.
 *
 * Va con el precio YA FORMATEADO además del número: así la página no tiene que
 * saber de céntimos ni de monedas, y no hay dos sitios donde se pueda escribir
 * mal el mismo importe.
 *
 * Una categoría sin productos activos NO se devuelve: un titulillo sobre una
 * sección vacía promete algo que no está.
 */
function catalogoPublico() {
  const d = leer();
  const activos = d.productos
    .filter((p) => p.activo)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));

  const grupos = categorias()
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      productos: activos.filter((p) => p.categoria === c.id).map(publico),
    }))
    .filter((g) => g.productos.length);

  // Los que quedaron sin categoría (o con una que ya no existe) no se pierden:
  // se enseñan al final. Perder un producto de la tienda porque alguien borró
  // su categoría sería peor que enseñarlo suelto.
  const conCategoria = new Set(grupos.flatMap((g) => g.productos.map((p) => p.id)));
  const sueltos = activos.filter((p) => !conCategoria.has(p.id)).map(publico);
  if (sueltos.length) grupos.push({ id: '', nombre: 'Otros', productos: sueltos });

  return grupos;
}

function publico(p) {
  return {
    id: p.id,
    categoria: p.categoria,
    nombre: p.nombre,
    resumen: p.resumen,
    detalle: p.detalle,
    vigencia: p.vigencia,
    entrega: p.entrega,
    igvIncluido: p.igvIncluido,
    moneda: p.moneda,
    precioCentimos: p.precioCentimos,
    precioTexto: formatearPrecio(p.precioCentimos, p.moneda),
  };
}

/** La lista plana de productos a la venta, sin agrupar. */
function productosALaVenta() {
  return leer().productos
    .filter((p) => p.activo)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    .map(publico);
}

module.exports = {
  buscarProducto, buscarCualquierProducto, catalogoPublico, productosALaVenta,
  formatearPrecio, categorias, buscarCategoria, todosLosProductos,
  leer, escribir, ARCHIVO,
};
