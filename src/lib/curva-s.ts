import { dividir, multiplicar, restar, sumar } from "@/lib/decimal";
import { ultimoAvancePorTarea, type AvanceReportado } from "@/lib/cronograma";

/**
 * La curva de avance: un punto por corte cargado.
 *
 * Dos decisiones gobiernan este archivo.
 *
 * PRIMERA: el avance del conjunto se PONDERA, nunca se promedia. Un promedio
 * de porcentajes hace que terminar una partida de un dia pese lo mismo que
 * terminar una de veinte, y la curva sale bonita mintiendo.
 *
 * SEGUNDA: se pondera por DURACION, y es una decision provisional que hay que
 * saber. Lo correcto es ponderar por dinero, pero eso necesita el mapeo
 * tarea-partida, que se confirma a mano. Mientras tanto la duracion es el
 * unico peso que el propio archivo trae —no lleva ni `<Cost>` ni `<Work>`— y
 * es ademas con lo que Project hace sus propios totales. Es una aproximacion
 * declarada, no un dato economico.
 *
 * Las dos lineas se calculan IGUAL. Que sean comparables entre si importa mas
 * que parecerse al total interno de Project, que usa su propio metodo.
 */

export interface TareaParaCurva {
  uid: number;
  /// Las tareas resumen se excluyen: su porcentaje ya es el de sus hijas y
  /// contarlas seria sumar dos veces el mismo trabajo.
  esResumen: boolean;
  duracionDias: string;
  porcentajePlaneado: string;
  porcentajeArchivo: string;
}

export interface CorteParaCurva {
  version: number;
  fechaCorte: Date;
  tareas: readonly TareaParaCurva[];
}

export interface PuntoCurva {
  version: number;
  fecha: Date;
  planeado: string;
  real: string;
  /// Real menos planeado. Negativo es ir por detras del plan.
  desfase: string;
}

/**
 * Media ponderada por duracion de un porcentaje, sobre las tareas hoja.
 *
 * Devuelve "0.00" si no hay ninguna tarea con duracion: un cronograma de
 * puros hitos no tiene avance ponderable, y ese caso debe dar cero y no
 * reventar la pantalla.
 */
export function ponderarPorDuracion(
  tareas: readonly TareaParaCurva[],
  porcentajeDe: (t: TareaParaCurva) => string,
): string {
  const hojas = tareas.filter((t) => !t.esResumen);

  const pesos = hojas.map((t) => t.duracionDias);
  const total = sumar(pesos, 4);
  if (total === "0.0000") return "0.00";

  // Se acumula en cuatro decimales y solo al final se redondea a dos: con dos
  // desde el principio, ciento y pico redondeos arrastran varias decimas.
  const aportes = hojas.map(
    (t) => multiplicar(t.duracionDias, porcentajeDe(t), 4) ?? "0",
  );

  return dividir(sumar(aportes, 4), total, 2) ?? "0.00";
}

/**
 * La serie completa, ordenada del corte mas antiguo al mas reciente.
 *
 * Para el avance real de cada corte se usa el reporte de obra VIGENTE EN ESA
 * FECHA, no el de hoy: la curva cuenta lo que se sabia entonces. Si en un
 * corte una tarea aun no tenia reporte, manda el porcentaje que traia el
 * archivo de ese mismo corte, que es lo que se sabia de ella.
 */
export function serieCurvaS(
  cortes: readonly CorteParaCurva[],
  avances: readonly AvanceReportado[],
): PuntoCurva[] {
  const ordenados = [...cortes].sort(
    (a, b) => a.fechaCorte.getTime() - b.fechaCorte.getTime(),
  );

  return ordenados.map((corte) => {
    const hasta = corte.fechaCorte.getTime();
    const vigentes = ultimoAvancePorTarea(
      avances.filter((a) => a.fecha.getTime() <= hasta),
    );

    const planeado = ponderarPorDuracion(corte.tareas, (t) => t.porcentajePlaneado);
    const real = ponderarPorDuracion(
      corte.tareas,
      (t) => vigentes.get(t.uid)?.porcentaje ?? t.porcentajeArchivo,
    );

    return {
      version: corte.version,
      fecha: corte.fechaCorte,
      planeado,
      real,
      // Con `restar` y no con `sumar([real, -planeado])`: esa forma se rompe
      // en cuanto el minuendo ya es negativo y devuelve el minuendo intacto.
      desfase: restar(real, planeado) ?? "0.00",
    };
  });
}
