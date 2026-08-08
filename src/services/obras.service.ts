import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { esPositivo, sumar } from "@/lib/decimal";
import { sumarHojas } from "@/lib/jerarquia-partidas";
import { estadoDeObra, validarObra, ESTADOS_OBRA } from "@/lib/obras";
import { diasEntre } from "@/utils/fechas";
import {
  contarPaginas,
  normalizarPagina,
  saltar,
  POR_PAGINA,
  type Pagina,
} from "@/lib/paginacion";
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
  /**
   * Comprometido con proveedores, SIN IGV y solo de ordenes APROBADAS: la
   * misma definicion que usa `obtenerComprometido` en la pantalla de la obra.
   * Un borrador todavia no compromete a nadie y una anulada dejo de hacerlo.
   */
  comprometido: string;
  /// Partidas cuyo comprometido supera su parcial. Es la alerta de sobrecosto
  /// que se puede afirmar hoy; el avance fisico no existe todavia.
  partidasSobregiradas: number;
}

export interface ResumenEmpresa {
  obras: number;
  obrasEnEjecucion: number;
  /// Suma de las partidas de TODAS las obras de la empresa.
  presupuestoTotal: string;
  /// Comprometido con proveedores, sin IGV y solo de ordenes aprobadas.
  comprometido: string;
  /// Presupuesto menos comprometido. Puede salir negativo, y entonces hay que
  /// verlo: significa que se ha pedido mas de lo que hay presupuestado.
  saldo: string;
  partidasSobregiradas: number;
  obrasConPlazoVencido: number;
}

/**
 * Las cifras de la empresa entera, para encabezar el panel.
 *
 * Hasta ahora estos totales **no existian en ninguna pantalla**: el
 * comprometido y el presupuesto solo se veian obra por obra, asi que nadie
 * podia responder «cuanto tengo comprometido en total» sin sumar a mano.
 *
 * Va aparte de `listarObras` a proposito: aquella devuelve UNA PAGINA y estas
 * cifras son de todas las obras. Calcularlas desde la pagina daria un total
 * distinto en cada pagina, que es justo la clase de cifra que no puede
 * aparecer en un panel de control.
 */
export async function obtenerResumenEmpresa(
  sesion: SesionActiva,
): Promise<ResumenEmpresa> {
  if (!puede(sesion, "obra:leer")) throw new SinPermisoError();

  const deLaEmpresa = { companyId: sesion.companyId };

  const [obras, obrasEnEjecucion, presupuesto, comprometido, vencidas] =
    await Promise.all([
      prisma.project.count({ where: deLaEmpresa }),

      prisma.project.count({
        where: { ...deLaEmpresa, estado: "EN_EJECUCION" },
      }),

      prisma.wbsItem.aggregate({
        where: { tipo: "PARTIDA", project: deLaEmpresa },
        _sum: { parcial: true },
      }),

      prisma.ordenImputacion.aggregate({
        where: { ordenCompra: { ...deLaEmpresa, estado: "APROBADA" } },
        _sum: { importe: true },
      }),

      // El plazo vencido solo es una alerta si la obra sigue en ejecucion:
      // una cerrada que acabo tarde ya no requiere ninguna accion.
      prisma.project.count({
        where: {
          ...deLaEmpresa,
          estado: "EN_EJECUCION",
          fechaFinProgramada: { lt: new Date() },
        },
      }),
    ]);

  const presupuestoTotal = sumar([
    presupuesto._sum.parcial?.toString() ?? "0",
  ]);
  const comprometidoTotal = sumar([comprometido._sum.importe?.toString() ?? "0"]);

  return {
    obras,
    obrasEnEjecucion,
    presupuestoTotal,
    comprometido: comprometidoTotal,
    // Con `sumar` y no con resta de numeros: aqui son importes, y en este
    // sistema el dinero nunca pasa por coma flotante.
    saldo: sumar([presupuestoTotal, `-${comprometidoTotal}`]),
    partidasSobregiradas: await contarPartidasSobregiradas(sesion),
    obrasConPlazoVencido: vencidas,
  };
}

/**
 * Partidas de la empresa cuyo comprometido supera su parcial.
 *
 * Hay que comparar partida a partida —no valen dos sumas— porque un total
 * holgado puede esconder varias partidas pasadas de largo, que es justo lo
 * que hay que corregir con una reconversion.
 */
async function contarPartidasSobregiradas(
  sesion: SesionActiva,
): Promise<number> {
  const porPartida = await prisma.ordenImputacion.groupBy({
    by: ["wbsItemId"],
    where: {
      ordenCompra: { companyId: sesion.companyId, estado: "APROBADA" },
    },
    _sum: { importe: true },
  });

  if (porPartida.length === 0) return 0;

  const partidas = await prisma.wbsItem.findMany({
    where: { id: { in: porPartida.map((p) => p.wbsItemId) } },
    select: { id: true, parcial: true },
  });

  const parcialPorId = new Map(
    partidas.map((p) => [p.id, p.parcial?.toString() ?? "0"]),
  );

  return porPartida.filter((p) => {
    const parcial = parcialPorId.get(p.wbsItemId);
    if (parcial === undefined) return false;

    return esPositivo(
      sumar([p._sum.importe?.toString() ?? "0", `-${parcial}`]),
    );
  }).length;
}

export interface AlertaEmpresa {
  obraId: string;
  obraNombre: string;
  clave: "sobregiro" | "plazo";
  texto: string;
}

/**
 * El detalle de las alertas que `obtenerResumenEmpresa` solo cuenta.
 *
 * El resumen dice «1 alerta» pero no dice DE QUE obra ni de que tipo: sin
 * esto, la unica forma de encontrarla era abrir cada tarjeta de obra una por
 * una a ver cual tenia la insignia encendida. Aqui se resuelve la misma
 * pregunta que ya contesta el globo de `FranjaObra`, pero para la empresa
 * entera y con enlace a la obra que corresponde.
 */
export async function listarAlertasEmpresa(
  sesion: SesionActiva,
): Promise<AlertaEmpresa[]> {
  if (!puede(sesion, "obra:leer")) throw new SinPermisoError();

  const deLaEmpresa = { companyId: sesion.companyId };

  const [porPartida, vencidas] = await Promise.all([
    prisma.ordenImputacion.groupBy({
      by: ["wbsItemId"],
      where: { ordenCompra: { ...deLaEmpresa, estado: "APROBADA" } },
      _sum: { importe: true },
    }),
    prisma.project.findMany({
      where: {
        ...deLaEmpresa,
        estado: "EN_EJECUCION",
        fechaFinProgramada: { lt: new Date() },
      },
      select: { id: true, nombreObra: true, fechaFinProgramada: true },
    }),
  ]);

  const alertas: AlertaEmpresa[] = [];

  // Mismo calculo que `contarPartidasSobregiradas`, pero agrupado por obra
  // en vez de solo contar: aqui hace falta saber A CUAL obra pertenece cada
  // partida pasada de largo para poder enlazarla.
  if (porPartida.length > 0) {
    const partidas = await prisma.wbsItem.findMany({
      where: { id: { in: porPartida.map((p) => p.wbsItemId) } },
      select: { id: true, parcial: true, projectId: true },
    });
    const partidaPorId = new Map(partidas.map((p) => [p.id, p]));

    const sobregiroPorObra = new Map<string, number>();
    for (const fila of porPartida) {
      const partida = partidaPorId.get(fila.wbsItemId);
      if (!partida) continue;

      const exceso = sumar([
        fila._sum.importe?.toString() ?? "0",
        `-${partida.parcial?.toString() ?? "0"}`,
      ]);

      if (esPositivo(exceso)) {
        sobregiroPorObra.set(
          partida.projectId,
          (sobregiroPorObra.get(partida.projectId) ?? 0) + 1,
        );
      }
    }

    if (sobregiroPorObra.size > 0) {
      const obras = await prisma.project.findMany({
        where: { id: { in: [...sobregiroPorObra.keys()] } },
        select: { id: true, nombreObra: true },
      });
      const nombrePorId = new Map(obras.map((o) => [o.id, o.nombreObra]));

      for (const [obraId, n] of sobregiroPorObra) {
        alertas.push({
          obraId,
          obraNombre: nombrePorId.get(obraId) ?? "Obra",
          clave: "sobregiro",
          texto:
            n === 1
              ? "1 partida comprometida por encima de su presupuesto"
              : `${n} partidas comprometidas por encima de su presupuesto`,
        });
      }
    }
  }

  for (const obra of vencidas) {
    alertas.push({
      obraId: obra.id,
      obraNombre: obra.nombreObra,
      clave: "plazo",
      texto: `El plazo vencio hace ${diasEntre(obra.fechaFinProgramada, new Date())} dia(s)`,
    });
  }

  return alertas;
}

export interface FiltrosObras {
  pagina?: string;
  porPagina?: number;
  /// Texto libre sobre nombre y codigo.
  q?: string;
  estado?: string;
}

/**
 * Las obras de la empresa, filtradas y paginadas.
 *
 * Antes las traia TODAS y ademas hacia dos agregados sobre todas ellas: con
 * cincuenta obras eran cincuenta tarjetas y dos consultas que crecian sin
 * limite.
 *
 * **El orden pone las activas primero y las cerradas al final**, y sale gratis
 * de la base: `estado` es un ENUM de MariaDB y ORDER BY sobre un ENUM ordena
 * por el indice de declaracion, no alfabeticamente. El esquema lo declara
 * PLANIFICACION, EN_EJECUCION, PARALIZADA, CERRADA, que es justo el orden en
 * que interesa verlas. Si algun dia se reordena ese enum, este orden cambia
 * con el.
 */
export async function listarObras(
  sesion: SesionActiva,
  opciones: FiltrosObras = {},
): Promise<Pagina<ObraResumen>> {
  if (!puede(sesion, "obra:leer")) throw new SinPermisoError();

  const porPagina = opciones.porPagina ?? POR_PAGINA;

  const texto = opciones.q?.trim();
  const estado = ESTADOS_OBRA.find((e) => e === opciones.estado);

  const where = {
    companyId: sesion.companyId,
    ...(estado ? { estado } : {}),
    ...(texto
      ? {
          OR: [
            { nombreObra: { contains: texto } },
            { codigoObra: { contains: texto } },
          ],
        }
      : {}),
  };

  const total = await prisma.project.count({ where });
  const totalPaginas = contarPaginas(total, porPagina);
  const pagina = normalizarPagina(opciones.pagina, totalPaginas);

  const obras = await prisma.project.findMany({
    where,
    orderBy: [{ estado: "asc" }, { createdAt: "desc" }],
    skip: saltar(pagina, porPagina),
    take: porPagina,
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

  if (obras.length === 0) {
    return { filas: [], total, pagina, totalPaginas };
  }

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

  /**
   * Comprometido por obra, con la MISMA definicion que `obtenerComprometido`:
   * solo ordenes APROBADAS y sobre el importe imputable, que es el neto con
   * IGV y el total con retencion —de eso ya se encarga la imputacion, que
   * guarda la cifra que cuenta—.
   *
   * Va en su propia consulta y no colgando de la de partidas porque son dos
   * agregados distintos; juntarlos multiplicaria filas y falsearia ambos.
   */
  const comprometidos = await prisma.ordenImputacion.groupBy({
    by: ["wbsItemId"],
    where: {
      ordenCompra: {
        projectId: { in: obras.map((o) => o.id) },
        estado: "APROBADA",
        companyId: sesion.companyId,
      },
    },
    _sum: { importe: true },
  });

  // Para saber a que obra pertenece cada partida, y su parcial, con el que se
  // detecta el sobregiro.
  const partidas = await prisma.wbsItem.findMany({
    where: { id: { in: comprometidos.map((c) => c.wbsItemId) } },
    select: { id: true, projectId: true, parcial: true },
  });

  const partidaPorId = new Map(partidas.map((p) => [p.id, p]));

  const comprometidoPorObra = new Map<string, string[]>();
  const sobregiradasPorObra = new Map<string, number>();

  for (const fila of comprometidos) {
    const partida = partidaPorId.get(fila.wbsItemId);
    if (!partida) continue;

    const importe = fila._sum.importe?.toString() ?? "0";

    const acumulado = comprometidoPorObra.get(partida.projectId) ?? [];
    acumulado.push(importe);
    comprometidoPorObra.set(partida.projectId, acumulado);

    // Se compara contra el parcial de la partida. El vigente (base +
    // movimientos) seria mas fino, pero exige la linea base aprobada y el
    // panel tiene que servir tambien para obras que aun no la tienen.
    //
    // La resta va con `sumar` y no con `Number`: aqui son importes, y en este
    // sistema el dinero nunca pasa por coma flotante.
    const exceso = sumar([importe, `-${partida.parcial?.toString() ?? "0"}`]);

    if (esPositivo(exceso)) {
      sobregiradasPorObra.set(
        partida.projectId,
        (sobregiradasPorObra.get(partida.projectId) ?? 0) + 1,
      );
    }
  }

  const filas = obras.map((obra) => {
    const agregado = porObra.get(obra.id);
    return {
      ...obra,
      presupuestoTotal: agregado?._sum.parcial?.toString() ?? "0",
      totalPartidas: agregado?._count._all ?? 0,
      comprometido: sumar(comprometidoPorObra.get(obra.id) ?? ["0"]),
      partidasSobregiradas: sobregiradasPorObra.get(obra.id) ?? 0,
    };
  });

  return { filas, total, pagina, totalPaginas };
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

/**
 * La obra, o null si no existe o no es de esta empresa.
 *
 * En `cache()` porque la piden el layout de `obras/[id]` —que pinta el
 * nombre y las pestanas— y ademas cada una de sus paginas. Sin envolverla
 * serian dos consultas identicas en cada navegacion dentro de una obra.
 */
export const obtenerObra = cache(async function obtenerObra(
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
});

// ---------------------------------------------------------------------------
// Alta de obras
// ---------------------------------------------------------------------------

export interface DatosObra {
  nombreObra: string;
  /// Vacio = sin codigo. La columna es nullable y la UI ya lo contempla.
  codigoObra?: string;
  ubicacion?: string;
  cliente?: string;
  /// "YYYY-MM-DD", como las manda un <input type="date">.
  fechaInicio: string;
  fechaFinProgramada: string;
  /// Uno de ProjectState. Si no llega o es raro, Planificacion.
  estado?: string;
}

export type ResultadoCrearObra =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Crea una obra en la empresa de la sesion.
 *
 * Hasta ahora las obras solo nacian del script de seed: el permiso
 * `obra:crear` estaba en la matriz pero no habia servicio que lo usara, asi
 * que en produccion, con la base vacia, no habia forma de arrancar la
 * primera obra.
 */
export async function crearObra(
  sesion: SesionActiva,
  datos: DatosObra,
): Promise<ResultadoCrearObra> {
  if (!puede(sesion, "obra:crear")) {
    return { ok: false, error: "No tienes permiso para crear obras." };
  }

  // Las reglas —nombre, fechas, estado— viven en `lib/obras` para que se
  // puedan probar sin base de datos.
  const validacion = validarObra(datos);
  if (!validacion.ok) return { ok: false, error: validacion.error };

  const { inicio, fin } = validacion.plazo;
  const estado = estadoDeObra(datos.estado);

  const opcional = (v: string | undefined, largo: number) =>
    v?.trim() ? v.trim().slice(0, largo) : null;

  const codigoObra = opcional(datos.codigoObra, 40);

  // El codigo repetido se comprueba aqui para poder decir con QUE obra choca,
  // y no soltar el "Unique constraint failed" crudo de Prisma. La clave
  // unica de la base lo cierra igual; esto es para que el mensaje sirva.
  if (codigoObra) {
    const existente = await prisma.project.findFirst({
      where: { companyId: sesion.companyId, codigoObra },
      select: { nombreObra: true },
    });
    if (existente) {
      return {
        ok: false,
        error: `Ya existe una obra con el codigo ${codigoObra}: "${existente.nombreObra}".`,
      };
    }
  }

  const campos = {
    nombreObra: datos.nombreObra.trim().slice(0, 255),
    codigoObra,
    ubicacion: opcional(datos.ubicacion, 255),
    cliente: opcional(datos.cliente, 200),
    fechaInicio: inicio,
    fechaFinProgramada: fin,
    estado,
  };

  const creada = await prisma.$transaction(async (tx) => {
    const obra = await tx.project.create({
      data: { companyId: sesion.companyId, ...campos },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obra.id,
        entidad: "Project",
        entidadId: obra.id,
        accion: "CREATE",
        despues: {
          ...campos,
          fechaInicio: datos.fechaInicio,
          fechaFinProgramada: datos.fechaFinProgramada,
        },
      },
    });

    return obra;
  });

  return { ok: true, id: creada.id };
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
