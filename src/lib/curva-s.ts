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
 * SEGUNDA: el PESO llega de fuera, no se decide aqui. Por defecto es la
 * DURACION —el unico peso que el propio archivo trae, porque no lleva ni
 * `<Cost>` ni `<Work>`, y con el que Project hace sus propios totales— y desde
 * el 23 de agosto de 2026 puede ser el IMPORTE de la partida mapeada, cuando
 * el mapeo cubre lo bastante del presupuesto (ver `lib/pesos-tarea`).
 *
 * Que el peso sea un parametro y no una constante es lo que hace posible la
 * regla que gobierna todo esto: el PLAN y el REAL se pesan IGUAL. Una curva
 * cuyas dos lineas se pesan distinto no se puede leer, porque lo unico que se
 * mira en ella es la distancia entre las dos.
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
 * Generica a proposito: recibe el peso, no lo decide. Desde el 23 de agosto de
 * 2026 hay DOS pesos —la duracion y el importe de la partida mapeada, ver
 * `lib/pesos-tarea`— y esta funcion sirve a los dos sin cambiar una linea.
 *
 * Era exactamente lo que este comentario anticipaba: no hizo falta escribir
 * una segunda cuenta que redondeara distinto y acabara dando dos cifras de
 * avance para la misma obra.
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
 * Las fechas de corte SEMANAL entre dos fechas: la primera ocurrencia de
 * `diaSemana` (ISO 1=lunes … 7=domingo) desde `desde`, y de ahi cada 7 dias
 * hasta `hasta` inclusive. Fechas de calendario (medianoche UTC), como el
 * resto del modulo. Vacio si `hasta` es anterior a `desde`.
 */
export function fechasSemanales(
  desde: Date,
  hasta: Date,
  diaSemana: number,
): Date[] {
  const fechas: Date[] = [];
  if (hasta.getTime() < desde.getTime()) return fechas;

  // getUTCDay da 0=domingo..6=sabado; se pasa a ISO 1=lunes..7=domingo.
  const iso = (f: Date) => (f.getUTCDay() === 0 ? 7 : f.getUTCDay());

  const salto = (diaSemana - iso(desde) + 7) % 7;

  for (let t = desde.getTime() + salto * DIA_MS; t <= hasta.getTime(); t += 7 * DIA_MS) {
    fechas.push(new Date(t));
  }
  return fechas;
}

/**
 * El % real ponderado en cada una de las fechas dadas.
 *
 * Para cada fecha se toma el reporte VIGENTE en ella —el ultimo con fecha
 * menor o igual— y se pondera por duracion, igual que `serieCurvaS` hace por
 * corte. Sirve para muestrear el avance en las fechas de corte semanal y
 * dibujar la curva real por semanas.
 */
export function serieRealPorFechas(
  tareas: readonly TareaParaCurva[],
  avances: readonly AvanceReportado[],
  fechas: readonly Date[],
  /// El MISMO peso con el que se dibuja el plan. Ver `planeadoEnFecha`: si las
  /// dos lineas de la curva no se pesan igual, la distancia entre ellas -que
  /// es lo unico que se mira en una curva S- no significa nada.
  pesoDe: (t: TareaParaCurva) => string = (t) => t.duracionDias,
): PuntoDiario[] {
  return fechas.map((fecha) => {
    const vigentes = ultimoAvancePorTarea(
      avances.filter((a) => a.fecha.getTime() <= fecha.getTime()),
    );
    const real = ponderar(
      tareas.filter((t) => !t.esResumen),
      pesoDe,
      (t) => vigentes.get(t.uid)?.porcentaje ?? t.porcentajeArchivo,
    );
    return { fecha, valor: Number(real) || 0 };
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

/**
 * % planeado acumulado en una fecha concreta.
 *
 * `pesoDe` decide con que cuenta cada tarea. Por defecto la DURACION, que es
 * como funciono siempre; con el mapeo tarea-partida suficiente se le pasa el
 * importe y la curva pasa a medir dinero planeado en vez de dias planeados.
 *
 * El peso llega de fuera y no se decide aqui porque el PLAN y el REAL tienen
 * que pesarse igual: un plan por duracion contra un real por dinero da una
 * desviacion que no significa nada, y separar esa decision de las dos cuentas
 * es lo unico que garantiza que no se puedan mezclar.
 */
export function planeadoEnFecha(
  tareas: readonly TareaPlanificada[],
  fecha: Date,
  pesoDe: (t: TareaPlanificada) => string = (t) => t.duracionDias,
): number {
  const hojas = tareas.filter((t) => !t.esResumen);

  let peso = 0;
  let avance = 0;

  for (const t of hojas) {
    const p = Number(pesoDe(t)) || 0;
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
  /// El mismo peso con el que se mide el real. Ver `planeadoEnFecha`.
  pesoDe?: (t: TareaPlanificada) => string,
): PuntoDiario[] {
  const dias = Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / DIA_MS));
  const paso = Math.max(1, Math.ceil(dias / 400));

  const puntos: PuntoDiario[] = [];

  for (let d = 0; d <= dias; d += paso) {
    const fecha = new Date(desde.getTime() + d * DIA_MS);
    puntos.push({ fecha, valor: planeadoEnFecha(tareas, fecha, pesoDe) });
  }

  // El ultimo dia siempre entra, aunque el paso no caiga justo en el.
  const ultimo = puntos[puntos.length - 1];
  if (!ultimo || ultimo.fecha.getTime() < hasta.getTime()) {
    puntos.push({ fecha: hasta, valor: planeadoEnFecha(tareas, hasta, pesoDe) });
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
 *
 * OJO CON EL FINAL. Multiplicar el plan por el factor responde "cuanto habre
 * hecho", no "cuando termino", y con un factor por debajo de 1 la curva NUNCA
 * alcanza el 100 —100 x 0,999 = 99,9—. Tal cual, un ritmo del 99,9% se leia
 * como "no se llega al 100% dentro del plazo", que es alarmante y falso: a ese
 * ritmo se termina un par de dias tarde. Por eso, cuando la curva se queda
 * corta, el termino se estima ESTIRANDO EL TIEMPO restante por 1/factor, que
 * es la misma hipotesis dicha al derecho: si rindes al 99,9% del plan, tardas
 * un 0,1% mas.
 */
export function proyectar(
  plan: readonly PuntoDiario[],
  corte: Date,
  realEnCorte: number,
): {
  puntos: PuntoDiario[];
  factor: number;
  terminoProyectado: Date | null;
  /**
   * Si el `factor` significa algo.
   *
   * Con plan 0 no hay division posible y `factor` vale 1 para poder seguir
   * proyectando, pero eso NO es «se rinde al 100% de lo previsto»: es que no
   * hay previsto contra el que comparar. Sin este aviso, el primer dia de una
   * obra con avance reportado se lee «ritmo 100%», que es una conclusion que
   * nadie midio —el mismo defecto que tenia la alerta del telefono SMS—.
   */
  ritmoMedible: boolean;
} {
  const enCorte =
    plan.find((p) => p.fecha.getTime() >= corte.getTime())?.valor ??
    plan[plan.length - 1]?.valor ??
    0;

  // Sin nada planeado todavia no hay ritmo que medir: se proyecta el plan tal
  // cual en vez de dividir por cero y disparar la curva al infinito.
  const ritmoMedible = enCorte > 0;
  const factor = ritmoMedible ? realEnCorte / enCorte : 1;

  const puntos: PuntoDiario[] = [];
  let terminoProyectado: Date | null = null;

  for (const p of plan) {
    if (p.fecha.getTime() < corte.getTime()) continue;

    const valor = Math.min(100, p.valor * factor);
    puntos.push({ fecha: p.fecha, valor });

    if (terminoProyectado === null && valor >= 99.995) terminoProyectado = p.fecha;
  }

  if (puntos.length > 0) puntos[0] = { fecha: corte, valor: realEnCorte };

  // La curva no llego al 100 dentro del plazo: se termina despues. Se estima
  // estirando lo que queda de plazo por 1/factor.
  //
  // Con factor 0 no se estima nada y queda null: no haber avanzado NADA si es
  // "a este paso no se llega", porque a ese paso no se llega nunca.
  if (terminoProyectado === null && factor > 0) {
    const finPlan = plan[plan.length - 1]?.fecha;
    if (finPlan && finPlan.getTime() > corte.getTime()) {
      const restante = finPlan.getTime() - corte.getTime();
      terminoProyectado = new Date(corte.getTime() + restante / factor);
    }
  }

  return { puntos, factor, terminoProyectado, ritmoMedible };
}

/**
 * El ritmo, en texto, para ensenarlo junto al termino proyectado.
 *
 * Cerca del 100 se ensena un decimal. Redondear 99,6 a "100%" y ponerlo al
 * lado de "termina tarde" es lo que hace dudar de la cifra: parecen dos datos
 * que se contradicen cuando en realidad el redondeo se comio la diferencia.
 * Lejos del 100 el decimal solo es ruido.
 */
export function textoRitmo(factor: number): string {
  const porcentaje = factor * 100;
  return porcentaje > 99 && porcentaje < 101
    ? porcentaje.toFixed(1)
    : porcentaje.toFixed(0);
}


// ---------------------------------------------------------------------------
// La banda entre el plan y el real
// ---------------------------------------------------------------------------

export interface PuntoBanda {
  fecha: Date;
  valor: number;
}

export interface BandaAvance {
  /**
   * El poligono cerrado, en orden de dibujo: el PLAN de izquierda a derecha y
   * el REAL de vuelta. Quien lo pinta solo tiene que aplicar sus escalas.
   */
  puntos: PuntoBanda[];
  /// true = el real va por DEBAJO del plan. Es lo que decide el color.
  atraso: boolean;
}

/**
 * El area entre la linea del plan y la del real, partida por donde se cruzan.
 *
 * POR QUE PARTIDA Y NO UNA SOLA. Una obra puede ir adelantada en marzo y
 * atrasada en junio, y una sola mancha de un solo color mentiria sobre la
 * mitad del recorrido. Cada tramo lleva su propio signo, asi que el rojo
 * significa siempre atraso y el verde siempre adelanto, sin excepciones que
 * haya que recordar.
 *
 * SOLO DONDE LAS DOS LINEAS EXISTEN. El real acaba en el ultimo corte medido y
 * el plan puede empezar antes o acabar despues; fuera de ese solape no hay
 * banda, porque no hay dos cosas que comparar. Extenderla hasta el final del
 * plan pintaria como «atraso» todo el trabajo que todavia no toca hacer.
 *
 * Las dos series se muestrean en la UNION de sus fechas -no en las de una
 * sola- porque si no, un tramo largo del plan sin puntos intermedios recortaria
 * los quiebres del real y la banda se separaria visiblemente de la linea que
 * dice bordear.
 */
export function bandasEntrePlanYReal(
  plan: readonly PuntoBanda[],
  real: readonly PuntoBanda[],
): BandaAvance[] {
  if (plan.length < 2 || real.length < 2) return [];

  const desde = Math.max(plan[0]!.fecha.getTime(), real[0]!.fecha.getTime());
  const hasta = Math.min(
    plan[plan.length - 1]!.fecha.getTime(),
    real[real.length - 1]!.fecha.getTime(),
  );
  if (hasta <= desde) return [];

  const fechas = [
    ...new Set(
      [...plan, ...real]
        .map((p) => p.fecha.getTime())
        .concat([desde, hasta])
        .filter((t) => t >= desde && t <= hasta),
    ),
  ].sort((a, b) => a - b);

  /// Cada muestra con su diferencia. `d > 0` = el real va por encima.
  const muestras = fechas.map((t) => {
    const p = valorInterpolado(plan, t);
    const r = valorInterpolado(real, t);
    return { t, plan: p, real: r, d: r - p };
  });

  /*
   * Donde las dos lineas se cruzan se mete una muestra EXTRA, con las dos en
   * el mismo valor. Sin ella el poligono del tramo que acaba y el del que
   * empieza se solaparian en forma de lazo, y el cruce -que es justo el
   * instante que interesa- saldria emborronado.
   */
  const conCruces: typeof muestras = [];
  for (let i = 0; i < muestras.length; i++) {
    const actual = muestras[i]!;
    conCruces.push(actual);

    const siguiente = muestras[i + 1];
    if (!siguiente) continue;
    if (actual.d === 0 || siguiente.d === 0) continue;
    if (actual.d > 0 === siguiente.d > 0) continue;

    // Interpolacion lineal de la DIFERENCIA: donde vale cero, se cruzan.
    const f = actual.d / (actual.d - siguiente.d);
    const t = actual.t + (siguiente.t - actual.t) * f;
    const valor = actual.plan + (siguiente.plan - actual.plan) * f;
    conCruces.push({ t, plan: valor, real: valor, d: 0 });
  }

  const bandas: BandaAvance[] = [];
  let tramo: typeof conCruces = [];

  const cerrar = () => {
    // Con menos de dos muestras no hay area: un poligono de dos puntos es una
    // raya, y dibujarla ensucia el grafico sin decir nada.
    if (tramo.length < 2) {
      tramo = [];
      return;
    }
    const atraso = tramo.some((m) => m.d < 0);
    // Solo el signo contrario no puede aparecer en el mismo tramo: si el tramo
    // es todo ceros -las dos lineas pegadas- no hay area que pintar.
    if (!atraso && !tramo.some((m) => m.d > 0)) {
      tramo = [];
      return;
    }
    bandas.push({
      puntos: [
        ...tramo.map((m) => ({ fecha: new Date(m.t), valor: m.plan })),
        ...[...tramo].reverse().map((m) => ({ fecha: new Date(m.t), valor: m.real })),
      ],
      atraso,
    });
    tramo = [];
  };

  for (const m of conCruces) {
    if (tramo.length === 0) {
      tramo.push(m);
      continue;
    }
    const signoTramo = tramo.find((x) => x.d !== 0)?.d ?? 0;
    if (signoTramo === 0 || m.d === 0 || m.d > 0 === signoTramo > 0) {
      tramo.push(m);
      continue;
    }
    // Cambia el signo: se cierra el tramo en el cruce -que es la ultima
    // muestra puesta- y el siguiente arranca en ese mismo punto, para que la
    // banda quede continua.
    const cruce = tramo[tramo.length - 1]!;
    cerrar();
    tramo = [cruce, m];
  }
  cerrar();

  return bandas;
}

/**
 * Valor de una serie en un instante cualquiera, interpolando entre los puntos
 * que lo rodean. Fuera del tramo cubierto devuelve el extremo mas cercano:
 * aqui solo se llama DENTRO del solape, asi que no llega a extrapolar.
 */
function valorInterpolado(puntos: readonly PuntoBanda[], t: number): number {
  const primero = puntos[0]!;
  const ultimo = puntos[puntos.length - 1]!;
  if (t <= primero.fecha.getTime()) return primero.valor;
  if (t >= ultimo.fecha.getTime()) return ultimo.valor;

  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1]!;
    const b = puntos[i]!;
    if (t > b.fecha.getTime()) continue;

    const tramo = b.fecha.getTime() - a.fecha.getTime();
    if (tramo <= 0) return b.valor;
    return a.valor + (b.valor - a.valor) * ((t - a.fecha.getTime()) / tramo);
  }

  return ultimo.valor;
}
