/**
 * Dos indicadores del Last Planner que GCM ya podia calcular y no calculaba.
 * Logica pura, sin base de datos.
 *
 * No miden productividad: miden si el sistema de planificacion FUNCIONA.
 *
 *   SWI  — cuanto trabajo hay listo para ejecutar que nadie ha comprometido.
 *          Es el colchon: si mañana se cae una tarea, ¿hay con que sustituirla
 *          sin improvisar? Un SWI de cero significa que cualquier imprevisto
 *          para la obra, por bien que se planifique lo demas.
 *
 *   TA   — de las restricciones con fecha prometida, cuantas se liberaron a
 *          tiempo. El PPC mide si el equipo cumple lo que promete EJECUTAR;
 *          esta mide si cumple lo que promete LIBERAR, que es lo que hace
 *          posible lo primero.
 *
 * Las dos comparten una regla que aqui importa mas que la formula: **se cuenta
 * aparte lo que no se puede medir**. Una tasa del 100 % sobre tres casos de
 * cincuenta no es un 100 %, es una muestra sin valor, y el numero solo no lo
 * dice. Es la misma leccion que `sinAnalizar` en la confiabilidad.
 */

import type { FaseAnalisis } from "@/lib/lookahead";

// ---------------------------------------------------------------------------
// SWI — Inventario de Trabajo Ejecutable (Shielded Work Inventory)
// ---------------------------------------------------------------------------

export interface TareaParaInventario {
  uid: number;
  nombre: string;
  codigo: string | null;
  zona: string | null;
  /// En que punto del analisis esta. Solo LISTA cuenta como ejecutable.
  fase: FaseAnalisis;
  /// En cuantas semanas del PTS ya se comprometio. Vacio = disponible.
  comprometida: readonly unknown[];
}

export interface Inventario {
  /// Tareas LISTAS y sin comprometer: el colchon de verdad.
  disponibles: number;
  /// Tareas LISTAS en total, comprometidas o no.
  listas: number;
  /// Las de la ventana, listas o no. Sirve para leer las otras dos.
  total: number;
  /// 0..100: que parte de lo listo sigue libre. Null si no hay nada listo,
  /// porque un 0 % ahi se leeria como «todo comprometido» y es lo contrario.
  porcentajeLibre: number | null;
  /// Las disponibles, para poder ENSEÑARLAS. Un numero sin la lista obliga a
  /// buscarlas a mano en la matriz, y entonces nadie lo usa como plan B.
  tareas: TareaParaInventario[];
}

/**
 * El inventario de trabajo ejecutable.
 *
 * Solo cuenta lo que esta LISTO —sin restricciones pendientes— y ademas sin
 * comprometer. Una tarea lista pero ya prometida esta semana no es colchon:
 * ya tiene dueño y fecha.
 */
export function inventarioEjecutable(
  filas: readonly TareaParaInventario[],
): Inventario {
  const listas = filas.filter((f) => f.fase === "LISTA");
  const tareas = listas.filter((f) => f.comprometida.length === 0);

  return {
    disponibles: tareas.length,
    listas: listas.length,
    total: filas.length,
    porcentajeLibre:
      listas.length === 0
        ? null
        : Math.round((tareas.length / listas.length) * 100),
    tareas,
  };
}

// ---------------------------------------------------------------------------
// TA — Tasa de liberacion de restricciones a tiempo
// ---------------------------------------------------------------------------

export interface RestriccionMedible {
  /// Para cuando se prometio. Null = nunca se comprometio fecha, y entonces
  /// esta restriccion NO se puede medir: va al contador de `sinPromesa`.
  fechaCompromiso: Date | null;
  resuelta: boolean;
  /// Cuando se resolvio de verdad. Null si sigue abierta.
  resueltaAt: Date | null;
}

export type SuerteDeLaPromesa =
  | "a_tiempo"
  | "tarde"
  | "vencida"
  | "en_plazo"
  | "sin_promesa";

/**
 * Que paso con una promesa de liberacion.
 *
 * `en_plazo` es la unica que NO cuenta para la tasa, y merece explicacion: es
 * una restriccion abierta cuya fecha aun no ha llegado. Todavia no ha tenido
 * ocasion de fallar. Meterla en el denominador hundiria la tasa de cualquier
 * obra que planifique con antelacion —cuanto mejor mires hacia delante, peor
 * saldrias—, que es exactamente al reves de lo que el indicador debe premiar.
 */
export function suerteDeLaPromesa(
  r: RestriccionMedible,
  hoy: Date,
): SuerteDeLaPromesa {
  if (r.fechaCompromiso === null) return "sin_promesa";

  if (r.resuelta) {
    // Sin fecha de resolucion no se puede saber si llego a tiempo. Se cuenta
    // como tarde y no como a tiempo: ante la duda, el indicador no se regala.
    if (r.resueltaAt === null) return "tarde";
    return r.resueltaAt.getTime() <= r.fechaCompromiso.getTime()
      ? "a_tiempo"
      : "tarde";
  }

  return r.fechaCompromiso.getTime() < hoy.getTime() ? "vencida" : "en_plazo";
}

export interface TasaLiberacion {
  /// Liberadas en su fecha o antes.
  aTiempo: number;
  /// Liberadas, pero despues de lo prometido.
  tarde: number;
  /// Sin liberar y con la fecha ya pasada. Cuentan como incumplidas: esperar
  /// a que alguien las cierre para contarlas seria premiar el olvido.
  vencidas: number;
  /// Abiertas con la fecha por llegar. NO cuentan: ver `suerteDeLaPromesa`.
  enPlazo: number;
  /// Sin fecha prometida. No se pueden medir, y por eso se dicen aparte: una
  /// tasa buena sobre cuatro promesas de cincuenta restricciones no es buena,
  /// es que casi nadie promete.
  sinPromesa: number;
  /// aTiempo + tarde + vencidas. Lo que de verdad sostiene el porcentaje.
  medidas: number;
  /// 0..100. Null cuando no hay ni una promesa cumplida su plazo: sin casos
  /// no hay tasa, y un 0 % se leeria como «se incumple todo».
  porcentaje: number | null;
}

/**
 * Que parte de las promesas de liberacion se cumplio a tiempo.
 *
 * Es el complemento del PPC: el PPC mide si se cumple lo que se promete
 * EJECUTAR, y esta si se cumple lo que se promete LIBERAR. Un PPC bajo con una
 * TA baja no es un problema de la cuadrilla: es que el trabajo llega sin estar
 * listo, y se arregla en otro sitio.
 */
export function tasaDeLiberacion(
  restricciones: readonly RestriccionMedible[],
  hoy: Date,
): TasaLiberacion {
  const cuenta = { aTiempo: 0, tarde: 0, vencidas: 0, enPlazo: 0, sinPromesa: 0 };

  for (const r of restricciones) {
    switch (suerteDeLaPromesa(r, hoy)) {
      case "a_tiempo": cuenta.aTiempo++; break;
      case "tarde": cuenta.tarde++; break;
      case "vencida": cuenta.vencidas++; break;
      case "en_plazo": cuenta.enPlazo++; break;
      case "sin_promesa": cuenta.sinPromesa++; break;
    }
  }

  const medidas = cuenta.aTiempo + cuenta.tarde + cuenta.vencidas;

  return {
    ...cuenta,
    medidas,
    porcentaje: medidas === 0 ? null : Math.round((cuenta.aTiempo / medidas) * 100),
  };
}
