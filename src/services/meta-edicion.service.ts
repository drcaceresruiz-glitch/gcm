import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import {
  esCero,
  esPositivo,
  multiplicar,
  normalizarDecimal,
  sumar,
} from "@/lib/decimal";
import { metaQueManda } from "@/services/meta.service";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Corregir el presupuesto meta dentro de la app.
 *
 * Hasta ahora la meta solo entraba por Excel: un precio mal tecleado obligaba
 * a rehacer la plantilla entera y volver a subirla, perdiendo por el camino
 * cualquier recargo ya ajustado. Aqui se corrige linea a linea.
 *
 * **Solo sobre un BORRADOR.** Una meta aprobada esta congelada, y eso es lo
 * que hace que la bolsa signifique algo: con una meta editable bastaria
 * bajarla cuando el gasto se va, y todos los indicadores mentirian hacia
 * atras sin dejar rastro. Es la misma razon por la que `aprobarMeta` existe.
 *
 * Vive aparte de `meta.service` porque es OTRA cosa: aquel compone y compara,
 * este escribe linea a linea. Comparte con el las guardas y `metaQueManda`,
 * que es la unica regla que no puede duplicarse -cual de las versiones manda-.
 */

export interface LineaDeLaMeta {
  id: string;
  codigoRef: string | null;
  descripcion: string;
  tipo: "CAPITULO" | "PARTIDA";
  unidad: string | null;
  metrado: string | null;
  precioUnitario: string | null;
  parcial: string | null;
  porcentajeRecargo: string | null;
  orden: number;
}

export interface BorradorDeMeta {
  metaId: string;
  version: number;
  lineas: LineaDeLaMeta[];
}

/** Las lineas del borrador editable. `null` si no hay, o si ya se aprobo. */
export async function lineasDelBorrador(
  sesion: SesionActiva,
  obraId: string,
): Promise<BorradorDeMeta | null> {
  if (!puede(sesion, "meta:leer")) return null;

  const meta = await metaQueManda(sesion.companyId, obraId);
  if (!meta || meta.aprobadaAt !== null) return null;

  const filas = await prisma.presupuestoMetaItem.findMany({
    where: { presupuestoMetaId: meta.id },
    orderBy: { orden: "asc" },
  });

  return {
    metaId: meta.id,
    version: meta.version,
    lineas: filas.map((f) => ({
      id: f.id,
      codigoRef: f.codigoRef,
      descripcion: f.descripcion,
      tipo: f.tipo as "CAPITULO" | "PARTIDA",
      unidad: f.unidad,
      // A texto y nunca a `number`: son importes.
      metrado: f.metrado?.toString() ?? null,
      precioUnitario: f.precioUnitario?.toString() ?? null,
      parcial: f.parcial?.toString() ?? null,
      porcentajeRecargo: f.porcentajeRecargo?.toString() ?? null,
      orden: f.orden,
    })),
  };
}

/**
 * El borrador sobre el que se puede escribir, o el motivo por el que no.
 *
 * Las cuatro guardas de toda escritura en la meta en un solo sitio: permiso,
 * obra abierta, que exista y que no este aprobada. Repetirlas en cada funcion
 * es como una de ellas acaba faltando justo en la cuarta.
 */
async function borradorEditable(
  sesion: SesionActiva,
  obraId: string,
): Promise<{ ok: true; metaId: string } | { ok: false; error: string }> {
  if (!puede(sesion, "meta:crear")) {
    return { ok: false, error: "No tienes permiso para cambiar el presupuesto meta." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const meta = await metaQueManda(sesion.companyId, obraId);
  if (!meta) return { ok: false, error: "Esta obra todavía no tiene presupuesto meta." };

  if (meta.aprobadaAt !== null) {
    return {
      ok: false,
      error:
        `La meta v${meta.version} está aprobada y no se puede editar. ` +
        "Para cambiarla se carga una versión nueva.",
    };
  }

  return { ok: true, metaId: meta.id };
}

type Transaccion = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Vuelve a sumar el costo de la meta desde sus lineas.
 *
 * Se llama despues de CADA cambio y dentro de la misma transaccion: si el
 * total se recalculara aparte, un fallo entre medias dejaria una meta cuyas
 * lineas no suman lo que dice su cabecera, y esa cifra gobierna la bolsa.
 *
 * El costo directo es la suma llana de los parciales -la MISMA cuenta que
 * hace `crearMeta`- y el total le anade los gastos generales, que esta
 * edicion no toca.
 */
async function recalcularCosto(tx: Transaccion, metaId: string): Promise<void> {
  const [lineas, meta] = await Promise.all([
    tx.presupuestoMetaItem.findMany({
      where: { presupuestoMetaId: metaId },
      select: { parcial: true },
    }),
    tx.presupuestoMeta.findUniqueOrThrow({
      where: { id: metaId },
      select: { gastosGenerales: true },
    }),
  ]);

  const costoDirecto = sumar(
    lineas
      .map((l) => l.parcial?.toString() ?? null)
      .filter((p): p is string => p !== null),
  );

  await tx.presupuestoMeta.update({
    where: { id: metaId },
    data: {
      costoDirecto,
      costoTotal: sumar([costoDirecto, meta.gastosGenerales.toString()]),
    },
  });
}

export interface DatosLineaMeta {
  descripcion: string;
  unidad?: string | null;
  metrado?: string | null;
  precioUnitario?: string | null;
  /// Solo se usa si no hay metrado y precio: entonces es una suma alzada.
  parcial?: string | null;
}

interface CifrasLinea {
  unidad: string | null;
  metrado: string | null;
  precioUnitario: string | null;
  parcial: string | null;
}

/**
 * Las cifras de una linea, normalizadas y con el parcial ya resuelto.
 *
 * El parcial se CALCULA cuando hay metrado y precio, en vez de aceptar el que
 * llegue: es la misma regla que la formula de la plantilla, y asi una linea
 * tecleada en la app y otra venida del Excel no pueden cuadrar distinto. Un
 * importe que viaja por el formulario y se guarda tal cual es ademas un
 * importe que cualquiera puede cambiar editando la pagina.
 */
function cifrasDeLinea(
  d: DatosLineaMeta,
): { ok: true; valores: CifrasLinea } | { ok: false; error: string } {
  const num = (v: string | null | undefined, decimales: number, campo: string) => {
    const crudo = (v ?? "").trim();
    if (crudo === "") return { ok: true as const, valor: null };
    const n = normalizarDecimal(crudo, decimales);
    if (n === null) return { ok: false as const, error: `El ${campo} no es un número.` };
    if (!esPositivo(n) && !esCero(n)) {
      return { ok: false as const, error: `El ${campo} no puede ser negativo.` };
    }
    return { ok: true as const, valor: n };
  };

  const metrado = num(d.metrado, 4, "metrado");
  if (!metrado.ok) return { ok: false, error: metrado.error };
  const precio = num(d.precioUnitario, 4, "precio unitario");
  if (!precio.ok) return { ok: false, error: precio.error };
  const suelto = num(d.parcial, 2, "importe");
  if (!suelto.ok) return { ok: false, error: suelto.error };

  const parcial =
    metrado.valor !== null && precio.valor !== null
      ? multiplicar(metrado.valor, precio.valor, 2)
      : suelto.valor;

  return {
    ok: true,
    valores: {
      unidad: (d.unidad ?? "").trim() || null,
      metrado: metrado.valor,
      precioUnitario: precio.valor,
      parcial,
    },
  };
}

export type ResultadoLinea = { ok: true } | { ok: false; error: string };

/**
 * Corregir una linea del borrador.
 *
 * El CODIGO no se toca aqui a proposito: es la referencia contra el
 * contractual, y cambiarlo mueve la linea de sitio en la comparacion sin que
 * se vea. Para eso estan anadir y borrar, que sí lo dicen.
 */
export async function editarLineaDeMeta(
  sesion: SesionActiva,
  obraId: string,
  lineaId: string,
  datos: DatosLineaMeta,
): Promise<ResultadoLinea> {
  const borrador = await borradorEditable(sesion, obraId);
  if (!borrador.ok) return borrador;

  const descripcion = datos.descripcion.trim();
  if (!descripcion) return { ok: false, error: "La línea necesita una descripción." };

  const cifras = cifrasDeLinea(datos);
  if (!cifras.ok) return cifras;

  // El identificador viene del formulario: se ata a ESTA meta antes de tocar
  // nada, o con el id de una linea ajena se editaria la meta de otra obra.
  const linea = await prisma.presupuestoMetaItem.findFirst({
    where: { id: lineaId, presupuestoMetaId: borrador.metaId },
    select: { id: true, tipo: true },
  });
  if (!linea) return { ok: false, error: "Esa línea no es de esta meta." };

  await prisma.$transaction(async (tx) => {
    await tx.presupuestoMetaItem.update({
      where: { id: linea.id },
      data: {
        descripcion: descripcion.slice(0, 500),
        unidad: cifras.valores.unidad?.slice(0, 20) ?? null,
        metrado: cifras.valores.metrado,
        precioUnitario: cifras.valores.precioUnitario,
        // Un capitulo es un titulo: no lleva importe propio y no suma.
        parcial: linea.tipo === "CAPITULO" ? null : cifras.valores.parcial,
      },
    });
    await recalcularCosto(tx, borrador.metaId);
  });

  return { ok: true };
}

/** Anadir una linea al final del borrador. */
export async function anadirLineaAMeta(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosLineaMeta & { codigoRef: string | null },
): Promise<ResultadoLinea> {
  const borrador = await borradorEditable(sesion, obraId);
  if (!borrador.ok) return borrador;

  const descripcion = datos.descripcion.trim();
  if (!descripcion) return { ok: false, error: "La línea necesita una descripción." };

  const cifras = cifrasDeLinea(datos);
  if (!cifras.ok) return cifras;

  const codigoRef = (datos.codigoRef ?? "").trim() || null;

  if (codigoRef !== null) {
    const repetido = await prisma.presupuestoMetaItem.findFirst({
      where: { presupuestoMetaId: borrador.metaId, codigoRef },
      select: { id: true },
    });
    if (repetido) {
      return {
        ok: false,
        error: `El código ${codigoRef} ya está en la meta. Cada línea es única.`,
      };
    }
  }

  const ultima = await prisma.presupuestoMetaItem.findFirst({
    where: { presupuestoMetaId: borrador.metaId },
    orderBy: { orden: "desc" },
    select: { orden: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.presupuestoMetaItem.create({
      data: {
        presupuestoMetaId: borrador.metaId,
        codigoRef,
        descripcion: descripcion.slice(0, 500),
        // Se anaden PARTIDAS: un capitulo nuevo cambia la jerarquia entera, y
        // eso es rehacer la meta, no corregirla.
        tipo: "PARTIDA",
        nivel: 1,
        orden: (ultima?.orden ?? 0) + 1,
        unidad: cifras.valores.unidad?.slice(0, 20) ?? null,
        metrado: cifras.valores.metrado,
        precioUnitario: cifras.valores.precioUnitario,
        parcial: cifras.valores.parcial,
        porcentajeRecargo: null,
      },
    });
    await recalcularCosto(tx, borrador.metaId);
  });

  return { ok: true };
}

/** Quitar una linea del borrador. */
export async function eliminarLineaDeMeta(
  sesion: SesionActiva,
  obraId: string,
  lineaId: string,
): Promise<ResultadoLinea> {
  const borrador = await borradorEditable(sesion, obraId);
  if (!borrador.ok) return borrador;

  const linea = await prisma.presupuestoMetaItem.findFirst({
    where: { id: lineaId, presupuestoMetaId: borrador.metaId },
    select: { id: true, tipo: true },
  });
  if (!linea) return { ok: false, error: "Esa línea no es de esta meta." };

  if (linea.tipo === "CAPITULO") {
    return {
      ok: false,
      error:
        "Un capítulo no se borra desde aquí: sus partidas se quedarían sin " +
        "sitio y sin recargo. Para eso se carga una versión nueva de la meta.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.presupuestoMetaItem.delete({ where: { id: linea.id } });
    await recalcularCosto(tx, borrador.metaId);
  });

  return { ok: true };
}
