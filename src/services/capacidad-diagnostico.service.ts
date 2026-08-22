import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { ppcDePlan } from "@/lib/plan-semanal";
import type { SesionActiva } from "@/services/sesion.service";

export interface SemanaDeCapacidad {
  numero: number;
  fechaCorte: Date;
  comprometidos: number;
  cumplidos: number;
}

export interface ObraConHistorialCapacidad {
  obraId: string;
  obraNombre: string;
  /// Solo semanas CERRADAS, la mas reciente primero -mismo orden que usa el
  /// resto del sistema para "las ultimas N".
  semanas: SemanaDeCapacidad[];
}

/**
 * Herramienta de DIAGNOSTICO, temporal: el historial completo de
 * comprometidos/cumplidos por semana cerrada, de toda la cartera de esta
 * empresa, para contrastar a ojo si los umbrales de `lib/capacidad.ts`
 * (`UMBRAL_AMBICIOSO = 1.0`, `UMBRAL_SOBRECARGA = 1.4`, hoy arbitrarios —
 * ver `docs/PENDIENTES.md`) se ajustan a lo que de verdad paso en obra.
 *
 * No es una pantalla de negocio: no tiene entrada en el menu ni en las
 * migas, solo un enlace discreto desde `/empresa/configuracion`. Cuando los
 * umbrales se validen (o se decida que hace falta mas tiempo), esta funcion
 * y su pantalla se pueden borrar sin que nada mas dependa de ellas.
 *
 * UNA sola consulta para toda la cartera, agrupada en JS por obra -mismo
 * criterio de coste que `gerencia.service.ts`-.
 */
export async function historialDeCapacidad(
  sesion: SesionActiva,
): Promise<ObraConHistorialCapacidad[]> {
  // Mismo permiso que ya gobierna /empresa/configuracion: no se crea un
  // permiso nuevo para una herramienta que se piensa temporal.
  if (!puede(sesion, "configuracion:editar")) return [];

  const planes = await prisma.planSemanal.findMany({
    where: { estado: "CERRADO", project: { companyId: sesion.companyId } },
    orderBy: [{ projectId: "asc" }, { numero: "desc" }],
    select: {
      projectId: true,
      numero: true,
      fechaCorte: true,
      project: { select: { nombreObra: true } },
      compromisos: { select: { cumplido: true, causa: true } },
    },
  });

  const porObra = new Map<string, ObraConHistorialCapacidad>();
  for (const p of planes) {
    const { total, cumplidos } = ppcDePlan(p.compromisos);
    const obra = porObra.get(p.projectId) ?? {
      obraId: p.projectId,
      obraNombre: p.project.nombreObra,
      semanas: [],
    };
    obra.semanas.push({
      numero: p.numero,
      fechaCorte: p.fechaCorte,
      comprometidos: total,
      cumplidos,
    });
    porObra.set(p.projectId, obra);
  }

  // Las obras con mas historial primero: son las que de verdad pueden
  // decir algo sobre el umbral.
  return [...porObra.values()].sort((a, b) => b.semanas.length - a.semanas.length);
}
