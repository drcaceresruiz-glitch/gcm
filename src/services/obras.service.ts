import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { sumar } from "@/lib/decimal";
import { sumarHojas } from "@/lib/jerarquia-partidas";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Consulta de obras.
 *
 * Regla de aislamiento: el `companyId` sale SIEMPRE de la sesion, nunca de
 * un parametro de la peticion. Es lo unico que impide que un usuario de una
 * empresa vea las obras de otra manipulando un identificador en la URL.
 */

export class SinPermisoError extends Error {
  constructor(mensaje = "No tienes permiso para esta operacion.") {
    super(mensaje);
    this.name = "SinPermisoError";
  }
}

export interface ObraResumen {
  id: string;
  codigoObra: string | null;
  nombreObra: string;
  ubicacion: string | null;
  estado: string;
  fechaInicio: Date;
  fechaFinProgramada: Date;
  /// Suma de los parciales de todas las partidas. String para no perder
  /// precision al viajar del servidor al navegador.
  presupuestoTotal: string;
  totalPartidas: number;
}

export async function listarObras(
  sesion: SesionActiva,
): Promise<ObraResumen[]> {
  if (!puede(sesion, "obra:leer")) throw new SinPermisoError();

  const obras = await prisma.project.findMany({
    where: { companyId: sesion.companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      codigoObra: true,
      nombreObra: true,
      ubicacion: true,
      estado: true,
      fechaInicio: true,
      fechaFinProgramada: true,
    },
  });

  if (obras.length === 0) return [];

  // Se agrega en la base y no en JavaScript: sumar miles de partidas en
  // memoria seria innecesariamente costoso y perderia precision decimal.
  const totales = await prisma.wbsItem.groupBy({
    by: ["projectId"],
    where: {
      projectId: { in: obras.map((o) => o.id) },
      tipo: "PARTIDA",
    },
    _sum: { parcial: true },
    _count: { _all: true },
  });

  const porObra = new Map(totales.map((t) => [t.projectId, t]));

  return obras.map((obra) => {
    const agregado = porObra.get(obra.id);
    return {
      ...obra,
      presupuestoTotal: agregado?._sum.parcial?.toString() ?? "0",
      totalPartidas: agregado?._count._all ?? 0,
    };
  });
}

export interface ObraDetalle {
  id: string;
  codigoObra: string | null;
  nombreObra: string;
  ubicacion: string | null;
  cliente: string | null;
  estado: string;
  fechaInicio: Date;
  fechaFinProgramada: Date;
  /// Version de la linea base aprobada, o null si el presupuesto sigue abierto.
  lineaBaseVersion: number | null;
}

export async function obtenerObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<ObraDetalle | null> {
  if (!puede(sesion, "obra:leer")) throw new SinPermisoError();

  // El companyId sale de la sesion: manipular el id de la URL no permite
  // alcanzar la obra de otra empresa, simplemente no aparece.
  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: {
      id: true,
      codigoObra: true,
      nombreObra: true,
      ubicacion: true,
      cliente: true,
      estado: true,
      fechaInicio: true,
      fechaFinProgramada: true,
      baselines: {
        where: { aprobadaAt: { not: null } },
        orderBy: { version: "desc" },
        take: 1,
        select: { version: true },
      },
    },
  });

  if (!obra) return null;

  const { baselines, ...resto } = obra;
  return { ...resto, lineaBaseVersion: baselines[0]?.version ?? null };
}

export interface PartidaFila {
  id: string;
  codigoPartida: string;
  tipo: "CAPITULO" | "PARTIDA";
  /// Gobierna si el importe se recalcula al cambiar el metrado.
  modalidad: "PRECIOS_UNITARIOS" | "SUMA_ALZADA" | "ALCANCE";
  descripcion: string;
  nivel: number;
  unidad: string | null;
  metrado: string | null;
  precioUnitario: string | null;
  /// En las partidas, su propio parcial. En los capitulos, la suma de todo
  /// lo que cuelga de ellos.
  parcial: string | null;
}

export interface ArbolPartidas {
  filas: PartidaFila[];
  totalPartidas: number;
  montoTotal: string;
}

export async function listarPartidas(
  sesion: SesionActiva,
  obraId: string,
): Promise<ArbolPartidas> {
  if (!puede(sesion, "partida:leer")) throw new SinPermisoError();

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });

  if (!obra) return { filas: [], totalPartidas: 0, montoTotal: "0.00" };

  const items = await prisma.wbsItem.findMany({
    where: { projectId: obraId },
    orderBy: [{ orden: "asc" }, { codigoPartida: "asc" }],
    select: {
      id: true, parentId: true, codigoPartida: true, tipo: true,
      modalidad: true, descripcion: true, nivel: true, unidad: true,
      metrado: true, precioUnitario: true, parcial: true,
    },
  });

  // Subtotal de cada capitulo: se acumula hacia arriba por la cadena de
  // padres, para que un capitulo refleje tambien lo que hay en sus
  // subcapitulos y no solo en sus hijos directos.
  const parcialesPorNodo = new Map<string, string[]>();
  const padreDe = new Map(items.map((i) => [i.id, i.parentId]));

  for (const item of items) {
    if (item.tipo !== "PARTIDA" || !item.parcial) continue;

    let ancestro = padreDe.get(item.id) ?? null;
    while (ancestro) {
      const acumulado = parcialesPorNodo.get(ancestro) ?? [];
      acumulado.push(item.parcial.toString());
      parcialesPorNodo.set(ancestro, acumulado);
      ancestro = padreDe.get(ancestro) ?? null;
    }
  }

  const filas: PartidaFila[] = items.map((i) => ({
    id: i.id,
    codigoPartida: i.codigoPartida,
    tipo: i.tipo,
    modalidad: i.modalidad,
    descripcion: i.descripcion,
    nivel: i.nivel,
    unidad: i.unidad,
    metrado: i.metrado?.toString() ?? null,
    precioUnitario: i.precioUnitario?.toString() ?? null,
    parcial:
      i.tipo === "PARTIDA"
        ? (i.parcial?.toString() ?? null)
        : sumar(parcialesPorNodo.get(i.id) ?? []),
  }));

  const partidas = items.filter((i) => i.tipo === "PARTIDA");

  return {
    filas,
    totalPartidas: partidas.length,
    // Misma regla que en la importacion: el costo de una rama es la suma de
    // sus hojas. Si aqui se sumara todo, el total de la obra no cuadraria
    // con el que se mostro al importar.
    montoTotal: sumarHojas(
      filas.map((f) => ({
        codigo: f.codigoPartida,
        parcial: f.tipo === "PARTIDA" ? f.parcial : null,
      })),
    ),
  };
}
