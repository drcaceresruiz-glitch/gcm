import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Marcar que un compromiso EMPEZO en obra, o deshacerlo.
 *
 * Es la transicion que le faltaba al Kanban. Antes solo se sabia «prometido»
 * y «evaluado», y entre las dos hay una semana entera de trabajo: la columna
 * de en ejecucion existia en la idea pero no en el modelo, y la unica forma
 * de rellenarla habria sido DEDUCIRLA de la cantidad ejecutada. Deducirla es
 * el modo de fallo caro de esta aplicacion —una fila cambia de naturaleza sin
 * que nadie lo note—, porque una cantidad en cero significa a la vez «empezo
 * y no hay avance medible» y «no ha empezado».
 *
 * Se sella la FECHA y no un booleano, como `listaAt` o `analizadaAt`: asi
 * mañana se puede medir cuanto tarda un compromiso en arrancar desde que se
 * prometio, que es una pregunta del Last Planner.
 *
 * Es reversible: se marca a mano y a mano se puede desmarcar. Al contrario
 * que aprobar un movimiento, esto no mueve dinero.
 */

export interface ResultadoMarcha {
  ok: boolean;
  error?: string;
}

export async function marcarEnEjecucion(
  sesion: SesionActiva,
  compromisoId: string,
  enMarcha: boolean,
): Promise<ResultadoMarcha> {
  // El mismo permiso con el que se arma y se cierra la semana: es trabajo de
  // campo, y lo tiene el residente.
  if (!puede(sesion, "plan_semanal:gestionar")) {
    return {
      ok: false,
      error: "No tienes permiso para mover los compromisos de la semana.",
    };
  }

  const compromiso = await prisma.compromisoSemanal.findFirst({
    where: {
      id: compromisoId,
      plan: { project: { companyId: sesion.companyId } },
    },
    select: {
      id: true,
      cumplido: true,
      plan: {
        select: { id: true, estado: true, projectId: true },
      },
    },
  });

  if (!compromiso) return { ok: false, error: "Compromiso no encontrado." };

  // Semana cerrada = congelada, la misma regla que el tablero semanal. Lo que
  // ya se evaluo no vuelve a estar «en ejecucion».
  if (compromiso.plan.estado !== "ABIERTO") {
    return {
      ok: false,
      error: "La semana ya esta cerrada: sus compromisos no se pueden mover.",
    };
  }

  if (compromiso.cumplido !== null) {
    return {
      ok: false,
      error: "Este compromiso ya esta evaluado. Reabre la semana para cambiarlo.",
    };
  }

  const cerrada = await motivoSiObraCerrada(
    sesion,
    compromiso.plan.projectId,
  );
  if (cerrada) return { ok: false, error: cerrada };

  await prisma.compromisoSemanal.update({
    where: { id: compromiso.id },
    data: { enEjecucionAt: enMarcha ? new Date() : null },
  });

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: compromiso.plan.projectId,
      entidad: "CompromisoSemanal",
      entidadId: compromiso.id,
      accion: "UPDATE",
      despues: { enEjecucion: enMarcha },
    },
  });

  return { ok: true };
}
