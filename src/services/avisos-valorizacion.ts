import "server-only";

import { prisma } from "@/lib/prisma";
import { estadoDeCadencia } from "@/lib/cadencia-valorizacion";

/**
 * El aviso de «a este contratista le tocaba valorizar y no consta el corte».
 *
 * AVISA, NO BLOQUEA: es la decision del usuario, y se cumple sola porque esto
 * no toca el avance de nada. Solo escribe en la campanita.
 *
 * ## Por que va en su propio modulo y no dentro de `avisos-reloj`
 *
 * El reparto de aquel gira alrededor de `MotivoAviso`, que es una TAREA con
 * su uid y su flujo de restriccion. Un contratista no es ninguna de las dos
 * cosas. Los hitos ya tuvieron que colarse por ahi inventandose un
 * `tipo: "INFORMACION"`; repetir el truco con los encargos habria obligado a
 * pasar el nombre del contratista en el campo `tarea`, y a partir de ahi
 * cualquiera que lea esos textos se lleva una idea equivocada de lo que hay
 * dentro.
 *
 * ## Solo campanita, no correo ni SMS
 *
 * Lo pedido es avisar al residente. El correo y el SMS de la obra tienen sus
 * topes, su presupuesto por pasada y una SIM que se paga detras; meter aqui
 * un canal que nadie pidio es gastar en nombre del cliente.
 *
 * ## A quien
 *
 * A los RESIDENTES asignados a la obra —`ProjectMembership` con rol
 * RESIDENTE—, que desde el alcance por obra es una lista exacta y no una
 * suposicion. Si no hay ninguno, tambien a los ADMIN_OBRA: en una obra
 * pequena el que lleva las valorizaciones es el administrativo, y un aviso
 * que no tiene destinatario es un aviso que no existe.
 */

/**
 * La clave que impide repetir.
 *
 * Lleva el DIA dentro, como las de recordatorio: mientras el contratista siga
 * debiendo el corte, el aviso vuelve a sonar cada dia, una sola vez al dia.
 * Sin el dia sonaria una vez y nunca mas, y un contratista que debe una
 * valorizacion desde hace tres semanas dejaria de existir para el sistema.
 */
function claveDeValorizacion(encargoId: string, dia: string): string {
  return `valorizacion:${encargoId}:${dia}`;
}

interface ObraParaAvisar {
  id: string;
  companyId: string;
  diaCorteSemanal: number;
}

/**
 * Escribe en la campanita los encargos con valorizacion vencida.
 *
 * Devuelve cuantos avisos creo, para el resumen de la pasada del reloj.
 */
export async function avisarValorizacionesPendientes(
  obra: ObraParaAvisar,
  ahora: Date,
): Promise<number> {
  const encargos = await prisma.encargoProveedor.findMany({
    // VIGENTES: uno cerrado ya no valoriza y uno anulado no existio. Es el
    // mismo criterio que el panel, y tiene que serlo: un aviso de algo que la
    // pantalla no ensena no se puede ni resolver ni entender.
    where: { projectId: obra.id, estado: "VIGENTE" },
    select: {
      id: true,
      numero: true,
      cadenciaDias: true,
      fechaInicio: true,
      createdAt: true,
      proveedor: { select: { razonSocial: true } },
      fechasValorizacion: { select: { fecha: true }, orderBy: { fecha: "asc" } },
      valorizaciones: {
        orderBy: { fecha: "desc" },
        take: 1,
        select: { fecha: true },
      },
    },
  });
  if (encargos.length === 0) return 0;

  const vencidos = encargos
    .map((e) => ({
      encargo: e,
      estado: estadoDeCadencia(
        {
          diaCorteObra: obra.diaCorteSemanal,
          cadenciaDias: e.cadenciaDias,
          fechas: e.fechasValorizacion.map((f) => f.fecha),
          ultimaValorizacion: e.valorizaciones[0]?.fecha ?? null,
          inicioEncargo: e.fechaInicio ?? e.createdAt,
        },
        ahora,
      ),
    }))
    .filter((x) => x.estado.vencida);

  if (vencidos.length === 0) return 0;

  // Los destinatarios: residentes asignados, y si no hay, administradores de
  // obra. Se resuelve UNA vez para todos los encargos.
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

  for (const { encargo, estado } of vencidos) {
    const clave = claveDeValorizacion(encargo.id, dia);

    /**
     * La reserva va ANTES de escribir, y la unicidad de
     * `(projectId, canal, clave)` es lo que hace idempotente al reloj: si la
     * pasada se repite —el cron corre cada minuto—, la segunda choca contra
     * la clave y no escribe nada. Es el mismo mecanismo que usan los avisos
     * de restriccion y de hito.
     */
    try {
      await prisma.envioAviso.create({
        data: {
          companyId: obra.companyId,
          projectId: obra.id,
          evento: "VALORIZACION_PENDIENTE",
          canal: "APP",
          clave,
          destino: "campanita",
          enviado: true,
        },
      });
    } catch {
      // Ya sono hoy por este encargo.
      continue;
    }

    const dias = estado.diasDeRetraso;
    const titulo = `Valorización pendiente: ${encargo.proveedor.razonSocial}`;
    const cuerpo =
      `El encargo E-${String(encargo.numero).padStart(3, "0")} tenía que ` +
      `valorizar y no consta el corte. ` +
      (dias === 1 ? "Lleva 1 día." : `Lleva ${dias} días.`) +
      " No bloquea el avance: revísalo con el contratista.";

    await prisma.aviso.createMany({
      data: destinatarios.map((userId) => ({
        companyId: obra.companyId,
        projectId: obra.id,
        userId,
        evento: "VALORIZACION_PENDIENTE" as const,
        titulo: titulo.slice(0, 200),
        cuerpo: cuerpo.slice(0, 400),
        // A la pantalla donde se resuelve. Un aviso del que no se puede salir
        // a arreglar la cosa es solo una queja.
        camino: "/valorizaciones",
      })),
    });

    creados += destinatarios.length;
  }

  return creados;
}
