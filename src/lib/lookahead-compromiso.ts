import type { TipoRestriccion } from "@/generated/prisma/enums";

/**
 * La promesa de liberar una restriccion: quien y para cuando.
 *
 * Vive aparte de `@/lib/lookahead` porque es otra pregunta. Aquel decide QUE
 * flujos le aplican a una tarea y si esta lista; esto decide **si alguien se
 * hizo cargo y si cumplio**, que es la fase de preparacion del Last Planner y
 * lo unico que GCM no medía.
 *
 * POR QUE HACÍA FALTA
 *
 * El analisis de restricciones del Last Planner ES una lista de
 * *restriccion -> responsable -> fecha en que promete liberarla*. Sin esas dos
 * columnas lo que hay es una casilla que alguien marca, y entonces no se puede
 * responder a la pregunta que de verdad importa cuando la obra se atasca:
 * **quien dijo que lo tendria, y para cuando**.
 *
 * Se vio en la primera obra real: el Pareto dio 5 de 5 incumplimientos por
 * "Prerrequisito / tarea previa" y no habia forma de saber quien iba a
 * resolver aquello.
 *
 * Todo lo decidible vive aqui y no en el servicio porque en este proyecto **no
 * hay tests de servicio**: lo que se escriba alli no lo prueba nadie.
 */

/** Los dos sujetos posibles. Alguien de GCM, o alguien de fuera. */
export type Responsable =
  | { tipo: "usuario"; id: string }
  | { tipo: "contacto"; id: string };

export interface RestriccionConPromesa {
  tipo: TipoRestriccion;
  resuelta: boolean;
  resueltaAt: Date | null;
  fechaCompromiso: Date | null;
  responsableUserId: string | null;
  responsableContactoId: string | null;
}

/**
 * En que punto esta la promesa de una restriccion.
 *
 * `sin-asignar` y `sin-fecha` son estados DISTINTOS a proposito, aunque los dos
 * signifiquen "no hay promesa": son dos conversaciones distintas. La primera es
 * "¿quien se hace cargo?" y la segunda "¿para cuando?", y quien tiene que
 * resolverlas suele ser distinta persona. Juntarlas obligaria a la pantalla a
 * decir algo vago que no lleva a ninguna accion concreta.
 */
export type EstadoPromesa =
  | "sin-asignar"
  | "sin-fecha"
  | "a-tiempo"
  | "vence-hoy"
  | "vencida"
  | "liberada";

/** Dias de calendario entre dos fechas, sin mirar la hora. */
function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.round((b - a) / 86_400_000);
}

export function estadoDePromesa(
  r: RestriccionConPromesa,
  hoy: Date,
): EstadoPromesa {
  if (r.resuelta) return "liberada";

  const asignada =
    r.responsableUserId !== null || r.responsableContactoId !== null;
  if (!asignada) return "sin-asignar";
  if (r.fechaCompromiso === null) return "sin-fecha";

  const dias = diasEntre(hoy, r.fechaCompromiso);
  if (dias < 0) return "vencida";
  if (dias === 0) return "vence-hoy";
  return "a-tiempo";
}

/**
 * Si una restriccion ya liberada se libero dentro de lo prometido.
 *
 * El MISMO DIA cuenta como a tiempo: quien prometio "el jueves" y lo tuvo el
 * jueves cumplio. Contarlo como tarde por unas horas seria un indicador que
 * castiga cumplir, y a la segunda semana nadie se comprometeria a nada.
 */
export function seLiberoATiempo(r: RestriccionConPromesa): boolean | null {
  if (!r.resuelta || r.fechaCompromiso === null) return null;
  // Sin fecha de resolucion no se puede juzgar; se da por buena antes que
  // acusar sin dato.
  if (r.resueltaAt === null) return true;
  return diasEntre(r.resueltaAt, r.fechaCompromiso) >= 0;
}

export interface CumplimientoLiberacion {
  /// Cuantas restricciones tienen fecha prometida (abiertas o no).
  conFecha: number;
  /// Liberadas dentro de plazo.
  aTiempo: number;
  /// Liberadas despues de la fecha.
  tarde: number;
  /// Abiertas y con la fecha ya pasada. Es el numero que mueve a alguien.
  vencidasAbiertas: number;
  /// Abiertas sin nadie asignado. El hueco silencioso.
  sinAsignar: number;
  /// Abiertas con responsable pero sin fecha.
  sinFecha: number;
  /**
   * De lo que se prometio Y ya se cerro, cuanto salio a tiempo (0..100).
   *
   * **`null` cuando nadie ha prometido nada todavia**, y esto no es un detalle:
   * "nadie prometio" no es "todos fallaron". Es exactamente la confusion que
   * tenia la confiabilidad antes de `analizadaAt` —una obra sin analizar salia
   * al 0% como si lo hubiera hecho mal— y no se va a repetir.
   */
  porcentaje: number | null;
}

/**
 * El PPC de la fase de preparacion.
 *
 * El PPC mide si se cumplio lo que se prometio HACER esta semana. Esto mide si
 * se cumplio lo que se prometio DEJAR LISTO, que es el paso de antes y donde
 * de verdad se pierde el plazo: una tarea que llega al lunes sin su material no
 * se recupera con voluntad.
 *
 * Solo entran las que tienen fecha. Lo que nadie prometio no se puede medir, y
 * meterlo como fallo inventaria un incumplimiento donde solo hubo silencio.
 */
export function cumplimientoDeLiberacion(
  restricciones: readonly RestriccionConPromesa[],
  hoy: Date,
): CumplimientoLiberacion {
  let conFecha = 0;
  let aTiempo = 0;
  let tarde = 0;
  let vencidasAbiertas = 0;
  let sinAsignar = 0;
  let sinFecha = 0;

  for (const r of restricciones) {
    if (r.fechaCompromiso !== null) conFecha += 1;

    const estado = estadoDePromesa(r, hoy);
    switch (estado) {
      case "sin-asignar":
        sinAsignar += 1;
        break;
      case "sin-fecha":
        sinFecha += 1;
        break;
      case "vencida":
        vencidasAbiertas += 1;
        break;
      case "liberada": {
        const puntual = seLiberoATiempo(r);
        if (puntual === true) aTiempo += 1;
        else if (puntual === false) tarde += 1;
        break;
      }
      default:
        break;
    }
  }

  const cerradas = aTiempo + tarde;
  return {
    conFecha,
    aTiempo,
    tarde,
    vencidasAbiertas,
    sinAsignar,
    sinFecha,
    porcentaje: cerradas === 0 ? null : (aTiempo / cerradas) * 100,
  };
}

// ---------------------------------------------------------------------------
// Registrar la promesa
// ---------------------------------------------------------------------------

export interface DatosCompromiso {
  /// "u:<id>" para un usuario, "c:<id>" para alguien de fuera, "" para quitar
  /// el responsable. Misma forma que la clave de persona de `@/lib/avisos`,
  /// para que un desplegable pueda ofrecer las dos listas juntas.
  responsable: string;
  /// "YYYY-MM-DD", o "" para quitar la fecha.
  fecha: string;
}

export interface CompromisoSaneado {
  responsable: Responsable | null;
  /// Null = quitar la fecha. Se distingue de "no tocar" en el servicio.
  fecha: Date | null;
}

export type ValidacionCompromiso =
  | { ok: true; datos: CompromisoSaneado }
  | { ok: false; error: string };

/**
 * Valida quien y cuando.
 *
 * Dos reglas, y las dos existen por lo mismo: que la fila diga algo verdadero.
 *
 * 1. **El sujeto es uno o ninguno.** Dos responsables es que no hay ninguno:
 *    cada uno dara por hecho que lo hace el otro.
 * 2. **La fecha no puede ser anterior a hoy.** Prometer para ayer no es una
 *    promesa, es registrar un incumplimiento por adelantado, y ademas
 *    envenenaria el indicador de liberadas a tiempo desde el primer dia.
 *
 * NO se exige que haya responsable para poner fecha ni al reves: en obra se
 * sabe antes "esto tiene que estar el jueves" que quien lo va a conseguir, y
 * obligar a rellenar los dos haria que no se rellenara ninguno.
 */
export function validarCompromisoRestriccion(
  d: DatosCompromiso,
  hoy: Date,
): ValidacionCompromiso {
  const bruto = d.responsable.trim();
  let responsable: Responsable | null = null;

  if (bruto !== "") {
    const id = bruto.slice(2);
    if (id === "") return { ok: false, error: "Elige a quién le toca." };
    if (bruto.startsWith("u:")) responsable = { tipo: "usuario", id };
    else if (bruto.startsWith("c:")) responsable = { tipo: "contacto", id };
    else return { ok: false, error: "Elige a quién le toca." };
  }

  const fechaBruta = d.fecha.trim();
  if (fechaBruta === "") return { ok: true, datos: { responsable, fecha: null } };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaBruta)) {
    return { ok: false, error: "La fecha no tiene el formato correcto." };
  }

  const fecha = new Date(`${fechaBruta}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) {
    return { ok: false, error: "La fecha no existe." };
  }

  if (diasEntre(hoy, fecha) < 0) {
    return {
      ok: false,
      error: "La fecha ya pasó. Una promesa para ayer no es una promesa.",
    };
  }

  return { ok: true, datos: { responsable, fecha } };
}

/** La clave de persona de un responsable, para casar con `@/lib/avisos`. */
export function claveDeResponsable(r: RestriccionConPromesa): string | null {
  if (r.responsableUserId !== null) return `u:${r.responsableUserId}`;
  if (r.responsableContactoId !== null) return `c:${r.responsableContactoId}`;
  return null;
}
