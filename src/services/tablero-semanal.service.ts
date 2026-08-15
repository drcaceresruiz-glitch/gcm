import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { construirTablero, type CompromisoEnTablero, type Tablero } from "@/lib/tablero-semanal";
import type { SesionActiva } from "@/services/sesion.service";
import type { EstadoPlanSemanal } from "@/generated/prisma/enums";

/**
 * El tablero de planificacion semanal.
 *
 * Consulta APARTE de `obtenerPlanSemanal` y no un campo mas dentro de ella, a
 * proposito. El tablero necesita cosas que el detalle del PTS no —el nombre de
 * cada contratista y el calendario laboral de la obra— y el detalle carga
 * cosas que el tablero no —el cronograma entero para el desplegable—. Bajo los
 * limites de recursos de produccion, esta pantalla ya se murio una vez por
 * traer de mas: cada vista pide lo suyo.
 */

export interface TableroDatos {
  planId: string;
  numero: number;
  fechaCorte: Date;
  estado: EstadoPlanSemanal;
  tablero: Tablero;
  /// Si quien mira puede mover tarjetas o solo verlas.
  puedeGestionar: boolean;
  /// Contratistas de la empresa, para el desplegable de asignacion.
  contratistas: { id: string; nombre: string }[];
}

export async function obtenerTablero(
  sesion: SesionActiva,
  obraId: string,
  planId: string,
): Promise<TableroDatos | null> {
  if (!puede(sesion, "plan_semanal:leer")) return null;

  const plan = await prisma.planSemanal.findFirst({
    where: { id: planId, projectId: obraId, project: { companyId: sesion.companyId } },
    select: {
      id: true,
      numero: true,
      fechaCorte: true,
      estado: true,
      compromisos: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, descripcion: true, zona: true, color: true,
          cantidadPlan: true, unidad: true, cumplido: true,
          diaInicio: true, diaFin: true, proveedorId: true,
          proveedor: { select: { razonSocial: true } },
        },
      },
    },
  });

  if (!plan) return null;

  // El calendario laboral decide que columnas son dias de trabajo. Si la obra
  // no lo tiene sembrado, el conjunto va vacio y el tablero asume que todos lo
  // son: enseñar de mas es preferible a esconder un dia con trabajo dentro.
  //
  // Lleva el filtro de empresa aunque a estas alturas `obraId` ya este
  // probado —el plan se encontro con el, acotado por `companyId`—. Cuesta
  // cero y hace que la consulta sea segura POR SI MISMA, sin depender del
  // orden de las lineas de arriba: el dia que alguien mueva este bloque, no
  // se abre un agujero.
  const calendario = await prisma.workCalendar.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    select: { diaSemana: true, laborable: true },
  });

  const laborables = new Set(
    calendario.filter((d) => d.laborable).map((d) => d.diaSemana),
  );

  const compromisos: CompromisoEnTablero[] = plan.compromisos.map((c) => ({
    id: c.id,
    descripcion: c.descripcion,
    proveedorId: c.proveedorId,
    proveedorNombre: c.proveedor?.razonSocial ?? null,
    zona: c.zona,
    color: c.color,
    cantidadPlan: c.cantidadPlan?.toString() ?? null,
    unidad: c.unidad,
    cumplido: c.cumplido,
    diaInicio: c.diaInicio,
    diaFin: c.diaFin,
  }));

  const contratistas = await prisma.proveedor.findMany({
    where: { companyId: sesion.companyId, activo: true },
    orderBy: { razonSocial: "asc" },
    select: { id: true, razonSocial: true },
  });

  return {
    planId: plan.id,
    numero: plan.numero,
    fechaCorte: plan.fechaCorte,
    estado: plan.estado,
    tablero: construirTablero(plan.fechaCorte, laborables, compromisos),
    puedeGestionar: puede(sesion, "plan_semanal:gestionar"),
    contratistas: contratistas.map((p) => ({ id: p.id, nombre: p.razonSocial })),
  };
}
