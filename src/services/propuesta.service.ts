import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { sumar } from "@/lib/decimal";
import {
  calcularCascadaComercial,
  parametrosDeImpuesto,
  type CascadaComercial,
  type TipoImpuestoContractual,
} from "@/lib/presupuesto";
import { logoDeEmpresa, type LogoEmpresa } from "@/services/logo.service";
import type { SesionActiva } from "@/services/sesion.service";
import type { LineaPropuesta } from "@/lib/propuesta-detalle";

/**
 * La propuesta economica: el presupuesto contractual tal como se entrega al
 * cliente.
 *
 * Lee de la LINEA BASE, no del arbol vivo. El arbol sigue cambiando mientras
 * la obra avanza; el papel que se le mando al cliente no puede cambiar con
 * el. `BaselineItem` guarda una copia congelada de cada partida -descripcion,
 * unidad, metrado y precio- justo para esto.
 *
 * Solo lee: todo lo que hace falta se decidio al crear la revision.
 */

// El tipo vive en la libreria pura porque es ella la que decide que se ve
// a cada profundidad; aqui solo se rellena desde la base.
export type { LineaPropuesta };

export interface EmisorPropuesta {
  razonSocial: string;
  ruc: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  representanteLegal: string | null;
  cargoRepresentante: string | null;
}

export interface Propuesta {
  obra: {
    id: string;
    nombreObra: string;
    codigoObra: string | null;
    cliente: string | null;
    ubicacion: string | null;
  };
  emisor: EmisorPropuesta;
  logo: LogoEmpresa | null;
  revision: {
    id: string;
    version: number;
    fechaRevision: Date;
    aprobada: boolean;
    /// Para poder emitirla en dolares. null = solo se puede en soles.
    tipoCambio: string | null;
    clausulas: string | null;
    tipoImpuesto: TipoImpuestoContractual;
    retencionAsumida: boolean;
    porcentajes: {
      gastosGenerales: string;
      utilidad: string;
      descuento: string;
      igv: string;
      retencion: string;
    };
  };
  lineas: LineaPropuesta[];
  /// El costo directo con las partidas negativas ya restadas. Se devuelve
  /// para que la pantalla pueda RECALCULAR la cascada cuando se cambia la
  /// forma de facturar, sin volver a preguntar a la base.
  costoDirectoNeto: string;
  cascada: CascadaComercial;
}

/**
 * Que revision se imprime.
 *
 * Sin pedir una concreta manda la APROBADA mas alta: es la que compromete.
 * Si no hay ninguna aprobada se cae a la ultima que haya, porque un borrador
 * hay que poder revisarlo en papel antes de firmarlo -y es el propio
 * documento el que avisa con un sello de que todavia no obliga a nada.
 */
async function revisionAImprimir(
  obraId: string,
  revisionId?: string,
): Promise<{ id: string } | null> {
  if (revisionId) {
    return prisma.baseline.findFirst({
      where: { id: revisionId, projectId: obraId },
      select: { id: true },
    });
  }

  const aprobada = await prisma.baseline.findFirst({
    where: { projectId: obraId, aprobadaAt: { not: null } },
    orderBy: { version: "desc" },
    select: { id: true },
  });

  if (aprobada) return aprobada;

  return prisma.baseline.findFirst({
    where: { projectId: obraId },
    orderBy: { version: "desc" },
    select: { id: true },
  });
}

export async function obtenerPropuesta(
  sesion: SesionActiva,
  obraId: string,
  revisionId?: string,
): Promise<Propuesta | null> {
  if (!puede(sesion, "linea_base:leer")) return null;

  // El filtro por empresa va aqui: a partir de este punto la obra ya es
  // suya, y las consultas que siguen cuelgan de ella.
  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: {
      id: true,
      nombreObra: true,
      codigoObra: true,
      cliente: true,
      ubicacion: true,
    },
  });

  if (!obra) return null;

  const elegida = await revisionAImprimir(obraId, revisionId);
  if (!elegida) return null;

  const revision = await prisma.baseline.findUniqueOrThrow({
    where: { id: elegida.id },
    select: {
      id: true,
      version: true,
      fechaRevision: true,
      aprobadaAt: true,
      clausulas: true,
      tipoCambio: true,
      costoDirecto: true,
      descuentos: true,
      porcentajeGastosGenerales: true,
      porcentajeUtilidad: true,
      porcentajeIgv: true,
      porcentajeDescuento: true,
      tipoImpuesto: true,
      porcentajeRetencion: true,
      retencionAsumida: true,
    },
  });

  const [lineas, empresa, logo] = await Promise.all([
    prisma.baselineItem.findMany({
      where: { baselineId: revision.id },
      orderBy: { orden: "asc" },
      select: {
        codigoPartida: true,
        descripcion: true,
        tipo: true,
        nivel: true,
        unidad: true,
        metrado: true,
        precioUnitario: true,
        parcial: true,
      },
    }),
    prisma.company.findUnique({
      where: { id: sesion.companyId },
      select: {
        razonSocial: true,
        ruc: true,
        direccion: true,
        telefono: true,
        email: true,
        representanteLegal: true,
        cargoRepresentante: true,
      },
    }),
    logoDeEmpresa(sesion),
  ]);

  if (!empresa) return null;

  /**
   * El costo directo NETO.
   *
   * `costoDirecto` y `descuentos` se guardaron separados, pero los descuentos
   * de aqui no son un descuento comercial: son las lineas del propio
   * presupuesto con importe negativo, y eso ES costo directo en negativo.
   * Es la misma suma que hizo `crearRevision` al guardar, y por eso el papel
   * da exactamente el mismo total que la pantalla de revisiones.
   */
  const costoDirectoNeto = sumar(
    [revision.costoDirecto.toString(), revision.descuentos.toString()],
    2,
  );

  const tipoImpuesto = revision.tipoImpuesto as TipoImpuestoContractual;
  const porcentajeIgv = revision.porcentajeIgv.toString();
  const porcentajeRetencion = revision.porcentajeRetencion.toString();

  const cascada = calcularCascadaComercial({
    costoDirecto: costoDirectoNeto,
    porcentajeGastosGenerales: revision.porcentajeGastosGenerales.toString(),
    porcentajeUtilidad: revision.porcentajeUtilidad.toString(),
    porcentajeDescuento: revision.porcentajeDescuento.toString(),
    ...parametrosDeImpuesto(
      tipoImpuesto,
      porcentajeIgv,
      revision.retencionAsumida,
      porcentajeRetencion,
    ),
  });

  return {
    obra,
    emisor: empresa,
    logo,
    revision: {
      id: revision.id,
      version: revision.version,
      fechaRevision: revision.fechaRevision,
      aprobada: revision.aprobadaAt !== null,
      tipoCambio: revision.tipoCambio?.toString() ?? null,
      clausulas: revision.clausulas,
      tipoImpuesto,
      retencionAsumida: revision.retencionAsumida,
      porcentajes: {
        gastosGenerales: revision.porcentajeGastosGenerales.toString(),
        utilidad: revision.porcentajeUtilidad.toString(),
        descuento: revision.porcentajeDescuento.toString(),
        igv: porcentajeIgv,
        retencion: porcentajeRetencion,
      },
    },
    lineas: lineas.map((l) => ({
      codigo: l.codigoPartida,
      descripcion: l.descripcion,
      unidad: l.unidad,
      metrado: l.metrado?.toString() ?? null,
      precioUnitario: l.precioUnitario?.toString() ?? null,
      parcial: l.parcial?.toString() ?? null,
      nivel: l.nivel,
      esCapitulo: l.tipo !== "PARTIDA",
    })),
    cascada,
    costoDirectoNeto,
  };
}
