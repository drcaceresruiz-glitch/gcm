import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import {
  esCero,
  esNegativo,
  esPositivo,
  normalizarDecimal,
  restar,
  sumar,
} from "@/lib/decimal";
import { aportantes } from "@/lib/jerarquia-partidas";
import { calcularCascada, type Cascada } from "@/lib/presupuesto";
import {
  contarPaginas,
  normalizarPagina,
  saltar,
  POR_PAGINA,
  type Pagina,
} from "@/lib/paginacion";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";
import type { ModalidadPartida, TipoMovimiento } from "@/generated/prisma/enums";

/**
 * Movimientos presupuestales: los ajustes que van ENCIMA de la linea base.
 *
 * De aqui salen las tres cifras del control de obra:
 *
 *   BASE     lo que dice la copia congelada (baseline_items)
 *   AJUSTES  la suma de las lineas de movimientos APROBADOS
 *   VIGENTE  base + ajustes
 *
 * El vigente NO se recalcula con `sumarHojas`. Esa funcion decide que nodo
 * cuenta segun el SIGNO de su importe, asi que un adicional que cruce a
 * positivo una hoja hoy negativa la haria cubrir a su ancestro y borraria el
 * importe del ancestro del presupuesto, sin error ni rastro. En CRIOCORD
 * serian los 779,10 de "7.09.00 GASTOS VARIOS". La jerarquia se resuelve UNA
 * vez, sobre la linea base, y los ajustes se suman planos encima.
 */

export class SinLineaBaseError extends Error {
  constructor(
    mensaje = "La obra no tiene una linea base aprobada. Los movimientos van encima de ella.",
  ) {
    super(mensaje);
    this.name = "SinLineaBaseError";
  }
}

export interface PartidaVigente {
  wbsItemId: string;
  codigoPartida: string;
  descripcion: string;
  modalidad: ModalidadPartida;
  nivel: number;
  /// Lo que dice la linea base. "0.00" en las partidas nacidas de un
  /// adicional, que no figuran en ella.
  base: string;
  ajustes: string;
  vigente: string;
  /// true si nacio de un adicional y no del presupuesto contratado.
  esAdicional: boolean;
}

export interface PresupuestoVigente {
  baselineId: string;
  version: number;
  cascadaBase: Cascada;
  cascadaVigente: Cascada;
  partidas: PartidaVigente[];
  /// Ajustes aprobados, separados por signo. Un adicional y un deductivo del
  /// mismo importe no pueden presentarse como "0.00": son dos hechos.
  totalEntradas: string;
  totalSalidas: string;
  /// Diferencia entre la suma de las bases y lo que guarda la linea base.
  /// Deberia ser cero; si no, algo se rompio y hay que mirarlo antes de
  /// fiarse de ninguna cifra de esta pantalla.
  descuadreBase: string;
  /// Codigos de la linea base cuya partida ya no existe en el arbol vivo.
  /// Su dinero cuenta en la base pero nadie puede reconvertirlo.
  codigosSinPartida: string[];
}

/** La linea base aprobada de la obra, o null si todavia no hay ninguna. */
async function lineaBaseAprobada(companyId: string, obraId: string) {
  return prisma.baseline.findFirst({
    where: {
      projectId: obraId,
      aprobadaAt: { not: null },
      project: { companyId },
    },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      costoDirecto: true,
      descuentos: true,
      porcentajeGastosGenerales: true,
      porcentajeUtilidad: true,
      porcentajeIgv: true,
    },
  });
}

/**
 * Presupuesto vigente de la obra: base, ajustes y vigente, por partida y en
 * total.
 *
 * Requiere `movimiento:leer`. Lanza `SinLineaBaseError` si no hay linea base
 * aprobada: sin ella no existe el concepto de "encima de la base".
 */
export async function obtenerPresupuestoVigente(
  sesion: SesionActiva,
  obraId: string,
): Promise<PresupuestoVigente> {
  if (!puede(sesion, "movimiento:leer")) {
    throw new Error("No tienes permiso para ver el presupuesto vigente.");
  }

  const base = await lineaBaseAprobada(sesion.companyId, obraId);
  if (!base) throw new SinLineaBaseError();

  const [items, partidasVivas, ajustesPorPartida] = await Promise.all([
    prisma.baselineItem.findMany({
      where: { baselineId: base.id },
      orderBy: { orden: "asc" },
      select: { codigoPartida: true, tipo: true, parcial: true },
    }),
    prisma.wbsItem.findMany({
      where: { projectId: obraId },
      orderBy: [{ orden: "asc" }, { codigoPartida: "asc" }],
      select: {
        id: true, codigoPartida: true, descripcion: true, modalidad: true,
        nivel: true, tipo: true, origenMovimientoId: true,
      },
    }),
    prisma.movimientoLinea.groupBy({
      by: ["wbsItemId"],
      where: {
        movimiento: {
          projectId: obraId,
          baselineId: base.id,
          estado: "APROBADO",
        },
      },
      _sum: { importe: true },
    }),
  ]);

  // Los capitulos se anulan ANTES de resolver la jerarquia. `crearRevision`
  // calcula la cascada anulandolos, pero copia `parcial` en crudo a
  // baseline_items: sin esto, un capitulo con importe entraria como
  // aportante y la suma de bases dejaria de cuadrar con `costoDirecto`.
  const baseAportante = aportantes(
    items.map((i) => ({
      codigo: i.codigoPartida,
      parcial: i.tipo === "PARTIDA" ? (i.parcial?.toString() ?? null) : null,
    })),
  );

  const basePorCodigo = new Map(
    baseAportante.map((n) => [n.codigo, n.parcial!]),
  );

  // `_sum` es null cuando no hay ninguna fila, que es el caso de la primera
  // obra sin movimientos. `sumar` no lo tolera: `escalar` hace `.trim()`.
  const ajustePorId = new Map(
    ajustesPorPartida.map((a) => [
      a.wbsItemId ?? "",
      a._sum.importe?.toString() ?? "0.00",
    ]),
  );

  const partidas: PartidaVigente[] = partidasVivas
    .filter((p) => p.tipo === "PARTIDA")
    .map((p) => {
      // `sumar` normaliza a dos decimales. Prisma devuelve "10000" y no
      // "10000.00", y mezclar las dos formas en la misma columna se nota.
      const base = sumar([basePorCodigo.get(p.codigoPartida) ?? "0"]);
      const ajustes = sumar([ajustePorId.get(p.id) ?? "0"]);
      return {
        wbsItemId: p.id,
        codigoPartida: p.codigoPartida,
        descripcion: p.descripcion,
        modalidad: p.modalidad,
        nivel: p.nivel,
        base,
        ajustes,
        vigente: sumar([base, ajustes]),
        esAdicional: p.origenMovimientoId !== null,
      };
    });

  // Dinero de la linea base cuya partida ya no existe: cuenta en el total
  // pero nadie puede moverlo. Se informa en vez de esconderlo.
  const vivasPorCodigo = new Set(partidasVivas.map((p) => p.codigoPartida));
  const codigosSinPartida = [...basePorCodigo.keys()].filter(
    (c) => !vivasPorCodigo.has(c),
  );

  // Entradas y salidas son para MOSTRAR cuanto dinero entro y cuanto salio,
  // asi que aqui si manda el signo del apunte.
  const todosLosAjustes = partidas.map((p) => p.ajustes);
  const totalEntradas = sumar(todosLosAjustes.filter(esPositivo));
  const totalSalidas = sumar(todosLosAjustes.filter(esNegativo));

  /**
   * Para la CASCADA, en cambio, cada ajuste va al cajon de la partida que
   * ajusta, no al que dicte su propio signo.
   *
   * Sacar 2.000 de una partida de costo no es un descuento comercial: es
   * menos costo. Repartir por el signo del apunte metia esos 2.000 en los
   * descuentos y el costo directo vigente salia inflado en la misma cantidad
   * (el total cuadraba igual, que es lo que hacia el fallo dificil de ver).
   *
   * Una partida es de descuento si su BASE es negativa. Las nacidas de un
   * adicional tienen base cero y son de costo.
   */
  const ajustesDeCosto = sumar(
    partidas.filter((p) => !esNegativo(p.base)).map((p) => p.ajustes),
  );
  const ajustesDeDescuento = sumar(
    partidas.filter((p) => esNegativo(p.base)).map((p) => p.ajustes),
  );

  const cascadaBase = calcularCascada({
    costoDirecto: base.costoDirecto.toString(),
    descuentos: base.descuentos.toString(),
    porcentajeGastosGenerales: base.porcentajeGastosGenerales.toString(),
    porcentajeUtilidad: base.porcentajeUtilidad.toString(),
    porcentajeIgv: base.porcentajeIgv.toString(),
  });

  /**
   * Los porcentajes son los de la linea base a proposito: gastos generales y
   * utilidad son terminos del contrato y no se renegocian por un adicional.
   */
  const cascadaVigente = calcularCascada({
    costoDirecto: sumar([base.costoDirecto.toString(), ajustesDeCosto]),
    descuentos: sumar([base.descuentos.toString(), ajustesDeDescuento]),
    porcentajeGastosGenerales: base.porcentajeGastosGenerales.toString(),
    porcentajeUtilidad: base.porcentajeUtilidad.toString(),
    porcentajeIgv: base.porcentajeIgv.toString(),
  });

  /**
   * Comprobacion de cuadre.
   *
   * Se compara la suma de las bases contra las COLUMNAS guardadas en la
   * linea base, nunca contra un recalculo: si los dos lados salieran del
   * mismo desglose cuadrarian siempre y mentirian juntos.
   */
  const sumaDeBases = sumar([...basePorCodigo.values()]);
  const guardadoEnLineaBase = sumar([
    base.costoDirecto.toString(),
    base.descuentos.toString(),
  ]);
  // Con el `restar` de decimal. Antes se negaba a mano el sustraendo para
  // sumarlo, porque el modulo no tenia resta; ya la tiene, y una sola
  // implementacion es lo que evita que cada sitio la resuelva a su manera.
  const descuadreBase = restar(sumaDeBases, guardadoEnLineaBase) ?? "0.00";

  return {
    baselineId: base.id,
    version: base.version,
    cascadaBase,
    cascadaVigente,
    partidas,
    totalEntradas,
    totalSalidas,
    descuadreBase,
    codigosSinPartida,
  };
}

// ---------------------------------------------------------------------------
// Alta de movimientos
// ---------------------------------------------------------------------------

/** Ajuste sobre una partida que ya existe. */
export interface LineaSobrePartida {
  wbsItemId: string;
  /// Positivo entra, negativo sale. Nunca cero.
  importe: string;
  justificacion?: string;
}

/**
 * Alta de una partida que no esta en el presupuesto contratado.
 *
 * `parentId` debe ser un CAPITULO. Si colgara de una partida con importe
 * propio, esa partida quedaria "cubierta" por la nueva y su importe
 * desapareceria del costo directo.
 */
export interface LineaNuevaPartida {
  parentId: string;
  codigoPartida: string;
  descripcion: string;
  unidad?: string;
  metrado?: string;
  precioUnitario?: string;
  modalidad?: ModalidadPartida;
  importe: string;
  justificacion?: string;
}

export type LineaEntrada = LineaSobrePartida | LineaNuevaPartida;

const esNuevaPartida = (l: LineaEntrada): l is LineaNuevaPartida =>
  "codigoPartida" in l;

export interface DatosMovimiento {
  tipo: TipoMovimiento;
  fecha: string;
  concepto: string;
  motivo: string;
  referencia?: string;
  lineas: LineaEntrada[];
}

export type ResultadoMovimiento =
  | { ok: true; id: string; numero: number }
  | { ok: false; error: string };

/**
 * Reglas de composicion segun el tipo. Se valida DESPUES de resolver las
 * partidas, no antes: hasta entonces las lineas nuevas no tienen codigo.
 */
function validarComposicion(
  tipo: TipoMovimiento,
  importes: string[],
): string | null {
  if (importes.length === 0) return "El movimiento no tiene ninguna linea.";

  const entradas = importes.filter(esPositivo);
  const salidas = importes.filter(esNegativo);

  if (tipo === "RECONVERSION") {
    if (entradas.length === 0 || salidas.length === 0) {
      return "Una reconversion mueve dinero: necesita al menos una partida que aporte y otra que reciba.";
    }
    const neto = sumar(importes);
    // `esCero` y no `!esPositivo && !esNegativo`: esa formula da true tambien
    // para un importe corrupto, y dejaria aprobar una reconversion
    // descuadrada.
    if (!esCero(neto)) {
      return `Una reconversion tiene que sumar cero y esta suma ${neto}. Ajusta los importes.`;
    }
  }

  if (tipo === "ADICIONAL" && salidas.length > 0) {
    return "Un adicional solo aumenta: no puede llevar lineas negativas. Para reducir, usa un deductivo.";
  }

  if (tipo === "DEDUCTIVO" && entradas.length > 0) {
    return "Un deductivo solo reduce: no puede llevar lineas positivas. Para aumentar, usa un adicional.";
  }

  return null;
}

/** Comprobaciones baratas sobre lo que llego, antes de tocar la base. */
function validarEntrada(datos: DatosMovimiento): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) {
    return "Indica la fecha del documento que respalda el movimiento.";
  }
  if (!datos.concepto.trim()) return "Indica un concepto.";
  if (!datos.motivo.trim()) return "Explica por que procede este movimiento.";
  if (datos.lineas.length === 0) return "Anade al menos una linea.";

  const nuevas = datos.lineas.filter(esNuevaPartida);
  if (nuevas.length > 0 && datos.tipo !== "ADICIONAL") {
    return "Solo un adicional puede dar de alta partidas nuevas.";
  }

  const codigosNuevos = nuevas.map((l) => l.codigoPartida.trim());
  if (new Set(codigosNuevos).size !== codigosNuevos.length) {
    return "Hay dos partidas nuevas con el mismo codigo en este movimiento.";
  }
  for (const codigo of codigosNuevos) {
    if (!/^\d+(\.\d+)*$/.test(codigo)) {
      return `El codigo "${codigo}" no tiene el formato de una partida (1, 2.03, 7.02.01).`;
    }
  }

  const existentes = datos.lineas.filter((l) => !esNuevaPartida(l));
  const ids = existentes.map((l) => (l as LineaSobrePartida).wbsItemId);
  if (new Set(ids).size !== ids.length) {
    return "Hay dos lineas sobre la misma partida. Junta los importes en una.";
  }

  return null;
}

/**
 * Crea un movimiento en BORRADOR.
 *
 * Las partidas nuevas NO se crean aqui: se guardan como propuesta en la
 * linea y nacen al aprobar. Asi un borrador descartado no deja partidas
 * fantasma en un arbol que la linea base congelada impide limpiar.
 */
export async function crearMovimiento(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosMovimiento,
): Promise<ResultadoMovimiento> {
  if (!puede(sesion, "movimiento:crear")) {
    return { ok: false, error: "No tienes permiso para crear movimientos." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const errorEntrada = validarEntrada(datos);
  if (errorEntrada) return { ok: false, error: errorEntrada };

  const base = await lineaBaseAprobada(sesion.companyId, obraId);
  if (!base) {
    return {
      ok: false,
      error:
        "La obra no tiene una linea base aprobada. Los movimientos van encima de ella: aprueba primero el presupuesto.",
    };
  }

  // --- Normalizar importes con la aritmetica exacta ----------------------
  const importes: string[] = [];
  for (const linea of datos.lineas) {
    const importe = normalizarDecimal(linea.importe, 2);
    if (importe === null) {
      return { ok: false, error: `El importe "${linea.importe}" no es un numero valido.` };
    }
    if (esCero(importe)) {
      return { ok: false, error: "Una linea con importe cero no ajusta nada. Quitala." };
    }
    importes.push(importe);
  }

  const errorComposicion = validarComposicion(datos.tipo, importes);
  if (errorComposicion) return { ok: false, error: errorComposicion };

  // --- Comprobar las partidas afectadas ----------------------------------
  const idsAfectados = datos.lineas
    .filter((l): l is LineaSobrePartida => !esNuevaPartida(l))
    .map((l) => l.wbsItemId);

  const idsPadre = datos.lineas
    .filter(esNuevaPartida)
    .map((l) => l.parentId);

  const referidas = await prisma.wbsItem.findMany({
    where: {
      id: { in: [...idsAfectados, ...idsPadre] },
      projectId: obraId,
      project: { companyId: sesion.companyId },
    },
    select: { id: true, codigoPartida: true, tipo: true, modalidad: true },
  });
  const porId = new Map(referidas.map((p) => [p.id, p]));

  for (const [i, linea] of datos.lineas.entries()) {
    if (esNuevaPartida(linea)) {
      const padre = porId.get(linea.parentId);
      if (!padre) {
        return { ok: false, error: "El capitulo elegido no existe en esta obra." };
      }
      // Colgar de una partida con importe propio la dejaria "cubierta" por
      // la nueva, y su importe desapareceria del costo directo.
      if (padre.tipo !== "CAPITULO") {
        return {
          ok: false,
          error: `Una partida nueva tiene que colgar de un capitulo, y "${padre.codigoPartida}" es una partida. Elige el capitulo que la contiene.`,
        };
      }
      continue;
    }

    const partida = porId.get(linea.wbsItemId);
    if (!partida) {
      return { ok: false, error: "Una de las partidas elegidas no existe en esta obra." };
    }
    if (partida.tipo !== "PARTIDA") {
      return {
        ok: false,
        error: `"${partida.codigoPartida}" es un capitulo. El dinero se ajusta en las partidas, no en los capitulos.`,
      };
    }
    // Una partida a suma alzada tiene el precio cerrado por contrato:
    // sacarle dinero produciria un vigente que no se puede facturar.
    if (partida.modalidad === "SUMA_ALZADA" && esNegativo(importes[i]!)) {
      return {
        ok: false,
        error: `"${partida.codigoPartida}" esta contratada a suma alzada: su precio esta cerrado y no se le puede quitar dinero. Registralo como deductivo con el cliente.`,
      };
    }
    if (partida.modalidad === "ALCANCE") {
      return {
        ok: false,
        error: `"${partida.codigoPartida}" solo detalla el alcance de otra partida y no lleva importe propio. Ajusta la partida padre.`,
      };
    }
  }

  // Los codigos propuestos no pueden chocar con partidas existentes. Se
  // vuelve a comprobar al aprobar: entre medias puede aparecer otro.
  const codigosNuevos = datos.lineas.filter(esNuevaPartida).map((l) => l.codigoPartida.trim());
  if (codigosNuevos.length > 0) {
    const ocupados = await prisma.wbsItem.findMany({
      where: { projectId: obraId, codigoPartida: { in: codigosNuevos } },
      select: { codigoPartida: true },
    });
    if (ocupados.length > 0) {
      return {
        ok: false,
        error: `El codigo "${ocupados[0]!.codigoPartida}" ya existe en el presupuesto. Elige otro.`,
      };
    }
  }

  const totalEntradas = sumar(importes.filter(esPositivo));
  const totalSalidas = sumar(importes.filter(esNegativo));
  const importeNeto = sumar(importes);

  const creado = await prisma.$transaction(async (tx) => {
    const ultimo = await tx.movimientoPresupuestal.findFirst({
      where: { projectId: obraId },
      orderBy: { numero: "desc" },
      select: { numero: true },
    });
    const numero = (ultimo?.numero ?? 0) + 1;

    const movimiento = await tx.movimientoPresupuestal.create({
      data: {
        projectId: obraId,
        baselineId: base.id,
        numero,
        tipo: datos.tipo,
        estado: "BORRADOR",
        fecha: new Date(datos.fecha),
        concepto: datos.concepto.trim(),
        motivo: datos.motivo.trim(),
        referencia: datos.referencia?.trim() || null,
        totalEntradas,
        totalSalidas,
        importeNeto,
        lineas: {
          create: datos.lineas.map((linea, i) =>
            esNuevaPartida(linea)
              ? {
                  importe: importes[i]!,
                  justificacion: linea.justificacion?.trim() || null,
                  modalidad: linea.modalidad ?? "PRECIOS_UNITARIOS",
                  nuevoCodigo: linea.codigoPartida.trim(),
                  nuevaDescripcion: linea.descripcion.trim(),
                  nuevaUnidad: linea.unidad?.trim() || null,
                  nuevoMetrado: linea.metrado
                    ? normalizarDecimal(linea.metrado, 4)
                    : null,
                  nuevoPrecio: linea.precioUnitario
                    ? normalizarDecimal(linea.precioUnitario, 4)
                    : null,
                  nuevoParentId: linea.parentId,
                }
              : {
                  wbsItemId: linea.wbsItemId,
                  codigoPartida: porId.get(linea.wbsItemId)!.codigoPartida,
                  modalidad: porId.get(linea.wbsItemId)!.modalidad,
                  importe: importes[i]!,
                  justificacion: linea.justificacion?.trim() || null,
                },
          ),
        },
      },
      select: { id: true, numero: true },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "MovimientoPresupuestal",
        entidadId: movimiento.id,
        accion: "CREATE",
        despues: {
          numero: movimiento.numero,
          tipo: datos.tipo,
          lineas: datos.lineas.length,
          totalEntradas,
          totalSalidas,
          importeNeto,
        },
      },
    });

    return movimiento;
  });

  return { ok: true, id: creado.id, numero: creado.numero };
}

// ---------------------------------------------------------------------------
// Aprobacion
// ---------------------------------------------------------------------------

/** Se lanza dentro de la transaccion; se traduce a un error legible fuera. */
class FalloAprobacion extends Error {}

export type ResultadoAprobacion =
  | { ok: true; numero: number }
  | { ok: false; error: string };

/**
 * Aprueba un movimiento y lo incorpora al presupuesto vigente.
 *
 * IRREVERSIBLE por diseno, como aprobar una revision: los indicadores se
 * miden contra el vigente y poder deshacerlo los recalcularia hacia atras.
 * Un movimiento equivocado se corrige registrando otro de signo contrario.
 *
 * Aqui es donde nacen las partidas de un adicional. Se crean dentro de la
 * transaccion, no al guardar el borrador, para que un borrador descartado no
 * deje partidas fantasma.
 */
export async function aprobarMovimiento(
  sesion: SesionActiva,
  movimientoId: string,
): Promise<ResultadoAprobacion> {
  if (!puede(sesion, "movimiento:aprobar")) {
    return {
      ok: false,
      error: "No tienes permiso para aprobar movimientos presupuestales.",
    };
  }

  const aprobadoPor = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`
    .trim()
    .slice(0, 150);

  try {
    const numero = await prisma.$transaction(async (tx) => {
      const mov = await tx.movimientoPresupuestal.findFirst({
        where: { id: movimientoId, project: { companyId: sesion.companyId } },
        select: {
          id: true, projectId: true, baselineId: true, numero: true,
          tipo: true, estado: true,
          lineas: {
            select: {
              id: true, wbsItemId: true, importe: true, modalidad: true,
              nuevoCodigo: true, nuevaDescripcion: true, nuevaUnidad: true,
              nuevoMetrado: true, nuevoPrecio: true, nuevoParentId: true,
            },
          },
        },
      });

      if (!mov) throw new FalloAprobacion("Movimiento no encontrado.");
      if (mov.estado === "APROBADO") {
        throw new FalloAprobacion(`El movimiento ${mov.numero} ya estaba aprobado.`);
      }

      const cerrada = await motivoSiObraCerrada(sesion, mov.projectId);
      if (cerrada) throw new FalloAprobacion(cerrada);

      /**
       * Se serializa por obra bloqueando la fila de la linea base.
       *
       * Sin esto, dos movimientos que vacian la misma partida se aprueban a
       * la vez: cada `updateMany` bloquea SU propia fila, no una compartida,
       * y la lectura de saldos no bloquea nada. Los dos pasarian la
       * comprobacion y la partida quedaria en negativo.
       */
      await tx.$queryRaw`SELECT id FROM baselines WHERE id = ${mov.baselineId} FOR UPDATE`;

      // --- Nacen las partidas propuestas ---------------------------------
      for (const linea of mov.lineas) {
        if (!linea.nuevoCodigo || !linea.nuevoParentId) continue;

        const choque = await tx.wbsItem.findFirst({
          where: { projectId: mov.projectId, codigoPartida: linea.nuevoCodigo },
          select: { id: true },
        });
        if (choque) {
          throw new FalloAprobacion(
            `El codigo "${linea.nuevoCodigo}" ya lo ocupa otra partida. Edita el borrador y elige otro.`,
          );
        }

        const padre = await tx.wbsItem.findFirst({
          where: { id: linea.nuevoParentId, projectId: mov.projectId },
          select: { id: true, nivel: true, orden: true, tipo: true },
        });
        if (!padre || padre.tipo !== "CAPITULO") {
          throw new FalloAprobacion(
            "El capitulo de una partida nueva ya no existe o dejo de ser un capitulo.",
          );
        }

        // Se inserta justo detras del capitulo, abriendo hueco en el orden
        // igual que hace `crearPartida`.
        const orden = padre.orden + 1;
        await tx.wbsItem.updateMany({
          where: { projectId: mov.projectId, orden: { gte: orden } },
          data: { orden: { increment: 1 } },
        });

        const creada = await tx.wbsItem.create({
          data: {
            projectId: mov.projectId,
            parentId: padre.id,
            origenMovimientoId: mov.id,
            codigoPartida: linea.nuevoCodigo,
            tipo: "PARTIDA",
            descripcion: linea.nuevaDescripcion ?? linea.nuevoCodigo,
            modalidad: linea.modalidad ?? "PRECIOS_UNITARIOS",
            nivel: padre.nivel + 1,
            orden,
            unidad: linea.nuevaUnidad,
            metrado: linea.nuevoMetrado,
            precioUnitario: linea.nuevoPrecio,
            // `parcial` queda NULO a proposito: el dinero de esta partida
            // vive en la linea del movimiento. Ponerlo aqui lo contaria
            // tambien en el arbol vivo y la cifra saldria dos veces.
            parcial: null,
          },
          select: { id: true, codigoPartida: true },
        });

        await tx.movimientoLinea.update({
          where: { id: linea.id },
          data: { wbsItemId: creada.id, codigoPartida: creada.codigoPartida },
        });
      }

      /**
       * Ninguna partida puede cambiar de signo por un movimiento.
       *
       * Una partida de costo no puede quedar en negativo (seria un descuento
       * que nadie pacto), y un descuento no puede cruzar a positivo (dejaria
       * de ajustar a su padre y pasaria a cubrirlo, borrando el importe del
       * padre del costo directo). Se comprueban las DOS direcciones, y el
       * caso base cero aparte: las partidas nacidas de un adicional lo tienen.
       */
      const lineasFrescas = await tx.movimientoLinea.findMany({
        where: { movimientoId: mov.id },
        select: { wbsItemId: true, importe: true, codigoPartida: true },
      });

      const itemsBase = await tx.baselineItem.findMany({
        where: { baselineId: mov.baselineId },
        orderBy: { orden: "asc" },
        select: { codigoPartida: true, tipo: true, parcial: true },
      });
      const basePorCodigo = new Map(
        aportantes(
          itemsBase.map((i) => ({
            codigo: i.codigoPartida,
            parcial: i.tipo === "PARTIDA" ? (i.parcial?.toString() ?? null) : null,
          })),
        ).map((n) => [n.codigo, n.parcial!]),
      );

      const yaAprobados = await tx.movimientoLinea.groupBy({
        by: ["wbsItemId"],
        where: {
          movimiento: { baselineId: mov.baselineId, estado: "APROBADO" },
        },
        _sum: { importe: true },
      });
      const aprobadoPorId = new Map(
        yaAprobados.map((a) => [a.wbsItemId ?? "", a._sum.importe?.toString() ?? "0.00"]),
      );

      for (const linea of lineasFrescas) {
        if (!linea.wbsItemId) continue;
        const base = basePorCodigo.get(linea.codigoPartida ?? "") ?? "0.00";
        const previo = aprobadoPorId.get(linea.wbsItemId) ?? "0.00";
        const vigente = sumar([base, previo, linea.importe.toString()]);

        const eraDescuento = esNegativo(base);
        if (eraDescuento && esPositivo(vigente)) {
          throw new FalloAprobacion(
            `"${linea.codigoPartida}" es un descuento y este movimiento lo dejaria en positivo (${vigente}). Un descuento que cruza a positivo deja de ajustar a su capitulo y le borra el importe.`,
          );
        }
        if (!eraDescuento && esNegativo(vigente)) {
          throw new FalloAprobacion(
            `"${linea.codigoPartida}" quedaria en ${vigente}. No se puede sacar de una partida mas de lo que tiene.`,
          );
        }
      }

      // Los totales se RECALCULAN desde las lineas, no se confia en los que
      // guardo el borrador: entre medias pudieron editarse.
      const importes = lineasFrescas.map((l) => l.importe.toString());
      const totalEntradas = sumar(importes.filter(esPositivo));
      const totalSalidas = sumar(importes.filter(esNegativo));
      const importeNeto = sumar(importes);

      const errorComposicion = validarComposicion(mov.tipo, importes);
      if (errorComposicion) throw new FalloAprobacion(errorComposicion);

      // La condicion sobre el estado cierra la carrera de dos pulsaciones:
      // la segunda no encuentra fila que cambiar.
      const { count } = await tx.movimientoPresupuestal.updateMany({
        where: { id: mov.id, estado: "BORRADOR" },
        data: {
          estado: "APROBADO",
          aprobadoAt: new Date(),
          aprobadoPor,
          totalEntradas,
          totalSalidas,
          importeNeto,
        },
      });
      if (count === 0) {
        throw new FalloAprobacion(`El movimiento ${mov.numero} ya estaba aprobado.`);
      }

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: mov.projectId,
          entidad: "MovimientoPresupuestal",
          entidadId: mov.id,
          accion: "APPROVE",
          antes: { estado: "BORRADOR" },
          despues: {
            numero: mov.numero,
            tipo: mov.tipo,
            aprobadoPor,
            totalEntradas,
            totalSalidas,
            importeNeto,
          },
        },
      });

      return mov.numero;
    });

    return { ok: true, numero };
  } catch (e) {
    if (e instanceof FalloAprobacion) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Consulta y borrado de borradores
// ---------------------------------------------------------------------------

export interface MovimientoResumen {
  id: string;
  numero: number;
  tipo: TipoMovimiento;
  aprobado: boolean;
  aprobadoAt: Date | null;
  aprobadoPor: string | null;
  fecha: Date;
  concepto: string;
  motivo: string;
  referencia: string | null;
  totalEntradas: string;
  totalSalidas: string;
  importeNeto: string;
  lineas: {
    codigoPartida: string | null;
    descripcion: string;
    importe: string;
    esNueva: boolean;
  }[];
}

/**
 * El historial de movimientos, paginado. Cada uno arrastra todas sus lineas.
 *
 * El `total` es el de todos, no el de la pagina. El vigente por partida no
 * sale de aqui —lo calcula `obtenerPresupuestoVigente` sobre los movimientos
 * aprobados—, asi que paginar el historial no toca ninguna cifra.
 */
export async function listarMovimientos(
  sesion: SesionActiva,
  obraId: string,
  opciones: { pagina?: string; porPagina?: number } = {},
): Promise<Pagina<MovimientoResumen>> {
  const porPagina = opciones.porPagina ?? POR_PAGINA;

  if (!puede(sesion, "movimiento:leer")) {
    return { filas: [], total: 0, pagina: 1, totalPaginas: 1 };
  }

  const where = {
    projectId: obraId,
    project: { companyId: sesion.companyId },
  };

  const total = await prisma.movimientoPresupuestal.count({ where });
  const totalPaginas = contarPaginas(total, porPagina);
  const pagina = normalizarPagina(opciones.pagina, totalPaginas);

  const filas = await prisma.movimientoPresupuestal.findMany({
    where,
    orderBy: { numero: "desc" },
    skip: saltar(pagina, porPagina),
    take: porPagina,
    select: {
      id: true, numero: true, tipo: true, estado: true,
      aprobadoAt: true, aprobadoPor: true, fecha: true,
      concepto: true, motivo: true, referencia: true,
      totalEntradas: true, totalSalidas: true, importeNeto: true,
      lineas: {
        orderBy: { createdAt: "asc" },
        select: {
          codigoPartida: true, importe: true, nuevoCodigo: true,
          nuevaDescripcion: true,
          partida: { select: { descripcion: true } },
        },
      },
    },
  });

  const resumenes = filas.map((m) => ({
    id: m.id,
    numero: m.numero,
    tipo: m.tipo,
    aprobado: m.estado === "APROBADO",
    aprobadoAt: m.aprobadoAt,
    aprobadoPor: m.aprobadoPor,
    fecha: m.fecha,
    concepto: m.concepto,
    motivo: m.motivo,
    referencia: m.referencia,
    totalEntradas: m.totalEntradas.toString(),
    totalSalidas: m.totalSalidas.toString(),
    importeNeto: m.importeNeto.toString(),
    lineas: m.lineas.map((l) => ({
      codigoPartida: l.codigoPartida ?? l.nuevoCodigo,
      descripcion: l.partida?.descripcion ?? l.nuevaDescripcion ?? "",
      importe: l.importe.toString(),
      esNueva: l.nuevoCodigo !== null,
    })),
  }));

  return { filas: resumenes, total, pagina, totalPaginas };
}

/**
 * Elimina un movimiento en BORRADOR. Un aprobado no se toca: se corrige con
 * otro de signo contrario.
 *
 * Las partidas que el borrador hubiera propuesto se van con el por la
 * cascada de `origenMovimientoId`, pero en un borrador todavia no existen.
 */
export async function eliminarBorrador(
  sesion: SesionActiva,
  movimientoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!puede(sesion, "movimiento:crear")) {
    return { ok: false, error: "No tienes permiso para eliminar movimientos." };
  }

  const mov = await prisma.movimientoPresupuestal.findFirst({
    where: { id: movimientoId, project: { companyId: sesion.companyId } },
    select: { id: true, projectId: true, numero: true, estado: true },
  });

  if (!mov) return { ok: false, error: "Movimiento no encontrado." };
  if (mov.estado === "APROBADO") {
    return {
      ok: false,
      error: `El movimiento ${mov.numero} esta aprobado y no se puede eliminar. Registra otro de signo contrario para corregirlo.`,
    };
  }

  const cerrada = await motivoSiObraCerrada(sesion, mov.projectId);
  if (cerrada) return { ok: false, error: cerrada };

  await prisma.$transaction(async (tx) => {
    await tx.movimientoPresupuestal.delete({ where: { id: mov.id } });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: mov.projectId,
        entidad: "MovimientoPresupuestal",
        entidadId: mov.id,
        accion: "DELETE",
        antes: { numero: mov.numero, estado: "BORRADOR" },
      },
    });
  });

  return { ok: true };
}
