import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { esNegativo, normalizarDecimal, sumar } from "@/lib/decimal";
import { sumarHojas } from "@/lib/jerarquia-partidas";
import {
  calcularCascada,
  calcularCascadaComercial,
  compararRevisiones,
  parametrosDeImpuesto,
  TASA_RETENCION_RENTA,
  type Cascada,
} from "@/lib/presupuesto";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
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
  /// Quien la aprobo y cuando. Es el registro del acto contractual: se
  /// guarda como texto y no como clave ajena, para que sobreviva aunque
  /// despues se desactive o se borre a esa persona.
  aprobadaAt: Date | null;
  aprobadaPor: string | null;
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
  if (!puede(sesion, "partida:leer")) {
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
  /// Descuento comercial, como porcentaje. Cascada 2.
  porcentajeDescuento?: string;
  /// Como tributa lo que se entrega al cliente. Por defecto, IGV.
  tipoImpuesto?: "IGV" | "RENTA" | "NINGUNO";
  /// Solo con RENTA: si la constructora asume la retencion subiendo el precio.
  retencionAsumida?: boolean;
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
  if (!puede(sesion, "linea_base:crear")) {
    return { ok: false, error: "No tienes permiso para crear revisiones." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  // Con una revision ya aprobada, el presupuesto es un contrato firmado y la
  // linea base es inmutable: los cambios posteriores van como adicionales o
  // reconversiones ENCIMA de ella, nunca como una revision nueva que la
  // sustituya. Crear revisiones queda para la fase de negociacion, cuando
  // todas son borradores.
  const aprobada = await prisma.baseline.findFirst({
    where: { projectId: obraId, aprobadaAt: { not: null } },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  if (aprobada) {
    return {
      ok: false,
      error:
        `El presupuesto ya tiene la linea base v${aprobada.version} aprobada. ` +
        `Los cambios posteriores se registran como adicionales o ` +
        `reconversiones, no como una revision nueva.`,
    };
  }

  const items = await prisma.wbsItem.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
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
    porcentajeDescuento: normalizarDecimal(datos.porcentajeDescuento ?? "0", 4),
  };

  for (const [campo, valor] of Object.entries(porcentajes)) {
    if (valor === null) return { ok: false, error: `El valor de ${campo} no es valido.` };
  }

  const tipoImpuesto = datos.tipoImpuesto ?? "IGV";
  const retencionAsumida = datos.retencionAsumida ?? false;

  /**
   * El costo directo NETO: con las partidas negativas del propio presupuesto
   * ya restadas.
   *
   * `separarDescuentos` no separa un descuento comercial: separa las lineas
   * con importe negativo que trae el presupuesto (un descuento de proveedor,
   * un ajuste). Eso ES costo directo, solo que en negativo. Pasar aqui el
   * bruto las dejaria fuera del calculo y la obra saldria mas cara de lo que
   * es, sin dar ningun error.
   */
  const costoDirectoNeto = sumar([costoDirecto, descuentos], 2);

  // La traduccion de tipoImpuesto y retencionAsumida a lo que entiende la
  // cascada vive en UNA sola funcion, compartida con el formulario y con la
  // propuesta imprimible: si divergieran, cada pantalla diria otra cifra.
  const impuesto = parametrosDeImpuesto(
    tipoImpuesto,
    porcentajes.porcentajeIgv!,
    retencionAsumida,
  );

  // Lo que se guarda es el IGV EFECTIVO, no el que se tecleo: un recibo por
  // honorarios no lo lleva, y dejar el 18% escrito lo resucitaria al releer.
  const igvEfectivo = impuesto.porcentajeIgv;

  const cascada = calcularCascadaComercial({
    costoDirecto: costoDirectoNeto,
    porcentajeGastosGenerales: porcentajes.porcentajeGastosGenerales!,
    porcentajeUtilidad: porcentajes.porcentajeUtilidad!,
    porcentajeDescuento: porcentajes.porcentajeDescuento!,
    ...impuesto,
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
        porcentajeIgv: igvEfectivo,
        porcentajeDescuento: porcentajes.porcentajeDescuento!,
        tipoImpuesto,
        porcentajeRetencion: TASA_RETENCION_RENTA,
        retencionAsumida,
        // Las revisiones nuevas se calculan con la cascada 2. Las que ya
        // estaban se quedan en 1 y siguen dando su total guardado.
        versionCascada: 2,
        // El presupuesto sin IGV: la cifra de control, como antes.
        montoTotal: cascada.valorVenta,
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
          presupuesto: cascada.valorVenta,
          partidas: items.length,
        },
      },
    });
  });

  return { ok: true, version, montoTotal: cascada.valorVenta };
}

/**
 * Resumen del presupuesto: la cascada de cada revision y la diferencia
 * entre las dos ultimas. Reproduce el cuadro de resumen final del Excel.
 */
export async function obtenerResumen(
  sesion: SesionActiva,
  obraId: string,
): Promise<ResumenPresupuesto> {
  if (!puede(sesion, "linea_base:leer")) {
    return { revisiones: [], comparacion: null };
  }

  const filas = await prisma.baseline.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: { version: "desc" },
    select: {
      id: true, version: true, fechaRevision: true,
      aprobadaAt: true, aprobadaPor: true,
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
    aprobadaAt: r.aprobadaAt,
    aprobadaPor: r.aprobadaPor,
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

/**
 * Se lanza dentro de la transaccion cuando la revision ya habia sido
 * aprobada entre la comprobacion y la escritura. Es un caso de carrera, no
 * un fallo: dos pulsaciones del mismo boton bastan para provocarlo.
 */
class YaAprobada extends Error {}

export type ResultadoAprobacion =
  | { ok: true; version: number }
  | { ok: false; error: string };

/**
 * Aprueba una revision y la convierte en la linea base de la obra.
 *
 * Es un acto contractual y es IRREVERSIBLE por diseño. A partir de aqui el
 * presupuesto queda congelado: la obra bloquea la edicion de partidas y el
 * importador, y todos los indicadores de avance y costo se miden contra
 * esta cifra. Poder deshacerlo significaria poder recalcular hacia atras
 * los indicadores ya publicados, que es justo lo que la linea base existe
 * para impedir.
 */
export async function aprobarRevision(
  sesion: SesionActiva,
  revisionId: string,
): Promise<ResultadoAprobacion> {
  if (!puede(sesion, "linea_base:aprobar")) {
    return {
      ok: false,
      error: "No tienes permiso para aprobar revisiones del presupuesto.",
    };
  }

  // El companyId sale de la sesion y se filtra por la obra: un id de
  // revision de otra empresa simplemente no aparece.
  const revision = await prisma.baseline.findFirst({
    where: { id: revisionId, project: { companyId: sesion.companyId } },
    select: {
      id: true, projectId: true, version: true,
      aprobadaAt: true, montoTotal: true,
    },
  });

  if (!revision) return { ok: false, error: "Revision no encontrada." };

  if (revision.aprobadaAt) {
    return {
      ok: false,
      error: `La revision v${revision.version} ya estaba aprobada.`,
    };
  }

  const cerrada = await motivoSiObraCerrada(sesion, revision.projectId);
  if (cerrada) return { ok: false, error: cerrada };

  // Solo la ultima. Aprobar una revision antigua teniendo un borrador mas
  // nuevo dejaria como linea base un contrato ya superado, y `obtenerObra`
  // toma la version mas alta de las aprobadas: el numero que veria la obra
  // no seria el que se acaba de firmar.
  const ultima = await prisma.baseline.findFirst({
    where: { projectId: revision.projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  if (ultima && ultima.version !== revision.version) {
    return {
      ok: false,
      error:
        `Solo se puede aprobar la ultima revision, y la v${ultima.version} ` +
        `es posterior a esta. Aprueba esa, o eliminala antes.`,
    };
  }

  const aprobadaAt = new Date();
  const aprobadaPor = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`
    .trim()
    .slice(0, 150);

  try {
    await prisma.$transaction(async (tx) => {
      // La condicion `aprobadaAt: null` es lo que hace segura la carrera:
      // si otra peticion aprobo primero, esta no encuentra fila que tocar y
      // no sobrescribe ni la fecha ni el firmante originales.
      const { count } = await tx.baseline.updateMany({
        where: { id: revision.id, aprobadaAt: null },
        data: { aprobadaAt, aprobadaPor },
      });

      if (count === 0) throw new YaAprobada();

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: revision.projectId,
          entidad: "Baseline",
          entidadId: revision.id,
          accion: "APPROVE",
          antes: { aprobada: false },
          despues: {
            version: revision.version,
            aprobadaAt: aprobadaAt.toISOString(),
            aprobadaPor,
            montoTotal: revision.montoTotal.toString(),
          },
        },
      });
    });
  } catch (e) {
    if (e instanceof YaAprobada) {
      return {
        ok: false,
        error: `La revision v${revision.version} ya estaba aprobada.`,
      };
    }
    throw e;
  }

  return { ok: true, version: revision.version };
}
