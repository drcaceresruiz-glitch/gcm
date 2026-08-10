import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { sumar, esNegativo, normalizarDecimal } from "@/lib/decimal";
import {
  importeDeFrente,
  avanceVigente,
  resumenEncargo,
  coberturaObra,
  type ResumenEncargo,
  type Cobertura,
} from "@/lib/encargos";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";
import type { EstadoEncargo, TipoImpuesto } from "@/generated/prisma/enums";

/**
 * Encargos a proveedores: repartir la obra en frentes, cada uno con su
 * proveedor, su monto pactado y su avance.
 *
 * Toda la aritmetica delicada vive en `@/lib/encargos` (pura, con pruebas).
 * Aqui solo queda lo que toca datos: permisos, aislamiento por empresa y
 * cruzar cada encargo con lo que ya se le ha PEDIDO a ese proveedor en
 * ordenes de compra.
 */

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export interface PartidaAsignable {
  id: string;
  codigoPartida: string;
  descripcion: string;
  parcial: string;
  /// Si ya esta en algun encargo: cuanto se ha asignado ya (suma de
  /// fracciones) y a que proveedores. Para no repartir de mas sin darse cuenta.
  asignadoPorcentaje: number;
  proveedores: string[];
}

export interface EncargoResumen {
  id: string;
  numero: number;
  descripcion: string;
  estado: EstadoEncargo;
  proveedor: { id: string; razonSocial: string; ruc: string };
  tipoImpuesto: TipoImpuesto;
  fechaInicio: Date | null;
  fechaFin: Date | null;
  partidas: number;
  /// Fecha de la ultima valorizacion, si hay.
  ultimaValorizacion: Date | null;
  cuentas: ResumenEncargo;
}

export interface EncargosDeObra {
  encargos: EncargoResumen[];
  cobertura: Cobertura;
}

/**
 * Los encargos de una obra, con sus cuentas ya cruzadas contra las ordenes.
 *
 * El comprometido de cada encargo NO es el de sus partidas a secas, sino lo
 * que se le ha pedido A ESE PROVEEDOR imputado a esas partidas: si una partida
 * se reparte entre dos, cada encargo cuenta solo el dinero de su proveedor.
 * Por eso se traen las imputaciones con su proveedor y se suman en memoria en
 * vez de con un `groupBy`, que no sabe agrupar por un campo de la relacion.
 */
export async function listarEncargos(
  sesion: SesionActiva,
  obraId: string,
): Promise<EncargosDeObra> {
  const vacio: EncargosDeObra = {
    encargos: [],
    cobertura: coberturaObra("0.00", "0.00"),
  };

  if (!puede(sesion, "encargo:leer")) return vacio;

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return vacio;

  const [encargos, imputaciones, presupuesto] = await Promise.all([
    prisma.encargoProveedor.findMany({
      where: { projectId: obraId },
      orderBy: { numero: "asc" },
      select: {
        id: true,
        numero: true,
        descripcion: true,
        estado: true,
        tipoImpuesto: true,
        montoContratado: true,
        fechaInicio: true,
        fechaFin: true,
        proveedor: { select: { id: true, razonSocial: true, ruc: true } },
        partidas: {
          select: { wbsItemId: true, fraccion: true, partida: { select: { parcial: true } } },
        },
        valorizaciones: {
          orderBy: { fecha: "desc" },
          select: { fecha: true, porcentaje: true, createdAt: true },
        },
      },
    }),
    // Todo lo pedido y aprobado en la obra, con su proveedor y su partida:
    // de aqui sale el comprometido de cada encargo, cruzando proveedor+partida.
    prisma.ordenImputacion.findMany({
      where: {
        ordenCompra: {
          projectId: obraId,
          companyId: sesion.companyId,
          estado: "APROBADA",
        },
      },
      select: {
        wbsItemId: true,
        importe: true,
        ordenCompra: { select: { proveedorId: true } },
      },
    }),
    prisma.wbsItem.aggregate({
      where: { tipo: "PARTIDA", projectId: obraId },
      _sum: { parcial: true },
    }),
  ]);

  // Comprometido por (proveedor, partida): la clave es el par, porque el mismo
  // proveedor puede tener varias partidas y la misma partida varios proveedores.
  const comprometidoPar = new Map<string, string[]>();
  for (const i of imputaciones) {
    const clave = `${i.ordenCompra.proveedorId}::${i.wbsItemId}`;
    const lista = comprometidoPar.get(clave) ?? [];
    lista.push(i.importe.toString());
    comprometidoPar.set(clave, lista);
  }

  let asignadoTotal = "0.00";

  const filas: EncargoResumen[] = encargos.map((e) => {
    const partidasFrente = e.partidas.map((p) => ({
      parcial: p.partida.parcial?.toString() ?? "0",
      fraccion: p.fraccion.toString(),
    }));
    const presupuestoFrente = importeDeFrente(partidasFrente);
    asignadoTotal = sumar([asignadoTotal, presupuestoFrente]);

    // Comprometido = lo pedido a ESTE proveedor en las partidas del encargo.
    const comprometido = sumar(
      e.partidas.flatMap(
        (p) => comprometidoPar.get(`${e.proveedor.id}::${p.wbsItemId}`) ?? [],
      ),
    );

    const vigente = avanceVigente(
      e.valorizaciones.map((v) => ({
        fecha: v.fecha,
        porcentaje: v.porcentaje.toString(),
        createdAt: v.createdAt,
      })),
    );

    const cuentas = resumenEncargo({
      montoContratado: e.montoContratado.toString(),
      presupuestoFrente,
      comprometido,
      avancePorcentaje: vigente ? vigente.porcentaje : null,
    });

    return {
      id: e.id,
      numero: e.numero,
      descripcion: e.descripcion,
      estado: e.estado,
      proveedor: e.proveedor,
      tipoImpuesto: e.tipoImpuesto,
      fechaInicio: e.fechaInicio,
      fechaFin: e.fechaFin,
      partidas: e.partidas.length,
      ultimaValorizacion: vigente ? vigente.fecha : null,
      cuentas,
    };
  });

  const total = presupuesto._sum.parcial?.toString() ?? "0.00";

  return {
    encargos: filas,
    cobertura: coberturaObra(normalizarDecimal(total, 2) ?? "0.00", asignadoTotal),
  };
}

export interface EncargoDetalle {
  id: string;
  numero: number;
  descripcion: string;
  estado: EstadoEncargo;
  proveedor: { id: string; razonSocial: string; ruc: string };
  tipoImpuesto: TipoImpuesto;
  montoContratado: string;
  fechaInicio: Date | null;
  fechaFin: Date | null;
  notas: string | null;
  partidas: {
    wbsItemId: string;
    codigoPartida: string;
    descripcion: string;
    parcial: string;
    fraccion: string;
  }[];
  valorizaciones: {
    id: string;
    fecha: Date;
    porcentaje: string;
    nota: string | null;
    registradoPor: string;
  }[];
}

/** Un encargo con su frente y su historial de valorizaciones. */
export async function obtenerEncargo(
  sesion: SesionActiva,
  obraId: string,
  encargoId: string,
): Promise<EncargoDetalle | null> {
  if (!puede(sesion, "encargo:leer")) return null;

  const e = await prisma.encargoProveedor.findFirst({
    where: {
      id: encargoId,
      projectId: obraId,
      project: { companyId: sesion.companyId },
    },
    select: {
      id: true,
      numero: true,
      descripcion: true,
      estado: true,
      tipoImpuesto: true,
      montoContratado: true,
      fechaInicio: true,
      fechaFin: true,
      notas: true,
      proveedor: { select: { id: true, razonSocial: true, ruc: true } },
      partidas: {
        select: {
          wbsItemId: true,
          fraccion: true,
          partida: {
            select: { codigoPartida: true, descripcion: true, parcial: true },
          },
        },
      },
      valorizaciones: {
        orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          fecha: true,
          porcentaje: true,
          nota: true,
          registradoPor: true,
        },
      },
    },
  });

  if (!e) return null;

  return {
    id: e.id,
    numero: e.numero,
    descripcion: e.descripcion,
    estado: e.estado,
    proveedor: e.proveedor,
    tipoImpuesto: e.tipoImpuesto,
    montoContratado: e.montoContratado.toString(),
    fechaInicio: e.fechaInicio,
    fechaFin: e.fechaFin,
    notas: e.notas,
    partidas: e.partidas
      .map((p) => ({
        wbsItemId: p.wbsItemId,
        codigoPartida: p.partida.codigoPartida,
        descripcion: p.partida.descripcion,
        parcial: p.partida.parcial?.toString() ?? "0.00",
        fraccion: p.fraccion.toString(),
      }))
      .sort((a, b) => a.codigoPartida.localeCompare(b.codigoPartida, "es")),
    valorizaciones: e.valorizaciones.map((v) => ({
      id: v.id,
      fecha: v.fecha,
      porcentaje: v.porcentaje.toString(),
      nota: v.nota,
      registradoPor: v.registradoPor,
    })),
  };
}

/**
 * Las partidas de la obra que se pueden asignar, con lo ya repartido de cada
 * una. Se ensena cuanto lleva asignado y a quien para no pasarse del 100 %.
 */
export async function partidasAsignables(
  sesion: SesionActiva,
  obraId: string,
): Promise<PartidaAsignable[]> {
  if (!puede(sesion, "encargo:leer")) return [];

  const partidas = await prisma.wbsItem.findMany({
    where: {
      tipo: "PARTIDA",
      projectId: obraId,
      project: { companyId: sesion.companyId },
    },
    orderBy: { orden: "asc" },
    select: {
      id: true,
      codigoPartida: true,
      descripcion: true,
      parcial: true,
      encargos: {
        select: {
          fraccion: true,
          encargo: {
            select: {
              estado: true,
              proveedor: { select: { razonSocial: true } },
            },
          },
        },
      },
    },
  });

  return partidas.map((p) => {
    // Solo cuentan los encargos VIGENTES: uno anulado ya no reserva nada.
    const vivos = p.encargos.filter((e) => e.encargo.estado === "VIGENTE");
    const asignado = vivos.reduce((s, e) => s + Number(e.fraccion), 0);

    return {
      id: p.id,
      codigoPartida: p.codigoPartida,
      descripcion: p.descripcion,
      parcial: p.parcial?.toString() ?? "0.00",
      asignadoPorcentaje: asignado,
      proveedores: [...new Set(vivos.map((e) => e.encargo.proveedor.razonSocial))],
    };
  });
}

export interface CapituloAsignable {
  id: string;
  codigoPartida: string;
  descripcion: string;
  nivel: number;
  /// Todas las partidas HOJA que cuelgan del capitulo, a cualquier profundidad.
  partidaIds: string[];
}

/**
 * Los capitulos de la obra con las partidas que agrupan.
 *
 * El frente de un encargo suele SER un capitulo entero —"toda la estructura
 * metalica"—, asi que la pantalla ofrece elegirlo de un golpe: al escogerlo se
 * rellena la descripcion y se marcan sus partidas, y desde ahi se edita. Las
 * partidas hoja salen recorriendo el arbol por `parentId`, no por prefijo de
 * codigo: el codigo es una etiqueta y "7.3.1" es hermana de "7.3", no su hija.
 */
export async function capitulosConPartidas(
  sesion: SesionActiva,
  obraId: string,
): Promise<CapituloAsignable[]> {
  if (!puede(sesion, "encargo:leer")) return [];

  const items = await prisma.wbsItem.findMany({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: { orden: "asc" },
    select: {
      id: true,
      parentId: true,
      tipo: true,
      codigoPartida: true,
      descripcion: true,
      nivel: true,
      parcial: true,
    },
  });

  const hijosDe = new Map<string, typeof items>();
  for (const it of items) {
    if (it.parentId === null) continue;
    const lista = hijosDe.get(it.parentId) ?? [];
    lista.push(it);
    hijosDe.set(it.parentId, lista);
  }

  // Partidas hoja con importe que cuelgan de un nodo, bajando por el arbol.
  function partidasDe(nodoId: string): string[] {
    const salida: string[] = [];
    const pila = [...(hijosDe.get(nodoId) ?? [])];
    while (pila.length > 0) {
      const n = pila.pop()!;
      if (n.tipo === "PARTIDA" && n.parcial !== null) salida.push(n.id);
      const suyos = hijosDe.get(n.id);
      if (suyos) pila.push(...suyos);
    }
    return salida;
  }

  return items
    .filter((i) => i.tipo === "CAPITULO")
    .map((c) => ({
      id: c.id,
      codigoPartida: c.codigoPartida,
      descripcion: c.descripcion,
      nivel: c.nivel,
      partidaIds: partidasDe(c.id),
    }))
    // Sin partidas medibles no hay nada que asignar: un capitulo de puros
    // subtitulos no es un frente.
    .filter((c) => c.partidaIds.length > 0);
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export type ResultadoEncargo =
  | { ok: true; id: string }
  | { ok: false; error: string };

export interface LineaFrente {
  wbsItemId: string;
  /// 0..100. Fraccion de la partida para este encargo.
  fraccion: string;
}

export interface DatosEncargo {
  proveedorId: string;
  descripcion: string;
  montoContratado: string;
  fechaInicio?: string;
  fechaFin?: string;
  notas?: string;
  partidas: LineaFrente[];
}

/** Reglas comunes de un encargo, antes de tocar la base. */
function validar(datos: DatosEncargo): string | null {
  if (!datos.descripcion.trim()) return "El encargo necesita una descripcion.";

  const monto = normalizarDecimal(datos.montoContratado, 2);
  if (monto === null || esNegativo(monto)) {
    return "El monto contratado tiene que ser un numero valido y no negativo.";
  }

  if (datos.partidas.length === 0) {
    return "Un encargo tiene que cubrir al menos una partida.";
  }

  for (const linea of datos.partidas) {
    const f = Number(linea.fraccion);
    if (!Number.isFinite(f) || f <= 0 || f > 100) {
      return "Cada fraccion tiene que estar entre 0 y 100.";
    }
  }

  // No repetir la misma partida dos veces dentro del mismo encargo.
  const ids = datos.partidas.map((p) => p.wbsItemId);
  if (new Set(ids).size !== ids.length) {
    return "Una partida no puede estar dos veces en el mismo encargo.";
  }

  return null;
}

/**
 * Comprueba que las partidas existen en la obra y que, sumando lo ya asignado
 * en OTROS encargos vigentes, ninguna se pasa del 100 %.
 *
 * Es lo que impide repartir la misma partida de mas entre proveedores: el caso
 * que el usuario describio —fraccionar y dar el resto a otro— es valido
 * mientras las fracciones no sumen mas que la partida entera.
 */
async function verificarFrente(
  obraId: string,
  companyId: string,
  partidas: LineaFrente[],
  encargoExcluido: string | null,
): Promise<string | null> {
  const ids = partidas.map((p) => p.wbsItemId);

  const filas = await prisma.wbsItem.findMany({
    where: {
      id: { in: ids },
      tipo: "PARTIDA",
      projectId: obraId,
      project: { companyId },
    },
    select: {
      id: true,
      codigoPartida: true,
      encargos: {
        where: {
          encargo: {
            estado: "VIGENTE",
            ...(encargoExcluido ? { id: { not: encargoExcluido } } : {}),
          },
        },
        select: { fraccion: true },
      },
    },
  });

  const porId = new Map(filas.map((f) => [f.id, f]));

  for (const linea of partidas) {
    const partida = porId.get(linea.wbsItemId);
    if (!partida) {
      return "Alguna partida elegida no esta en el presupuesto de esta obra.";
    }

    const yaAsignado = partida.encargos.reduce(
      (s, e) => s + Number(e.fraccion),
      0,
    );
    if (yaAsignado + Number(linea.fraccion) > 100.001) {
      return `La partida ${partida.codigoPartida} quedaria asignada por encima del 100 % entre sus proveedores.`;
    }
  }

  return null;
}

/** Crea un encargo con su frente. El numero es correlativo por obra. */
export async function crearEncargo(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosEncargo,
): Promise<ResultadoEncargo> {
  if (!puede(sesion, "encargo:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar encargos." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const problema = validar(datos);
  if (problema) return { ok: false, error: problema };

  const [obra, proveedor] = await Promise.all([
    prisma.project.findFirst({
      where: { id: obraId, companyId: sesion.companyId },
      select: { id: true },
    }),
    prisma.proveedor.findFirst({
      where: { id: datos.proveedorId, companyId: sesion.companyId },
      select: { id: true, tipoImpuesto: true },
    }),
  ]);

  if (!obra) return { ok: false, error: "Obra no encontrada." };
  if (!proveedor) return { ok: false, error: "Ese proveedor no es de tu empresa." };

  const frenteMal = await verificarFrente(
    obraId,
    sesion.companyId,
    datos.partidas,
    null,
  );
  if (frenteMal) return { ok: false, error: frenteMal };

  try {
    const id = await prisma.$transaction(async (tx) => {
      // El correlativo se calcula DENTRO de la transaccion, sobre el maximo
      // actual: dos altas a la vez no pueden coger el mismo numero porque la
      // unicidad (projectId, numero) lo rechazaria y la transaccion reintenta.
      const ultimo = await tx.encargoProveedor.aggregate({
        where: { projectId: obraId },
        _max: { numero: true },
      });
      const numero = (ultimo._max.numero ?? 0) + 1;

      const encargo = await tx.encargoProveedor.create({
        data: {
          projectId: obraId,
          proveedorId: proveedor.id,
          numero,
          descripcion: datos.descripcion.trim(),
          montoContratado: normalizarDecimal(datos.montoContratado, 2) ?? "0",
          tipoImpuesto: proveedor.tipoImpuesto,
          fechaInicio: datos.fechaInicio
            ? new Date(`${datos.fechaInicio}T00:00:00Z`)
            : null,
          fechaFin: datos.fechaFin
            ? new Date(`${datos.fechaFin}T00:00:00Z`)
            : null,
          notas: datos.notas?.trim() || null,
          creadoPor: quien(sesion),
          partidas: {
            create: datos.partidas.map((p) => ({
              wbsItemId: p.wbsItemId,
              fraccion: normalizarDecimal(p.fraccion, 3) ?? "100",
            })),
          },
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: obraId,
          entidad: "EncargoProveedor",
          entidadId: encargo.id.slice(0, 40),
          accion: "CREATE",
          despues: {
            numero,
            proveedorId: proveedor.id,
            montoContratado: datos.montoContratado,
            partidas: datos.partidas.length,
          },
        },
      });

      return encargo.id;
    });

    return { ok: true, id };
  } catch {
    return {
      ok: false,
      error: "No se pudo crear el encargo. Vuelve a intentarlo en unos segundos.",
    };
  }
}

/** Edita la cabecera y el frente de un encargo. Reemplaza las partidas. */
export async function editarEncargo(
  sesion: SesionActiva,
  obraId: string,
  encargoId: string,
  datos: DatosEncargo,
): Promise<ResultadoEncargo> {
  if (!puede(sesion, "encargo:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar encargos." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const problema = validar(datos);
  if (problema) return { ok: false, error: problema };

  const encargo = await prisma.encargoProveedor.findFirst({
    where: {
      id: encargoId,
      projectId: obraId,
      project: { companyId: sesion.companyId },
    },
    select: { id: true, estado: true },
  });
  if (!encargo) return { ok: false, error: "Encargo no encontrado." };
  if (encargo.estado === "ANULADO") {
    return { ok: false, error: "Un encargo anulado no se edita." };
  }

  const frenteMal = await verificarFrente(
    obraId,
    sesion.companyId,
    datos.partidas,
    encargoId,
  );
  if (frenteMal) return { ok: false, error: frenteMal };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.encargoPartida.deleteMany({ where: { encargoId } });

      await tx.encargoProveedor.update({
        where: { id: encargoId },
        data: {
          descripcion: datos.descripcion.trim(),
          montoContratado: normalizarDecimal(datos.montoContratado, 2) ?? "0",
          fechaInicio: datos.fechaInicio
            ? new Date(`${datos.fechaInicio}T00:00:00Z`)
            : null,
          fechaFin: datos.fechaFin
            ? new Date(`${datos.fechaFin}T00:00:00Z`)
            : null,
          notas: datos.notas?.trim() || null,
          partidas: {
            create: datos.partidas.map((p) => ({
              wbsItemId: p.wbsItemId,
              fraccion: normalizarDecimal(p.fraccion, 3) ?? "100",
            })),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: obraId,
          entidad: "EncargoProveedor",
          entidadId: encargoId.slice(0, 40),
          accion: "UPDATE",
          despues: {
            montoContratado: datos.montoContratado,
            partidas: datos.partidas.length,
          },
        },
      });
    });

    return { ok: true, id: encargoId };
  } catch {
    return {
      ok: false,
      error: "No se pudo guardar el encargo. Vuelve a intentarlo en unos segundos.",
    };
  }
}

/** Cambia el estado del encargo (cerrar, anular, reabrir). */
export async function cambiarEstadoEncargo(
  sesion: SesionActiva,
  obraId: string,
  encargoId: string,
  estado: EstadoEncargo,
): Promise<ResultadoEncargo> {
  if (!puede(sesion, "encargo:gestionar")) {
    return { ok: false, error: "No tienes permiso para gestionar encargos." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const { count } = await prisma.encargoProveedor.updateMany({
    where: {
      id: encargoId,
      projectId: obraId,
      project: { companyId: sesion.companyId },
    },
    data: { estado },
  });

  if (count === 0) return { ok: false, error: "Encargo no encontrado." };

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "EncargoProveedor",
      entidadId: encargoId.slice(0, 40),
      accion: "UPDATE",
      despues: { estado },
    },
  });

  return { ok: true, id: encargoId };
}

export interface DatosValorizacion {
  fecha: string;
  porcentaje: string;
  nota?: string;
}

/**
 * Registra el avance del proveedor. Append-only: cada valorizacion es un corte
 * nuevo, no sobrescribe el anterior.
 */
export async function valorizarEncargo(
  sesion: SesionActiva,
  obraId: string,
  encargoId: string,
  datos: DatosValorizacion,
): Promise<ResultadoEncargo> {
  if (!puede(sesion, "encargo:valorizar")) {
    return { ok: false, error: "No tienes permiso para valorizar encargos." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const pct = Number(datos.porcentaje);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return { ok: false, error: "El avance tiene que estar entre 0 y 100." };
  }
  if (!datos.fecha) return { ok: false, error: "Falta la fecha del corte." };

  const encargo = await prisma.encargoProveedor.findFirst({
    where: {
      id: encargoId,
      projectId: obraId,
      project: { companyId: sesion.companyId },
    },
    select: { id: true, estado: true },
  });
  if (!encargo) return { ok: false, error: "Encargo no encontrado." };
  if (encargo.estado === "ANULADO") {
    return { ok: false, error: "Un encargo anulado no se valoriza." };
  }

  await prisma.$transaction(async (tx) => {
    const v = await tx.valorizacionEncargo.create({
      data: {
        encargoId,
        fecha: new Date(`${datos.fecha}T00:00:00Z`),
        porcentaje: normalizarDecimal(datos.porcentaje, 3) ?? "0",
        nota: datos.nota?.trim() || null,
        registradoPor: quien(sesion),
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "ValorizacionEncargo",
        entidadId: v.id.slice(0, 40),
        accion: "CREATE",
        despues: { encargoId, fecha: datos.fecha, porcentaje: datos.porcentaje },
      },
    });
  });

  return { ok: true, id: encargoId };
}
