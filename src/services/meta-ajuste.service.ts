import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { sumar, multiplicar } from "@/lib/decimal";
import { mesesAjustadosAlPlazo } from "@/lib/gastos-contra-plazo";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Ajustar los meses de los gastos generales al plazo real de la obra.
 *
 * La pantalla ya avisaba de que unas lineas duraban mas que la obra, pero
 * dejaba al usuario con el problema en la mano: habia que salir, abrir el
 * Excel, corregir la columna y volver a cargarlo entero. Un aviso que no se
 * puede atender desde donde aparece acaba siendo ruido.
 *
 * Reescala conservando la proporcion entre lineas —la misma regla con la que
 * se genera la plantilla— y recalcula los totales de la meta.
 *
 * SOLO EN BORRADOR. Una meta aprobada esta congelada a proposito: es la
 * promesa contra la que se mide el margen, y si se pudiera recalcular
 * despues, las cifras ya publicadas cambiarian sin rastro. Para corregir una
 * aprobada se crea una version nueva, que es lo que este modulo ya permite.
 */

export interface ResultadoAjuste {
  ok: boolean;
  error?: string;
  /// Cuantas lineas cambiaron de meses.
  ajustadas?: number;
  /// Lo que sumaban los gastos generales antes y despues.
  antes?: string;
  despues?: string;
}

export async function ajustarMesesAlPlazo(
  sesion: SesionActiva,
  metaId: string,
): Promise<ResultadoAjuste> {
  if (!puede(sesion, "meta:crear")) {
    return {
      ok: false,
      error: "No tienes permiso para corregir el presupuesto meta.",
    };
  }

  const meta = await prisma.presupuestoMeta.findFirst({
    where: { id: metaId, project: { companyId: sesion.companyId } },
    select: {
      id: true,
      projectId: true,
      aprobadaAt: true,
      costoDirecto: true,
      project: { select: { fechaInicio: true, fechaFinProgramada: true } },
      gastosGeneralesLista: {
        orderBy: { orden: "asc" },
        select: {
          id: true,
          concepto: true,
          tipo: true,
          montoMensual: true,
          meses: true,
          montoTotal: true,
        },
      },
    },
  });

  if (!meta) return { ok: false, error: "Presupuesto meta no encontrado." };

  if (meta.aprobadaAt) {
    return {
      ok: false,
      error:
        "Esta meta ya esta aprobada y no se puede recalcular. Crea una version nueva.",
    };
  }

  const cerrada = await motivoSiObraCerrada(sesion, meta.projectId);
  if (cerrada) return { ok: false, error: cerrada };

  // El plazo sale de las fechas de la obra, no de lo que teclee nadie: es lo
  // que hace que esta correccion sea fiable.
  const dias =
    (meta.project.fechaFinProgramada.getTime() -
      meta.project.fechaInicio.getTime()) /
    86_400_000;
  const mesesObra = (dias / 30).toFixed(2);

  const lineas = meta.gastosGeneralesLista;
  const ajustes = mesesAjustadosAlPlazo(
    lineas.map((g) => ({
      concepto: g.concepto,
      tipo: g.tipo,
      meses: g.meses?.toString() ?? null,
    })),
    mesesObra,
  );

  if (ajustes.length === 0) {
    return { ok: false, error: "No hay meses que ajustar: ya cuadran con la obra." };
  }

  const antes = sumar(lineas.map((g) => g.montoTotal.toString()));

  // Los totales nuevos, calculados ANTES de escribir: si algo no cuadra, no
  // se ha tocado nada.
  const nuevos = new Map<string, { meses: string; total: string }>();
  for (const a of ajustes) {
    const linea = lineas[a.indice];
    if (!linea || linea.montoMensual === null) continue;
    const total = multiplicar(linea.montoMensual.toString(), a.despues, 2);
    if (total === null) continue;
    nuevos.set(linea.id, { meses: a.despues, total });
  }

  const despues = sumar(
    lineas.map((g) => nuevos.get(g.id)?.total ?? g.montoTotal.toString()),
  );

  await prisma.$transaction(async (tx) => {
    for (const [id, valor] of nuevos) {
      await tx.gastoGeneralMeta.update({
        where: { id },
        data: { meses: valor.meses, montoTotal: valor.total },
      });
    }

    // El total de la meta cambia con ellos. Si no se recalculara, la pantalla
    // enseñaria unas lineas corregidas y una suma vieja.
    await tx.presupuestoMeta.update({
      where: { id: meta.id },
      data: {
        gastosGenerales: despues,
        costoTotal: sumar([meta.costoDirecto.toString(), despues]),
      },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: meta.projectId,
        entidad: "PresupuestoMeta",
        entidadId: meta.id,
        accion: "UPDATE",
        antes: { gastosGenerales: antes },
        despues: {
          gastosGenerales: despues,
          mesesObra,
          lineasAjustadas: nuevos.size,
        },
      },
    });
  });

  return { ok: true, ajustadas: nuevos.size, antes, despues };
}
