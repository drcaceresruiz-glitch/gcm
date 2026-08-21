import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { sumar, esNegativo, normalizarDecimal } from "@/lib/decimal";
import { codigoDeFallo } from "@/lib/fallo-de-base";
import {
  importeDeFrente,
  avanceVigente,
  resumenEncargo,
  coberturaObra,
  type ResumenEncargo,
  type Cobertura,
} from "@/lib/encargos";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import { totalDeObra } from "@/services/presupuesto-obra";
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
  /**
   * Cuando esta programada esta partida en el cronograma vigente.
   *
   * `null` cuando no hay cronograma, cuando ninguna tarea casa por codigo, o
   * cuando las que casan estan SIN PROGRAMAR. Ese null es informacion: dice que
   * no hay fecha que proponer, y la pantalla deja el campo vacio en vez de
   * inventarla.
   */
  inicio: Date | null;
  fin: Date | null;
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
 * El comprometido de cada encargo son las ordenes APROBADAS emitidas CONTRA
 * EL —`encargoId` en la orden—, por su importe imputable. Antes de existir
 * ese vinculo se deducia cruzando proveedor y partida, y esa cuenta atribuia
 * al encargo cualquier orden suelta del mismo proveedor sobre sus partidas:
 * ahora la orden dice de que contrato es, y la deduccion sobra. Una orden
 * vieja sin vincular no cuenta contra ningun encargo; se anula y se vuelve a
 * emitir contra el suyo, que deja rastro de ambas cosas.
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
          select: {
            wbsItemId: true,
            fraccion: true,
            partida: { select: { parcial: true } },
          },
        },
        valorizaciones: {
          orderBy: { fecha: "desc" },
          select: { fecha: true, porcentaje: true, createdAt: true },
        },
      },
    }),
    // Lo aprobado CONTRA un encargo, con cual: de aqui sale el comprometido
    // de cada uno. Las ordenes sueltas no entran: no son de ningun contrato.
    prisma.ordenImputacion.findMany({
      where: {
        ordenCompra: {
          projectId: obraId,
          companyId: sesion.companyId,
          estado: "APROBADA",
          encargoId: { not: null },
        },
      },
      select: {
        importe: true,
        ordenCompra: { select: { encargoId: true } },
      },
    }),
    // El denominador de la cobertura, con la regla de hojas: una suma plana
    // por tipo cuenta dos veces los grupos a suma alzada con hijas costeadas,
    // y la cobertura saldria artificialmente baja.
    totalDeObra(obraId),
  ]);

  // Comprometido por encargo: la orden ya dice de que contrato es.
  const comprometidoPorEncargo = new Map<string, string[]>();
  for (const i of imputaciones) {
    const clave = i.ordenCompra.encargoId;
    if (!clave) continue;
    const lista = comprometidoPorEncargo.get(clave) ?? [];
    lista.push(i.importe.toString());
    comprometidoPorEncargo.set(clave, lista);
  }

  let asignadoTotal = "0.00";

  const filas: EncargoResumen[] = encargos.map((e) => {
    const partidasFrente = e.partidas.map((p) => ({
      parcial: p.partida.parcial?.toString() ?? "0",
      fraccion: p.fraccion.toString(),
    }));
    const presupuestoFrente = importeDeFrente(partidasFrente);
    asignadoTotal = sumar([asignadoTotal, presupuestoFrente]);

    // Comprometido = lo pedido en ordenes emitidas CONTRA este encargo.
    const comprometido = sumar(comprometidoPorEncargo.get(e.id) ?? []);

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

  const total = presupuesto.costoDirecto;

  return {
    encargos: filas,
    cobertura: coberturaObra(
      normalizarDecimal(total, 2) ?? "0.00",
      asignadoTotal,
    ),
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

  // En paralelo: las partidas y cuando estan programadas. La segunda consulta
  // es lo que evita pedir a mano unas fechas que el cronograma ya sabe.
  const fechas = await fechasDelCronograma(sesion.companyId, obraId);

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
      proveedores: [
        ...new Set(vivos.map((e) => e.encargo.proveedor.razonSocial)),
      ],
      ...(fechas.get(p.codigoPartida) ?? { inicio: null, fin: null }),
    };
  });
}

/**
 * Cuando esta programada cada partida, segun el cronograma vigente.
 *
 * LA PARTIDA NO TIENE FECHAS: `WbsItem` guarda metrado, precio y parcial, y se
 * acabo. Las fechas viven en el cronograma, que es otro arbol. Lo que une a los
 * dos es el CODIGO —el «4.4» que `TareaCronograma` guarda aparte del nombre—,
 * que casa porque la EDT se genera desde el presupuesto.
 *
 * SE DESCARTAN LAS TAREAS `sinProgramar`, y esto no es un detalle: en esas
 * filas, dice el propio esquema, «inicio y fin no son un plan, son solo el
 * relleno que exige la columna». Proponerlas convertiria un hueco del
 * cronograma en las fechas de un CONTRATO con un proveedor.
 *
 * Tambien se descartan los resumenes: sus fechas son las de sus hijas, y
 * mezclarlas ensancharia el rango con algo que nadie ejecuta.
 *
 * Devuelve vacio si la obra no tiene cronograma. Entonces la pantalla no
 * propone nada, que es lo correcto: no hay de donde sacarlo.
 */
async function fechasDelCronograma(
  companyId: string,
  obraId: string,
): Promise<Map<string, { inicio: Date | null; fin: Date | null }>> {
  const salida = new Map<string, { inicio: Date | null; fin: Date | null }>();

  // Acotado por empresa, no solo por obra. Lo caz  la prueba de aislamiento y
  // tenia razon: un `projectId` es adivinable, y aunque de aqui solo salgan
  // fechas, la regla de la casa es que NINGUNA consulta se fie del id suelto.
  // EL VIGENTE ES EL MAS RECIENTE, no una fila marcada: `Cronograma` no tiene
  // columna `vigente` y nunca la tuvo. Esto decia `vigente: true` y Prisma
  // rechazaba la consulta ENTERA por argumento desconocido, asi que la
  // pantalla de nuevo encargo caia con 500 siempre —no en un caso raro—.
  // Se elige como en todo el resto del codigo: corte mas nuevo, y a igualdad
  // de corte la version mas alta.
  const cronograma = await prisma.cronograma.findFirst({
    where: { projectId: obraId, project: { companyId } },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: { id: true },
  });
  if (!cronograma) return salida;

  const tareas = await prisma.tareaCronograma.findMany({
    where: {
      cronogramaId: cronograma.id,
      esResumen: false,
      sinProgramar: false,
      codigo: { not: null },
    },
    select: { codigo: true, inicio: true, fin: true },
  });

  // Una partida puede tener varias tareas (se parte en fases): se abraza todo
  // lo suyo, de la mas temprana a la mas tardia.
  for (const t of tareas) {
    if (!t.codigo) continue;

    const previo = salida.get(t.codigo);
    salida.set(t.codigo, {
      inicio:
        !previo?.inicio || t.inicio < previo.inicio ? t.inicio : previo.inicio,
      fin: !previo?.fin || t.fin > previo.fin ? t.fin : previo.fin,
    });
  }

  return salida;
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

  return (
    items
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
      .filter((c) => c.partidaIds.length > 0)
  );
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export type ResultadoEncargo =
  { ok: true; id: string } | { ok: false; error: string };

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
  if (!proveedor)
    return { ok: false, error: "Ese proveedor no es de tu empresa." };

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
      error:
        "No se pudo crear el encargo. Vuelve a intentarlo en unos segundos.",
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
      error:
        "No se pudo guardar el encargo. Vuelve a intentarlo en unos segundos.",
    };
  }
}

/**
 * Cambia el estado del encargo (cerrar, anular, reabrir).
 *
 * ANULAR ES DECIR «ESTO NUNCA FUE», y por eso un encargo con avance reconocido
 * no se anula: si se valorizo, fue. Se CIERRA, que deja el historial en pie con
 * lo valorizado como definitivo.
 *
 * Sin esa regla, anular un encargo a medio ejecutar lo sacaba del comprometido
 * —«Comprometido» son los VIGENTES— y dejaba sus valorizaciones, y los pagos
 * que cuelgan de ellas, apuntando a un contrato que dice que no existio. Es el
 * modo de fallo de la casa: una fila cambia de naturaleza y el dinero deja de
 * cuadrar sin que nadie vea un error.
 *
 * Cierra la simetria que ya tenia el modulo por los otros dos lados: un
 * anulado no se edita y un anulado no se valoriza.
 */
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

  if (estado === "ANULADO") {
    // El mismo acotado por obra y empresa que el `updateMany` de abajo: si se
    // contara sin el, un id de otra constructora daria cero y dejaria anular.
    const avances = await prisma.valorizacionEncargo.count({
      where: {
        encargoId,
        encargo: {
          projectId: obraId,
          project: { companyId: sesion.companyId },
        },
      },
    });

    if (avances > 0) {
      return {
        ok: false,
        error:
          `Este encargo ya tiene ${avances} valorización(es): el contratista avanzó y eso no se borra. ` +
          `Ciérralo en vez de anularlo — deja de contar en el comprometido igual, pero conserva lo valorizado y sus pagos.`,
      };
    }
  }

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

  // La escritura va CAPTURADA. Hasta ahora no podia fallar por datos y se
  // llamaba a pelo; con los correlativos si puede: dos personas valorizando en
  // la misma obra al mismo segundo leen el mismo maximo y una de las dos choca
  // contra la unicidad. Sin este `try`, ese choque sube hasta Next y sale como
  // «esta pantalla no se pudo cargar» —el fallo que ya se comieron la
  // importacion de presupuesto y el alta de usuarios—.
  try {
    await prisma.$transaction(async (tx) => {
      // Los DOS correlativos, dentro de la transaccion y sobre el maximo actual
      // de cada serie. Mismo patron que `crearEncargo`: dos altas a la vez no
      // pueden llevarse el mismo numero porque las unicidades del esquema
      // —(projectId, numeroObra) y (encargoId, numeroEncargo)— rechazan a la
      // segunda y la transaccion entera se deshace.
      //
      // LO UNICO QUE HAY QUE MIRAR DOS VECES son los alcances, porque son
      // distintos y el codigo se parece: el maximo de la serie de OBRA se busca
      // por `projectId` —todos los encargos de la obra comparten esa serie— y el
      // de la serie del ENCARGO, por `encargoId`. Cruzarlos daria numeros que
      // parecen correlativos sin serlo: la segunda valorizacion de la obra
      // saldria con el numero 1 si es la primera de su contratista.
      const enLaObra = await tx.valorizacionEncargo.aggregate({
        where: { projectId: obraId },
        _max: { numeroObra: true },
      });
      const enElEncargo = await tx.valorizacionEncargo.aggregate({
        where: { encargoId },
        _max: { numeroEncargo: true },
      });

      const numeroObra = (enLaObra._max.numeroObra ?? 0) + 1;
      const numeroEncargo = (enElEncargo._max.numeroEncargo ?? 0) + 1;

      const v = await tx.valorizacionEncargo.create({
        data: {
          encargoId,
          // Copia de la obra del encargo. No se toma de `datos`: la obra ya
          // quedo comprobada arriba al buscar el encargo con `projectId: obraId`
          // y `project.companyId`, asi que este es el mismo valor ya validado.
          projectId: obraId,
          numeroObra,
          numeroEncargo,
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
          despues: {
            encargoId,
            fecha: datos.fecha,
            porcentaje: datos.porcentaje,
            numeroObra,
            numeroEncargo,
          },
        },
      });
    });
  } catch (e) {
    // P2002 es la unicidad del correlativo: el numero se lo llevo otro. Es
    // TRANSITORIO —al reintentar, el maximo ya es el nuevo y el siguiente
    // numero esta libre—, asi que el mensaje invita a repetir en vez de
    // sugerir que el dato esta mal.
    if (codigoDeFallo(e) === "P2002") {
      return {
        ok: false,
        error:
          "Otra persona acaba de valorizar en esta obra y se llevo el numero. " +
          "Vuelve a guardar: el corte no se ha perdido.",
      };
    }
    return {
      ok: false,
      error:
        "No se pudo guardar la valorizacion. Vuelve a intentarlo en unos segundos.",
    };
  }

  return { ok: true, id: encargoId };
}

export interface EncargoParaOrden {
  id: string;
  numero: number;
  descripcion: string;
  proveedorId: string;
}

/**
 * Los encargos VIGENTES de la obra, para el desplegable del formulario de
 * ordenes: al elegir proveedor, la orden puede emitirse contra uno de sus
 * encargos en vez de quedar suelta.
 *
 * Solo vigentes a proposito: contra un encargo cerrado o anulado ya no se
 * emite nada, y ofrecerlo seria ofrecer un error. El permiso es el de crear
 * ordenes, que es quien va a usar la lista.
 */
export async function encargosParaOrden(
  sesion: SesionActiva,
  obraId: string,
): Promise<EncargoParaOrden[]> {
  if (!puede(sesion, "orden:crear")) return [];

  return prisma.encargoProveedor.findMany({
    where: {
      projectId: obraId,
      estado: "VIGENTE",
      project: { companyId: sesion.companyId },
    },
    orderBy: { numero: "asc" },
    select: { id: true, numero: true, descripcion: true, proveedorId: true },
  });
}
