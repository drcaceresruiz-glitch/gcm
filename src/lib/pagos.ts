import { esPositivo, normalizarDecimal, restar, sumar } from "@/lib/decimal";

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

/**
 * El techo de lo que se le puede pagar a un contratista.
 *
 * NACE DE UNA PRUEBA DEL USUARIO, el 23 de agosto de 2026: pago 740 sobre un
 * contrato de 735 y GCM lo acepto sin decir nada. La pantalla lo llamo
 * «pagado por adelantado S/ 5,00», que es lo que dice cuando se paga mas de
 * lo VALORIZADO, y ahi estaba la confusion.
 *
 * HAY QUE DISTINGUIR DOS EXCESOS, porque uno es normal y el otro no puede
 * pasar:
 *
 * - **Pagar mas de lo VALORIZADO es un adelanto.** Pasa constantemente en
 *   obra: se adelanta para materiales antes de que haya avance que valorizar.
 *   No se bloquea; ya se enseña como «pagado por adelantado». `PagoEncargo`
 *   tiene el `valorizacionId` opcional justo por esto.
 *
 * - **Pagar mas que el CONTRATO no es un adelanto, es un error.** Por
 *   definicion no se le puede deber mas de lo que vale su contrato: si de
 *   verdad hay que pagarle mas, lo que falta es una ADENDA que amplie el
 *   contrato. Y desde que las adendas existen, esa salida esta a un clic, asi
 *   que el mensaje la nombra en vez de dejar a nadie buscando.
 *
 * El tope es el VIGENTE -lo firmado mas sus adendas aprobadas-, no lo
 * firmado: un adicional ya aprobado es dinero que se le debe.
 *
 * SIN IGV, como todo en esta cadena: `montoContratado` se guarda sin
 * impuesto para poder compararse con el parcial del presupuesto, y lo
 * valorizado y lo pagado se comparan contra el. Nada en el camino del encargo
 * calcula un bruto.
 */
export interface TopeDePago {
  /// Lo firmado mas las adendas APROBADAS.
  vigente: string;
  /// La suma de los pagos ya registrados.
  yaPagado: string;
}

export type ResultadoTope =
  | { ok: true }
  | { ok: false; error: string };

export function cabeElPago(monto: string, tope: TopeDePago): ResultadoTope {
  const total = sumar([tope.yaPagado, monto]);
  const sobra = restar(total, tope.vigente);

  // `esPositivo` y no `> 0`: esto es dinero y se compara con decimal exacto.
  if (sobra === null || !esPositivo(sobra)) return { ok: true };

  return {
    ok: false,
    error:
      `Con este pago le habrias pagado ${total} y su contrato vigente es ` +
      `${tope.vigente}: son ${sobra} de mas. No se puede pagar por encima del ` +
      `contrato. Si de verdad hay que pagarle mas, registra una adenda en el ` +
      `encargo y que gerencia la apruebe; entonces el contrato sube y el pago ` +
      `cabe.`,
  };
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
