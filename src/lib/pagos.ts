import { esPositivo, normalizarDecimal } from "@/lib/decimal";

/**
 * Las reglas de un pago al contratista, sin base de datos.
 *
 * Un pago es dinero que YA salio de caja: no se edita, se registra. Por eso
 * lo que se comprueba aqui no es «esta bonito» sino que la fila que va a
 * quedar para siempre no pueda mentir sobre cuanto se pago y cuando.
 */

/// Enteros de la columna: Decimal(14,2) deja 12 enteros.
const ENTEROS_MONTO = 12;

/**
 * Lo que se acepta como comprobante.
 *
 * **El PDF es la novedad frente a la evidencia de obra**, y no es un capricho:
 * una constancia de transferencia casi nunca es una foto, y el banco la
 * entrega en PDF. La evidencia de obra solo admite imagen porque se comprime
 * en el NAVEGADOR antes de subirla; un PDF no se comprime asi, de modo que
 * este camino tiene su propio tope de tamano y no reutiliza aquel.
 */
export const MIMES_COMPROBANTE = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"],
]);

/**
 * 8 MB. Mas alto que los 5 MB de la evidencia de obra, y a proposito: aquella
 * llega ya comprimida por el navegador y esto puede ser un PDF escaneado de
 * varias hojas, que nadie va a poder encoger antes de subirlo.
 */
export const TAMANO_MAXIMO_COMPROBANTE = 8 * 1024 * 1024;

export interface DatosPago {
  /// Tal como llega del formulario.
  monto: string;
  /// "YYYY-MM-DD", como lo manda un <input type="date">.
  fecha: string;
  nota?: string;
}

export type PagoValidado =
  | { ok: true; monto: string; fecha: Date; nota: string | null }
  | { ok: false; error: string };

/**
 * Comprueba un pago contra el dia de hoy.
 *
 * `hoy` entra por parametro y no se lee del reloj: una funcion que mira la
 * hora del sistema no se puede probar, y el caso que importa —el pago con
 * fecha futura— solo se ve fijando el dia.
 */
export function validarPago(datos: DatosPago, hoy: Date): PagoValidado {
  const monto = normalizarDecimal(datos.monto, 2);
  if (monto === null) {
    return { ok: false, error: "El monto no es un número válido." };
  }

  if (!esPositivo(monto)) {
    // Cero incluido: un pago de cero no es un pago, y dejarlo entrar llena el
    // historial de filas que no explican nada.
    return { ok: false, error: "El monto tiene que ser mayor que cero." };
  }

  const enteros = monto.split(".")[0]?.replace("-", "").length ?? 0;
  if (enteros > ENTEROS_MONTO) {
    return { ok: false, error: "El monto es demasiado grande para el campo." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) {
    return { ok: false, error: "Falta la fecha del pago." };
  }

  const fecha = new Date(`${datos.fecha}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime())) {
    return { ok: false, error: "La fecha del pago no es válida." };
  }

  /**
   * Un pago con fecha futura es casi siempre un dedo en el teclado, y aqui
   * hace dano de verdad: la fecha es la que ordena el historial y la que
   * cuadra con el extracto del banco. Se rechaza en vez de avisar, porque es
   * append-only y despues no hay forma de corregirlo.
   */
  const dia = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()),
  );
  if (fecha.getTime() > dia.getTime()) {
    return { ok: false, error: "La fecha del pago no puede ser futura." };
  }

  return {
    ok: true,
    monto,
    fecha,
    nota: datos.nota?.trim() ? datos.nota.trim() : null,
  };
}
