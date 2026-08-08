import { restar } from "@/lib/decimal";

/**
 * Cruce entre el PLAN y el AVANCE.
 *
 * El reparto acordado es que MS Project manda sobre el plan y GCM sobre el
 * avance real. Aqui se juntan los dos lados, que viven en tablas distintas y
 * a proposito: `AvanceTarea` no tiene clave foranea a `TareaCronograma`
 * porque las versiones del cronograma se sustituyen y el avance tiene que
 * sobrevivirlas. El unico punto de union es el `<UID>` de Project.
 *
 * Es logica pura y se prueba sin base de datos, como `lib/ordenes.ts` frente
 * a `ordenes.service.ts`.
 *
 * NO se calcula aqui ningun porcentaje de la obra entera. Promediar los
 * porcentajes de las tareas haria que terminar una partida de 500 soles
 * pesara lo mismo que terminar una de 200.000, y esa cifra parece razonable
 * mientras miente. El avance del conjunto necesita el peso en dinero de
 * `MapeoTareaPartida`, que se confirma a mano.
 */

/** Lo minimo que hace falta de una tarea para medirla. */
export interface TareaMedible {
  uid: number;
  /// El "% Planeado" del archivo. Se leyo, no se calculo.
  porcentajePlaneado: string;
  /// El `<PercentComplete>` del archivo.
  porcentajeArchivo: string;
}

/** Un reporte de obra, tal como se guardo. */
export interface AvanceReportado {
  uid: number;
  porcentaje: string;
  fecha: Date;
  createdAt: Date;
  reportadoPor: string;
  nota: string | null;
}

export interface Medida {
  /// El que manda: lo reportado desde obra y, mientras nadie reporte nada, lo
  /// que trajo el archivo. Sembrar con el archivo evita que un cronograma
  /// recien importado se vea entero a cero teniendo Project el dato.
  porcentajeReal: string;
  /// Real menos planeado. Negativo es ir por detras del plan.
  ///
  /// Se calcula aqui porque el "% DESFASE" del archivo (`Number2`) esta roto:
  /// resta una escala 0..100 de otra 0..1 y da cifras sin sentido.
  desfase: string;
  /// Lo que reporto obra, si alguien lo reporto.
  avance: AvanceReportado | null;
  /// Project y obra no dicen lo mismo de esta tarea. No es un error: es la
  /// discrepancia que hoy se pierde al sobrescribir el porcentaje en Project.
  discrepa: boolean;
}

/**
 * El ultimo reporte de cada tarea.
 *
 * Cada reporte es una fila nueva y nunca un UPDATE —la curva S sale de la
 * serie historica—, asi que para pintar el estado de hoy hay que quedarse
 * con el mas reciente de cada una.
 *
 * Desempata `createdAt` cuando dos reportes comparten fecha: si el residente
 * corrige por la tarde lo que dijo por la manana, manda la correccion.
 */
export function ultimoAvancePorTarea(
  avances: readonly AvanceReportado[],
): Map<number, AvanceReportado> {
  const ultimos = new Map<number, AvanceReportado>();

  for (const avance of avances) {
    const previo = ultimos.get(avance.uid);
    if (!previo || esPosterior(avance, previo)) ultimos.set(avance.uid, avance);
  }

  return ultimos;
}

function esPosterior(a: AvanceReportado, b: AvanceReportado): boolean {
  const dia = a.fecha.getTime() - b.fecha.getTime();
  return dia !== 0 ? dia > 0 : a.createdAt.getTime() > b.createdAt.getTime();
}

/**
 * Pone a cada tarea su avance al lado y aparta los reportes huerfanos.
 *
 * Un reporte queda huerfano cuando la tarea desaparece del cronograma: el
 * planificador la borro en Project y la siguiente importacion ya no la trae.
 * Paso de verdad entre dos semanas —la partida 6.1 estaba al 100%—, asi que
 * el caso no es teorico. Se devuelven aparte para poder ensenarlos: borrar en
 * silencio trabajo que alguien reporto es justo lo que este modulo evita.
 */
export function medirAvance<T extends TareaMedible>(
  tareas: readonly T[],
  avances: readonly AvanceReportado[],
): { tareas: (T & Medida)[]; huerfanos: AvanceReportado[] } {
  const ultimos = ultimoAvancePorTarea(avances);
  const conTarea = new Set(tareas.map((t) => t.uid));

  const medidas = tareas.map((tarea) => {
    const avance = ultimos.get(tarea.uid) ?? null;
    const porcentajeReal = avance?.porcentaje ?? tarea.porcentajeArchivo;

    return {
      ...tarea,
      avance,
      porcentajeReal,
      // Si algun operando no fuera un decimal valido, `restar` devuelve null.
      // No puede pasar con valores que vienen de columnas Decimal, pero un
      // cero es mejor respuesta que romper la pantalla del cronograma.
      desfase: restar(porcentajeReal, tarea.porcentajePlaneado) ?? "0.00",
      // Se compara restando y no con `!==`. Las columnas Decimal vuelven de
      // la base sin los ceros finales ("55" y no "55.00"), asi que comparar
      // los textos daria por distintos dos porcentajes iguales en cuanto uno
      // de los dos lados llegue formateado de otra forma.
      discrepa: avance !== null && restar(avance.porcentaje, tarea.porcentajeArchivo) !== "0.00",
    };
  });

  return {
    tareas: medidas,
    huerfanos: [...ultimos.values()].filter((a) => !conTarea.has(a.uid)),
  };
}
