import { esCero, esPositivo, multiplicar, dividir, sumar } from "@/lib/decimal";

/**
 * Las cuentas de un contrato de proveedor que ha cambiado despues de firmarse.
 *
 * NACE DE UN CASO DE OBRA, planteado el 23 de agosto de 2026: a mitad de
 * ejecucion el contratista se percata de alcances que su orden de compra
 * aprobada no recogia y presenta un adicional. Hasta ese dia la unica forma
 * de registrarlo era subir `montoContratado` a mano, con dos consecuencias:
 *
 *  1. Se borraba lo pactado. Nadie podia saber despues si el contrato siempre
 *     fue de esa cifra o si el contratista se paso un 20 %.
 *  2. Se REVALUABA HACIA ATRAS lo ya valorizado, porque la valorizacion
 *     guardaba solo el porcentaje. Ver `importeDeValorizacion`.
 *
 * Aqui no hay base de datos a proposito: esto es dinero, y el dinero se
 * prueba con numeros.
 */

/** Una adenda ya aprobada. El importe lleva SIGNO. */
export interface AdendaAplicada {
  /// Positivo en un adicional, negativo en un deductivo.
  importe: string;
}

/**
 * Lo que el contrato vale HOY: lo firmado mas las adendas aprobadas.
 *
 * Solo las APROBADAS. Una adenda pendiente es una peticion del contratista,
 * no un compromiso: contarla inflaria el comprometido de la obra con plata
 * que gerencia todavia puede rechazar, y ese numero se usa para decidir.
 */
export function montoVigente(
  montoContratado: string,
  aprobadas: readonly AdendaAplicada[],
): string {
  return sumar([montoContratado, ...aprobadas.map((a) => a.importe)]);
}

export interface ResumenAdendas {
  /// Suma de las aprobadas, con signo.
  neto: string;
  /// Solo los adicionales aprobados.
  adicionales: string;
  /// Solo los deductivos aprobados, en positivo para poder enseñarlo.
  deductivos: string;
  /// Cuantas esperan la firma de gerencia.
  pendientes: number;
  /// Cuanto suman las pendientes, con signo. Es la cifra que convierte «hay
  /// tres adendas por aprobar» en una decision.
  importePendiente: string;
}

export interface AdendaContada extends AdendaAplicada {
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
}

/** El desglose de las adendas de un encargo. */
export function resumenAdendas(
  adendas: readonly AdendaContada[],
): ResumenAdendas {
  const aprobadas = adendas.filter((a) => a.estado === "APROBADA");
  const pendientes = adendas.filter((a) => a.estado === "PENDIENTE");

  return {
    neto: sumar(aprobadas.map((a) => a.importe)),
    adicionales: sumar(
      aprobadas.filter((a) => esPositivo(a.importe)).map((a) => a.importe),
    ),
    // En positivo: un deductivo se lee «se le quitaron 12.000», no «-12.000».
    deductivos: (() => {
      const negativos = aprobadas.filter(
        (a) => !esPositivo(a.importe) && !esCero(a.importe),
      );
      const suma = sumar(negativos.map((a) => a.importe));
      return esCero(suma) ? "0.00" : (multiplicar(suma, "-1", 2) ?? "0.00");
    })(),
    pendientes: pendientes.length,
    importePendiente: sumar(pendientes.map((a) => a.importe)),
  };
}

/** Una valorizacion, tal como la guarda la base. */
export interface ValorizacionCongelable {
  porcentaje: string;
  /// Lo que ese porcentaje valia el dia del corte. `null` en las anteriores a
  /// que existiera la columna.
  importe: string | null;
}

/**
 * Lo que vale una valorizacion, sin revaluarla hacia atras.
 *
 * ESTE ES EL ARREGLO. Antes el importe se recalculaba SIEMPRE contra el monto
 * contratado de hoy, y con un contrato inmutable eso no se notaba. En cuanto
 * el contrato puede cambiar -que es justo lo que introducen las adendas- el
 * pasado se mueve solo:
 *
 *   Valorizo el 60 % de un contrato de 50.000 -> 30.000, y se le pago.
 *   Entra un deductivo de -12.000 -> ese MISMO 60 % pasa a valer 22.800.
 *   Sin que nadie toque esa valorizacion, el sistema dice que se le pagaron
 *   7.200 de mas.
 *
 * Si la valorizacion trae su importe, manda: es lo que se firmo. Si no lo
 * trae -las anteriores a la columna- se cae al calculo antiguo contra el
 * monto CONTRATADO, nunca contra el vigente: esas son de antes de que hubiera
 * ninguna adenda, asi que el contratado ES el vigente que tenian.
 */
export function importeDeValorizacion(
  v: ValorizacionCongelable,
  montoContratado: string,
): string {
  if (v.importe !== null) return v.importe;
  return importeSobre(montoContratado, v.porcentaje);
}

/** Un porcentaje de un monto, a dos decimales. */
export function importeSobre(monto: string, porcentaje: string): string {
  const producto = multiplicar(monto, porcentaje, 6);
  if (producto === null) return "0.00";
  return dividir(producto, "100", 2) ?? "0.00";
}
