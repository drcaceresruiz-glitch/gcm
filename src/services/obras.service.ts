import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { esPositivo, restar, sumar } from "@/lib/decimal";
import { sumarHojas } from "@/lib/jerarquia-partidas";
import {
  estadoDeObra,
  validarObra,
  ESTADOS_OBRA,
  formatearCorrelativoObra,
  puedeTransicionarObra,
  requisitosParaEjecutar,
  puedeArrancar,
  obraAdmiteCambios,
  OBRA_CERRADA,
  ETIQUETA_ESTADO_OBRA,
  type EstadoObra,
} from "@/lib/obras";
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
  /// Correlativo del sistema ("OB-000001"). Null solo en obras anteriores a
  /// su introduccion.
  correlativo: string | null;
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
   * Comprometido con proveedores, solo de ordenes APROBADAS: la misma
   * definicion que usa `obtenerComprometido` en la pantalla de la obra. Un
   * borrador todavia no compromete a nadie y una anulada dejo de hacerlo.
   *
   * Cuenta el importe IMPUTABLE de cada orden, que es el neto en las que
   * llevan IGV y el total en las de retencion o sin impuesto. No es «sin IGV»
   * a secas: eso solo describe al primer caso.
   */
  comprometido: string;
  /// Partidas cuyo comprometido supera su parcial.
  partidasSobregiradas: number;
}

export interface ResumenEmpresa {
  obras: number;
  obrasEnEjecucion: number;
  /// Suma de las partidas de TODAS las obras de la empresa.
  presupuestoTotal: string;
  /// Comprometido con proveedores, solo de ordenes aprobadas. Es el importe
  /// imputable de cada una: neto con IGV, total con retencion o sin impuesto.
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

  // Las cifras de sobregiro y plazo vencido salen de `datosAlertasEmpresa`, que
  // esta cacheada por peticion: el panel tambien pide las alertas para el
  // popup, asi que ese trabajo se hace una sola vez y aqui solo se leen sus
  // totales. Lo demas son agregados propios que van en el mismo lote.
  const [obras, obrasEnEjecucion, presupuesto, comprometido, alertas] =
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

      datosAlertasEmpresa(sesion),
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
    // Con aritmetica decimal y no con resta de numeros: aqui son importes, y
    // en este sistema el dinero nunca pasa por coma flotante.
    // Con `restar` y no con `sumar([a, `-${b}`])`: esa forma produce "--100"
    // en cuanto el sustraendo ya es negativo, y `sumar` la descarta en
    // silencio devolviendo el minuendo intacto —o sea, el saldo entero—.
    saldo: restar(presupuestoTotal, comprometidoTotal) ?? "0.00",
    partidasSobregiradas: alertas.partidasSobregiradas,
    obrasConPlazoVencido: alertas.obrasConPlazoVencido,
  };
}

interface DatosAlertas {
  alertas: AlertaEmpresa[];
  /// Total de partidas de la empresa por encima de su presupuesto.
  partidasSobregiradas: number;
  /// Obras en ejecucion con la fecha de fin ya pasada.
  obrasConPlazoVencido: number;
}

/**
 * Calcula de UNA sola vez todo lo de alertas: la lista para el popup y los
 * totales para las cifras del resumen.
 *
 * Va en `cache()` porque el panel pide, por separado y con el MISMO objeto de
 * sesion, el resumen (que necesita los totales) y las alertas (para el popup).
 * Sin esto, el trabajo pesado —dos agregados y sus busquedas de nombres— se
 * hacia dos veces por carga del panel; con el, una.
 *
 * Comparar partida a partida —y no dos sumas— es a proposito: un total holgado
 * puede esconder varias partidas pasadas de largo, que es justo lo que hay que
 * corregir con una reconversion.
 */
const datosAlertasEmpresa = cache(async function datosAlertasEmpresa(
  sesion: SesionActiva,
): Promise<DatosAlertas> {
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
  let partidasSobregiradas = 0;

  if (porPartida.length > 0) {
    const partidas = await prisma.wbsItem.findMany({
      where: { id: { in: porPartida.map((p) => p.wbsItemId) } },
      select: { id: true, parcial: true, projectId: true },
    });
    const partidaPorId = new Map(partidas.map((p) => [p.id, p]));

    // Cuantas partidas se pasan, y de que obra es cada una: el total va al
    // resumen, el desglose por obra al popup.
    const sobregiroPorObra = new Map<string, number>();
    for (const fila of porPartida) {
      const partida = partidaPorId.get(fila.wbsItemId);
      if (!partida) continue;

      /**
       * Con `restar`, y aqui importa de verdad.
       *
       * `sumar([importe, \`-${parcial}\`])` se rompe cuando el parcial ya es
       * negativo —el descuento comercial de CRIOCORD es -26.821,60—: produce
       * "--26821.60", `sumar` lo descarta en silencio y el exceso queda igual
       * al importe comprometido, que es positivo. Resultado: la partida se
       * marcaba SOBREGIRADA sin estarlo, y saltaba una alerta falsa.
       */
      const exceso = restar(
        fila._sum.importe?.toString() ?? "0",
        partida.parcial?.toString() ?? "0",
      );

      if (exceso !== null && esPositivo(exceso)) {
        partidasSobregiradas++;
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

  return { alertas, partidasSobregiradas, obrasConPlazoVencido: vencidas.length };
});

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
  return (await datosAlertasEmpresa(sesion)).alertas;
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
            // El correlativo tambien se busca: es justo para lo que existe.
            { correlativo: { contains: texto } },
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
      correlativo: true,
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
  //
  // Los dos agregados —presupuesto por obra y comprometido por partida— son
  // independientes entre si, asi que van en el mismo lote: encadenarlos solo
  // sumaba una ida y vuelta a la base de mas por cada carga del panel.
  const idsObras = obras.map((o) => o.id);
  const [totales, comprometidos] = await Promise.all([
    prisma.wbsItem.groupBy({
      by: ["projectId"],
      where: { projectId: { in: idsObras }, tipo: "PARTIDA" },
      _sum: { parcial: true },
      _count: { _all: true },
    }),

    /**
     * Comprometido por obra, con la MISMA definicion que `obtenerComprometido`:
     * solo ordenes APROBADAS y sobre el importe imputable, que es el neto con
     * IGV y el total con retencion —de eso ya se encarga la imputacion, que
     * guarda la cifra que cuenta—.
     *
     * Va en su propia consulta y no colgando de la de partidas porque son dos
     * agregados distintos; juntarlos multiplicaria filas y falsearia ambos.
     */
    prisma.ordenImputacion.groupBy({
      by: ["wbsItemId"],
      where: {
        ordenCompra: {
          projectId: { in: idsObras },
          estado: "APROBADA",
          companyId: sesion.companyId,
        },
      },
      _sum: { importe: true },
    }),
  ]);

  const porObra = new Map(totales.map((t) => [t.projectId, t]));

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
    // La resta va con `restar` y no con `Number`: aqui son importes y el
    // dinero nunca pasa por coma flotante. Y con `restar` y no con
    // `sumar([importe, `-${parcial}`])`, que con un parcial negativo produce
    // "--26821.60" —lo hay en CRIOCORD—, `sumar` lo descarta en silencio y la
    // partida sale marcada como sobregirada sin estarlo.
    const exceso = restar(importe, partida.parcial?.toString() ?? "0");

    if (exceso !== null && esPositivo(exceso)) {
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
  correlativo: string | null;
  nombreObra: string;
  ubicacion: string | null;
  cliente: string | null;
  estado: string;
  fechaInicio: Date;
  fechaFinProgramada: Date;
  /// Dia de la semana esperado para el corte de avance (ISO 1..7, viernes=5).
  diaCorteSemanal: number;
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
      correlativo: true,
      nombreObra: true,
      ubicacion: true,
      cliente: true,
      estado: true,
      fechaInicio: true,
      fechaFinProgramada: true,
      diaCorteSemanal: true,
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
 * Calendario laboral por defecto de una obra nueva (Last Planner).
 *
 * L-V 8h, sabado 5h, domingo descanso: la cadencia habitual de las obras del
 * cliente (el sabado laborable de CRIOCORD son 5h). Es editable despues; da al
 * Lookahead una base de dias habiles desde el primer dia. ISO 1..7 (lunes=1).
 */
const CALENDARIO_POR_DEFECTO = [
  { diaSemana: 1, laborable: true, horas: "8" },
  { diaSemana: 2, laborable: true, horas: "8" },
  { diaSemana: 3, laborable: true, horas: "8" },
  { diaSemana: 4, laborable: true, horas: "8" },
  { diaSemana: 5, laborable: true, horas: "8" },
  { diaSemana: 6, laborable: true, horas: "5" },
  { diaSemana: 7, laborable: false, horas: "0" },
] as const;

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
    // El correlativo sale del contador de la empresa, incrementado de forma
    // atomica: el valor PREVIO al incremento es el de esta obra. Hacerlo con
    // `increment` y no leyendo-y-sumando evita que dos altas simultaneas se
    // lleven el mismo numero.
    const empresa = await tx.company.update({
      where: { id: sesion.companyId },
      data: { siguienteCorrelativoObra: { increment: 1 } },
      select: { siguienteCorrelativoObra: true },
    });
    const correlativo = formatearCorrelativoObra(
      empresa.siguienteCorrelativoObra - 1,
    );

    const obra = await tx.project.create({
      data: { companyId: sesion.companyId, correlativo, ...campos },
      select: { id: true },
    });

    // Siembra el calendario laboral por defecto de la obra (Last Planner).
    await tx.workCalendar.createMany({
      data: CALENDARIO_POR_DEFECTO.map((d) => ({ projectId: obra.id, ...d })),
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
          correlativo,
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

export type ResultadoActualizarObra =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Edita los datos de una obra de la empresa de la sesion.
 *
 * Antes no habia forma de corregir una obra ya creada: nombre, cliente,
 * ubicacion, codigo y —lo que mas duele— el PLAZO quedaban fijos desde el alta.
 * Una fecha fin mal tecleada se arrastraba a todo el panel (dias restantes,
 * avance de calendario) sin forma de enmendarla desde la UI.
 *
 * Espeja a `crearObra`: mismas reglas puras (`validarObra`), mismo aislamiento
 * por empresa y mismo control de codigo unico —excluyendo la propia obra—, con
 * un apunte de auditoria del antes y el despues. NO toca el `estado`: ese cambia
 * por la maquina de transiciones (`cambiarEstadoObra`), no por este formulario.
 */
export async function actualizarObra(
  sesion: SesionActiva,
  obraId: string,
  datos: DatosObra,
): Promise<ResultadoActualizarObra> {
  if (!puede(sesion, "obra:editar")) {
    return { ok: false, error: "No tienes permiso para editar obras." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: {
      id: true,
      nombreObra: true,
      codigoObra: true,
      ubicacion: true,
      cliente: true,
      fechaInicio: true,
      fechaFinProgramada: true,
      estado: true,
    },
  });
  if (!obra) return { ok: false, error: "No se encontro la obra." };

  if (!obraAdmiteCambios(obra.estado)) {
    return { ok: false, error: OBRA_CERRADA };
  }

  const validacion = validarObra(datos);
  if (!validacion.ok) return { ok: false, error: validacion.error };

  const { inicio, fin } = validacion.plazo;

  const opcional = (v: string | undefined, largo: number) =>
    v?.trim() ? v.trim().slice(0, largo) : null;

  const codigoObra = opcional(datos.codigoObra, 40);

  // Codigo unico dentro de la empresa, EXCLUYENDO esta misma obra: sin el
  // `id: { not }`, guardar sin cambiar el codigo chocaria contra si mismo.
  if (codigoObra) {
    const existente = await prisma.project.findFirst({
      where: { companyId: sesion.companyId, codigoObra, id: { not: obraId } },
      select: { nombreObra: true },
    });
    if (existente) {
      return {
        ok: false,
        error: `Ya existe otra obra con el codigo ${codigoObra}: "${existente.nombreObra}".`,
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
  };

  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: obraId }, data: campos });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "Project",
        entidadId: obraId,
        accion: "UPDATE",
        antes: {
          nombreObra: obra.nombreObra,
          codigoObra: obra.codigoObra,
          ubicacion: obra.ubicacion,
          cliente: obra.cliente,
          fechaInicio: obra.fechaInicio.toISOString().slice(0, 10),
          fechaFinProgramada: obra.fechaFinProgramada.toISOString().slice(0, 10),
        },
        despues: {
          ...campos,
          fechaInicio: datos.fechaInicio,
          fechaFinProgramada: datos.fechaFinProgramada,
        },
      },
    });
  });

  return { ok: true, id: obraId };
}

// ---------------------------------------------------------------------------
// Baja de obras
// ---------------------------------------------------------------------------

/**
 * Elimina una obra, con trazabilidad, SOLO si es segura de eliminar.
 *
 * Segura = en PLANIFICACION, sin ninguna orden y sin ninguna linea base. Es
 * decir, una obra que aun no ha comprometido nada con nadie ni ha congelado
 * su presupuesto: lo unico que puede tener son partidas cargadas, que se van
 * con ella. En cuanto hay una orden o una linea base, la obra ya es historia
 * economica y no se borra —a lo sumo se cierra—.
 *
 * Sin linea base no puede haber movimientos (un movimiento exige una), asi
 * que el arbol de partidas es lo unico colgando. Se rompe la jerarquia antes
 * de borrar —`parentId` a NULL— porque la relacion padre-hijo es `Restrict`:
 * un `deleteMany` sobre filas que se referencian entre si fallaria.
 */
export async function eliminarObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!puede(sesion, "obra:eliminar")) {
    return { ok: false, error: "No tienes permiso para eliminar obras." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true, nombreObra: true, codigoObra: true, estado: true },
  });
  if (!obra) return { ok: false, error: "No se encontro la obra." };

  if (obra.estado !== "PLANIFICACION") {
    return {
      ok: false,
      error:
        "Solo se pueden eliminar obras en planificacion. Una obra en ejecucion, paralizada o cerrada es historia de la empresa: se conserva.",
    };
  }

  const [ordenes, baselines] = await Promise.all([
    prisma.ordenCompra.count({ where: { projectId: obraId } }),
    prisma.baseline.count({ where: { projectId: obraId } }),
  ]);

  if (ordenes > 0) {
    return {
      ok: false,
      error:
        "Esta obra ya tiene ordenes registradas; no puede eliminarse. Anula las ordenes o cierra la obra.",
    };
  }
  if (baselines > 0) {
    return {
      ok: false,
      error:
        "Esta obra ya tiene una linea base; no puede eliminarse. Una vez congelado el presupuesto, la obra se conserva.",
    };
  }

  await prisma.$transaction(async (tx) => {
    // El apunte va ANTES del borrado: si algo fallara despues, queda el
    // intento registrado y no un borrado silencioso.
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "Project",
        entidadId: obraId,
        accion: "DELETE",
        antes: {
          nombreObra: obra.nombreObra,
          codigoObra: obra.codigoObra,
          estado: obra.estado,
        },
      },
    });

    // Romper la jerarquia antes de borrar: la relacion padre-hijo es Restrict
    // y un borrado masivo con las referencias intactas chocaria contra ella.
    await tx.wbsItem.updateMany({
      where: { projectId: obraId },
      data: { parentId: null },
    });
    // Las partidas se van; sus filas de "proveedor habitual" caen en cascada.
    await tx.wbsItem.deleteMany({ where: { projectId: obraId } });

    await tx.project.delete({ where: { id: obraId } });
  });

  return { ok: true };
}

/**
 * Cambia el estado de una obra por uno de los permitidos desde el actual.
 *
 * La maquina de estados vive en `lib/obras` para poder probarla; aqui solo se
 * comprueba que el paso pedido sea uno de los validos y se registra el cambio.
 * Un paso invalido —o manipulado en la peticion— se rechaza con un mensaje
 * claro en vez de escribir un estado imposible.
 */
export async function cambiarEstadoObra(
  sesion: SesionActiva,
  obraId: string,
  nuevoEstado: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!puede(sesion, "obra:editar")) {
    return { ok: false, error: "No tienes permiso para cambiar el estado de la obra." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { estado: true, nombreObra: true },
  });
  if (!obra) return { ok: false, error: "No se encontro la obra." };

  if (!ESTADOS_OBRA.includes(nuevoEstado as EstadoObra)) {
    return { ok: false, error: "Estado no valido." };
  }

  if (obra.estado === nuevoEstado) return { ok: true }; // nada que hacer

  if (!puedeTransicionarObra(obra.estado, nuevoEstado)) {
    return {
      ok: false,
      error: `No se puede pasar de ${ETIQUETA_ESTADO_OBRA[obra.estado as EstadoObra]} a ${ETIQUETA_ESTADO_OBRA[nuevoEstado as EstadoObra]}.`,
    };
  }

  // Arrancar POR PRIMERA VEZ exige presupuesto. Reanudar una obra paralizada
  // no: esa ya paso por aqui, y volver a exigirselo bloquearia una obra en
  // marcha por un requisito que cumplio hace meses.
  if (nuevoEstado === "EN_EJECUCION" && obra.estado === "PLANIFICACION") {
    const partidas = await prisma.wbsItem.count({
      where: { projectId: obraId, tipo: "PARTIDA" },
    });

    // Se comprueba en el servidor y no solo en la pantalla: la accion se puede
    // invocar directamente, y una obra en ejecucion sin presupuesto deja el
    // control economico entero sin suelo.
    const faltan = requisitosParaEjecutar({
      partidas,
      // Cronograma y linea base no bloquean, asi que no hace falta
      // consultarlos aqui: la pantalla ya los avisa antes de llegar.
      tieneCronograma: true,
      tieneLineaBase: true,
    });

    if (!puedeArrancar(faltan)) {
      const bloqueante = faltan.find((r) => r.bloqueante);
      return {
        ok: false,
        error: `${bloqueante?.falta ?? "Faltan requisitos."} ${bloqueante?.consecuencia ?? ""}`.trim(),
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: obraId },
      data: { estado: nuevoEstado as EstadoObra },
    });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "Project",
        entidadId: obraId,
        accion: "UPDATE",
        antes: { estado: obra.estado },
        despues: { estado: nuevoEstado },
      },
    });
  });

  return { ok: true };
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
