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

/**
 * Lo minimo para poder ponderar: si cuenta, y cuanto pesa.
 *
 * Se pide solo esto —y no una tarea entera— para que la misma ponderacion
 * sirva a la curva y al control por capitulos, que traen tareas distintas.
 */
export interface Ponderable {
  /// Las tareas resumen se excluyen: su porcentaje ya es el de sus hijas y
  /// contarlas seria sumar dos veces el mismo trabajo.
  esResumen: boolean;
  duracionDias: string;
}

export interface TareaParaCurva extends Ponderable {
  uid: number;
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
export function ponderarPorDuracion<T extends Ponderable>(
  tareas: readonly T[],
  porcentajeDe: (t: T) => string,
): string {
  return ponderar(
    tareas.filter((t) => !t.esResumen),
    (t) => t.duracionDias,
    porcentajeDe,
  );
}

/**
 * Media ponderada exacta con el peso que se le diga.
 *
 * El peso es la duracion mientras no haya mapeo tarea-partida, y el DINERO en
 * cuanto lo hay. La cuenta es la misma; lo unico que cambia es con que se
 * pesa, y por eso vive en un solo sitio: dos copias acabarian redondeando
 * distinto y dando dos cifras de avance para la misma obra.
 */
export function ponderar<T>(
  items: readonly T[],
  pesoDe: (t: T) => string,
  valorDe: (t: T) => string,
): string {
  const total = sumar(items.map(pesoDe), 4);
  if (total === "0.0000") return "0.00";

  // Se acumula en cuatro decimales y solo al final se redondea a dos: con dos
  // desde el principio, ciento y pico redondeos arrastran varias decimas.
  const aportes = items.map((t) => multiplicar(pesoDe(t), valorDe(t), 4) ?? "0");

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

/**
 * La curva planeada CONTINUA, dia a dia.
 *
 * Es lo que hace que una curva S sea una curva S. El "% Planeado" del archivo
 * solo existe en las fechas de corte —dos puntos, en CRIOCORD—, y con dos
 * puntos no hay curva que leer. Aqui el plan se reconstruye para todas las
 * fechas: cada tarea reparte su peso a lo largo de los dias que dura y se
 * acumula. De ahi sale la forma de S: arranque lento, tramo central rapido y
 * cierre lento, porque al principio y al final hay pocas tareas solapadas.
 *
 * El reparto DENTRO de cada tarea es lineal. Es la hipotesis estandar cuando
 * no hay curva de recursos, y este archivo no la trae: no lleva ni `<Cost>`
 * ni `<Work>`. Suponer otra cosa seria inventarsela.
 *
 * A diferencia del resto del modulo esto se calcula en coma flotante y no con
 * decimales exactos, a proposito: son coordenadas de un dibujo, no dinero. Las
 * cifras que se leen como texto siguen saliendo de `serieCurvaS`.
 */

export interface TareaPlanificada {
  uid: number;
  esResumen: boolean;
  duracionDias: string;
  inicio: Date;
  fin: Date;
}

export interface PuntoDiario {
  fecha: Date;
  /// 0..100
  valor: number;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Fraccion de una tarea ya transcurrida en una fecha: 0, 1 o lo de en medio. */
function fraccion(t: TareaPlanificada, fecha: number): number {
  const inicio = t.inicio.getTime();
  const fin = t.fin.getTime();

  if (fecha <= inicio) return 0;
  if (fecha >= fin) return 1;

  // Un hito o una tarea de un solo dia no tiene tramo intermedio.
  if (fin <= inicio) return 1;

  return (fecha - inicio) / (fin - inicio);
}

/** % planeado acumulado en una fecha concreta. */
export function planeadoEnFecha(
  tareas: readonly TareaPlanificada[],
  fecha: Date,
): number {
  const hojas = tareas.filter((t) => !t.esResumen);

  let peso = 0;
  let avance = 0;

  for (const t of hojas) {
    const p = Number(t.duracionDias) || 0;
    if (p <= 0) continue;
    peso += p;
    avance += p * fraccion(t, fecha.getTime());
  }

  return peso === 0 ? 0 : (avance / peso) * 100;
}

/**
 * La curva planeada entre dos fechas, un punto por dia.
 *
 * Se limita a 400 puntos: un plazo de mas de un ano se muestrea mas grueso en
 * vez de dibujar miles de puntos que el ojo no distingue y que engordan el
 * HTML sin anadir informacion.
 */
export function curvaPlaneada(
  tareas: readonly TareaPlanificada[],
  desde: Date,
  hasta: Date,
): PuntoDiario[] {
  const dias = Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / DIA_MS));
  const paso = Math.max(1, Math.ceil(dias / 400));

  const puntos: PuntoDiario[] = [];

  for (let d = 0; d <= dias; d += paso) {
    const fecha = new Date(desde.getTime() + d * DIA_MS);
    puntos.push({ fecha, valor: planeadoEnFecha(tareas, fecha) });
  }

  // El ultimo dia siempre entra, aunque el paso no caiga justo en el.
  const ultimo = puntos[puntos.length - 1];
  if (!ultimo || ultimo.fecha.getTime() < hasta.getTime()) {
    puntos.push({ fecha: hasta, valor: planeadoEnFecha(tareas, hasta) });
  }

  return puntos;
}

/**
 * Como acabaria la obra si se siguiera al ritmo actual.
 *
 * Se extrapola con el factor de rendimiento —lo real dividido entre lo
 * planeado a la fecha de corte—, que es el criterio habitual: si llevas el
 * 80% de lo que deberias, se supone que seguiras rindiendo al 80%. La
 * proyeccion arranca EXACTAMENTE en el ultimo punto real, para que no haya un
 * salto entre lo medido y lo estimado.
 *
 * Es una extrapolacion, no una promesa: vale mientras no cambien los medios.
 */
export function proyectar(
  plan: readonly PuntoDiario[],
  corte: Date,
  realEnCorte: number,
): { puntos: PuntoDiario[]; factor: number; terminoProyectado: Date | null } {
  const enCorte =
    plan.find((p) => p.fecha.getTime() >= corte.getTime())?.valor ??
    plan[plan.length - 1]?.valor ??
    0;

  // Sin nada planeado todavia no hay ritmo que medir: se proyecta el plan tal
  // cual en vez de dividir por cero y disparar la curva al infinito.
  const factor = enCorte > 0 ? realEnCorte / enCorte : 1;

  const puntos: PuntoDiario[] = [];
  let terminoProyectado: Date | null = null;

  for (const p of plan) {
    if (p.fecha.getTime() < corte.getTime()) continue;

    const valor = Math.min(100, p.valor * factor);
    puntos.push({ fecha: p.fecha, valor });

    if (terminoProyectado === null && valor >= 99.995) terminoProyectado = p.fecha;
  }

  if (puntos.length > 0) puntos[0] = { fecha: corte, valor: realEnCorte };

  return { puntos, factor, terminoProyectado };
}
