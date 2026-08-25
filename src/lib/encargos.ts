import { montoVigente } from "@/lib/adendas";
import {
  dividir,
  esCero,
  esPositivo,
  multiplicar,
  porcentajeDe,
  restar,
  sumar,
} from "@/lib/decimal";

/**
 * Cuentas de los encargos a proveedores. Logica pura, sin base de datos.
 *
 * Aqui vive el unico calculo delicado del modulo: cruzar TRES cifras que
 * miden lo mismo en bases distintas y no confundirlas.
 *
 *   - `montoContratado`: lo que pactaste con el proveedor. Es SU precio.
 *   - `presupuestoFrente`: el parcial de las partidas del encargo. Es TU
 *     costo estimado. Puede quedar por encima o por debajo del contratado.
 *   - `comprometido`: lo que ya le has pedido en ordenes de compra contra ese
 *     frente. Es lo formalizado hasta hoy.
 *
 * Y encima, el AVANCE del proveedor: cuanto de su contrato ha ejecutado,
 * segun las valorizaciones. Todo en dinero exacto —nunca coma flotante—.
 */

export interface PartidaDeFrente {
  /// Parcial de la partida (sin IGV), como texto.
  parcial: string;
  /// Fraccion asignada a este encargo, 0..100. Lo normal es 100.
  fraccion: string;
}

/**
 * Cuanto de TU presupuesto cubre el frente del encargo.
 *
 * Suma el parcial de cada partida por la fraccion que le toca a este encargo.
 * Con fraccion 100 —el caso normal— es el parcial entero; cuando una partida
 * se reparte entre dos proveedores, cada encargo se lleva su parte y la suma
 * de las partes no pasa del parcial.
 */
export function importeDeFrente(partidas: readonly PartidaDeFrente[]): string {
  const importes = partidas.map((p) => {
    // parcial * fraccion / 100, exacto: primero el producto con margen de
    // decimales, luego entre cien.
    const producto = multiplicar(p.parcial, p.fraccion, 6);
    if (producto === null) return "0";
    return dividir(producto, "100", 2) ?? "0";
  });

  return sumar(importes);
}

export interface Valorizacion {
  fecha: Date;
  /// Avance ACUMULADO del proveedor, 0..100.
  porcentaje: string;
  /// Desempata dos valorizaciones del mismo dia: manda la ultima registrada.
  createdAt: Date;
}

/**
 * La valorizacion vigente: la del corte MAS RECIENTE.
 *
 * Se compara por fecha de corte, y a igualdad de fecha por el momento de
 * registro: si en un mismo dia se corrige la cifra, vale la ultima que se
 * escribio. Null si el proveedor no tiene ninguna valorizacion todavia.
 *
 * Generica sobre la fila para DEVOLVER LA MISMA que entro, con todo lo que
 * lleve encima. Fijado el tipo en `Valorizacion` a secas, quien la llama con
 * filas que ademas traen sus correlativos recuperaba un objeto sin ellos y
 * tenia que volver a buscar la fila por fecha —dos veces la misma eleccion,
 * que es como acaban discrepando—.
 */
export function avanceVigente<T extends Valorizacion>(
  valorizaciones: readonly T[],
): T | null {
  if (valorizaciones.length === 0) return null;

  return valorizaciones.reduce((vigente, v) => {
    const t = v.fecha.getTime();
    const tv = vigente.fecha.getTime();
    if (t > tv) return v;
    if (t === tv && v.createdAt.getTime() > vigente.createdAt.getTime()) return v;
    return vigente;
  }, valorizaciones[0]!);
}

/** Importe ejecutado por el proveedor: su monto contratado por el % vigente. */
export function importeValorizado(
  montoContratado: string,
  porcentaje: string,
): string {
  const producto = multiplicar(montoContratado, porcentaje, 6);
  if (producto === null) return "0.00";
  return dividir(producto, "100", 2) ?? "0.00";
}

export interface DatosResumen {
  /// Lo FIRMADO. Se conserva aparte del vigente a proposito: si se
  /// sobrescribiera con cada adenda, nadie podria saber despues si el
  /// contrato siempre valio eso o si el contratista se paso un 20 %.
  montoContratado: string;
  /// Las adendas APROBADAS, con signo. Vacio si no hay ninguna.
  adendas?: readonly string[];
  presupuestoFrente: string;
  comprometido: string;
  /// El importe ya valorizado, congelado corte a corte. Si no viaja, se cae
  /// al calculo antiguo -porcentaje x monto- que revalua el pasado cada vez
  /// que cambia el contrato. Ver `lib/adendas.ts`.
  valorizadoAcumulado?: string | null;
  /// % de avance vigente del proveedor, o null si no ha valorizado.
  avancePorcentaje: string | null;
}

export interface ResumenEncargo {
  /// Lo FIRMADO, sin adendas. Se conserva para poder ver cuanto se movio.
  montoContratado: string;
  /// Lo firmado mas las adendas APROBADAS: lo que de verdad hay que pagar.
  /// Es contra esto contra lo que van todas las cuentas de abajo.
  montoVigente: string;
  /// Cuanto suman las adendas aprobadas, con signo. Cero si no hay ninguna.
  adendas: string;
  presupuestoFrente: string;
  comprometido: string;
  /// Contratado menos presupuesto. Positivo = el proveedor cobra mas de lo que
  /// costaba en tu presupuesto; negativo = por debajo.
  contraPresupuesto: string;
  /// Cuanto del contrato queda por formalizar en ordenes. Nunca baja de cero:
  /// que se haya pedido MAS que el contrato es otra lectura y la da el signo
  /// de `excesoComprometido`.
  porComprometer: string;
  /// Comprometido por encima del contratado, si lo hay. Es la senal de que las
  /// ordenes se han pasado del encargo.
  excesoComprometido: string;
  /// Importe ejecutado por el proveedor segun su ultima valorizacion.
  valorizado: string;
  avancePorcentaje: string | null;
}

/**
 * Todas las cuentas de un encargo, para pintarlo sin repetir aritmetica en la
 * pantalla ni en el servidor.
 *
 * `restar` y no `sumar([a, "-"+b])`: cualquiera de estas cifras puede ser
 * negativa —un descuento comercial en el parcial, por ejemplo— y esa forma se
 * rompe en silencio. En dinero, siempre `restar`.
 */
export function resumenEncargo(datos: DatosResumen): ResumenEncargo {
  /*
   * TODAS las cuentas van contra el monto VIGENTE, no contra el firmado.
   *
   * Un adicional aprobado es plata que hay que pagar: si el «por comprometer»
   * o el «contra presupuesto» siguieran mirando el monto original, un
   * contratista con adendas apareceria como si le quedara margen cuando ya se
   * lo comio. El firmado se conserva y se enseña aparte, que es lo que
   * permite ver CUANTO se movio.
   */
  const vigente = montoVigente(datos.montoContratado, (datos.adendas ?? []).map((importe) => ({ importe })));

  const contraPresupuesto =
    restar(vigente, datos.presupuestoFrente) ?? "0.00";

  const diferenciaContrato = restar(vigente, datos.comprometido) ?? "0.00";

  // Si el comprometido supera el contrato, `porComprometer` es cero y el
  // exceso se reporta aparte: mezclarlos daria un "por comprometer" negativo
  // que se lee como si aun quedara pedido por hacer.
  const excedido = esPositivo(diferenciaContrato) ? false : true;

  return {
    montoContratado: datos.montoContratado,
    montoVigente: vigente,
    adendas: restar(vigente, datos.montoContratado) ?? "0.00",
    presupuestoFrente: datos.presupuestoFrente,
    comprometido: datos.comprometido,
    contraPresupuesto,
    porComprometer: excedido ? "0.00" : diferenciaContrato,
    excesoComprometido: excedido
      ? (restar(datos.comprometido, vigente) ?? "0.00")
      : "0.00",
    /*
     * Lo valorizado sale de la SUMA DE LOS CORTES, no de un porcentaje por el
     * monto de hoy. Con el contrato inmutable las dos cuentas daban lo mismo;
     * en cuanto entra una adenda, la segunda revalua el pasado -un deductivo
     * hacia abajo, un adicional hacia arriba- y el sistema empieza a decir
     * que se pago de mas o de menos sin que nadie tocara nada.
     *
     * `valorizadoAcumulado` solo falta en las llamadas que aun no lo pasan;
     * entonces se cae al calculo antiguo, que es lo que habia.
     */
    valorizado:
      datos.valorizadoAcumulado ??
      (datos.avancePorcentaje === null
        ? "0.00"
        : importeValorizado(datos.montoContratado, datos.avancePorcentaje)),
    avancePorcentaje: datos.avancePorcentaje,
  };
}

export interface Cobertura {
  /// Presupuesto de la obra (suma de parciales).
  total: string;
  /// Parte ya repartida en encargos.
  asignado: string;
  /// Lo que queda sin proveedor asignado.
  sinAsignar: string;
  /// 0..100. Cuanto del presupuesto tiene ya un proveedor detras.
  porcentaje: number;
}

/**
 * Cuanto del presupuesto de la obra esta ya repartido entre proveedores.
 *
 * Es la lectura de arriba: si la cobertura es baja, hay obra sin nadie
 * asignado; si pasa del 100 %, se ha asignado mas de lo que hay —partidas
 * fraccionadas que suman de mas, o un frente contado dos veces—.
 */
export function coberturaObra(total: string, asignado: string): Cobertura {
  // Con la aritmetica de importes: son dos cifras de dinero, y dividirlas en
  // coma flotante es el error que `lib/decimal` existe para evitar.
  const porcentaje = porcentajeDe(asignado, total) ?? 0;

  return {
    total,
    asignado,
    sinAsignar: restar(total, asignado) ?? "0.00",
    porcentaje,
  };
}

// ---------------------------------------------------------------------------
// El COMPROMETIDO: encargos vigentes + ordenes sueltas
// ---------------------------------------------------------------------------

export interface PartidaDeReparto {
  /// Con que se identifica la partida en el resultado (el id del WbsItem).
  clave: string;
  /// Parcial de la partida en TU presupuesto, sin IGV.
  parcial: string;
  /// Fraccion de esa partida asignada al encargo, 0..100.
  fraccion: string;
}

/**
 * Reparte el monto contratado de un encargo entre sus partidas, EXACTO.
 *
 * El encargo reparte su frente por FRACCIONES del presupuesto y el
 * comprometido se lee por IMPORTES: esta es la unica conversion entre los
 * dos mundos, y por eso vive aqui y en ningun otro sitio. Convertirla mal
 * descuadra los capitulos sin dar error.
 *
 * - El peso de cada partida es `parcial x fraccion`: el trozo de TU
 *   presupuesto que el encargo se lleva de ella. El monto del contratista se
 *   reparte proporcional a esos pesos.
 * - Si los pesos no suman nada —partidas sin costear, o parciales que se
 *   cancelan—, se reparte a partes iguales: peor reparto, pero ningun sol se
 *   queda invisible.
 * - LA INVARIANTE: la suma de las partes es SIEMPRE el monto contratado. El
 *   residuo del redondeo se carga a la partida de mayor peso, donde menos se
 *   nota, en vez de dejarse caer.
 */
export function repartirContratado(
  montoContratado: string,
  partidas: readonly PartidaDeReparto[],
): { clave: string; importe: string }[] {
  if (partidas.length === 0) return [];

  const pesos = partidas.map(
    (p) => multiplicar(p.parcial, p.fraccion, 6) ?? "0",
  );
  const totalPesos = sumar(pesos, 6);

  const aPartesIguales = esCero(totalPesos);
  const cuotas = aPartesIguales ? partidas.map(() => "1") : pesos;
  const divisor = aPartesIguales ? String(partidas.length) : totalPesos;

  const importes = cuotas.map((cuota) => {
    const producto = multiplicar(montoContratado, cuota, 6);
    if (producto === null) return "0.00";
    return dividir(producto, divisor, 2) ?? "0.00";
  });

  const residuo = restar(montoContratado, sumar(importes));
  if (residuo !== null && !esCero(residuo)) {
    // Elegir la fila es una comparacion, no dinero: aqui si vale Number.
    let mayor = 0;
    for (let i = 1; i < cuotas.length; i++) {
      if (Math.abs(Number(cuotas[i])) > Math.abs(Number(cuotas[mayor]))) {
        mayor = i;
      }
    }
    importes[mayor] = sumar([importes[mayor]!, residuo]);
  }

  return partidas.map((p, i) => ({ clave: p.clave, importe: importes[i]! }));
}

export interface EncargoDelComprometido {
  /**
   * Lo firmado MAS sus adendas APROBADAS.
   *
   * Se llama `montoVigente` y no `montoContratado` a proposito: hasta el 23
   * de agosto de 2026 aqui llegaba lo firmado, asi que un adicional aprobado
   * -dinero que ya se le debe al contratista- no aparecia en el comprometido
   * de ninguna pantalla. El nombre del campo es lo que obliga a quien lea
   * filas de la base a acordarse de sumar las adendas antes de llegar aqui.
   */
  montoVigente: string;
  partidas: readonly PartidaDeReparto[];
}

/**
 * LA DEFINICION de «Comprometido», en un solo sitio (decision del 18/08):
 *
 *     encargos VIGENTES (su monto contratado, repartido entre sus partidas)
 *   + ordenes sueltas APROBADAS (las que no cuelgan de ningun encargo)
 *
 * Una orden emitida CONTRA un encargo NO suma: su dinero ya lo puso el monto
 * contratado, y contarla ademas seria contar dos veces el mismo compromiso.
 * Quien la excluye es la CONSULTA (filtra `encargoId: null`); aqui solo se
 * funden los dos origenes por partida.
 *
 * Los tres sitios que ensenan comprometido por partida —la pantalla de
 * ordenes, el cruce fisico-economico y las alertas de sobregiro— pasan por
 * aqui: dos copias de esta cuenta acabarian dando dos cifras distintas del
 * mismo dinero.
 */
export function comprometidoPorPartida(
  encargos: readonly EncargoDelComprometido[],
  sueltas: readonly { clave: string; importe: string }[],
): Map<string, string> {
  const importesPorClave = new Map<string, string[]>();

  const anotar = (clave: string, importe: string) => {
    const lista = importesPorClave.get(clave);
    if (lista) lista.push(importe);
    else importesPorClave.set(clave, [importe]);
  };

  for (const encargo of encargos) {
    for (const parte of repartirContratado(
      encargo.montoVigente,
      encargo.partidas,
    )) {
      anotar(parte.clave, parte.importe);
    }
  }
  for (const suelta of sueltas) anotar(suelta.clave, suelta.importe);

  return new Map(
    [...importesPorClave].map(([clave, importes]) => [clave, sumar(importes)]),
  );
}

export interface DesgloseComprometido {
  total: string;
  /// Monto contratado de los encargos vigentes. Es el precio del CONTRATISTA,
  /// no tu presupuesto: la pantalla lo tiene que decir con esas palabras.
  deEncargos: string;
  deOrdenesSueltas: string;
}

/**
 * Los totales del comprometido, desde las mismas dos listas.
 *
 * `deEncargos` sale de los MONTOS y no del reparto: un encargo sin partidas
 * repartidas no aparece en ninguna fila, pero su dinero esta igual de
 * comprometido y el total lo tiene que contar. La diferencia entre el total
 * y la suma de filas es visible en pantalla, no un descuadre silencioso.
 */
export interface ResumenComprometido extends DesgloseComprometido {
  /// Cuanto carga cada partida, con el reparto ya hecho.
  porPartida: Map<string, string>;
  /// Las partidas que se pasaron de su parcial. Los IDS y no un conteo: quien
  /// llama necesita agruparlas por obra, y volver a calcularlas para eso seria
  /// tener otra vez dos copias de la misma regla.
  sobregiradas: string[];
  /// Cuantos encargos vigentes ponen la parte `deEncargos`.
  encargosVigentes: number;
}

/**
 * TODO el comprometido de un ambito, de una sola pasada: el total, el
 * desglose por origen, el reparto por partida y cuales se pasaron.
 *
 * NACE DE UN NUMERO EQUIVOCADO EN PANTALLA, el 23 de agosto de 2026. El
 * tablero de la obra decia «Comprometido S/ 0,00 de S/ 740,00 - saldo
 * disponible S/ 740,00» en una obra con un contratista de 735 firmados y 740
 * ya pagados. La causa no fue un fallo de calculo: habia DOS definiciones de
 * comprometido conviviendo. Cuando el encargo paso a ser el contrato marco
 * (18/08) se actualizo la del panel de empresa y no la del tablero, que se
 * quedo contando solo ordenes de compra -y esa obra no tenia ninguna-. El
 * comentario del tablero llego a decir «las mismas definiciones que el
 * resumen de empresa» siendo ya falso.
 *
 * Que un saldo diga que hay dinero libre que en realidad ya se gasto es el
 * peor tipo de cifra equivocada: no parece rota, parece buena noticia.
 *
 * Por eso esta funcion y `services/comprometido.service.ts` son el UNICO
 * sitio donde se decide que cuenta. Aqui la aritmetica, alli las filas.
 *
 * El sobregiro se mide con `restar` y no con `sumar([importe, "-"+parcial])`:
 * un parcial negativo -un descuento comercial, los hay- produce "--26821.60",
 * `sumar` lo descarta en silencio y la partida sale marcada como sobregirada
 * sin estarlo. Ya paso.
 */
export function resumirComprometido(
  encargos: readonly EncargoDelComprometido[],
  sueltas: readonly { clave: string; importe: string }[],
  parcialDePartida: ReadonlyMap<string, string>,
): ResumenComprometido {
  const porPartida = comprometidoPorPartida(encargos, sueltas);

  const sobregiradas: string[] = [];
  for (const [clave, importe] of porPartida) {
    const parcial = parcialDePartida.get(clave);
    // Sin parcial conocido no se afirma nada: una partida que no se pudo leer
    // no es una partida sobregirada.
    if (parcial === undefined) continue;

    const exceso = restar(importe, parcial);
    if (exceso !== null && esPositivo(exceso)) sobregiradas.push(clave);
  }

  return {
    ...desgloseComprometido(
      encargos.map((e) => e.montoVigente),
      sueltas.map((s) => s.importe),
    ),
    porPartida,
    sobregiradas,
    encargosVigentes: encargos.length,
  };
}

export function desgloseComprometido(
  montosDeEncargos: readonly string[],
  importesSueltos: readonly string[],
): DesgloseComprometido {
  const deEncargos = sumar([...montosDeEncargos]);
  const deOrdenesSueltas = sumar([...importesSueltos]);
  return {
    deEncargos,
    deOrdenesSueltas,
    total: sumar([deEncargos, deOrdenesSueltas]),
  };
}
