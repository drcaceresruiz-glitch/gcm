import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import {
  codigoPadre,
  sumarHojas,
  calcularProfundidades,
} from "@/lib/jerarquia-partidas";
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
  const montoTotal = sumarHojas(filas);

  // Orden de presentacion: el del documento original. Mas abajo se insertan
  // por niveles para que el padre exista antes que el hijo, pero ese orden
  // tecnico no debe filtrarse a la pantalla, o el arbol saldria con todos
  // los capitulos juntos y luego todas las partidas.
  const ordenOriginal = new Map(filas.map((f, i) => [f.codigo, i]));

  const profundidades = calcularProfundidades([...codigos]);

  await prisma.$transaction(async (tx) => {
    if (existentes > 0) {
      /**
       * Se borra de fuera hacia dentro: en cada vuelta se eliminan las
       * hojas, es decir las filas que no son padre de ninguna otra.
       *
       * La relacion padre-hijo tiene restriccion de integridad. Borrar "las
       * que tienen padre" y luego el resto no funciona con tres niveles:
       * dentro de una misma sentencia no hay garantia de que los nietos se
       * eliminen antes que sus padres. Tampoco sirve borrar por `nivel`,
       * porque un padre y su hijo pueden compartirlo.
       */
      for (let vuelta = 0; vuelta < 50; vuelta++) {
        const conHijos = await tx.wbsItem.findMany({
          where: { projectId: obraId, parentId: { not: null } },
          select: { parentId: true },
          distinct: ["parentId"],
        });

        const idsPadres = conHijos
          .map((c) => c.parentId)
          .filter((id): id is string => id !== null);

        const { count } = await tx.wbsItem.deleteMany({
          where: { projectId: obraId, id: { notIn: idsPadres } },
        });

        if (count === 0) break;
      }
    }

    // Se insertan de menor a mayor profundidad real para que el padre
    // exista siempre antes que el hijo.
    const porProfundidad = [...filas].sort(
      (a, b) =>
        (profundidades.get(a.codigo) ?? 0) - (profundidades.get(b.codigo) ?? 0),
    );
    const idPorCodigo = new Map<string, string>();

    for (const f of porProfundidad) {
      const padre = codigoPadre(f.codigo, codigos);

      const creado = await tx.wbsItem.create({
        data: {
          projectId: obraId,
          parentId: padre ? (idPorCodigo.get(padre) ?? null) : null,
          codigoPartida: f.codigo,
          tipo: f.tipo,
          modalidad: f.modalidad,
          descripcion: f.descripcion.slice(0, 500),
          // Profundidad real en el arbol, no numero de segmentos del
          // codigo: es la que gobierna la sangria en pantalla.
          nivel: profundidades.get(f.codigo) ?? 0,
          orden: ordenOriginal.get(f.codigo) ?? 0,
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
