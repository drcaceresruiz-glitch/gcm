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

/**
 * Las opciones del selector. Se puede pedir cualquier numero por la URL.
 *
 * UNA y DOS semanas estan aqui aunque el Last Planner hable de tres: una obra
 * de dos semanas no tiene tres que mirar, y ofrecerle solo ventanas mas largas
 * que la obra entera llena la matriz de trabajo que no existe. El minimo util
 * del metodo sigue siendo 3 —y por eso es el defecto—, pero el tamano de la
 * obra manda sobre la doctrina.
 */
export const SEMANAS_SUGERIDAS: readonly number[] = [1, 2, 3, 4, 6, 8, 12];

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
  if (!hayValor(valor)) return SEMANAS_POR_DEFECTO;

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

/**
 * Los 7 tipos en el orden de la matriz. Es el CHECKLIST de preguntas que hay
 * que hacerse sobre cada tarea, no la lista de restricciones que se le crean:
 * cuales aplican de verdad lo decide quien la analiza.
 */
export const TIPOS_RESTRICCION: readonly TipoRestriccion[] =
  FLUJOS_RESTRICCION.map((f) => f.tipo);

/**
 * En que punto del analisis esta una tarea.
 *
 * Distingue lo que `EstadoLookahead` no puede: "nadie la ha mirado" de
 * "revisada y no le aplica ninguna restriccion". Las dos tienen cero
 * restricciones, y confundirlas es lo que hacia que el porcentaje de
 * confiabilidad midiera la falta de analisis y no la obra.
 */
export type FaseAnalisis = "SIN_ANALIZAR" | "CON_PENDIENTES" | "LISTA";

export interface TareaAnalizable {
  /// Cuando alguien decidio que flujos aplican. Null = nadie la ha mirado.
  analizadaAt: Date | null;
  restricciones: ReadonlyArray<{ resuelta: boolean }>;
}

/**
 * La fase de analisis de una tarea.
 *
 * Sin fecha de analisis es SIN_ANALIZAR aunque tenga restricciones: la fecha
 * manda sobre las filas, porque hay tareas viejas con las 7 sembradas que
 * nadie llego a mirar.
 *
 * Analizada y sin ninguna restriccion sale LISTA, y eso NO es un descuido:
 * `[].every()` es true, y ese caso —"la revise y no le aplica nada"— es justo
 * el que antes no se podia expresar.
 */
export function faseDeTarea(tarea: TareaAnalizable): FaseAnalisis {
  if (tarea.analizadaAt === null) return "SIN_ANALIZAR";
  return tarea.restricciones.every((r) => r.resuelta)
    ? "LISTA"
    : "CON_PENDIENTES";
}

/**
 * El semaforo que se guarda en `LookaheadTask.estado`: responde a "se puede
 * comprometer?". Se deriva de `faseDeTarea` a proposito, para que los dos no
 * puedan divergir. BLOQUEADO es una marca manual y no se deduce aqui.
 */
export function estadoDeTarea(tarea: TareaAnalizable): EstadoLookahead {
  return faseDeTarea(tarea) === "LISTA" ? "LISTO" : "PENDIENTE";
}

export interface Confiabilidad {
  listas: number;
  total: number;
  /// 0..100, entero: cuantas tareas de la ventana estan LISTAS.
  porcentaje: number;
  /// Cuantas de `total` no las ha mirado nadie. Sin este numero, un 0% no
  /// distingue "la obra va mal" de "no se ha usado la matriz".
  sinAnalizar: number;
}

/** Resumen de confiabilidad de la ventana: cuantas tareas estan LISTAS. */
export function confiabilidad(
  filas: ReadonlyArray<{ fase: FaseAnalisis }>,
): Confiabilidad {
  const total = filas.length;
  const listas = filas.filter((f) => f.fase === "LISTA").length;
  const sinAnalizar = filas.filter((f) => f.fase === "SIN_ANALIZAR").length;
  const porcentaje = total === 0 ? 0 : Math.round((listas / total) * 100);
  return { listas, total, porcentaje, sinAnalizar };
}

// --- Elegir que flujos aplican ---------------------------------------------

/// Una restriccion tal como esta hoy en la base, con lo que hace falta para
/// decidir si se puede retirar sin tirar trabajo de nadie.
export interface RestriccionActual {
  id: string;
  tipo: TipoRestriccion;
  resuelta: boolean;
  detalle: string | null;
  requiereDoc: boolean;
  documentoId: string | null;
  /// Cuantas fotos de evidencia cuelgan de ella.
  fotos: number;
}

/// Por que se conservo una restriccion que sobraba. Se le dice al usuario.
export type MotivoConservada = "resuelta" | "con-fotos" | "con-datos";

/// `reemplazar`: la tarea queda EXACTAMENTE con los flujos pedidos.
/// `agregar`: se anaden a los que ya tenga, sin quitar ninguno.
export type ModoFlujos = "reemplazar" | "agregar";

export interface PlanDeFlujos {
  /// Tipos a crear, en el orden de la matriz.
  crear: TipoRestriccion[];
  /// Ids a borrar: sobraban Y estaban en blanco.
  borrar: string[];
  /// Sobraban pero se quedan porque tienen algo dentro.
  conservadas: { id: string; tipo: TipoRestriccion; motivo: MotivoConservada }[];
}

/**
 * Que hay que crear y que se puede borrar para dejar una tarea con los flujos
 * pedidos.
 *
 * Vive aqui y no en el servicio porque es la regla que PROTEGE LA EVIDENCIA.
 * `FotoEvidencia.restriccionId` es `ON DELETE SET NULL`: borrar una
 * restriccion con fotos no borra las fotos, las deja con los dos anclajes en
 * null —invisibles para siempre en toda pantalla, ocupando disco—. Por eso
 * una restriccion con fotos NUNCA entra en `borrar`, y por eso esto tiene
 * tests.
 *
 * Lo mismo con las resueltas (alguien hizo el trabajo de levantarlas) y con
 * las que llevan detalle o documento (alguien escribio algo). Se conservan y
 * se informa; no se pide confirmacion, porque no se pierde nada que confirmar.
 */
export function planificarFlujos(
  actuales: readonly RestriccionActual[],
  pedidos: readonly TipoRestriccion[],
  modo: ModoFlujos = "reemplazar",
): PlanDeFlujos {
  const quiere = new Set(pedidos);
  const hay = new Set(actuales.map((r) => r.tipo));

  // En el orden de la matriz y no en el que llegaron: la lista de creadas se
  // ensena al usuario, y el orden de la pantalla es el que reconoce.
  const crear = TIPOS_RESTRICCION.filter((t) => quiere.has(t) && !hay.has(t));

  if (modo === "agregar") return { crear, borrar: [], conservadas: [] };

  const borrar: string[] = [];
  const conservadas: PlanDeFlujos["conservadas"] = [];

  for (const r of actuales) {
    if (quiere.has(r.tipo)) continue;
    const motivo = motivoParaConservar(r);
    if (motivo === null) borrar.push(r.id);
    else conservadas.push({ id: r.id, tipo: r.tipo, motivo });
  }

  return { crear, borrar, conservadas };
}

/// Null si la restriccion esta en blanco y se puede retirar sin perder nada.
function motivoParaConservar(r: RestriccionActual): MotivoConservada | null {
  if (r.resuelta) return "resuelta";
  if (r.fotos > 0) return "con-fotos";
  if (r.detalle !== null && r.detalle.trim() !== "") return "con-datos";
  if (r.requiereDoc || r.documentoId !== null) return "con-datos";
  return null;
}

/// Si de verdad viene algo. Un `?semanas=` vacio en la URL no es una eleccion.
function hayValor(valor: string | number | undefined | null): boolean {
  if (valor === null || valor === undefined) return false;
  return !(typeof valor === "string" && valor.trim() === "");
}

/**
 * Que ventana se mira: la que se pide de paso, o la que la obra tiene elegida.
 *
 * `pedidas` viene de `?semanas=` en la URL y MANDA cuando viene: sirve para
 * asomarse a otra ventana —un enlace que alguien comparte, o mirar mas lejos
 * un momento— sin cambiarsela a toda la obra.
 *
 * `guardadas` es `Project.semanasLookahead`, null mientras nadie la haya
 * fijado. Existe porque hasta el 25 de agosto de 2026 la ventana vivia SOLO en
 * la URL: se elegia en el desplegable y se perdia al salir de la pantalla, asi
 * que cada persona que entraba volvia a ver tres semanas y tenia que volver a
 * ampliarla.
 */
export function semanasElegidas(
  pedidas: string | number | undefined | null,
  guardadas: number | null | undefined,
): number {
  return hayValor(pedidas) ? normalizarSemanas(pedidas) : normalizarSemanas(guardadas);
}
