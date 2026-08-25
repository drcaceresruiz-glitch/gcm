/**
 * catalogo.js — Lo que se vende, y a qué precio.
 *
 * ESTE ES EL ÚNICO SITIO DONDE VIVE UN PRECIO. El navegador nunca manda un
 * importe: manda un identificador de producto, y el servidor busca aquí cuánto
 * cuesta. Es la primera de las reglas que no se negocian del plan de cobro
 * (docs/plan-cobro-licencia.md, apartado 7): si el precio viajara en el
 * formulario, cualquiera podría comprar la licencia por un sol.
 *
 * ⚠️ LOS IMPORTES DE ABAJO SON DE PRUEBA (S/ 5.00 y S/ 10.00). Están puestos
 * así a propósito, para que Izipay pueda hacer sus transacciones de
 * certificación con cargos reales pequeños antes de habilitar la cuenta. NO son
 * la tarifa: hay que sustituirlos por los precios de venta ANTES de abrir el
 * checkout al público, o se venderá una licencia anual por cinco soles.
 *
 * Cambiarlos es tocar `precioCentimos` en las dos fichas de abajo y nada más:
 * el checkout no tiene ningún precio escrito, lo pide a /api/catalogo.
 *
 * IGV. El régimen quedó fijado el 25/08/2026: persona natural con negocio,
 * MYPE Tributario y afecto a IGV. Los importes de abajo son el PRECIO FINAL,
 * con el IGV ya dentro: lo que el cliente ve es lo que se le cobra, sin sumas
 * posteriores. Eso es lo que promete el apartado 3 de los Términos, y por eso
 * `igvIncluido` va en true y no hay ningún cálculo de impuesto en el checkout.
 *
 * Cuando toque añadir categorías y edición desde una pantalla, este archivo es
 * lo que se sustituye por una tabla. Mientras tanto la forma de cada producto
 * ya es la que tendría una fila, para que la migración no obligue a rehacer ni
 * el checkout ni el servidor.
 */

/** Los importes se guardan en CÉNTIMOS: 500 son S/ 5.00. */
const PRODUCTOS = [
  {
    id: 'licencia-web',
    categoria: 'Licencias',
    nombre: 'Licencia de la App Web GCM',
    resumen: 'Acceso a la plataforma en la nube para su constructora.',
    detalle: [
      'Control de obra multiproyecto: presupuesto, avance físico y resultado económico.',
      'Usuarios por obra con sus permisos, desde gerencia hasta el residente.',
      'Actualizaciones y respaldos incluidos mientras la licencia esté vigente.',
      'Soporte por correo en días hábiles.',
    ],
    // PRUEBA: S/ 5.00. Sustituir por la tarifa real antes de producción.
    precioCentimos: 500,
    moneda: 'PEN',
    /** Vigencia informativa que se le enseña al comprador. */
    vigencia: '12 meses desde la activación',
    igvIncluido: true,
    entrega: 'Activación de su cuenta en un plazo máximo de 24 horas hábiles.',
  },
  {
    id: 'software-instalable',
    categoria: 'Software',
    nombre: 'Software Descargable Autoinstalable GCM',
    resumen: 'Instalador para ejecutar GCM en el servidor de su empresa.',
    detalle: [
      'Instalador autocontenido: no requiere configurar servidor a mano.',
      'Sus datos quedan en su propia infraestructura.',
      'Manual de instalación y del residente incluidos.',
      'Actualizaciones del año en curso.',
    ],
    // PRUEBA: S/ 10.00. Sustituir por la tarifa real antes de producción.
    precioCentimos: 1000,
    moneda: 'PEN',
    vigencia: 'Licencia perpetua de la versión adquirida',
    igvIncluido: true,
    entrega: 'Enlace de descarga por correo tras la confirmación del pago.',
  },
];

/** Formatea céntimos como se escribe un precio en Perú: S/ 1,234.00 */
function formatearPrecio(centimos) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(centimos / 100);
}

/**
 * El producto, o null si el identificador no está en el catálogo.
 *
 * Devolver null y no lanzar es a propósito: quien llama decide si eso es un
 * 400 del cliente o un fallo suyo, y así esta función sigue siendo pura.
 */
function buscarProducto(id) {
  return PRODUCTOS.find((p) => p.id === id) || null;
}

/**
 * El catálogo tal como lo puede ver el navegador.
 *
 * Va con el precio YA FORMATEADO además del número: así la página no tiene que
 * saber de céntimos ni de monedas, y no hay dos sitios donde se pueda escribir
 * mal el mismo importe.
 */
function catalogoPublico() {
  return PRODUCTOS.map((p) => ({
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
    precioTexto: formatearPrecio(p.precioCentimos),
  }));
}

module.exports = { PRODUCTOS, buscarProducto, catalogoPublico, formatearPrecio };
