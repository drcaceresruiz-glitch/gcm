import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { validarCalendario, type DiaLaboral } from "@/lib/calendario";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * El regimen laboral de la obra.
 *
 * La tabla se sembraba al crear la obra y hasta ahora no habia donde tocarla
 * ni nada que la leyera. Aqui se lee y se edita; quien la consume es la ficha
 * de la obra, que ya puede decir cuantos de los dias que quedan son
 * laborables de verdad.
 */

export type ResultadoCalendario = { ok: true } | { ok: false; error: string };

/**
 * Los siete dias de la obra, ordenados de lunes a domingo.
 *
 * Devuelve lista vacia si la obra no es de esta empresa o no hay permiso: el
 * consumidor decide si eso significa «sin configurar» o no ensenar nada.
 */
export async function obtenerCalendario(
  sesion: SesionActiva,
  obraId: string,
): Promise<DiaLaboral[]> {
  if (!puede(sesion, "obra:leer")) return [];

  const dias = await prisma.workCalendar.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: { diaSemana: "asc" },
    select: { diaSemana: true, laborable: true, horas: true },
  });

  return dias.map((d) => ({
    diaSemana: d.diaSemana,
    laborable: d.laborable,
    horas: d.horas.toString(),
  }));
}

/**
 * Guarda el regimen laboral.
 *
 * Se hace con `upsert` por (obra, dia) y no borrando y recreando: la clave
 * unica ya garantiza un dia una vez, y asi una obra sembrada antes de que
 * existiera esta pantalla se actualiza sin quedarse un instante sin calendario.
 */
export async function guardarCalendario(
  sesion: SesionActiva,
  obraId: string,
  dias: DiaLaboral[],
): Promise<ResultadoCalendario> {
  if (!puede(sesion, "obra:editar")) {
    return { ok: false, error: "No tienes permiso para editar la obra." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const validos = validarCalendario(dias);
  if (!validos.ok) return { ok: false, error: validos.error };

  await prisma.$transaction(async (tx) => {
    for (const d of validos.dias) {
      await tx.workCalendar.upsert({
        where: { projectId_diaSemana: { projectId: obraId, diaSemana: d.diaSemana } },
        create: {
          projectId: obraId,
          diaSemana: d.diaSemana,
          laborable: d.laborable,
          horas: d.horas,
        },
        update: { laborable: d.laborable, horas: d.horas },
      });
    }

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "WorkCalendar",
        entidadId: obraId,
        accion: "UPDATE",
        despues: {
          laborables: validos.dias
            .filter((d) => d.laborable)
            .map((d) => d.diaSemana)
            .join(","),
        },
      },
    });
  });

  return { ok: true };
}
