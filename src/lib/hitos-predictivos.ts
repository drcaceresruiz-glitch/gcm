import { diasLaborablesEntre, type DiaLaboral } from "@/lib/calendario";

/**
 * Hitos que el sistema PROPONE, deducidos del estado de la obra.
 *
 * Ninguna regla inserta nada. Una propuesta no es una fila del cronograma
 * hasta que alguien la acepta, y eso es deliberado: un hito ES una tarea con
 * `esHito`, y `esHito` la saca del avance ponderado. Insertar propuestas
 * descuadraria la curva sola, en silencio.
 *
 * Cada regla devuelve propuestas O el motivo de su silencio, nunca un hueco
 * mudo. Tres de las seis no pueden decir nada con los datos de hoy —el CPI
 * necesita mapeo, la convergencia necesita la red de precedencias y la
 * saturacion necesita dotacion, que GCM ni guarda—, y **enseñar por que es la
 * mitad util de tenerlas escritas**: la pantalla es tambien la lista de lo que
 * le falta a la obra para poder predecirse.
 */

export type Regla =
  | "estancamiento"
  | "holgura"
  | "spi"
  | "cpi"
  | "convergencia"
  | "recursos";

export interface Propuesta {
  regla: Regla;
  /// La tarea que motiva la propuesta. Sirve para no repetirla y para ordenar;
  /// NO es el hito: aceptar crea una fila nueva y esta tarea sigue contando
  /// en el avance ponderado, como debe.
  uid: number;
  /**
   * Tras que partida colgaria el hito, por CODIGO.
   *
   * Es lo que `crearHito` espera, y es tambien lo que permite no volver a
   * proponer lo mismo: si ya hay un hito anclado ahi, esta parte de la obra ya
   * tiene su fecha marcada. Null = colgaria al final.
   */
  anclaCodigo: string | null;
  titulo: string;
  /// Por que, CON LA CIFRA dentro: «sin avance desde el 12/08 (7 dias
  /// habiles)» explica; «estancada» no dice nada que no supiera ya quien mira.
  motivo: string;
  /// Fecha de calendario "YYYY-MM-DD" para el hito.
  fechaSugerida: string;
  severidad: "avisar" | "urgente";
}

/** Por que una regla calla. Con el numero real, nunca un «no aplica». */
export interface SinDato {
  regla: Regla;
  falta: string;
}

export interface Prediccion {
  propuestas: Propuesta[];
  sinDato: SinDato[];
}

/**
 * LOS UMBRALES SON CRITERIO, NO MEDICION.
 *
 * Ninguno sale de una obra medida: se eligieron por oficio. Van aqui, con
 * nombre y con su porque, y la pantalla los cita como criterio de GCM —«5 dias
 * sin avance»— en vez de presentarlos como un hallazgo.
 *
 * Es la misma trampa que `lib/capacidad.ts` tiene anotada: elegirlos a ojo y
 * que en pantalla parezcan medidos. Cuando haya obras cerradas con las que
 * contrastarlos, se contrastan; hasta entonces son lo que son.
 */

/// Dias HABILES sin que se mueva el avance de una tarea ya empezada.
export const DIAS_ESTANCADA = 5;

/// Puntos porcentuales por debajo del plan a partir de los cuales una tarea
/// critica se considera en riesgo de comerse la holgura.
export const RETRASO_CRITICO = 15;

/// Cobertura del mapeo tarea-partida que exige el CPI para no mentir. Es la
/// MISMA que ya usa el panel de EVM: no se duplica el criterio, se cita.
export const COBERTURA_MINIMA = 60;

/// Predecesoras que tienen que confluir en una tarea para llamarla punto de
/// integracion.
export const CONVERGENCIA_MINIMA = 3;

/** Lo que cada regla necesita saber de una tarea del cronograma vigente. */
export interface TareaPredecible {
  uid: number;
  codigo: string | null;
  nombre: string;
  esResumen: boolean;
  esHito: boolean;
  esCritico: boolean;
  inicio: Date;
  fin: Date;
  porcentajePlaneado: string;
  porcentajeReal: string;
  /// Fecha del ULTIMO reporte de obra, o null si nadie ha reportado nunca.
  ultimoAvance: Date | null;
}

export interface EntradaPrediccion {
  tareas: readonly TareaPredecible[];
  dependencias: readonly { tareaUid: number; predecesoraUid: number }[];
  calendario: readonly DiaLaboral[];
  /// El dia contra el que se mide el estancamiento (la fecha de corte).
  hoy: Date;
  /// Fin de obra segun el cronograma, para proyectar el retraso del SPI.
  finObra: Date | null;
  spi: number | null;
  cpi: number | null;
  coberturaMapeo: number;
  /// Hay una version fijada como linea base. Sin ella el PV sale del % del
  /// archivo y la proyeccion del SPI es aproximada.
  conLineaBase: boolean;
  /**
   * Los codigos de partida que YA tienen un hito anclado.
   *
   * Se compara por ANCLA y no por uid porque un hito es una fila NUEVA con su
   * propio uid: comparar uids no encontraria nunca la coincidencia y la
   * pantalla volveria a proponer, cada vez, lo que ya se acepto.
   */
  anclasConHito: ReadonlySet<string>;
}

const iso = (f: Date) => f.toISOString().slice(0, 10);
const pct = (v: string) => Number(v) || 0;

/** Suma dias de calendario a una fecha, sin tocar la original. */
function sumarDias(f: Date, dias: number): Date {
  const d = new Date(f.getTime());
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

/**
 * Las tareas sobre las que tiene sentido predecir algo.
 *
 * Fuera los resumenes —no son trabajo, son envoltura—, los que ya son hito
 * —proponer un hito sobre un hito no significa nada— y los que ya estan al
 * 100%: de lo terminado no hay nada que anticipar.
 */
function candidatas(e: EntradaPrediccion): TareaPredecible[] {
  return e.tareas.filter(
    (t) =>
      !t.esResumen &&
      !t.esHito &&
      !(t.codigo !== null && e.anclasConHito.has(t.codigo)) &&
      pct(t.porcentajeReal) < 100,
  );
}

const nombrar = (t: TareaPredecible) =>
  `${t.codigo ? `${t.codigo} ` : ""}${t.nombre}`;

/**
 * 1. ESTANCAMIENTO: empezada, sin terminar y sin moverse.
 *
 * Se cuentan dias HABILES, no naturales: con naturales, un feriado largo
 * convierte una obra normal en abandono y la alarma se vuelve decorado.
 *
 * Solo mira tareas que YA empezaron —alguien reporto algo alguna vez—. Una
 * tarea que aun no arranca no esta estancada, esta por empezar, y de eso ya
 * avisa el plan.
 */
export function porEstancamiento(e: EntradaPrediccion): Propuesta[] {
  return candidatas(e)
    .filter((t) => t.ultimoAvance !== null && pct(t.porcentajeReal) > 0)
    .map((t) => {
      const dias = diasLaborablesEntre(t.ultimoAvance!, e.hoy, e.calendario);
      return { t, dias };
    })
    .filter(({ dias }) => dias >= DIAS_ESTANCADA)
    .map(({ t, dias }) => ({
      regla: "estancamiento" as const,
      uid: t.uid,
      anclaCodigo: t.codigo,
      titulo: `Revisar ${nombrar(t)}`,
      motivo:
        `Sin avance desde el ${iso(t.ultimoAvance!)} (${dias} dias habiles) ` +
        `y va por el ${pct(t.porcentajeReal).toFixed(0)}%.`,
      fechaSugerida: iso(e.hoy),
      severidad: t.esCritico ? ("urgente" as const) : ("avisar" as const),
    }));
}

/**
 * 2. HOLGURA AGOTADA: critica y por detras del plan.
 *
 * Solo sobre la ruta critica: en una tarea con holgura, ir por detras no se
 * come el plazo de la obra, y avisar de todas seria pedir que se ignoren.
 */
export function porHolgura(e: EntradaPrediccion): Propuesta[] {
  return candidatas(e)
    .filter((t) => t.esCritico)
    .map((t) => ({ t, atraso: pct(t.porcentajePlaneado) - pct(t.porcentajeReal) }))
    .filter(({ atraso }) => atraso > RETRASO_CRITICO)
    .map(({ t, atraso }) => ({
      regla: "holgura" as const,
      uid: t.uid,
      anclaCodigo: t.codigo,
      titulo: `Punto de control en ${nombrar(t)}`,
      motivo:
        `Va ${atraso.toFixed(0)} puntos por detras del plan ` +
        `(${pct(t.porcentajeReal).toFixed(0)}% real contra ` +
        `${pct(t.porcentajePlaneado).toFixed(0)}% previsto) y esta en la ruta ` +
        `critica: lo que pierda aqui lo pierde la obra.`,
      fechaSugerida: iso(t.fin),
      severidad: "urgente" as const,
    }));
}

/**
 * 3. SPI: el plazo, proyectado sobre el fin de obra.
 *
 * Un solo hito para toda la obra, no uno por tarea: el SPI es agregado y
 * repartirlo por filas seria inventar de donde sale el retraso.
 *
 * Sin linea base fijada el PV sale del % del archivo y la proyeccion es
 * aproximada. Se propone igual —el retraso es real— pero el motivo lo dice:
 * callar seria esconder el unico indicador de plazo que hay.
 */
export function porSpi(e: EntradaPrediccion): Propuesta[] {
  if (e.spi === null || e.spi >= 1 || !e.finObra) return [];

  const restantes = Math.max(
    0,
    Math.round((e.finObra.getTime() - e.hoy.getTime()) / 86_400_000),
  );
  // Si rindes al mismo ritmo, lo que queda tarda 1/SPI. La diferencia es el
  // corrimiento que se proyecta.
  const corrimiento = Math.round(restantes / e.spi - restantes);
  if (corrimiento <= 0) return [];

  const fin = sumarDias(e.finObra, corrimiento);
  const primera = candidatas(e).find((t) => t.esCritico) ?? candidatas(e)[0];
  if (!primera) return [];

  return [
    {
      regla: "spi",
      uid: primera.uid,
      anclaCodigo: primera.codigo,
      titulo: "Hito de revision de plazo",
      motivo:
        `Con un SPI de ${e.spi.toFixed(2)}, al ritmo de hoy la obra acabaria ` +
        `el ${iso(fin)}: ${corrimiento} dias despues de lo previsto.` +
        (e.conLineaBase
          ? ""
          : " Es APROXIMADO: no hay linea base fijada, asi que el plan se " +
            "compara contra el porcentaje del propio archivo."),
      fechaSugerida: iso(e.finObra),
      severidad: "urgente",
    },
  ];
}

/**
 * 4. CPI: el costo. CON COMPUERTA, y la compuerta es lo importante.
 *
 * Por debajo de `COBERTURA_MINIMA` el CPI no describe la obra sino el trocito
 * que esta mapeado, y un hito automatico sobre un CPI que miente es
 * exactamente la alarma que enseña a ignorar las alarmas. Se calla, y se dice
 * CON EL NUMERO cuanto falta.
 */
export function porCpi(e: EntradaPrediccion): Propuesta[] | SinDato {
  if (e.coberturaMapeo < COBERTURA_MINIMA) {
    return {
      regla: "cpi",
      falta:
        `El mapeo tarea-partida cubre el ${e.coberturaMapeo.toFixed(1)}% del ` +
        `presupuesto y hacen falta ${COBERTURA_MINIMA}%. Por debajo, el CPI ` +
        `describe solo la parte mapeada y proyectar un sobrecosto con el ` +
        `seria inventar. Se arregla enlazando tareas con partidas.`,
    };
  }

  if (e.cpi === null) {
    return {
      regla: "cpi",
      falta:
        "Todavia no hay costo real imputado con el que comparar lo ganado.",
    };
  }

  if (e.cpi >= 1) return [];

  const primera = candidatas(e)[0];
  if (!primera) return [];

  return [
    {
      regla: "cpi",
      uid: primera.uid,
      anclaCodigo: primera.codigo,
      titulo: "Hito de revision de costo",
      motivo:
        `Con un CPI de ${e.cpi.toFixed(2)}, por cada sol ganado se llevan ` +
        `gastados ${(1 / e.cpi).toFixed(2)}. Al ritmo de hoy el cierre acaba ` +
        `por encima del presupuesto.`,
      fechaSugerida: iso(e.hoy),
      severidad: "urgente",
    },
  ];
}

/**
 * 5. CONVERGENCIA: donde confluyen varias cadenas.
 *
 * Una tarea a la que llegan tres o mas predecesoras es un punto de
 * integracion: si una sola de las que entran se retrasa, arrastra a todas las
 * demas y el hito avisa antes de que ocurra.
 *
 * **Sin red de precedencias no se deduce nada.** Un cronograma venido de Excel
 * o generado desde el presupuesto no trae enlaces —por eso el importador pone
 * `esCritico: false` y no los inventa—, y contar flechas ahi diria mas del
 * archivo que de la obra.
 */
export function porConvergencia(e: EntradaPrediccion): Propuesta[] | SinDato {
  if (e.dependencias.length === 0) {
    return {
      regla: "convergencia",
      falta:
        "El cronograma vigente no trae ninguna dependencia. Un plan venido " +
        "de Excel o generado desde el presupuesto no lleva la red de " +
        "precedencias; hace falta importar el archivo de MS Project.",
    };
  }

  const entrantes = new Map<number, number>();
  for (const d of e.dependencias) {
    entrantes.set(d.tareaUid, (entrantes.get(d.tareaUid) ?? 0) + 1);
  }

  return candidatas(e)
    .map((t) => ({ t, cuantas: entrantes.get(t.uid) ?? 0 }))
    .filter(({ cuantas }) => cuantas >= CONVERGENCIA_MINIMA)
    .map(({ t, cuantas }) => ({
      regla: "convergencia" as const,
      uid: t.uid,
      anclaCodigo: t.codigo,
      titulo: `Hito de integracion: ${nombrar(t)}`,
      motivo:
        `Confluyen ${cuantas} tareas en esta. Si una sola se retrasa las ` +
        `arrastra a todas, asi que conviene mirarla antes de que empiece.`,
      fechaSugerida: iso(t.inicio),
      severidad: "avisar" as const,
    }));
}

/**
 * 6. SATURACION DE RECURSOS: no se puede, y se dice.
 *
 * Exige dotacion por cuadrilla y rendimiento por partida, y GCM no guarda
 * ninguno de los dos. Existe para que el hueco se VEA en la pantalla —es el
 * mismo dato que bloquea la fase B de capacidad—, no para fingir un calculo.
 */
export function porRecursos(): SinDato {
  return {
    regla: "recursos",
    falta:
      "GCM no guarda dotacion por cuadrilla ni rendimiento por partida, que " +
      "es lo que haria falta para sumar horas-hombre por semana. Es el mismo " +
      "dato que bloquea la capacidad en horas.",
  };
}

/** Todas las reglas, con lo que proponen y lo que no pueden decir. */
export function predecirHitos(e: EntradaPrediccion): Prediccion {
  const propuestas: Propuesta[] = [
    ...porEstancamiento(e),
    ...porHolgura(e),
    ...porSpi(e),
  ];
  const sinDato: SinDato[] = [porRecursos()];

  for (const r of [porCpi(e), porConvergencia(e)]) {
    if (Array.isArray(r)) propuestas.push(...r);
    else sinDato.push(r);
  }

  // Primero lo urgente, y dentro de eso por uid para que el orden no baile
  // entre dos cargas de la misma pantalla.
  const peso = (p: Propuesta) => (p.severidad === "urgente" ? 0 : 1);
  propuestas.sort((a, b) => peso(a) - peso(b) || a.uid - b.uid);

  return { propuestas, sinDato };
}
