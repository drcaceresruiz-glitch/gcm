import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * El criterio de la obra sobre los gastos generales.
 *
 * Es la primera decision que hay que tomar DESPUES de cargar el presupuesto
 * contractual y ANTES de seguir llenando nada: dice si los gastos generales
 * cuentan en la BOLSA OPERATIVA o quedan fuera.
 *
 * Por que es una decision y no un ajuste con valor por defecto: en la practica
 * del usuario los gastos generales (y la utilidad) NO son del presupuesto que
 * gestiona la obra —solo se tocan si el gerente general autoriza pasar dinero
 * de ahi para cubrir un comprometido cuando la bolsa ya se agoto—. Pero eso
 * cambia de una constructora a otra y de un contrato a otro, asi que el
 * sistema no puede elegir por nadie: pregunta una vez, al principio, y lo
 * recuerda.
 *
 * ES DE PRESENTACION, NO DE DATOS. Los gastos generales se siguen cargando y
 * guardando siempre; el criterio solo decide si entran en el calculo de la
 * bolsa. Por eso se puede cambiar en cualquier momento, incluso con metas ya
 * aprobadas y congeladas, sin migrar nada ni reescribir el historico.
 */

export interface CriterioObra {
  /// null = todavia no se ha decidido.
  incluyeGastosGenerales: boolean | null;
  /// Ya hay presupuesto contractual: la pregunta tiene sentido.
  hayPresupuesto: boolean;
  /**
   * Hay que decidir YA: hay presupuesto y nadie ha elegido.
   *
   * Mientras sea true la obra no deja avanzar, porque cualquier cifra de
   * margen que se enseñara estaria calculada con un criterio que nadie ha
   * confirmado.
   */
  faltaDecidir: boolean;
}

export async function criterioDeObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<CriterioObra | null> {
  if (!puede(sesion, "obra:leer")) return null;

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { metaIncluyeGastosGenerales: true },
  });
  if (!obra) return null;

  /**
   * La pregunta se hace cuando ya hay contra que comparar. Antes del
   * presupuesto no significa nada y solo estorbaria al alta de la obra.
   *
   * OJO: `lineaBaseVersion` NO es una columna de `Project` —es un derivado que
   * arma `obtenerObra`—, asi que hay que preguntar por la linea base aprobada.
   * Pedirla en el `select` compila igual: Prisma no valida los `select` en
   * tipos, y es la misma trampa que ya tumbo la pantalla de mensajeria con
   * `nombre` en vez de `nombreObra`.
   */
  const base = await prisma.baseline.findFirst({
    where: { projectId: obraId, aprobadaAt: { not: null } },
    select: { id: true },
  });
  const hayPresupuesto = base !== null;

  return {
    incluyeGastosGenerales: obra.metaIncluyeGastosGenerales,
    hayPresupuesto,
    faltaDecidir:
      hayPresupuesto && obra.metaIncluyeGastosGenerales === null,
  };
}

/**
 * Guarda el criterio. Se puede cambiar las veces que haga falta.
 *
 * Pide `obra:editar` y no un permiso nuevo: es una decision de como se lee el
 * dinero de la obra, del mismo rango que editar sus datos.
 */
export async function decidirGastosGenerales(
  sesion: SesionActiva,
  obraId: string,
  incluir: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!puede(sesion, "obra:editar")) {
    return {
      ok: false,
      error: "No tienes permiso para cambiar el criterio de la obra.",
    };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const { count } = await prisma.project.updateMany({
    where: { id: obraId, companyId: sesion.companyId },
    data: { metaIncluyeGastosGenerales: incluir },
  });

  if (count === 0) return { ok: false, error: "Obra no encontrada." };

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "Project",
      entidadId: obraId,
      accion: "UPDATE",
      despues: { metaIncluyeGastosGenerales: incluir },
    },
  });

  return { ok: true };
}
