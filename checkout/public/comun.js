/* comun.js — Lo que comparten la página del catálogo y la del pago.
 *
 * El carrito vive en localStorage para que pasar de una página a la otra —o
 * recargar— no lo vacíe. Es una comodidad, nada más: lo que se cobra lo decide
 * el servidor a partir de los identificadores y las cantidades que se le
 * manden, así que manipular esto a mano no cambia ningún precio.
 *
 * Todo lo que toca localStorage va en try/catch: en una ventana privada, o con
 * las cookies de sitio bloqueadas, hasta leerlo lanza.
 */

/* La clave vieja era 'gcm_carrito', de cuando la tienda se llamaba GCM. Se
   sigue leyendo para no vaciarle el carrito a quien lo dejó a medias con el
   nombre anterior; se escribe solo la nueva. */
const LLAVE_CARRITO = 'tienda_carrito';
const LLAVE_CARRITO_VIEJA = 'gcm_carrito';

/* eslint-disable-next-line @typescript-eslint/no-unused-vars -- global que consumen tienda.html y pagar.html */
const Tienda = {
  /** Lista plana de productos a la venta, tal como los manda /api/catalogo. */
  productos: [],
  /** Grupos [{id, nombre, productos: [...]}] en el orden del catálogo. */
  grupos: [],
  /** { idDeProducto: cantidad }. Lo que hay en el carrito ahora mismo. */
  carrito: {},

  /** Pide el catálogo y deja listos productos, grupos y el carrito ya limpio. */
  async cargarCatalogo() {
    const r = await fetch('/api/catalogo');
    const catalogo = await r.json();
    this.productos = catalogo.productos || [];
    this.grupos = catalogo.grupos || [];
    this.recuperarCarrito();
  },

  guardarCarrito() {
    try { localStorage.setItem(LLAVE_CARRITO, JSON.stringify(this.carrito)); } catch { /* da igual */ }
  },

  /**
   * El carrito de la visita anterior, si lo hubiera. Se descarta lo que ya no
   * está a la venta: un producto retirado mientras el carrito dormía no puede
   * quedarse dentro, o el pago se rechazaría entero al final, que es el peor
   * momento para enterarse.
   */
  recuperarCarrito() {
    let guardado = {};
    try {
      guardado = JSON.parse(
        localStorage.getItem(LLAVE_CARRITO)
        || localStorage.getItem(LLAVE_CARRITO_VIEJA)
        || '{}',
      );
    } catch { guardado = {}; }

    this.carrito = {};
    for (const [id, cantidad] of Object.entries(guardado || {})) {
      const p = this.productos.find((x) => x.id === id);
      const n = Math.trunc(Number(cantidad));
      if (p && Number.isFinite(n) && n >= 1) this.carrito[id] = Math.min(n, 99);
    }
    this.guardarCarrito();
  },

  cantidadDe(id) {
    return this.carrito[id] || 0;
  },

  cambiarCantidad(id, cantidad) {
    const n = Math.max(0, Math.min(99, Math.trunc(cantidad)));
    if (n === 0) delete this.carrito[id];
    else this.carrito[id] = n;
    this.guardarCarrito();
  },

  /** Las líneas del carrito, con su producto del catálogo y sus importes. */
  lineas() {
    return Object.entries(this.carrito)
      .map(([id, cantidad]) => {
        const p = this.productos.find((x) => x.id === id);
        return p ? { p, cantidad, importe: p.precioCentimos * cantidad } : null;
      })
      .filter(Boolean);
  },

  /** Cuántas unidades hay en total, para el contador de la barra. */
  unidades() {
    return this.lineas().reduce((s, l) => s + l.cantidad, 0);
  },

  totalCentimos() {
    return this.lineas().reduce((s, l) => s + l.importe, 0);
  },
};

/**
 * Céntimos a texto, para no depender de que el servidor formatee cada suma.
 *
 * El servidor manda cada precio ya formateado, pero el TOTAL cambia con cada
 * clic y pedírselo en cada uno sería una llamada por pulsación. Lo que se
 * cobra lo sigue calculando él: esto es solo lo que se enseña mientras.
 */
/* eslint-disable-next-line @typescript-eslint/no-unused-vars -- global que consumen tienda.html y pagar.html */
function soles(centimos) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency', currency: 'PEN', minimumFractionDigits: 2,
  }).format(centimos / 100);
}
