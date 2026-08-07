import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Consulta de obras.
 *
 * Regla de aislamiento: el `companyId` sale SIEMPRE de la sesion, nunca de
 * un parametro de la peticion. Es lo unico que impide que un usuario de una
 * empresa vea las obras de otra manipulando un identificador en la URL.
 */

export class SinPermisoError extends Error {
  constructor(mensaje = "No tienes permiso para esta operacion.") {
    super(mensaje);
    this.name = "SinPermisoError";
  }
}

export interface ObraResumen {
  id: string;
  codigoObra: string | null;
  nombreObra: string;
  ubicacion: string | null;
  estado: string;
  fechaInicio: Date;
  fechaFinProgramada: Date;
  /// Suma de los parciales de todas las partidas. String para no perder
  /// precision al viajar del servidor al navegador.
  presupuestoTotal: string;
  totalPartidas: number;
}

export async function listarObras(
  sesion: SesionActiva,
): Promise<ObraResumen[]> {
  if (!puede(sesion.role, "obra:leer")) throw new SinPermisoError();

  const obras = await prisma.project.findMany({
    where: { companyId: sesion.companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      codigoObra: true,
      nombreObra: true,
      ubicacion: true,
      estado: true,
      fechaInicio: true,
      fechaFinProgramada: true,
    },
  });

  if (obras.length === 0) return [];

  // Se agrega en la base y no en JavaScript: sumar miles de partidas en
  // memoria seria innecesariamente costoso y perderia precision decimal.
  const totales = await prisma.wbsItem.groupBy({
    by: ["projectId"],
    where: {
      projectId: { in: obras.map((o) => o.id) },
      tipo: "PARTIDA",
    },
    _sum: { parcial: true },
    _count: { _all: true },
  });

  const porObra = new Map(totales.map((t) => [t.projectId, t]));

  return obras.map((obra) => {
    const agregado = porObra.get(obra.id);
    return {
      ...obra,
      presupuestoTotal: agregado?._sum.parcial?.toString() ?? "0",
      totalPartidas: agregado?._count._all ?? 0,
    };
  });
}
