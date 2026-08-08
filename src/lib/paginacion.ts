/**
 * Paginacion.
 *
 * El numero de pagina llega por la URL, asi que llega como texto y puede ser
 * cualquier cosa: `?p=abc`, `?p=0`, `?p=-3`, o un `?p=12` que era valido
 * antes de que alguien anulara media lista. Sin acotarlo, todos esos casos
 * acaban en un `skip` que deja la consulta sin filas y en una pantalla vacia
 * que parece decir «aqui no hay nada» cuando lo que pasa es que se pidio una
 * pagina que no existe.
 */

/** Cuantas filas por pagina cuando nadie dice otra cosa. */
export const POR_PAGINA = 20;

export interface Pagina<T> {
  filas: T[];
  /// Filas que hay EN TOTAL, no en esta pagina. Es lo que deben mostrar los
  /// recuentos de las pantallas: con «12 ordenes» refiriendose a la pagina,
  /// el rotulo cambiaria al pasar de pagina y ninguno seria el numero real.
  total: number;
  pagina: number;
  totalPaginas: number;
}

/** Paginas que ocupan `total` filas. Siempre al menos una: una lista vacia
 *  se sigue mostrando en la pagina 1, no en la pagina 0. */
export function contarPaginas(total: number, porPagina = POR_PAGINA): number {
  return Math.max(1, Math.ceil(total / porPagina));
}

/**
 * Convierte lo que venga en la URL en una pagina que existe.
 *
 * Se acota en lugar de rechazar: quien llega a `?p=999` desde un enlace
 * viejo quiere ver la lista, no un error.
 */
export function normalizarPagina(
  valor: string | undefined,
  totalPaginas: number,
): number {
  const numero = Number(valor);

  // `Number("")` es 0 y `Number(" ")` tambien, asi que no basta con
  // `isNaN`: hay que descartar todo lo que no sea un entero positivo.
  if (!Number.isInteger(numero) || numero < 1) return 1;

  return Math.min(numero, Math.max(1, totalPaginas));
}

/** Filas que hay que saltarse para empezar en `pagina`. */
export function saltar(pagina: number, porPagina = POR_PAGINA): number {
  return (pagina - 1) * porPagina;
}
