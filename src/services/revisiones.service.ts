import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { esNegativo, normalizarDecimal } from "@/lib/decimal";
import { sumarHojas } from "@/lib/jerarquia-partidas";
import { calcularCascada, compararRevisiones, type Cascada } from "@/lib/presupuesto";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Revisiones del presupuesto.
 *
 * Cada revision congela el presupuesto en una fecha con sus propios
 * porcentajes y su tipo de cambio. Guardarlos en la revision y no en la
 * obra es lo que permite comparar dos revisiones: si los porcentajes
 * vivieran en la obra, recalcular una revision antigua daria otro numero.
 */

export interface RevisionResumen {
  id: string;
  version: number;
  fechaRevision: Date;
  aprobada: boolean;
  tipoCambio: string | null;
  clausulas: string | null;
  cascada: Cascada;
  /// Como fraccion, tal cual se guardaron. La interfaz los muestra en
  /// porcentaje; el cuadro del Excel rotula cada linea con el suyo y sin
  /// ellos no se puede ver que una revision cambio la utilidad.
  porcentajes: {
    gastosGenerales: string;
    utilidad: string;
    igv: string;
  };
}

export interface ResumenPresupuesto {
  revisiones: RevisionResumen[];
  /// Diferencia entre las dos ultimas revisiones, como el resumen del Excel.
  comparacion: {
    anterior: RevisionResumen;
    actual: RevisionResumen;
    diferenciaSoles: string;
    diferenciaDolares: string | null;
    encarece: boolean;
  } | null;
}

/**
 * Separa el costo directo bruto de los descuentos comerciales.
 *
 * El presupuesto del cliente los presenta en lineas distintas: primero el
 * costo original, despues la sumatoria de descuentos, y de ahi el subtotal.
 * Las partidas de descuento viven dentro de su capitulo con importe
 * negativo, asi que se separan por el signo.
 */
function separarDescuentos(
  hojas: { codigo: string; parcial: string | null }[],
): { costoDirecto: string; descuentos: string } {
  const positivas = hojas.map((h) =>
    h.parcial && esNegativo(h.parcial) ? { ...h, parcial: null } : h,
  );
  const negativas = hojas.map((h) =>
    h.parcial && !esNegativo(h.parcial) ? { ...h, parcial: null } : h,
  );

  return {
    costoDirecto: sumarHojas(positivas),
    descuentos: sumarHojas(negativas),
  };
}

export interface CostoDirectoActual {
  costoDirecto: string;
  descuentos: string;
  totalPartidas: number;
}

/**
 * Costo directo del presupuesto vivo, ya separado en positivo y descuentos.
 *
 * Es exactamente lo que congelaria una revision creada en este momento. La
 * pantalla lo necesita para dibujar la cascada ANTES de crear nada: una
 * revision es un acto contractual y quien la firma tiene que ver la cifra
 * antes, no descubrirla despues.
 *
 * Se separa aqui y no en el navegador porque la regla de que solo un
 * importe positivo cubre a su ancestro vive en `sumarHojas`, y duplicarla
 * en la interfaz seria condenarla a divergir.
 */
export async function obtenerCostoDirectoActual(
  sesion: SesionActiva,
  obraId: string,
): Promise<CostoDirectoActual> {
  if (!puede(sesion.role, "partida:leer")) {
    return { costoDirecto: "0.00", descuentos: "0.00", totalPartidas: 0 };
  }

  const items = await prisma.wbsItem.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    select: { codigoPartida: true, tipo: true, parcial: true },
  });

  const { costoDirecto, descuentos } = separarDescuentos(
    items.map((i) => ({
      codigo: i.codigoPartida,
      parcial: i.tipo === "PARTIDA" ? (i.parcial?.toString() ?? null) : null,
    })),
  );

  return {
    costoDirecto,
    descuentos,
    totalPartidas: items.filter((i) => i.tipo === "PARTIDA").length,
  };
}

export interface DatosRevision {
  fechaRevision: string;
  porcentajeGastosGenerales: string;
  porcentajeUtilidad: string;
  porcentajeIgv: string;
  tipoCambio?: string | null;
  clausulas?: string | null;
  notas?: string | null;
}

export type ResultadoRevision =
  | { ok: true; version: number; montoTotal: string }
  | { ok: false; error: string };

export async function crearRevision(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosRevision,
): Promise<ResultadoRevision> {
  if (!puede(sesion.role, "linea_base:crear")) {
    return { ok: false, error: "No tienes permiso para crear revisiones." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const items = await prisma.wbsItem.findMany({
    where: { projectId: obraId },
    orderBy: { orden: "asc" },
    select: {
      codigoPartida: true, descripcion: true, tipo: true, modalidad: true,
      nivel: true, orden: true, unidad: true,
      metrado: true, precioUnitario: true, parcial: true,
    },
  });

  if (items.length === 0) {
    return { ok: false, error: "La obra no tiene partidas que congelar." };
  }

  const hojas = items.map((i) => ({
    codigo: i.codigoPartida,
    parcial: i.tipo === "PARTIDA" ? (i.parcial?.toString() ?? null) : null,
  }));

  const { costoDirecto, descuentos } = separarDescuentos(hojas);

  const porcentajes = {
    porcentajeGastosGenerales: normalizarDecimal(datos.porcentajeGastosGenerales, 4),
    porcentajeUtilidad: normalizarDecimal(datos.porcentajeUtilidad, 4),
    porcentajeIgv: normalizarDecimal(datos.porcentajeIgv, 4),
  };

  for (const [campo, valor] of Object.entries(porcentajes)) {
    if (valor === null) return { ok: false, error: `El valor de ${campo} no es valido.` };
  }

  const cascada = calcularCascada({
    costoDirecto,
    descuentos,
    porcentajeGastosGenerales: porcentajes.porcentajeGastosGenerales!,
    porcentajeUtilidad: porcentajes.porcentajeUtilidad!,
    porcentajeIgv: porcentajes.porcentajeIgv!,
  });

  const ultima = await prisma.baseline.findFirst({
    where: { projectId: obraId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const version = (ultima?.version ?? 0) + 1;
  const tipoCambio = datos.tipoCambio
    ? normalizarDecimal(datos.tipoCambio, 4)
    : null;

  await prisma.$transaction(async (tx) => {
    const revision = await tx.baseline.create({
      data: {
        projectId: obraId,
        version,
        fechaRevision: new Date(datos.fechaRevision),
        costoDirecto,
        descuentos,
        porcentajeGastosGenerales: porcentajes.porcentajeGastosGenerales!,
        porcentajeUtilidad: porcentajes.porcentajeUtilidad!,
        porcentajeIgv: porcentajes.porcentajeIgv!,
        montoTotal: cascada.presupuesto,
        tipoCambio,
        clausulas: datos.clausulas?.trim() || null,
        notas: datos.notas?.trim() || null,
      },
      select: { id: true },
    });

    // Copia inmutable de cada partida: la revision debe sobrevivir aunque
    // despues se renombren o eliminen partidas del presupuesto vivo.
    await tx.baselineItem.createMany({
      data: items.map((i) => ({
        baselineId: revision.id,
        codigoPartida: i.codigoPartida,
        descripcion: i.descripcion,
        tipo: i.tipo,
        modalidad: i.modalidad,
        nivel: i.nivel,
        orden: i.orden,
        unidad: i.unidad,
        metrado: i.metrado,
        precioUnitario: i.precioUnitario,
        parcial: i.parcial,
      })),
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "Baseline",
        entidadId: revision.id,
        accion: "CREATE",
        despues: {
          version,
          costoDirecto,
          descuentos,
          presupuesto: cascada.presupuesto,
          partidas: items.length,
        },
      },
    });
  });

  return { ok: true, version, montoTotal: cascada.presupuesto };
}

/**
 * Resumen del presupuesto: la cascada de cada revision y la diferencia
 * entre las dos ultimas. Reproduce el cuadro de resumen final del Excel.
 */
export async function obtenerResumen(
  sesion: SesionActiva,
  obraId: string,
): Promise<ResumenPresupuesto> {
  if (!puede(sesion.role, "linea_base:leer")) {
    return { revisiones: [], comparacion: null };
  }

  const filas = await prisma.baseline.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: { version: "desc" },
    select: {
      id: true, version: true, fechaRevision: true, aprobadaAt: true,
      costoDirecto: true, descuentos: true, montoTotal: true, tipoCambio: true,
      clausulas: true, porcentajeGastosGenerales: true,
      porcentajeUtilidad: true, porcentajeIgv: true,
    },
  });

  const revisiones: RevisionResumen[] = filas.map((r) => ({
    id: r.id,
    version: r.version,
    fechaRevision: r.fechaRevision,
    aprobada: r.aprobadaAt !== null,
    tipoCambio: r.tipoCambio?.toString() ?? null,
    clausulas: r.clausulas,
    // Se recalcula desde los datos guardados en lugar de leer montoTotal:
    // asi la pantalla muestra la cascada completa, no solo el resultado.
    cascada: calcularCascada({
      costoDirecto: r.costoDirecto.toString(),
      descuentos: r.descuentos.toString(),
      porcentajeGastosGenerales: r.porcentajeGastosGenerales.toString(),
      porcentajeUtilidad: r.porcentajeUtilidad.toString(),
      porcentajeIgv: r.porcentajeIgv.toString(),
    }),
    porcentajes: {
      gastosGenerales: r.porcentajeGastosGenerales.toString(),
      utilidad: r.porcentajeUtilidad.toString(),
      igv: r.porcentajeIgv.toString(),
    },
  }));

  const [actual, anterior] = revisiones;

  if (!actual || !anterior) return { revisiones, comparacion: null };

  const dif = compararRevisiones(
    anterior.cascada.presupuesto,
    actual.cascada.presupuesto,
    actual.tipoCambio,
  );

  return {
    revisiones,
    comparacion: {
      anterior,
      actual,
      diferenciaSoles: dif.diferenciaSoles,
      diferenciaDolares: dif.diferenciaDolares,
      encarece: dif.encarece,
    },
  };
}
