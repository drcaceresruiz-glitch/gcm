import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { construirTablero, type CompromisoEnTablero, type Tablero } from "@/lib/tablero-semanal";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";
import type { EstadoPlanSemanal } from "@/generated/prisma/enums";
import { alcanzaObra } from "@/lib/alcance-obras";

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

  // El alcance por obra, con la MISMA respuesta que «no tienes permiso»: las
  // dos dicen «esto no es para ti» y distinguirlas ya seria contar algo. Ver
  // la regla 4 en `gcm-limites-de-capas`.
  if (!alcanzaObra(sesion, obraId)) return null;

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


export interface ColocacionTarjeta {
  compromisoId: string;
  /// ISO 1-7, o null para devolverla a la banda «sin dia».
  diaInicio: number | null;
  diaFin: number | null;
  proveedorId: string | null;
  /// Hex `#rrggbb`, o null para dejarla neutra.
  color: string | null;
}

export type ResultadoColocacion =
  | { ok: true; colocadas: number }
  | { ok: false; error: string };

/**
 * Coloca las tarjetas del tablero, todas de una vez.
 *
 * De una vez y no una a una porque asi se usa: la reunion decide la semana
 * entera mirando la pizarra y despues alguien la pasa. Guardar tarjeta a
 * tarjeta serian veinte peticiones y veinte oportunidades de dejar el tablero
 * a medias.
 *
 * NO se toca `descripcion`, `cantidadPlan` ni nada del compromiso en si: el
 * tablero coloca, no replanifica. Comprometer trabajo sigue siendo del PTS, y
 * mezclarlo aqui permitiria cambiar lo prometido desde una pantalla que se usa
 * con la semana ya en marcha.
 */
export async function colocarTarjetas(
  sesion: SesionActiva,
  obraId: string,
  planId: string,
  tarjetas: readonly ColocacionTarjeta[],
): Promise<ResultadoColocacion> {
  if (!puede(sesion, "plan_semanal:gestionar")) {
    return { ok: false, error: "No tienes permiso para mover el tablero." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const plan = await prisma.planSemanal.findFirst({
    where: { id: planId, projectId: obraId, project: { companyId: sesion.companyId } },
    select: { id: true, estado: true, compromisos: { select: { id: true } } },
  });
  if (!plan) return { ok: false, error: "Semana no encontrada." };

  // Una semana cerrada ya dio su PPC y se leyo. Mover sus tarjetas cambiaria
  // el reparto por dia de un resultado que ya se firmo.
  if (plan.estado !== "ABIERTO") {
    return { ok: false, error: "La semana esta cerrada: su tablero ya no se mueve." };
  }

  // Solo se aceptan compromisos DE ESTA semana. Sin esto, un id de otra semana
  // —o de otra obra— colado en el formulario se escribiria igual: la peticion
  // la arma el navegador y no se le cree nada.
  const deLaSemana = new Set(plan.compromisos.map((c) => c.id));
  const validas = tarjetas.filter((t) => deLaSemana.has(t.compromisoId));

  const proveedoresPedidos = validas
    .map((t) => t.proveedorId)
    .filter((p): p is string => p !== null);

  // Y los proveedores, de ESTA empresa. Un id ajeno dejaria una fila del
  // tablero con el nombre de un contratista de otro cliente.
  const propios = new Set(
    (
      await prisma.proveedor.findMany({
        where: { id: { in: proveedoresPedidos }, companyId: sesion.companyId },
        select: { id: true },
      })
    ).map((p) => p.id),
  );

  await prisma.$transaction(
    validas.map((t) =>
      prisma.compromisoSemanal.update({
        where: { id: t.compromisoId },
        data: {
          // Fuera del rango ISO se guarda null: es «sin dia», que es lo que de
          // hecho significa un valor que ninguna columna puede representar.
          diaInicio: enRangoIso(t.diaInicio),
          diaFin: enRangoIso(t.diaFin),
          proveedorId: t.proveedorId && propios.has(t.proveedorId) ? t.proveedorId : null,
          color: /^#[0-9a-f]{6}$/i.test(t.color ?? "") ? t.color : null,
        },
      }),
    ),
  );

  return { ok: true, colocadas: validas.length };
}

/** ISO 1-7, o null. Cualquier otra cosa es «sin dia». */
function enRangoIso(dia: number | null): number | null {
  return dia !== null && Number.isInteger(dia) && dia >= 1 && dia <= 7 ? dia : null;
}
