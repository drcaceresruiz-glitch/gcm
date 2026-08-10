import type { EstadoLookahead, TipoRestriccion } from "@/generated/prisma/enums";

/**
 * Reglas del Lookahead (Last Planner), sin base de datos.
 *
 * Se separan del servicio para poder probarlas: la ventana de mediano plazo,
 * los 7 flujos de restriccion, el semaforo de confiabilidad (LISTO/PENDIENTE)
 * y el % de confiabilidad de la ventana. Las tareas que caen en la ventana se
 * filtran con `tareasDeLaSemana` de `@/lib/plan-semanal` (mismo solape de
 * fechas): la ventana es solo un rango mayor.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

export interface VentanaLookahead {
  desde: Date;
  hasta: Date;
}

/**
 * La ventana del Lookahead: de hoy a `semanas` semanas despues (3 por defecto).
 * `hoy` se recibe —no se lee dentro— para poder probarla. Fechas de calendario
 * comparables con las columnas `@db.Date` de las tareas.
 */
export function ventanaLookahead(hoy: Date, semanas = SEMANAS_POR_DEFECTO): VentanaLookahead {
  return { desde: hoy, hasta: new Date(hoy.getTime() + semanas * 7 * DIA_MS) };
}

/**
 * Cuantas semanas mira el Lookahead.
 *
 * El Last Planner no fija un numero: tres semanas es el minimo util y lo
 * habitual son cuatro a seis. Depende de los plazos de entrega de la obra —una
 * con acero importado necesita mirar mas lejos que una de acabados—, asi que
 * se elige por obra en vez de imponerlo.
 *
 * Se mantiene 3 por defecto para no cambiarle la ventana a nadie en silencio.
 */
export const SEMANAS_POR_DEFECTO = 3;
export const SEMANAS_MINIMO = 1;
/// Mas alla de esto el cronograma deja de ser fiable y el analisis es humo.
export const SEMANAS_MAXIMO = 12;

/// Las opciones del selector. Se puede pedir cualquier numero por la URL.
export const SEMANAS_SUGERIDAS: readonly number[] = [3, 4, 6, 8, 12];

/**
 * El numero de semanas que pide la pantalla, acotado.
 *
 * Llega de la URL, asi que puede ser cualquier cosa: se ignora lo que no sea
 * un entero y se recorta al rango en vez de fallar. Una ventana rara no es
 * motivo para no ensenar el Lookahead.
 */
export function normalizarSemanas(valor: string | number | undefined | null): number {
  // "Sin valor" se descarta ANTES de convertir: `Number(null)` y `Number("")`
  // valen 0, no NaN, asi que se colarian por el guardian de abajo y acabarian
  // recortados al minimo. Una URL con `?semanas=` daria una ventana de una
  // semana en vez del defecto.
  if (valor === null || valor === undefined) return SEMANAS_POR_DEFECTO;
  if (typeof valor === "string" && valor.trim() === "") return SEMANAS_POR_DEFECTO;

  const n = Number(valor);
  if (!Number.isFinite(n)) return SEMANAS_POR_DEFECTO;
  const entero = Math.floor(n);
  if (entero < SEMANAS_MINIMO) return SEMANAS_MINIMO;
  if (entero > SEMANAS_MAXIMO) return SEMANAS_MAXIMO;
  return entero;
}

/**
 * Los 7 flujos del analisis de restricciones del Last Planner, en el orden en
 * que se muestran en la matriz. `tipo` casa con el enum `TipoRestriccion`.
 */
export const FLUJOS_RESTRICCION: ReadonlyArray<{
  tipo: TipoRestriccion;
  etiqueta: string;
  descripcion: string;
}> = [
  { tipo: "INFORMACION", etiqueta: "Informacion", descripcion: "Planos, RFI, especificaciones" },
  { tipo: "MATERIALES", etiqueta: "Materiales", descripcion: "En obra o con entrega confirmada" },
  { tipo: "MANO_OBRA", etiqueta: "Mano de obra", descripcion: "Cuadrilla asignada" },
  { tipo: "EQUIPOS", etiqueta: "Equipos", descripcion: "Maquinaria y herramienta disponibles" },
  { tipo: "ESPACIO", etiqueta: "Espacio", descripcion: "Frente o zona liberada" },
  { tipo: "REQUISITOS", etiqueta: "Requisitos", descripcion: "Prerrequisitos o tareas previas" },
  { tipo: "SEGURIDAD", etiqueta: "Seguridad", descripcion: "Permisos, PETAR, ATS" },
];

/** Los 7 tipos en el orden de la matriz. Base para sembrar restricciones. */
export const TIPOS_RESTRICCION: readonly TipoRestriccion[] =
  FLUJOS_RESTRICCION.map((f) => f.tipo);

/**
 * Estado de confiabilidad de una tarea segun sus restricciones: LISTO si TODAS
 * estan resueltas (y hay al menos una); si no, PENDIENTE. El estado BLOQUEADO
 * es una marca manual y no se deduce aqui.
 */
export function estadoDeTarea(
  restricciones: ReadonlyArray<{ resuelta: boolean }>,
): EstadoLookahead {
  if (restricciones.length === 0) return "PENDIENTE";
  return restricciones.every((r) => r.resuelta) ? "LISTO" : "PENDIENTE";
}

export interface Confiabilidad {
  listas: number;
  total: number;
  /// 0..100, entero: cuantas tareas de la ventana estan LISTAS.
  porcentaje: number;
}

/** Resumen de confiabilidad de la ventana: cuantas tareas estan LISTAS. */
export function confiabilidad(
  filas: ReadonlyArray<{ estado: EstadoLookahead }>,
): Confiabilidad {
  const total = filas.length;
  const listas = filas.filter((f) => f.estado === "LISTO").length;
  const porcentaje = total === 0 ? 0 : Math.round((listas / total) * 100);
  return { listas, total, porcentaje };
}
