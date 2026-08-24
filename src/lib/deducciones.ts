import { esPositivo, normalizarDecimal, restar, sumar } from "@/lib/decimal";

/**
 * Deducir un costo propio de la meta congelada. Logica pura, sin base.
 *
 * PEDIDO ASI: «que el residente y/o el administrador de la obra pueda
 * solicitar deducir monto de los gastos generales, se le presenta al gerente
 * general y si este lo aprueba perfecto, se hacen todos los ajustes». Los
 * «gastos generales» de esa frase son hoy los COSTOS PROPIOS: los items de la
 * meta sin `codigoRef` -sueldos, alquileres, polizas, fianzas-.
 *
 * ## Por que no se edita la meta y punto
 *
 * Porque la meta se CONGELA al aprobarla, y esa congelacion es la unica razon
 * por la que la desviacion se puede ver. Si bajar un costo propio reescribiera
 * la meta, la bolsa subiria sola y sin rastro: el plan se habria reescrito
 * para encajar con la realidad, y siempre pareceria que se va justo. Es el
 * mismo motivo por el que `mesesPlazo` se guarda en vez de derivarse de la
 * fecha real de fin.
 *
 * Asi que la meta no se toca y la deduccion se apunta encima, con su firma.
 * Es exactamente la relacion que ya existe entre la linea base y los
 * movimientos presupuestales: congelado + aprobados = vigente.
 *
 * ## Una deduccion NO es dinero encontrado
 *
 * Es un COMPROMISO DE NO GASTAR. Por eso el motivo es obligatorio y por eso
 * pide decir QUE no se va a gastar: alguien tiene que poder comprobar despues
 * que de verdad no se gasto. Un motivo vacio convierte esto en una palanca
 * para cuadrar la bolsa cuando se pone fea, que es justo lo contrario de para
 * lo que se pidio.
 */

export type EstadoDeduccion = "PENDIENTE" | "APROBADA" | "RECHAZADA";

/** Una deduccion tal como cuenta para las sumas. */
export interface DeduccionContada {
  /// El item del que se deduce.
  metaItemId: string;
  /// SIEMPRE POSITIVO: cuanto se deja de gastar.
  importe: string;
  estado: EstadoDeduccion;
}

/**
 * Cuanto se ha deducido YA de cada linea, por id de item.
 *
 * Solo las APROBADAS. Una pendiente es una peticion, no una decision: contarla
 * subiria la bolsa con dinero que gerencia todavia puede negar, y contra esa
 * bolsa se decide si se aprieta o no.
 */
export function deducidoPorItem(
  deducciones: readonly DeduccionContada[],
): Map<string, string> {
  const porItem = new Map<string, string[]>();

  for (const d of deducciones) {
    if (d.estado !== "APROBADA") continue;
    const suyas = porItem.get(d.metaItemId) ?? [];
    suyas.push(d.importe);
    porItem.set(d.metaItemId, suyas);
  }

  return new Map([...porItem].map(([id, importes]) => [id, sumar(importes)]));
}

export interface ResumenDeducciones {
  /// Suma de las APROBADAS: lo que ya volvio a la bolsa.
  aprobado: string;
  /// Cuantas esperan la firma de gerencia.
  pendientes: number;
  /// Cuanto suman. NO esta descontado de la bolsa -no es una decision hasta
  /// que se firma- pero se enseña al lado: es lo que puede pasar si se
  /// aprueban todas.
  importePendiente: string;
}

export function resumenDeducciones(
  deducciones: readonly DeduccionContada[],
): ResumenDeducciones {
  const pendientes = deducciones.filter((d) => d.estado === "PENDIENTE");

  return {
    aprobado: sumar(
      deducciones.filter((d) => d.estado === "APROBADA").map((d) => d.importe),
    ),
    pendientes: pendientes.length,
    importePendiente: sumar(pendientes.map((d) => d.importe)),
  };
}

/// Lo que la linea vale hoy: lo presupuestado menos lo ya deducido. Nunca se
/// deja bajar de cero -esa es la comprobacion de `validarDeduccion`-, asi que
/// esto no puede salir negativo si el circuito se respeto.
export function importeVigenteDeLinea(
  presupuestado: string,
  deducido: string,
): string {
  return restar(presupuestado, deducido) ?? presupuestado;
}

/** La linea de la que se quiere deducir, tal como esta hoy. */
export interface LineaParaDeducir {
  /// null = es una linea CON codigo, o sea un costo directo. No se puede.
  codigoRef: string | null;
  descripcion: string;
  /// Lo que la meta presupuesto para ella.
  presupuestado: string;
  /// Lo ya deducido y aprobado.
  deducido: string;
}

export interface DatosDeduccion {
  importe: string;
  motivo: string;
}

/**
 * Si la deduccion se puede pedir, y si no, por que.
 *
 * Devuelve el mensaje o null. Tres reglas, y cada una tiene detras una forma
 * concreta de romper la bolsa:
 */
export function validarDeduccion(
  linea: LineaParaDeducir,
  datos: DatosDeduccion,
): string | null {
  /*
   * 1. SOLO DE UN COSTO PROPIO.
   *
   * Un costo propio es una decision de la empresa -cuantos meses se alquila
   * el andamio- y por eso se puede decidir gastar menos. El costo de una
   * partida lo dicta la obra: «deducir» de ella no seria decidir nada, seria
   * bajar el plan para que cuadre con lo que esta pasando. Eso es justo lo
   * que la meta congelada existe para impedir.
   */
  if (linea.codigoRef !== null) {
    return (
      "Solo se puede deducir de un costo propio de la meta (sueldos, " +
      "alquileres, pólizas): son los que la empresa decide y puede decidir " +
      "gastar menos. El costo de una partida lo dicta la obra, y bajarlo " +
      "sería reescribir el plan para que cuadre."
    );
  }

  const importe = normalizarDecimal(datos.importe, 2);
  if (importe === null) return "El importe a deducir no es un número.";

  /*
   * 2. POSITIVO, Y NO CERO.
   *
   * El importe se guarda sin signo: es «cuanto se deja de gastar». Admitir
   * negativos convertiria esta tabla en una forma de SUBIR un costo propio a
   * espaldas de la meta congelada, que es otra cosa y con otra conversacion
   * -eso es una meta nueva-. Y una deduccion de cero no ajusta nada.
   */
  if (!esPositivo(importe)) {
    return (
      "El importe a deducir tiene que ser positivo: es cuánto se va a dejar " +
      "de gastar. Para SUBIR un costo propio hace falta una versión nueva de " +
      "la meta, no una deducción."
    );
  }

  /*
   * 3. NO MAS DE LO QUE QUEDA EN LA LINEA.
   *
   * Deducir 50.000 de un alquiler de 40.000 no es ahorrar 50.000: es inventar
   * 10.000 de bolsa. Y se compara contra lo que QUEDA -presupuestado menos lo
   * ya deducido- porque si no, dos deducciones de 30.000 sobre una linea de
   * 40.000 pasarian las dos por separado.
   */
  const queda = importeVigenteDeLinea(linea.presupuestado, linea.deducido);
  const sobra = restar(importe, queda);

  if (sobra !== null && esPositivo(sobra)) {
    return (
      `De «${linea.descripcion}» solo quedan ${queda} por deducir` +
      `${esPositivo(linea.deducido) ? ` (ya se dedujeron ${linea.deducido})` : ""}` +
      `. No se puede dejar de gastar más de lo que había presupuestado.`
    );
  }

  if (!datos.motivo.trim()) {
    return (
      "Falta el motivo: qué no se va a gastar y por qué se puede. Una " +
      "deducción no es dinero encontrado, es un compromiso de no gastarlo, y " +
      "alguien tiene que poder comprobar después que se cumplió."
    );
  }

  return null;
}
