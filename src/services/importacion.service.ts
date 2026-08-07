import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { sumar } from "@/lib/decimal";
import type { FilaImportada } from "@/lib/excel-presupuesto";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Escritura del presupuesto importado.
 *
 * El analisis del Excel vive en `@/lib/excel-presupuesto`: es logica pura y
 * se prueba sin base de datos ni servidor. Aqui solo queda lo que toca
 * datos, que es donde importan los permisos y el aislamiento por empresa.
 */

export type ResultadoImportacion =
  | { ok: true; capitulos: number; partidas: number; montoTotal: string }
  | { ok: false; error: string };

/**
 * Deduce el codigo del padre.
 *
 * "4.3" cuelga de "4.0"; "01.02.01" cuelga de "01.02". Se prueban ambas
 * convenciones porque conviven segun de donde venga el presupuesto.
 */
function codigoPadre(codigo: string, existentes: Set<string>): string | null {
  const segmentos = codigo.split(".");
  if (segmentos.length < 2) return null;

  const directo = segmentos.slice(0, -1).join(".");
  if (existentes.has(directo)) return directo;

  const comoCapitulo = `${directo}.0`;
  if (existentes.has(comoCapitulo)) return comoCapitulo;

  return null;
}

export async function aplicarImportacion(
  sesion: SesionActiva,
  obraId: string,
  filas: FilaImportada[],
  reemplazar: boolean,
): Promise<ResultadoImportacion> {
  if (!puede(sesion.role, "partida:importar")) {
    return { ok: false, error: "No tienes permiso para importar partidas." };
  }

  if (filas.length === 0) {
    return { ok: false, error: "No hay filas validas que importar." };
  }

  // El filtro por empresa sale de la sesion: es lo que impide cargar
  // partidas en una obra de otro cliente manipulando el identificador.
  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });

  if (!obra) return { ok: false, error: "Obra no encontrada." };

  // Un presupuesto congelado no se toca. Cambiarlo invalidaria todos los
  // indicadores calculados contra el.
  const lineaBase = await prisma.baseline.findFirst({
    where: { projectId: obraId, aprobadaAt: { not: null } },
    select: { version: true },
  });

  if (lineaBase) {
    return {
      ok: false,
      error:
        `El presupuesto ya fue congelado (linea base v${lineaBase.version}). ` +
        `Los cambios posteriores deben registrarse como adicionales o deductivos.`,
    };
  }

  const existentes = await prisma.wbsItem.count({ where: { projectId: obraId } });

  if (existentes > 0 && !reemplazar) {
    return {
      ok: false,
      error: `Esta obra ya tiene ${existentes} partidas. Marca "reemplazar" para sustituirlas.`,
    };
  }

  const codigos = new Set(filas.map((f) => f.codigo));
  const montoTotal = sumar(filas.map((f) => f.parcial ?? "0"));

  await prisma.$transaction(async (tx) => {
    if (existentes > 0) {
      // Se borran los hijos primero: la relacion padre-hijo tiene
      // restriccion de integridad y el borrado directo fallaria.
      await tx.wbsItem.deleteMany({
        where: { projectId: obraId, parentId: { not: null } },
      });
      await tx.wbsItem.deleteMany({ where: { projectId: obraId } });
    }

    // Se insertan por nivel para que el padre exista siempre antes que el hijo.
    const porNivel = [...filas].sort((a, b) => a.nivel - b.nivel);
    const idPorCodigo = new Map<string, string>();

    for (const [indice, f] of porNivel.entries()) {
      const padre = codigoPadre(f.codigo, codigos);

      const creado = await tx.wbsItem.create({
        data: {
          projectId: obraId,
          parentId: padre ? (idPorCodigo.get(padre) ?? null) : null,
          codigoPartida: f.codigo,
          tipo: f.tipo,
          descripcion: f.descripcion.slice(0, 500),
          nivel: f.nivel,
          orden: indice,
          unidad: f.unidad,
          metrado: f.metrado,
          precioUnitario: f.precioUnitario,
          parcial: f.parcial,
        },
        select: { id: true },
      });

      idPorCodigo.set(f.codigo, creado.id);
    }

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "WbsItem",
        entidadId: obraId,
        accion: reemplazar && existentes > 0 ? "UPDATE" : "CREATE",
        despues: {
          origen: "importacion-excel",
          filas: filas.length,
          montoTotal,
          reemplazo: existentes > 0,
        },
      },
    });
  });

  return {
    ok: true,
    capitulos: filas.filter((f) => f.tipo === "CAPITULO").length,
    partidas: filas.filter((f) => f.tipo === "PARTIDA").length,
    montoTotal,
  };
}
