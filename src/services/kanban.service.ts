import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { obtenerLookahead } from "@/services/lookahead.service";
import type { SesionActiva } from "@/services/sesion.service";
import type {
  CausaNoCumplimiento,
  TipoRestriccion,
} from "@/generated/prisma/enums";

/**
 * El Kanban de la obra: el flujo del Last Planner en cinco columnas.
 *
 * NO es un tercer tablero. Es OTRA DISPOSICION de los mismos datos que ya
 * pintan la matriz del Lookahead y el tablero semanal: aquel ordena por dia
 * de la semana, este por madurez de la tarea. Por eso reusa
 * `obtenerLookahead` en vez de repetir el cruce entre el cronograma y la
 * matriz: dos mapas del mismo territorio acaban divergiendo, y este proyecto
 * ya lo pago dentro de la obra.
 *
 * Las cinco columnas salen de estados que la base YA transiciona. No se
 * inventa ninguno:
 *
 *   SIN ANALIZAR -> CON RESTRICCIONES -> LISTA -> COMPROMETIDA -> CERRADA
 *   `-------- faseDeTarea ---------'    `--- CompromisoSemanal ---'
 *
 * OJO con `EstadoLookahead.BLOQUEADO`: es una marca MANUAL y no se deduce de
 * nada (`estadoDeTarea` solo devuelve LISTO o PENDIENTE). Por eso la segunda
 * columna no es «bloqueada» sino «con restricciones», que es lo que el modelo
 * sabe responder de verdad.
 */

export type ColumnaKanban =
  | "SIN_ANALIZAR"
  | "CON_RESTRICCIONES"
  | "LISTA"
  | "COMPROMETIDA"
  | "EN_EJECUCION"
  | "CERRADA";

export interface BloqueoTarjeta {
  tipo: TipoRestriccion;
  fechaCompromiso: Date | null;
  /// true si la promesa de liberacion ya vencio y sigue abierta.
  vencida: boolean;
}

export interface TarjetaKanban {
  /// Clave estable para React. El uid no vale: los compromisos libres no lo
  /// tienen, y una tarea puede estar comprometida en dos semanas.
  clave: string;
  /// UID de la tarea del cronograma. Null en un compromiso de linea libre.
  uid: number | null;
  codigo: string | null;
  nombre: string;
  faseBloque: string | null;
  zona: string | null;
  /// Solo en las tres primeras columnas: las fechas salen del cronograma.
  inicio: Date | null;
  fin: Date | null;
  /// Restricciones abiertas, para las etiquetas de bloqueo.
  bloqueos: BloqueoTarjeta[];
  /// Semana del PTS, en las dos ultimas columnas.
  planId: string | null;
  semana: number | null;
  proveedor: string | null;
  cantidadPlan: string | null;
  cantidadEjec: string | null;
  unidad: string | null;
  /// Solo en CERRADA. null en el resto.
  cumplido: boolean | null;
  causa: CausaNoCumplimiento | null;
  /// Nacio de una tarea del Lookahead o es una linea libre de la semana.
  libre: boolean;
  /// Id del compromiso, para poder moverlo de columna. Null en las tareas
  /// del Lookahead, que todavia no son compromiso.
  compromisoId: string | null;
  enEjecucion: boolean;
}

export interface ColumnaConTarjetas {
  clave: ColumnaKanban;
  titulo: string;
  /// La pregunta que responde la columna, con el mismo vocabulario que los
  /// menus de obra y de empresa.
  pregunta: string;
  tarjetas: TarjetaKanban[];
}

export interface KanbanDatos {
  columnas: ColumnaConTarjetas[];
  /// Semanas del PTS que aportan la columna COMPROMETIDA.
  semanasAbiertas: number[];
  /// La semana cerrada que aporta la columna CERRADA, si hay alguna.
  semanaCerrada: number | null;
  /// Cuantas semanas mira la ventana del Lookahead (las tres primeras).
  semanas: number;
}

const TITULOS: Record<ColumnaKanban, { titulo: string; pregunta: string }> = {
  SIN_ANALIZAR: {
    titulo: "Sin analizar",
    pregunta: "nadie ha mirado qué le falta",
  },
  CON_RESTRICCIONES: {
    titulo: "Con restricciones",
    pregunta: "qué la tiene parada",
  },
  LISTA: { titulo: "Lista", pregunta: "se puede comprometer" },
  COMPROMETIDA: { titulo: "Comprometida", pregunta: "prometida esta semana" },
  EN_EJECUCION: { titulo: "En ejecución", pregunta: "ya empezó en obra" },
  CERRADA: { titulo: "Cerrada", pregunta: "se cumplió o no, y por qué" },
};

/**
 * Arma el Kanban de una obra.
 *
 * Devuelve null sin permiso de lectura del Lookahead, igual que la matriz: sin
 * el no hay tablero que enseñar.
 *
 * Una tarea sale en UNA sola columna. El orden de decision es el del flujo, y
 * va de derecha a izquierda: si ya se evaluo esta CERRADA; si esta prometida
 * en una semana abierta esta COMPROMETIDA; y solo si no, se clasifica por su
 * fase de analisis. Sin esa precedencia, una tarea lista y ya comprometida
 * aparecería dos veces y el tablero contaria el trabajo por duplicado.
 */
export async function kanbanDeObra(
  sesion: SesionActiva,
  obraId: string,
  semanasPedidas?: string | number,
): Promise<KanbanDatos | null> {
  const matriz = await obtenerLookahead(sesion, obraId, semanasPedidas);
  if (!matriz) return null;

  // El PTS tiene su propio permiso: quien solo lee el Lookahead ve las tres
  // primeras columnas y las dos ultimas vacias, en vez de un error.
  const veElPts = puede(sesion, "plan_semanal:leer");

  const { abiertos, cerrada } = veElPts
    ? await compromisosDelTablero(obraId)
    : { abiertos: [], cerrada: null };

  const comprometidas = new Set(
    abiertos.flatMap((c) => (c.lookaheadTaskId ? [c.lookaheadTaskId] : [])),
  );
  const cerradas = new Set(
    (cerrada?.compromisos ?? []).flatMap((c) =>
      c.lookaheadTaskId ? [c.lookaheadTaskId] : [],
    ),
  );

  const porColumna: Record<ColumnaKanban, TarjetaKanban[]> = {
    SIN_ANALIZAR: [],
    CON_RESTRICCIONES: [],
    LISTA: [],
    COMPROMETIDA: [],
    EN_EJECUCION: [],
    CERRADA: [],
  };

  for (const fila of matriz.filas) {
    const id = fila.lookaheadTaskId;
    // Ya prometida o ya juzgada: su tarjeta la pone el compromiso, que trae
    // ademas el contratista y las cantidades.
    if (id && (comprometidas.has(id) || cerradas.has(id))) continue;

    const bloqueos = fila.restricciones
      .filter((r) => r.id !== null && !r.resuelta)
      .map((r) => ({
        tipo: r.tipo,
        fechaCompromiso: r.fechaCompromiso,
        vencida: r.promesa === "vencida",
      }));

    const columna: ColumnaKanban =
      fila.fase === "SIN_ANALIZAR"
        ? "SIN_ANALIZAR"
        : fila.fase === "LISTA"
          ? "LISTA"
          : "CON_RESTRICCIONES";

    porColumna[columna].push({
      clave: `t-${fila.uid}`,
      uid: fila.uid,
      codigo: fila.codigo,
      nombre: fila.nombre,
      faseBloque: fila.faseBloque,
      zona: fila.zona,
      inicio: fila.inicio,
      fin: fila.fin,
      bloqueos,
      planId: null,
      semana: null,
      proveedor: null,
      cantidadPlan: null,
      cantidadEjec: null,
      unidad: null,
      cumplido: null,
      causa: null,
      libre: false,
      compromisoId: null,
      enEjecucion: false,
    });
  }

  for (const c of abiertos) {
    // La columna sale de un dato EXPLICITO, no de deducir nada: una cantidad
    // ejecutada en cero no distingue «empezo sin avance medible» de «no ha
    // empezado», y confundirlas es como una fila cambia de naturaleza sin que
    // nadie lo note.
    const columna: ColumnaKanban = c.enEjecucion
      ? "EN_EJECUCION"
      : "COMPROMETIDA";
    porColumna[columna].push(tarjetaDeCompromiso(c));
  }
  for (const c of cerrada?.compromisos ?? []) {
    porColumna.CERRADA.push(tarjetaDeCompromiso(c));
  }

  return {
    columnas: (Object.keys(TITULOS) as ColumnaKanban[]).map((clave) => ({
      clave,
      ...TITULOS[clave],
      tarjetas: porColumna[clave],
    })),
    semanasAbiertas: [...new Set(abiertos.map((c) => c.numero))].sort(
      (a, b) => a - b,
    ),
    semanaCerrada: cerrada?.numero ?? null,
    semanas: matriz.semanas,
  };
}

/// Lo que hace falta de un compromiso para pintar su tarjeta.
interface CompromisoDelTablero {
  id: string;
  planId: string;
  numero: number;
  uid: number | null;
  descripcion: string;
  zona: string | null;
  lookaheadTaskId: string | null;
  cumplido: boolean | null;
  causa: CausaNoCumplimiento | null;
  /// Sellada la fecha de arranque = ya empezo en obra.
  enEjecucion: boolean;
  cantidadPlan: string | null;
  cantidadEjec: string | null;
  unidad: string | null;
  proveedor: string | null;
}

const CAMPOS_COMPROMISO = {
  id: true,
  uid: true,
  descripcion: true,
  zona: true,
  lookaheadTaskId: true,
  cumplido: true,
  causa: true,
  enEjecucionAt: true,
  cantidadPlan: true,
  cantidadEjec: true,
  unidad: true,
  proveedor: { select: { razonSocial: true } },
} as const;

/**
 * Los compromisos que alimentan las dos ultimas columnas.
 *
 * ACOTADO A PROPOSITO: las semanas ABIERTAS y **solo la ultima cerrada**. Un
 * Kanban que arrastrase todo el historico crecería sin limite y dejaria de
 * responder a «que pasa ahora», que es justo para lo que sirve. El historial
 * completo ya vive en la pantalla del plan semanal.
 */
async function compromisosDelTablero(obraId: string): Promise<{
  abiertos: CompromisoDelTablero[];
  cerrada: { numero: number; compromisos: CompromisoDelTablero[] } | null;
}> {
  const [planesAbiertos, ultimaCerrada] = await Promise.all([
    prisma.planSemanal.findMany({
      where: { projectId: obraId, estado: "ABIERTO" },
      orderBy: { fechaCorte: "asc" },
      select: { id: true, numero: true, compromisos: { select: CAMPOS_COMPROMISO } },
    }),
    prisma.planSemanal.findFirst({
      where: { projectId: obraId, estado: "CERRADO" },
      orderBy: { fechaCorte: "desc" },
      select: { id: true, numero: true, compromisos: { select: CAMPOS_COMPROMISO } },
    }),
  ]);

  const aplanar = (
    plan: { id: string; numero: number },
    filas: {
      id: string;
      uid: number | null;
      descripcion: string;
      zona: string | null;
      lookaheadTaskId: string | null;
      cumplido: boolean | null;
      causa: CausaNoCumplimiento | null;
      enEjecucionAt: Date | null;
      cantidadPlan: unknown;
      cantidadEjec: unknown;
      unidad: string | null;
      proveedor: { razonSocial: string } | null;
    }[],
  ): CompromisoDelTablero[] =>
    filas.map((c) => ({
      id: c.id,
      planId: plan.id,
      numero: plan.numero,
      uid: c.uid,
      descripcion: c.descripcion,
      zona: c.zona,
      lookaheadTaskId: c.lookaheadTaskId,
      cumplido: c.cumplido,
      causa: c.causa,
      enEjecucion: c.enEjecucionAt !== null,
      // Los decimales viajan como texto hasta la pantalla, como en el resto
      // del proyecto: convertirlos a numero aqui perderia centimos.
      cantidadPlan: c.cantidadPlan?.toString() ?? null,
      cantidadEjec: c.cantidadEjec?.toString() ?? null,
      unidad: c.unidad,
      proveedor: c.proveedor?.razonSocial ?? null,
    }));

  return {
    abiertos: planesAbiertos.flatMap((p) => aplanar(p, p.compromisos)),
    cerrada: ultimaCerrada
      ? {
          numero: ultimaCerrada.numero,
          compromisos: aplanar(ultimaCerrada, ultimaCerrada.compromisos),
        }
      : null,
  };
}

function tarjetaDeCompromiso(c: CompromisoDelTablero): TarjetaKanban {
  return {
    clave: `c-${c.id}`,
    uid: c.uid,
    codigo: null,
    nombre: c.descripcion,
    faseBloque: null,
    zona: c.zona,
    // Un compromiso vive en su semana, no en el tramo del cronograma: las
    // fechas de la tarea aqui confundirian.
    inicio: null,
    fin: null,
    bloqueos: [],
    planId: c.planId,
    semana: c.numero,
    proveedor: c.proveedor,
    cantidadPlan: c.cantidadPlan,
    cantidadEjec: c.cantidadEjec,
    unidad: c.unidad,
    cumplido: c.cumplido,
    causa: c.causa,
    libre: c.lookaheadTaskId === null,
    compromisoId: c.id,
    enEjecucion: c.enEjecucion,
  };
}
