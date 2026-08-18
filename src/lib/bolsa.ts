import {
  sumar,
  restar,
  multiplicar,
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
 * 2. HAY DOS BOLSAS, NO UNA. La de PRODUCCION se gana ejecutando por debajo
 *    de la meta; la de PLAZO, terminando antes. Se pierden por motivos
 *    distintos, asi que se informan por separado: tapar un sobrecosto de
 *    produccion con un ahorro de plazo que todavia no has ganado es
 *    exactamente el vicio que esta separacion impide.
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
  /// Importe de gastos generales del CONTRACTUAL, ya calculado por la cascada
  /// de la linea base (es un % sobre el costo directo).
  gastosGeneralesContractual: string;
  /// Suma de la lista de gastos generales de la META. Aqui NO es un
  /// porcentaje: es lo que cuesta sostener la obra durante su plazo.
  gastosGeneralesMeta: string;
  /// Utilidad del contractual. Viaja para poder ensenarla al lado de la
  /// bolsa; NUNCA se suma a ella.
  utilidadContractual: string;
  /**
   * Si los gastos generales cuentan en la bolsa. Lo decide la obra.
   *
   * Opcional y por defecto true para no cambiar el resultado de quien no lo
   * pase: cambiar una cifra de dinero por omision es justo lo que no puede
   * pasar aqui.
   */
  incluyeGastosGenerales?: boolean;
}

export interface Bolsa {
  porLinea: readonly LineaBolsa[];

  costoDirectoContractual: string;
  costoDirectoMeta: string;
  /// Costo directo contractual - costo directo meta.
  bolsaProduccion: string;

  gastosGeneralesContractual: string;
  gastosGeneralesMeta: string;
  /// Gastos generales contractuales - gastos generales meta. "0.00" cuando la
  /// obra decidio que los gastos generales NO entran en la bolsa.
  bolsaPlazo: string;
  /// El criterio con el que se calculo, para que la pantalla no lo adivine.
  incluyeGastosGenerales: boolean;
  /**
   * Gastos generales contratados menos los presupuestados. SIEMPRE, entre o
   * no entre en la bolsa.
   *
   * NO es bolsa aunque salga positivo, y por eso tiene nombre propio: es el
   * resultado de la ESTRUCTURA, y lo gestiona la empresa, no el residente.
   * Negativo significa que los gastos generales cuestan mas de lo que el
   * contrato reconoce y esa diferencia sale del bolsillo de la empresa.
   *
   * Se calcula siempre porque esconderlo era el agujero del diseño anterior:
   * al sacar los gastos generales de la bolsa, simplemente desaparecian, y
   * una obra podia ir perfecta en costo directo y perder dinero sin que nada
   * lo dijera.
   */
  resultadoGastosGenerales: string;

  /// Produccion + plazo. SIN utilidad.
  bolsaTotal: string;

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
  const costoDirectoMeta = sumar(datos.meta.map((m) => m.importe));

  const bolsaProduccion =
    restar(costoDirectoContractual, costoDirectoMeta) ?? "0.00";
  /**
   * La bolsa de plazo solo existe si la obra decidio que los gastos
   * generales entran. Cuando no entran es "0.00" y no null: sigue siendo una
   * cifra sumable, y quien la pinte decide si la enseña. Los gastos
   * generales se devuelven igual —se cargaron y se guardaron—, para que la
   * pantalla los pueda mostrar aparte con su aviso de sobrecosto.
   */
  const incluyeGG = datos.incluyeGastosGenerales ?? true;
  // El resultado de estructura se calcula SIEMPRE. La bolsa lo usa o no,
  // segun el criterio de la obra, pero la cifra existe en los dos casos.
  const resultadoGastosGenerales =
    restar(datos.gastosGeneralesContractual, datos.gastosGeneralesMeta) ??
    "0.00";

  const bolsaPlazo = incluyeGG
    ? restar(datos.gastosGeneralesContractual, datos.gastosGeneralesMeta) ??
      "0.00"
    : "0.00";

  const bolsaTotal = sumar([bolsaProduccion, bolsaPlazo]);

  return {
    porLinea: union.filas,
    costoDirectoContractual,
    costoDirectoMeta,
    bolsaProduccion,
    gastosGeneralesContractual: datos.gastosGeneralesContractual,
    gastosGeneralesMeta: datos.gastosGeneralesMeta,
    bolsaPlazo,
    incluyeGastosGenerales: incluyeGG,
    resultadoGastosGenerales,
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

export type TipoGasto = "FIJO" | "VARIABLE";

export interface EntradaGasto {
  tipo: TipoGasto;
  /// VARIABLE: lo que cuesta cada mes. FIJO: null.
  montoMensual: string | null;
  /// VARIABLE: cuantos meses se sostiene. FIJO: null.
  meses: string | null;
  /// FIJO: el importe tal cual. VARIABLE: null.
  montoFijo: string | null;
}

/**
 * El total de un gasto general, o null si la fila no tiene forma valida.
 *
 * Es la validacion que la base de datos NO puede expresar: que un VARIABLE
 * lleve mensual y meses, y que un FIJO lleve su importe. Devolver null en vez
 * de cero es deliberado —un cero se suma sin ruido y desaparece del total—.
 */
export function totalDeGasto(g: EntradaGasto): string | null {
  if (g.tipo === "FIJO") {
    return g.montoFijo === null ? null : sumar([g.montoFijo]);
  }

  if (g.montoMensual === null || g.meses === null) return null;
  return multiplicar(g.montoMensual, g.meses, 2);
}

export interface ResumenGastosGenerales {
  /// Suma de todos los gastos generales de la meta.
  total: string;
  /// Solo los que no dependen del plazo.
  fijos: string;
  /// Solo los que se pagan por mes.
  variables: string;
  /// Lo que cuesta CADA MES de atraso: la suma de los mensuales de los
  /// variables. Es la cifra que convierte "vamos tres semanas tarde" en
  /// dinero, y la razon de guardar el mensual en vez de un total ciego.
  costeMensualDelAtraso: string;
  /// Cuantas filas no tienen forma valida y quedaron fuera de la suma.
  invalidas: number;
}

/** Las cuentas de la lista de gastos generales de la meta. */
export function resumenGastosGenerales(
  gastos: readonly EntradaGasto[],
): ResumenGastosGenerales {
  const totales = gastos.map((g) => ({ g, total: totalDeGasto(g) }));
  const validos = totales.filter((t) => t.total !== null);

  const de = (tipo: TipoGasto) =>
    sumar(validos.filter((t) => t.g.tipo === tipo).map((t) => t.total!));

  return {
    total: sumar(validos.map((t) => t.total!)),
    fijos: de("FIJO"),
    variables: de("VARIABLE"),
    costeMensualDelAtraso: sumar(
      gastos
        .filter((g) => g.tipo === "VARIABLE" && g.montoMensual !== null)
        .map((g) => g.montoMensual!),
    ),
    invalidas: totales.length - validos.length,
  };
}


/**
 * Los gastos generales de la meta son inverosimiles.
 *
 * En una obra, los gastos generales son una fraccion del costo directo —del
 * orden del 8 % al 20 %—. Que SUPEREN al costo directo no es una obra cara:
 * es una lista mal cargada, casi siempre por multiplicar un monto mensual por
 * un numero de meses equivocado (`totalDeGasto` hace `mensual x meses`, y un
 * plazo en dias donde iban meses infla el total treinta veces).
 *
 * Existe porque la `bolsaPlazo` se calcula contra esa cifra sin mirarla, y un
 * gasto general disparado sale por pantalla como una bolsa operativa
 * negativa enorme, indistinguible de una obra que de verdad va a perder
 * dinero. La diferencia importa: una se arregla corrigiendo una fila, la otra
 * cambiando como se construye.
 *
 * NO se bloquea nada por esto: es un aviso. Puede haber casos raros
 * —una obra casi toda de supervision— y el sistema no esta para decidir por
 * el jefe de obra.
 */
export function gastosGeneralesInverosimiles(datos: {
  gastosGeneralesMeta: string;
  costoDirectoMeta: string;
}): boolean {
  // Con costo directo cero no hay proporcion que juzgar: una meta a medio
  // cargar no tiene por que gritar.
  if (!esPositivo(datos.costoDirectoMeta)) return false;

  return esPositivo(
    restar(datos.gastosGeneralesMeta, datos.costoDirectoMeta) ?? "0.00",
  );
}

/**
 * El resultado de gastos generales es un DEFICIT: cuestan mas de lo que el
 * contrato reconoce.
 *
 * Es la situacion que el usuario describe como la corriente en obra pequena,
 * y no es un detalle contable: una obra no puede perder dinero, no puede
 * tocar su utilidad, y una vez firmado no puede volver a presupuestar de cara
 * al cliente. Solo hay tres salidas, y las tres son decisiones de personas:
 *
 *   1. Meter los gastos generales en la bolsa, si se habian dejado fuera, y
 *      cubrirlos con el margen de produccion.
 *   2. Quitar o recortar lineas de gasto general hasta que quepan.
 *   3. Gestionar un ADICIONAL al contrato y que se apruebe. Sube el costo
 *      directo vigente y, con el mismo porcentaje, los gastos generales que
 *      el contrato reconoce.
 *
 * Por eso esto devuelve un booleano y no arregla nada: el sistema señala, la
 * decision es de gerencia.
 */
export function hayDeficitDeEstructura(bolsa: {
  resultadoGastosGenerales: string;
}): boolean {
  return esNegativo(bolsa.resultadoGastosGenerales);
}

export interface SalidasDelDeficit {
  /// Lo que falta, en positivo, para poder escribirlo sin el signo.
  falta: string;
  /// true si la bolsa de produccion da para cubrirlo.
  laCubreLaProduccion: boolean;
  /// Lo que quedaria de bolsa despues de cubrirlo con produccion.
  bolsaDespues: string;
  /**
   * De cuanto tendria que ser el ADICIONAL de costo directo para que los
   * gastos generales que reconoce el contrato suban lo que falta.
   *
   * El contrato reconoce gastos generales como un PORCENTAJE del costo
   * directo, asi que para subirlos en X hay que ampliar el contrato en
   * X / porcentaje. Con un porcentaje bajo la cifra se dispara, y eso es
   * justo lo que hay que ver antes de ir a pedirlo: dice si esa via es
   * realista o si toca recortar.
   *
   * null cuando no se puede calcular (sin gastos generales contractuales no
   * hay porcentaje del que tirar).
   */
  adicionalNecesario: string | null;
}

/**
 * Las tres salidas del deficit de estructura, con su numero.
 *
 * Avisar sin cuantificar deja al usuario con la misma pregunta: «¿y cuanto
 * recorto?». Aqui cada salida viene con la cifra que la hace decidible.
 */
export function salidasDelDeficit(bolsa: {
  resultadoGastosGenerales: string;
  bolsaProduccion: string;
  costoDirectoContractual: string;
  gastosGeneralesContractual: string;
}): SalidasDelDeficit {
  const falta = multiplicar(bolsa.resultadoGastosGenerales, "-1", 2) ?? "0.00";
  const bolsaDespues = sumar([bolsa.bolsaProduccion, bolsa.resultadoGastosGenerales]);

  const gg = Number(bolsa.gastosGeneralesContractual);
  const cd = Number(bolsa.costoDirectoContractual);
  const adicionalNecesario =
    gg > 0 && cd > 0
      ? multiplicar(falta, (cd / gg).toFixed(6), 2)
      : null;

  return {
    falta,
    laCubreLaProduccion: !esNegativo(bolsaDespues),
    bolsaDespues,
    adicionalNecesario,
  };
}
