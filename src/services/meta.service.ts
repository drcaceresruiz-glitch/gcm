import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import {
  normalizarDecimal,
  sumar,
  restar,
  multiplicar,
  esPositivo,
} from "@/lib/decimal";
import { subtotalesPorRama } from "@/lib/jerarquia-partidas";
import {
  calcularBolsa,
  desfaseDeMeta,
  resumenGastosGenerales,
  type Bolsa,
  type Desfase,
  type EntradaGasto,
  type LineaContractual,
  type LineaMeta,
  type ModoMeta,
} from "@/lib/bolsa";
import {
  obtenerPresupuestoVigente,
  SinLineaBaseError,
} from "@/services/movimientos.service";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import {
  lineasMasLargasQueLaObra,
  type LineaLarga,
} from "@/lib/gastos-contra-plazo";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Presupuesto meta de la obra: lo que la empresa se compromete a gastar.
 *
 * Espeja `revisiones.service` —versiones, congelado con `aprobadaAt`, mismo
 * patron de auditoria— con UNA diferencia deliberada: aqui SI se puede crear
 * una version nueva despues de aprobar la anterior.
 *
 * En el contractual eso esta prohibido, y con razon: una vez firmada, la
 * linea base es un contrato y los cambios van como adicionales encima. La
 * meta no es un contrato con nadie: es la promesa interna, y tiene que poder
 * rehacerse cuando el alcance cambia. Si no pudiera, la llegada de un
 * adicional dejaria la meta desfasada PARA SIEMPRE y la bolsa exagerando sin
 * remedio. Re-fijarla es justo la respuesta a ese desfase.
 */

export interface MetaResumen {
  id: string;
  version: number;
  modo: ModoMeta;
  fechaMeta: Date;
  costoDirecto: string;
  gastosGenerales: string;
  costoTotal: string;
  mesesPlazo: string;
  /// null si la meta nacio antes que el contractual: no se fijo contra nada.
  baselineVersion: number | null;
  movimientosAlFijar: number;
  aprobada: boolean;
  aprobadaAt: Date | null;
  aprobadaPor: string | null;
  creadaPor: string;
  notas: string | null;
  totalItems: number;
}

/** Las versiones de la meta, de la mas nueva a la mas vieja. */
export async function listarMetas(
  sesion: SesionActiva,
  obraId: string,
): Promise<MetaResumen[]> {
  if (!puede(sesion, "meta:leer")) return [];

  const filas = await prisma.presupuestoMeta.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: { version: "desc" },
    include: { _count: { select: { items: true } } },
  });

  return filas.map((m) => ({
    id: m.id,
    version: m.version,
    modo: m.modo as ModoMeta,
    fechaMeta: m.fechaMeta,
    costoDirecto: m.costoDirecto.toString(),
    gastosGenerales: m.gastosGenerales.toString(),
    costoTotal: m.costoTotal.toString(),
    mesesPlazo: m.mesesPlazo.toString(),
    baselineVersion: m.baselineVersion,
    movimientosAlFijar: m.movimientosAlFijar,
    aprobada: m.aprobadaAt !== null,
    aprobadaAt: m.aprobadaAt,
    aprobadaPor: m.aprobadaPor,
    creadaPor: m.creadaPor,
    notas: m.notas,
    totalItems: m._count.items,
  }));
}

/**
 * La meta que manda: la aprobada de version mas alta; si no hay ninguna
 * aprobada, el ultimo borrador.
 *
 * Se elige la APROBADA aunque exista un borrador mas nuevo, al contrario que
 * en la linea base. Un borrador de meta es trabajo en curso —alguien esta
 * recalculando el costo— y hasta que se congela no puede gobernar la bolsa
 * que se ensena en el tablero.
 */
export async function metaQueManda(companyId: string, obraId: string) {
  const donde = { projectId: obraId, project: { companyId } };

  const aprobada = await prisma.presupuestoMeta.findFirst({
    where: { ...donde, aprobadaAt: { not: null } },
    orderBy: { version: "desc" },
  });
  if (aprobada) return aprobada;

  return prisma.presupuestoMeta.findFirst({
    where: donde,
    orderBy: { version: "desc" },
  });
}

/**
 * Meses entre dos fechas, a razon de 30 dias por mes.
 *
 * Es una convencion de COSTEO, no un calendario: sirve para comparar el plazo
 * que presupuesto la meta con el que dice el cronograma, y para poner precio
 * a la diferencia. No se guarda en ninguna parte ni sale en un documento.
 */
function mesesEntre(inicio: Date, fin: Date): string {
  const dias = (fin.getTime() - inicio.getTime()) / 86_400_000;
  return normalizarDecimal(dias / 30, 2) ?? "0.00";
}

export interface AvisoPlazo {
  /// Meses con los que la meta presupuesto sus gastos generales.
  mesesMeta: string;
  /// Meses que dice hoy el cronograma de la obra.
  mesesProgramados: string;
  /// Meses de mas (positivo) o de menos (negativo).
  desviacion: string;
  /// Lo que cuesta cada mes de mas: la suma de los gastos VARIABLES.
  costeMensual: string;
  /// desviacion x costeMensual. Gasto de sostenimiento que la meta no
  /// presupuesto y que, a diferencia del de produccion, no se puede recuperar
  /// trabajando mejor: solo terminando antes.
  sobrecosto: string;
  hay: boolean;
}

export interface ComparacionMeta {
  meta: MetaResumen;
  bolsa: Bolsa;
  /// Gastos generales que duran mas que la obra. Vacio = todos cuadran.
  lineasLargas: LineaLarga[];
  /// El plazo de la obra, en meses, contra el que se comparan.
  mesesObra: string;
  /// Cuanto exagera la bolsa por movimientos aprobados despues de fijarla.
  desfase: Desfase;
  plazo: AvisoPlazo;
}

export type ResultadoComparacion =
  | { ok: true; comparacion: ComparacionMeta }
  | { ok: false; error: string };

/**
 * El lado contractual, al nivel que pide el modo.
 *
 * En CAPITULO no se recorta el codigo por los puntos para adivinar el
 * capitulo: se usa `subtotalesPorRama`, que sube por la cadena REAL de padres.
 * En los presupuestos de verdad faltan filas intermedias y hay cabeceras
 * terminadas en ceros, y adivinar por el codigo es exactamente el error que
 * ya salio caro en el mapeo de tareas.
 */
async function lineasContractuales(
  modo: ModoMeta,
  obraId: string,
  partidas: readonly {
    wbsItemId: string;
    codigoPartida: string;
    descripcion: string;
    vigente: string;
  }[],
): Promise<LineaContractual[]> {
  if (modo !== "CAPITULO") {
    return partidas.map((p) => ({
      codigo: p.codigoPartida,
      descripcion: p.descripcion,
      importe: p.vigente,
    }));
  }

  const todos = await prisma.wbsItem.findMany({
    where: { projectId: obraId },
    orderBy: { orden: "asc" },
    select: { codigoPartida: true, descripcion: true, tipo: true, nivel: true },
  });

  const vigentePorCodigo = new Map(
    partidas.map((p) => [p.codigoPartida, p.vigente]),
  );

  const subtotales = subtotalesPorRama(
    todos.map((t) => ({
      codigo: t.codigoPartida,
      // Solo las partidas aportan importe, y el que aportan es el VIGENTE
      // (base mas adicionales), no el de la linea base.
      parcial: t.tipo === "PARTIDA"
        ? (vigentePorCodigo.get(t.codigoPartida) ?? "0.00")
        : null,
    })),
  );

  // Solo las raices: la suma de sus subtotales es exactamente el costo
  // directo de la obra, invariante que fija una prueba de `jerarquia-partidas`.
  // Bajar de ahi contaria el mismo dinero dos veces.
  return todos
    .filter((t) => t.nivel === 0)
    .map((t) => ({
      codigo: t.codigoPartida,
      descripcion: t.descripcion,
      importe: subtotales.get(t.codigoPartida) ?? "0.00",
    }));
}

/**
 * La bolsa de la obra: meta contra presupuesto vigente.
 *
 * Contra el VIGENTE y no contra la base, para que los adicionales cuenten. El
 * efecto secundario —que una meta vieja frente a adicionales nuevos exagere la
 * bolsa— se mide y se devuelve en `desfase`, no se esconde.
 */
export async function compararConContractual(
  sesion: SesionActiva,
  obraId: string,
): Promise<ResultadoComparacion> {
  if (!puede(sesion, "meta:leer")) {
    return { ok: false, error: "No tienes permiso para ver el presupuesto meta." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: {
        id: true,
        fechaInicio: true,
        fechaFinProgramada: true,
        metaIncluyeGastosGenerales: true,
      },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const meta = await metaQueManda(sesion.companyId, obraId);
  if (!meta) {
    return { ok: false, error: "Esta obra todavia no tiene presupuesto meta." };
  }

  let vigente;
  try {
    vigente = await obtenerPresupuestoVigente(sesion, obraId);
  } catch (e) {
    if (e instanceof SinLineaBaseError) {
      return {
        ok: false,
        error:
          "La obra no tiene linea base aprobada: sin presupuesto contractual " +
          "no hay contra que comparar la meta.",
      };
    }
    throw e;
  }

  const modo = meta.modo as ModoMeta;

  // La tabla de gastos generales quedo DORMIDA: ni se escribe ni se lee.
  const [items] = await Promise.all([
    prisma.presupuestoMetaItem.findMany({
      where: { presupuestoMetaId: meta.id },
      orderBy: { orden: "asc" },
      // Siempre, no solo en FRENTE: un `include` condicional deja el tipo en
      // `unknown` y obliga a castear. Fuera de FRENTE la tabla de reparto
      // esta vacia para esta meta, asi que la union no cuesta nada.
      include: { reparto: true },
    }),
  ]);

  // El reparto de un frente se pondera con el importe VIGENTE de cada
  // partida, no con el parcial de la linea base: si no, un adicional sobre
  // una partida repartida no llegaria nunca al frente que la ejecuta.
  const vigentePorId = new Map(
    vigente.partidas.map((p) => [p.wbsItemId, p.vigente]),
  );

  const lineasMeta: LineaMeta[] = items.map((i) => ({
    codigoRef: i.codigoRef,
    descripcion: i.descripcion,
    importe: i.parcial?.toString() ?? "0.00",
    reparto: i.reparto.map((r) => ({
      parcial: vigentePorId.get(r.wbsItemId) ?? "0.00",
      fraccion: r.fraccion.toString(),
    })),
  }));

  const bolsa = calcularBolsa({
    modo,
    contractual: await lineasContractuales(modo, obraId, vigente.partidas),
    meta: lineasMeta,
    utilidadContractual: vigente.cascadaVigente.utilidad,
  });

  // Los movimientos aprobados DESPUES de fijar la meta. Se ordenan por numero
  // —el correlativo de la obra— y se saltan los que ya existian: es el mismo
  // criterio con el que se conto `movimientosAlFijar`.
  const posteriores = await prisma.movimientoPresupuestal.findMany({
    where: { projectId: obraId, estado: "APROBADO" },
    orderBy: { numero: "asc" },
    skip: meta.movimientosAlFijar,
    select: { importeNeto: true },
  });

  const resumenGG = resumenGastosGenerales([]);

  const mesesMeta = meta.mesesPlazo.toString();
  const mesesProgramados = mesesEntre(obra.fechaInicio, obra.fechaFinProgramada);
  const desviacion = restar(mesesProgramados, mesesMeta, 2) ?? "0.00";

  const plazo: AvisoPlazo = {
    mesesMeta,
    mesesProgramados,
    desviacion,
    costeMensual: resumenGG.costeMensualDelAtraso,
    sobrecosto:
      multiplicar(desviacion, resumenGG.costeMensualDelAtraso, 2) ?? "0.00",
    hay: esPositivo(desviacion),
  };

  /**
   * Las lineas de gasto que duran mas que la obra.
   *
   * Se compara contra `mesesProgramados` —las fechas de la obra— y no contra
   * `mesesMeta`: si alguien presupuesto ocho meses en una obra de trece dias,
   * comparar contra su propio ocho no delataria nada.
   */
  // Sin gastos generales en la meta no hay lineas que puedan pasarse del
  // plazo: la lista se retiro con ellos.
  const lineasLargas = lineasMasLargasQueLaObra([], mesesProgramados);

  return {
    ok: true,
    comparacion: {
      meta: {
        id: meta.id,
        version: meta.version,
        modo,
        fechaMeta: meta.fechaMeta,
        costoDirecto: meta.costoDirecto.toString(),
        gastosGenerales: meta.gastosGenerales.toString(),
        costoTotal: meta.costoTotal.toString(),
        mesesPlazo: mesesMeta,
        baselineVersion: meta.baselineVersion,
        movimientosAlFijar: meta.movimientosAlFijar,
        aprobada: meta.aprobadaAt !== null,
        aprobadaAt: meta.aprobadaAt,
        aprobadaPor: meta.aprobadaPor,
        creadaPor: meta.creadaPor,
        notas: meta.notas,
        totalItems: items.length,
      },
      bolsa,
      desfase: desfaseDeMeta(
        posteriores.map((m) => ({ importeNeto: m.importeNeto.toString() })),
      ),
      plazo,
      lineasLargas,
      mesesObra: mesesProgramados,
    },
  };
}

export interface EntradaItemMeta {
  /// Codigo contractual que espeja. null = linea propia de la meta.
  codigoRef: string | null;
  descripcion: string;
  tipo: "CAPITULO" | "PARTIDA";
  nivel?: number;
  unidad?: string | null;
  metrado?: string | null;
  precioUnitario?: string | null;
  /// El importe de la linea. null = es un TITULO y no suma. A diferencia del
  /// contractual, aqui no hay jerarquia que resolver: cada fila lleva lo suyo
  /// y el costo directo es la suma llana de las que tienen importe.
  parcial: string | null;
  /// Solo en capitulos: % de recargo con el que se genera el contractual.
  ///
  /// OBLIGATORIO a proposito, aunque casi siempre sea null: este dato ya se
  /// perdio una vez en silencio (el importador lo leia y el mapeo de la
  /// accion no lo copiaba). Siendo obligatorio, quien construya la entrada
  /// tiene que decidir, y `tsc` senala el sitio si alguien lo olvida.
  porcentajeRecargo: string | null;
}

export interface EntradaGastoMeta {
  concepto: string;
  tipo: "FIJO" | "VARIABLE";
  /// VARIABLE.
  montoMensual?: string | null;
  /// VARIABLE. Puede ser distinto del plazo de la obra: un topografo esta
  /// tres meses de los ocho, y por eso se pide por linea.
  meses?: string | null;
  /// FIJO.
  montoFijo?: string | null;
}

export interface DatosMeta {
  modo: ModoMeta;
  fechaMeta: string;
  mesesPlazo: string;
  notas?: string | null;
  items: EntradaItemMeta[];
  gastosGenerales: EntradaGastoMeta[];
}

export type ResultadoMeta =
  | { ok: true; id: string; version: number; costoTotal: string }
  | { ok: false; error: string };

export async function crearMeta(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosMeta,
): Promise<ResultadoMeta> {
  if (!puede(sesion, "meta:crear")) {
    return { ok: false, error: "No tienes permiso para crear el presupuesto meta." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  if (datos.items.length === 0) {
    return { ok: false, error: "La meta no tiene ni una linea." };
  }

  /**
   * La linea base ya NO es obligatoria para fijar la meta.
   *
   * Antes lo era: sin contractual no habia contra que comparar. Pero desde
   * que el contractual SE GENERA a partir del real, exigir un contractual
   * para poder crear el real era pescadilla que se muerde la cola.
   *
   * Se anota la version si la hay y null si no. Null es la verdad: esta meta
   * no se fijo contra ningun contractual porque nacio antes que el. Un cero
   * mentiria, y `desfaseDeMeta` no tiene nada que medir mientras no exista
   * el otro presupuesto.
   */
  const base = await prisma.baseline.findFirst({
    where: { projectId: obraId, aprobadaAt: { not: null } },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const mesesPlazo = normalizarDecimal(datos.mesesPlazo, 2);
  if (mesesPlazo === null || !esPositivo(mesesPlazo)) {
    return { ok: false, error: "El plazo en meses tiene que ser mayor que cero." };
  }

  // Un codigo repetido significa que la misma partida esta dos veces en la
  // meta: el costo directo saldria inflado y la bolsa hundida, sin error.
  const referencias = datos.items
    .map((i) => i.codigoRef)
    .filter((c): c is string => c !== null);
  const repetido = referencias.find(
    (c, i) => referencias.indexOf(c) !== i,
  );
  if (repetido) {
    return {
      ok: false,
      error: `El codigo ${repetido} aparece dos veces en la meta.`,
    };
  }

  // LOS GASTOS GENERALES YA NO SON DE LA META (20/08/2026).
  //
  // La lista se sigue leyendo del Excel para poder AVISAR de que viene, pero
  // no entra en la meta ni en la bolsa: los gastos generales los reconoce el
  // contrato como un porcentaje y los gestiona la empresa. La tabla queda
  // dormida en el esquema para no perder lo que ya cargaron las metas viejas.
  const entradasGasto: EntradaGasto[] = [];

  const resumenGG = resumenGastosGenerales(entradasGasto);
  if (resumenGG.invalidas > 0) {
    return {
      ok: false,
      error:
        `${resumenGG.invalidas} gasto(s) general(es) estan incompletos: los ` +
        `variables necesitan monto mensual y meses; los fijos, su importe.`,
    };
  }

  const costoDirecto = sumar(
    datos.items
      .map((i) => i.parcial)
      .filter((p): p is string => p !== null && p !== ""),
  );
  const costoTotal = sumar([costoDirecto, resumenGG.total]);

  const [ultima, movimientos] = await Promise.all([
    prisma.presupuestoMeta.findFirst({
      where: { projectId: obraId },
      orderBy: { version: "desc" },
      select: { version: true },
    }),
    prisma.movimientoPresupuestal.count({
      where: { projectId: obraId, estado: "APROBADO" },
    }),
  ]);

  const version = (ultima?.version ?? 0) + 1;
  const creadaPor = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`
    .trim()
    .slice(0, 150);

  const creada = await prisma.$transaction(async (tx) => {
    const meta = await tx.presupuestoMeta.create({
      data: {
        projectId: obraId,
        version,
        modo: datos.modo,
        fechaMeta: new Date(datos.fechaMeta),
        notas: datos.notas?.trim() || null,
        costoDirecto,
        gastosGenerales: resumenGG.total,
        costoTotal,
        mesesPlazo,
        baselineVersion: base?.version ?? null,
        movimientosAlFijar: movimientos,
        creadaPor,
      },
      select: { id: true },
    });

    await tx.presupuestoMetaItem.createMany({
      data: datos.items.map((i, orden) => ({
        presupuestoMetaId: meta.id,
        codigoRef: i.codigoRef,
        descripcion: i.descripcion,
        tipo: i.tipo,
        nivel: i.nivel ?? 0,
        orden,
        unidad: i.unidad ?? null,
        metrado: i.metrado ?? null,
        precioUnitario: i.precioUnitario ?? null,
        parcial: i.parcial,
        porcentajeRecargo: i.porcentajeRecargo ?? null,
      })),
    });


    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "PresupuestoMeta",
        entidadId: meta.id,
        accion: "CREATE",
        despues: {
          version,
          modo: datos.modo,
          costoDirecto,
          gastosGenerales: resumenGG.total,
          costoTotal,
          mesesPlazo,
          baselineVersion: base?.version ?? null,
          lineas: datos.items.length,
        },
      },
    });

    return meta;
  });

  return { ok: true, id: creada.id, version, costoTotal };
}

class YaAprobada extends Error {}

export type ResultadoAprobacion =
  | { ok: true; version: number }
  | { ok: false; error: string };

/**
 * Congela la meta. A partir de aqui es inmutable.
 *
 * Es lo que hace que la bolsa signifique algo: con una meta editable bastaria
 * bajarla cuando el gasto se va, y todos los indicadores mentirian hacia
 * atras sin dejar rastro.
 */
export async function aprobarMeta(
  sesion: SesionActiva,
  metaId: string,
): Promise<ResultadoAprobacion> {
  if (!puede(sesion, "meta:aprobar")) {
    return { ok: false, error: "No tienes permiso para aprobar el presupuesto meta." };
  }

  const meta = await prisma.presupuestoMeta.findFirst({
    where: { id: metaId, project: { companyId: sesion.companyId } },
    select: {
      id: true, projectId: true, version: true,
      aprobadaAt: true, costoTotal: true,
    },
  });
  if (!meta) return { ok: false, error: "Presupuesto meta no encontrado." };

  if (meta.aprobadaAt) {
    return { ok: false, error: `La meta v${meta.version} ya estaba aprobada.` };
  }

  const cerrada = await motivoSiObraCerrada(sesion, meta.projectId);
  if (cerrada) return { ok: false, error: cerrada };

  // Solo la ultima. Congelar una version antigua teniendo un borrador mas
  // nuevo dejaria gobernando una meta ya superada, porque `metaQueManda`
  // toma la aprobada de version mas alta.
  const ultima = await prisma.presupuestoMeta.findFirst({
    where: { projectId: meta.projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  if (ultima && ultima.version !== meta.version) {
    return {
      ok: false,
      error:
        `Solo se puede aprobar la ultima meta, y la v${ultima.version} es ` +
        `posterior a esta. Aprueba esa, o eliminala antes.`,
    };
  }

  const aprobadaAt = new Date();
  const aprobadaPor = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`
    .trim()
    .slice(0, 150);

  try {
    await prisma.$transaction(async (tx) => {
      // `aprobadaAt: null` en el where es lo que hace segura la carrera: si
      // otra peticion aprobo primero, esta no encuentra fila y no sobrescribe
      // ni la fecha ni el firmante originales.
      const { count } = await tx.presupuestoMeta.updateMany({
        where: { id: meta.id, aprobadaAt: null },
        data: { aprobadaAt, aprobadaPor },
      });

      if (count === 0) throw new YaAprobada();

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: meta.projectId,
          entidad: "PresupuestoMeta",
          entidadId: meta.id,
          accion: "APPROVE",
          antes: { aprobada: false },
          despues: {
            version: meta.version,
            aprobadaAt: aprobadaAt.toISOString(),
            aprobadaPor,
            costoTotal: meta.costoTotal.toString(),
          },
        },
      });
    });
  } catch (e) {
    if (e instanceof YaAprobada) {
      return { ok: false, error: `La meta v${meta.version} ya estaba aprobada.` };
    }
    throw e;
  }

  return { ok: true, version: meta.version };
}

export type ResultadoBorrado =
  | { ok: true; version: number }
  | { ok: false; error: string };

/**
 * Elimina un BORRADOR de meta. Una aprobada no se toca nunca.
 *
 * Existe por lo mismo que el de la semana del plan: una meta cargada por
 * error —el Excel equivocado, el modo que no era— hay que poder rehacerla, y
 * dejarla ahi como version muerta ensucia el historial que decide cual manda.
 * Se lleva por cascada sus lineas, su reparto y sus gastos generales.
 */
export async function eliminarBorrador(
  sesion: SesionActiva,
  metaId: string,
): Promise<ResultadoBorrado> {
  if (!puede(sesion, "meta:crear")) {
    return { ok: false, error: "No tienes permiso para eliminar el presupuesto meta." };
  }

  const meta = await prisma.presupuestoMeta.findFirst({
    where: { id: metaId, project: { companyId: sesion.companyId } },
    select: { id: true, projectId: true, version: true, aprobadaAt: true },
  });
  if (!meta) return { ok: false, error: "Presupuesto meta no encontrado." };

  if (meta.aprobadaAt) {
    return {
      ok: false,
      error:
        `La meta v${meta.version} esta aprobada y es inmutable. Si el alcance ` +
        `cambio, crea una version nueva.`,
    };
  }

  const cerrada = await motivoSiObraCerrada(sesion, meta.projectId);
  if (cerrada) return { ok: false, error: cerrada };

  await prisma.$transaction(async (tx) => {
    // La auditoria se escribe ANTES de borrar: despues no habria de que
    // dejar constancia, y esta fila es lo unico que queda de la version.
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: meta.projectId,
        entidad: "PresupuestoMeta",
        entidadId: meta.id,
        accion: "DELETE",
        antes: { version: meta.version, aprobada: false },
      },
    });

    // `aprobadaAt: null` tambien aqui: si alguien la aprueba entre la lectura
    // y el borrado, este no encuentra fila y la meta congelada sobrevive.
    await tx.presupuestoMeta.deleteMany({
      where: { id: meta.id, aprobadaAt: null },
    });
  });

  return { ok: true, version: meta.version };
}
