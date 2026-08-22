import "server-only";

import { prisma } from "@/lib/prisma";
import { esVencida } from "@/lib/notas";

/**
 * El aviso de «esta nota tenía fecha de recordatorio y ya pasó».
 *
 * Antes, un recordatorio vivía solo en el widget "Próximos recordatorios"
 * del tablero: si nadie abría el panel ese día, era exactamente igual que
 * si el recordatorio no existiera. Este modulo es lo que convierte "vencida
 * y esperando a que alguien mire el tablero" en "vencida y ya se avisó".
 *
 * ## Por que va aparte, igual que `avisos-valorizacion.ts`
 *
 * El reparto de `avisos-envio.ts` gira alrededor de `MotivoAviso`, que es
 * una TAREA con su uid y su flujo de restriccion. Una Nota no es ninguna de
 * las dos cosas: es texto libre sin responsable. Forzarla por ese molde
 * habria significado inventarse un `tipo` que no le corresponde, el mismo
 * problema que ya documenta `avisos-valorizacion.ts` para los encargos.
 *
 * ## Solo campanita, no correo ni SMS
 *
 * Igual que las valorizaciones pendientes: el correo y el SMS de la obra
 * tienen su presupuesto por pasada y una SIM que se paga detras, y nadie
 * pidio gastarlos en un recordatorio que el propio autor de la nota
 * configuro sin avisar a nadie mas.
 *
 * ## A quien
 *
 * A los RESIDENTES asignados a la obra, y si no hay ninguno, a los
 * ADMIN_OBRA —mismo criterio que valorizaciones—: en una obra pequeña sin
 * residente asignado, el administrativo es quien tiene que verlo.
 */

/**
 * La clave que impide repetir.
 *
 * Lleva el DIA dentro: mientras la nota siga vencida y sin atender, el
 * aviso vuelve a sonar cada dia, una sola vez al dia. Sin el dia sonaria
 * una vez y nunca mas, y una nota vencida desde hace tres semanas dejaria
 * de existir para el sistema.
 */
function claveDeNota(notaId: string, dia: string): string {
  return `nota:${notaId}:${dia}`;
}

interface ObraParaAvisar {
  id: string;
  companyId: string;
}

/**
 * Escribe en la campanita las notas con recordatorio vencido y sin atender.
 *
 * Devuelve cuantos avisos creo, para el resumen de la pasada del reloj.
 */
export async function avisarNotasVencidas(
  obra: ObraParaAvisar,
  ahora: Date,
): Promise<number> {
  const notas = await prisma.nota.findMany({
    where: {
      projectId: obra.id,
      atendida: false,
      fechaRecordatorio: { not: null },
    },
    select: { id: true, titulo: true, categoria: true, fechaRecordatorio: true },
  });
  if (notas.length === 0) return 0;

  const vencidas = notas.filter((n) =>
    esVencida({ atendida: false, fechaRecordatorio: n.fechaRecordatorio }, ahora),
  );
  if (vencidas.length === 0) return 0;

  // Los destinatarios: residentes asignados, y si no hay, administradores de
  // obra. Se resuelve UNA vez para todas las notas, igual que valorizaciones.
  const miembros = await prisma.projectMembership.findMany({
    where: {
      projectId: obra.id,
      role: { in: ["RESIDENTE", "ADMIN_OBRA"] },
      user: { estado: "ACTIVO" },
    },
    select: { userId: true, role: true },
  });

  const residentes = miembros.filter((m) => m.role === "RESIDENTE");
  const destinatarios = (residentes.length > 0 ? residentes : miembros).map(
    (m) => m.userId,
  );
  if (destinatarios.length === 0) return 0;

  const dia = ahora.toISOString().slice(0, 10);
  let creados = 0;

  for (const nota of vencidas) {
    const clave = claveDeNota(nota.id, dia);

    // La reserva va ANTES de escribir: si la pasada se repite, la segunda
    // choca contra la clave y no escribe nada. Mismo mecanismo que
    // valorizaciones, restricciones e hitos.
    try {
      await prisma.envioAviso.create({
        data: {
          companyId: obra.companyId,
          projectId: obra.id,
          evento: "NOTA_VENCIDA",
          canal: "APP",
          clave,
          destino: "campanita",
          enviado: true,
        },
      });
    } catch {
      // Ya sono hoy por esta nota.
      continue;
    }

    const titulo = `Recordatorio vencido: ${nota.titulo}`;
    const cuerpo =
      `La nota "${nota.titulo}" tenía recordatorio para el ` +
      `${nota.fechaRecordatorio!.toISOString().slice(0, 10)} y sigue sin ` +
      "atenderse. No bloquea nada: márcala como atendida cuando corresponda.";

    await prisma.aviso.createMany({
      data: destinatarios.map((userId) => ({
        companyId: obra.companyId,
        projectId: obra.id,
        userId,
        evento: "NOTA_VENCIDA" as const,
        titulo: titulo.slice(0, 200),
        cuerpo: cuerpo.slice(0, 400),
        // A la nota exacta, no a la lista entera: mismo ancla que ya usa el
        // widget "Próximos recordatorios" del tablero.
        camino: `/notas#nota-${nota.id}`,
      })),
    });

    creados += destinatarios.length;
  }

  return creados;
}
