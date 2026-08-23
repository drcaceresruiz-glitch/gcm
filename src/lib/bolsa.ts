import {
  sumar,
  restar,
  esPositivo,
  esNegativo,
} from "@/lib/decimal";
import { importeDeFrente, type PartidaDeFrente } from "@/lib/encargos";

/**
 * La bolsa operativa de la obra. Logica pura, sin base de datos.
 *
 * Separa el presupuesto CONTRACTUAL —lo que el cliente paga— del presupuesto
 * META —lo que la empresa se compromete a gastar—. Lo que queda en medio es
 * la bolsa, y de ella sale el margen real de la obra.
 *
 * Tres reglas gobiernan este archivo. Las tres son decisiones de negocio, no
 * detalles de implementacion, y ninguna es evidente mirando el codigo:
 *
 * 1. LA UTILIDAD NUNCA ENTRA EN LA BOLSA. Viaja y se devuelve, pero aparte y
 *    etiquetada. No es un ahorro que se pueda gastar: es el resultado.
 *    Sumarla a la bolsa la convierte en presupuesto, y entonces se gasta.
 *
 * 2. LOS GASTOS GENERALES NO SON DE LA OBRA. Salieron de la meta por
 *    decision del usuario (20/08/2026): la empresa los gestiona y el
 *    contrato los reconoce como un porcentaje del costo directo. Aqui
 *    queda UNA sola bolsa, la de PRODUCCION. Volver a meterlos mezclaria
 *    el margen de la obra con el resultado de la estructura.
 *
 * 3. LO QUE NO TIENE META NO ES MARGEN. Una partida del contrato sin linea en
 *    la meta sale como bolsa integra, y es justo lo contrario: es gasto que
 *    nadie ha presupuestado. Cuenta en `bolsaProduccion` —porque la resta de
 *    totales es la que es— pero se marca `sin_meta` linea a linea y se totaliza
 *    en `contractualSinMeta`, para que la pantalla pueda decir cuanto de esa
 *    bolsa es un espejismo.
 */

/// Con que detalle se compara. PARTIDA y CAPITULO se resuelven igual —union
/// por codigo—: lo que cambia es a que nivel llegan las lineas que envia el
/// servicio. Solo FRENTE es un algoritmo distinto.
export type ModoMeta = "PARTIDA" | "CAPITULO" | "FRENTE";

/** Una linea del lado CONTRACTUAL, ya al nivel que toca comparar. */
export interface LineaContractual {
  /// Codigo de partida o de capitulo, segun el modo.
  codigo: string;
  descripcion: string;
  /// Importe VIGENTE (linea base + movimientos aprobados), sin IGV.
  importe: string;
}

/** Una linea del lado META. */
export interface LineaMeta {
  /// Codigo contractual que espeja. null = linea propia de la meta.
  codigoRef: string | null;
  descripcion: string;
  /// Lo que la meta presupuesta para esta linea.
  importe: string;
  /// Solo en modo FRENTE: que partidas cubre y en que fraccion.
  reparto?: readonly PartidaDeFrente[];
}

export type SenalBolsa = "favorable" | "ajustada" | "excedida" | "sin_meta";

export interface LineaBolsa {
  /// null en las lineas propias de la meta y en los frentes, que no espejan
  /// un codigo del contrato.
  codigo: string | null;
  descripcion: string;
  contractual: string;
  meta: string;
  /// contractual - meta. Positivo = sobra; negativo = te has pasado.
  bolsa: string;
  senal: SenalBolsa;
  /// true si la linea no espeja nada del contrato: un costo propio de la meta
  /// (andamio alquilado, cuadrilla de apoyo). Consume bolsa por definicion,
  /// porque el contrato no lo paga aparte.
  propia: boolean;
}

/** Positivo sobra, negativo te has pasado, cero justo. */
function senalDe(bolsa: string): SenalBolsa {
  if (esPositivo(bolsa)) return "favorable";
  if (esNegativo(bolsa)) return "excedida";
  return "ajustada";
}

interface Union {
  filas: LineaBolsa[];
  /// Importe del contrato que ninguna linea de la meta cubre.
  contractualSinMeta: string;
}

/**
 * Union por codigo (modos PARTIDA y CAPITULO).
 *
 * Recorre la meta y busca su contraparte; despues barre el contrato en busca
 * de lo que la meta no menciono. Ese segundo barrido es el que importa: sin
 * el, olvidar media obra en la meta se lee como un margen excelente.
 */
function unirPorCodigo(
  contractual: readonly LineaContractual[],
  meta: readonly LineaMeta[],
): Union {
  const porCodigo = new Map(contractual.map((c) => [c.codigo, c]));
  const cubiertos = new Set<string>();
  const filas: LineaBolsa[] = [];

  for (const m of meta) {
    const c = m.codigoRef === null ? undefined : porCodigo.get(m.codigoRef);
    if (c) cubiertos.add(c.codigo);

    const contra = c?.importe ?? "0.00";
    const bolsa = restar(contra, m.importe) ?? "0.00";

    filas.push({
      codigo: m.codigoRef,
      descripcion: m.descripcion,
      contractual: contra,
      meta: m.importe,
      bolsa,
      senal: senalDe(bolsa),
      propia: c === undefined,
    });
  }

  const huerfanas = contractual.filter((c) => !cubiertos.has(c.codigo));

  for (const c of huerfanas) {
    filas.push({
      codigo: c.codigo,
      descripcion: c.descripcion,
      // Su importe SI cuenta como bolsa, porque la resta de totales es la que
      // es y las cifras tienen que cuadrar. Lo que lo desactiva como alegria
      // es la senal, que la pantalla pinta como aviso y no como ahorro.
      contractual: c.importe,
      meta: "0.00",
      bolsa: c.importe,
      senal: "sin_meta",
      propia: false,
    });
  }

  return {
    filas,
    contractualSinMeta: sumar(huerfanas.map((c) => c.importe)),
  };
}

/**
 * Union por reparto (modo FRENTE).
 *
 * Un frente de produccion no coincide con una partida del contrato: toca
 * varias, y a veces solo una parte de cada una. Su contraparte contractual se
 * calcula con `importeDeFrente`, la MISMA funcion que reparte los encargos a
 * proveedores; escribir una segunda daria dos comportamientos distintos en los
 * bordes (fracciones que no suman 100, parciales negativos de un descuento).
 *
 * Lo que ningun frente cubre se anade como UNA fila sintetica, para que la
 * suma de las filas siga siendo la bolsa de produccion tambien en este modo.
 */
function unirPorFrente(
  contractual: readonly LineaContractual[],
  meta: readonly LineaMeta[],
): Union {
  const filas: LineaBolsa[] = meta.map((m) => {
    const reparto = m.reparto ?? [];
    const contra = reparto.length === 0 ? "0.00" : importeDeFrente(reparto);
    const bolsa = restar(contra, m.importe) ?? "0.00";

    return {
      codigo: null,
      descripcion: m.descripcion,
      contractual: contra,
      meta: m.importe,
      bolsa,
      senal: senalDe(bolsa),
      propia: reparto.length === 0,
    };
  });

  const total = sumar(contractual.map((c) => c.importe));
  const cubierto = sumar(filas.map((f) => f.contractual));
  const sinMeta = restar(total, cubierto) ?? "0.00";

  // Solo si sobra algo. Un cero no merece una fila, y un NEGATIVO tampoco se
  // esconde: significa que las fracciones suman mas del 100 % de alguna
  // partida y el frente esta contando dinero que no le toca.
  if (esPositivo(sinMeta) || esNegativo(sinMeta)) {
    filas.push({
      codigo: null,
      descripcion: esNegativo(sinMeta)
        ? "Reparto excedido: los frentes suman mas que el presupuesto"
        : "Partidas sin frente asignado",
      contractual: sinMeta,
      meta: "0.00",
      bolsa: sinMeta,
      senal: "sin_meta",
      propia: false,
    });
  }

  return { filas, contractualSinMeta: sinMeta };
}

export interface DatosBolsa {
  modo: ModoMeta;
  contractual: readonly LineaContractual[];
  meta: readonly LineaMeta[];
  /// Utilidad del contractual. Viaja para poder ensenarla al lado de la
  /// bolsa; NUNCA se suma a ella.
  utilidadContractual: string;
}

export interface Bolsa {
  porLinea: readonly LineaBolsa[];

  costoDirectoContractual: string;
  /// Solo las lineas de la meta CON codigo: las que tienen contraparte en el
  /// contrato. Los sueldos y alquileres no estan aqui, estan en
  /// `costoPropioMeta`.
  costoDirectoMeta: string;
  /// Costo directo contractual - costo directo meta.
  bolsaProduccion: string;

  /**
   * Lo que la obra puede gestionar de verdad: produccion MENOS costos
   * propios.
   *
   * Hasta el 23 de agosto de 2026 habia dos cifras, `bolsaTotal` y
   * `bolsaNeta`, porque los costos propios llegaban de una tabla aparte que
   * podia venir vacia. Ahora viajan en la misma lista, asi que las dos
   * valdrian siempre lo mismo y se dejo una sola: dos nombres para un numero
   * es como se acaba enseñando el que no toca.
   */
  bolsaTotal: string;

  /// Las lineas de la meta SIN codigo: personal indirecto, alquileres,
  /// polizas, fianzas. Todo lo que la obra cuesta sin ser una partida.
  ///
  /// NO se recibe de fuera: se deriva de la misma lista que el costo directo.
  /// Hasta el 23 de agosto de 2026 llegaba como parametro desde una tabla
  /// aparte, y llegaba en cero sin que nada avisara.
  costoPropioMeta: string;

  /// Aparte y etiquetada. No es bolsa: es el margen ofertado.
  utilidadContractual: string;
  /// bolsaTotal + utilidad. Lo que la obra deberia dejar si todo sale como
  /// dice la meta. Derivada, y por eso con nombre propio: para que nadie
  /// confunda "lo que puedo gastar" con "lo que espero ganar".
  margenEsperado: string;

  /// Cuanto del contrato no tiene contraparte en la meta. Es la parte de
  /// `bolsaProduccion` que NO es margen sino presupuesto olvidado.
  contractualSinMeta: string;
  /// bolsaProduccion descontando lo anterior: la lectura prudente.
  bolsaProduccionCubierta: string;
}

/**
 * Todas las cuentas de la bolsa, para pintarlas sin repetir aritmetica en la
 * pantalla ni en el servidor.
 *
 * `restar` y no `sumar([a, "-" + b])` en todas las diferencias: cualquiera de
 * estas cifras puede ser negativa —un descuento comercial, una meta que se
 * pasa del contrato— y esa forma se rompe en silencio devolviendo el minuendo
 * intacto. En dinero, siempre `restar`.
 */
export function calcularBolsa(datos: DatosBolsa): Bolsa {
  const union =
    datos.modo === "FRENTE"
      ? unirPorFrente(datos.contractual, datos.meta)
      : unirPorCodigo(datos.contractual, datos.meta);

  const costoDirectoContractual = sumar(
    datos.contractual.map((c) => c.importe),
  );
  // El corte es el CODIGO, y por eso las dos cifras salen de la misma lista:
  // lo que tiene contraparte en el contrato se compara con el contrato, y lo
  // que no la tiene se descuenta despues. Antes el segundo sumando llegaba de
  // una tabla aparte y podia venir en cero sin que nada chirriara.
  const costoDirectoMeta = sumar(
    datos.meta.filter((m) => m.codigoRef !== null).map((m) => m.importe),
  );
  const costoPropioMeta = sumar(
    datos.meta.filter((m) => m.codigoRef === null).map((m) => m.importe),
  );

  // Produccion mide SOLO el margen de las partidas. Lo que se paga sin ser
  // partida -residente, maestro, alquileres, polizas- se descuenta despues:
  // se paga igual aunque todas las partidas cuadren.
  const bolsaProduccion =
    restar(costoDirectoContractual, costoDirectoMeta) ?? "0.00";
  const bolsaTotal = restar(bolsaProduccion, costoPropioMeta) ?? bolsaProduccion;

  return {
    porLinea: union.filas,
    costoDirectoContractual,
    costoDirectoMeta,
    costoPropioMeta,
    bolsaProduccion,
    bolsaTotal,
    utilidadContractual: datos.utilidadContractual,
    margenEsperado: sumar([bolsaTotal, datos.utilidadContractual]),
    contractualSinMeta: union.contractualSinMeta,
    bolsaProduccionCubierta:
      restar(bolsaProduccion, union.contractualSinMeta) ?? "0.00",
  };
}

export interface Desfase {
  /// Cuantos movimientos se aprobaron despues de fijar la meta.
  movimientos: number;
  /// Cuanto suman. La bolsa esta inflada en esta cifra.
  importe: string;
  hay: boolean;
}

/**
 * Cuanto exagera la bolsa por culpa de una meta vieja.
 *
 * La comparacion se hace contra el presupuesto VIGENTE —base mas movimientos
 * aprobados—, porque si no un adicional no contaria. El efecto secundario es
 * que un adicional aprobado DESPUES de fijar la meta sube el contractual sin
 * subir la meta, y la diferencia aparece como margen cuando en realidad es
 * trabajo que habra que ejecutar y pagar.
 *
 * Devuelve el IMPORTE y no un booleano a proposito: "tu meta esta desfasada"
 * no mueve a nadie; "tu bolsa exagera en 84.200 soles" si.
 */
export function desfaseDeMeta(
  posteriores: readonly { importeNeto: string }[],
): Desfase {
  return {
    movimientos: posteriores.length,
    importe: sumar(posteriores.map((m) => m.importeNeto)),
    hay: posteriores.length > 0,
  };
}
