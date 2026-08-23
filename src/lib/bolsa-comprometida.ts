import { restar, sumar } from "@/lib/decimal";

/**
 * La bolsa que queda cuando se miran los contratos firmados, no el plan.
 *
 * NACE DE UNA PREGUNTA DE OBRA, del 23 de agosto de 2026: «el contratista se
 * percata de alcances que no estaban en su orden y me genera un adicional;
 * como lo registro para que reste de la bolsa operativa».
 *
 * LA RESPUESTA NO ERA BAJAR LA META, y conviene dejarlo escrito porque es la
 * tentacion evidente. Si un adicional del contratista subiera el costo de la
 * meta, la bolsa bajaria y con ella DESAPARECERIA la desviacion: el plan se
 * habria reescrito para encajar con la realidad y siempre pareceria que se va
 * justo. Es el mismo motivo por el que la meta se congela al aprobarla y por
 * el que `mesesPlazo` no se deriva de la fecha real.
 *
 * Lo que faltaba era la SEGUNDA lectura:
 *
 *   Bolsa prevista     = contractual - meta.        El margen que planificaste.
 *   Bolsa comprometida = la prevista - las desviaciones de los contratos ya
 *                        firmados.                  Lo que queda de verdad.
 *
 * La primera no se toca nunca. La segunda es la que baja con cada adenda
 * aprobada, y la que responde a la pregunta.
 *
 * Aqui no hay base de datos: esto es dinero y se prueba con numeros.
 */

/** Un frente contratado, ya cruzado contra lo que la meta preveia para el. */
export interface FrenteContratado {
  encargoId: string;
  numero: number;
  descripcion: string;
  proveedor: string;
  /// Lo firmado mas sus adendas APROBADAS: lo que hay que pagarle.
  montoVigente: string;
  /**
   * Lo que la META preveia para las partidas de este frente.
   *
   * De la META y no del contractual: la bolsa se mide contra lo que ibas a
   * gastar, no contra lo que le cobras al cliente. Comparar el contrato del
   * proveedor con el precio de venta mezcla los dos lados y da un numero que
   * no es ni margen ni desviacion.
   */
  previstoEnLaMeta: string;
}

export interface DesviacionDeFrente extends FrenteContratado {
  /// Vigente menos previsto. POSITIVO = se paga mas de lo planeado y sale de
  /// la bolsa; negativo = se cerro por debajo y la bolsa gana.
  desviacion: string;
}

export interface BolsaComprometida {
  /// La de siempre: contractual menos meta. No la toca nada de aqui.
  prevista: string;
  /// Suma de las desviaciones, con signo.
  desviacionTotal: string;
  /// La prevista menos las desviaciones.
  comprometida: string;
  /// Frente a frente, para poder señalar cual se la come.
  frentes: readonly DesviacionDeFrente[];
  /// Cuanto suman las adendas que esperan la firma de gerencia. NO esta
  /// descontado de `comprometida` -no es un compromiso hasta que se firma-
  /// pero se enseña al lado: es lo que puede pasar si se aprueban todas.
  pendienteDeFirma: string;
}

/**
 * Cuanto queda de la bolsa una vez contados los contratos.
 *
 * Las desviaciones se suman CON SIGNO, sin quedarse solo con las positivas.
 * Un frente cerrado por debajo de la meta es margen ganado de verdad, y
 * esconderlo daria una cifra pesimista que nadie usaria: quien mira este
 * numero para decidir si aprieta o no necesita que sea el real, no el
 * prudente.
 */
export function bolsaComprometida(
  prevista: string,
  frentes: readonly FrenteContratado[],
  pendienteDeFirma: string = "0.00",
): BolsaComprometida {
  const conDesviacion: DesviacionDeFrente[] = frentes.map((f) => ({
    ...f,
    desviacion: restar(f.montoVigente, f.previstoEnLaMeta) ?? "0.00",
  }));

  const desviacionTotal = sumar(conDesviacion.map((f) => f.desviacion));

  return {
    prevista,
    desviacionTotal,
    // `restar` y no `sumar([a, "-" + b])`: la desviacion puede ser negativa y
    // esa forma se rompe en silencio devolviendo el minuendo intacto.
    comprometida: restar(prevista, desviacionTotal) ?? prevista,
    frentes: conDesviacion,
    pendienteDeFirma,
  };
}

/*
 * Lo que la meta preveia para un frente NO se calcula aqui: se usa
 * `importeDeFrente` de `lib/encargos.ts`, que ya reparte por la fraccion con
 * aritmetica decimal. Escribir una segunda version seria tener dos formas de
 * repartir el mismo dinero, que es justo el patron que este proyecto lleva
 * todo el dia quitando.
 */
