import { sumar, restar, multiplicar, dividir, esPositivo } from "@/lib/decimal";

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
 */
export function avanceVigente(
  valorizaciones: readonly Valorizacion[],
): Valorizacion | null {
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
  montoContratado: string;
  presupuestoFrente: string;
  comprometido: string;
  /// % de avance vigente del proveedor, o null si no ha valorizado.
  avancePorcentaje: string | null;
}

export interface ResumenEncargo {
  montoContratado: string;
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
  const contraPresupuesto =
    restar(datos.montoContratado, datos.presupuestoFrente) ?? "0.00";

  const diferenciaContrato =
    restar(datos.montoContratado, datos.comprometido) ?? "0.00";

  // Si el comprometido supera el contrato, `porComprometer` es cero y el
  // exceso se reporta aparte: mezclarlos daria un "por comprometer" negativo
  // que se lee como si aun quedara pedido por hacer.
  const excedido = esPositivo(diferenciaContrato) ? false : true;

  return {
    montoContratado: datos.montoContratado,
    presupuestoFrente: datos.presupuestoFrente,
    comprometido: datos.comprometido,
    contraPresupuesto,
    porComprometer: excedido ? "0.00" : diferenciaContrato,
    excesoComprometido: excedido
      ? (restar(datos.comprometido, datos.montoContratado) ?? "0.00")
      : "0.00",
    valorizado:
      datos.avancePorcentaje === null
        ? "0.00"
        : importeValorizado(datos.montoContratado, datos.avancePorcentaje),
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
  const numTotal = Number(total);
  const porcentaje =
    numTotal > 0 ? (Number(asignado) / numTotal) * 100 : 0;

  return {
    total,
    asignado,
    sinAsignar: restar(total, asignado) ?? "0.00",
    porcentaje,
  };
}
