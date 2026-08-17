import { restar, sumar } from "@/lib/decimal";
import { ponderarPorDuracion } from "@/lib/curva-s";

/**
 * Leer el cronograma como se lee en obra: por capitulos, y sabiendo que va
 * mal.
 *
 * La tabla completa son ciento y pico filas. Sirve para trabajar, no para
 * decidir: nadie mira cien barras y saca una conclusion. Lo que se decide se
 * decide con dos cosas, y son las que hay aqui —como va cada capitulo, y que
 * partidas estan frenando la obra—.
 *
 * Es logica pura y se prueba sin base de datos.
 */

export interface TareaControlada {
  uid: number;
  /// Numero de fila del archivo. Manda el ORDEN, y de el sale la jerarquia.
  fila: number;
  codigo: string | null;
  nombre: string;
  nivel: number;
  esResumen: boolean;
  esHito: boolean;
  esCritico: boolean;
  duracionDias: string;
  inicio: Date;
  fin: Date;
  /**
   * Sus fechas no son un plan todavia. Opcional a proposito: quien no lo pase
   * —el lector de MS Project, que SIEMPRE trae fechas— se comporta como antes.
   */
  sinProgramar?: boolean;
  porcentajePlaneado: string;
  porcentajeReal: string;
  desfase: string;
}

export interface Capitulo {
  uid: number;
  codigo: string | null;
  nombre: string;
  planeado: string;
  real: string;
  desfase: string;
  /// Partidas de trabajo que cuelgan de el, sin contar subcapitulos.
  hojas: number;
  /**
   * Tiene trabajo con duracion que medir.
   *
   * Falso en los capitulos de puros hitos —el «0.0 HITOS CLAVE» del archivo
   * real, o el capitulo de gestion, cuyas partidas duran cero dias—. Ahi el
   * real ponderado sale 0 por construccion, y ensenarlo junto a un planeado
   * del 100% describe un atraso que no existe. Por eso el informe los deja
   * fuera, igual que hace el que ya se entrega al cliente.
   */
  medible: boolean;
  /// Cuantas de ellas van por detras del plan.
  atrasadas: number;
  criticas: number;
}

/**
 * Cada capitulo con las tareas que cuelgan de el, en el orden del documento.
 *
 * Los capitulos son el nivel de esquema inmediatamente por debajo del mas
 * alto: en el archivo real, la fila del proyecto esta en el nivel 1 y los
 * trece capitulos en el 2. No se identifican por el codigo —"0.0", "1.0"— ni
 * por ser tarea resumen: el codigo es una etiqueta y hay capitulos del archivo
 * que no estan marcados como resumen.
 *
 * Que tareas cuelgan de un capitulo sale del ORDEN del documento, que es como
 * funciona un esquema: son las que vienen despues hasta la primera que vuelve
 * a su nivel o mas arriba. Buscarlas por prefijo de codigo fallaria, porque
 * "7.3.1" es hermana de "7.3" y no su hija.
 *
 * Se extrajo para que `agruparPorCapitulo` y `capituloDeCadaTarea` compartan la
 * regla en vez de copiarla: son la misma pregunta —«¿que cuelga de que?»— y dos
 * copias acabarian agrupando distinto sin que nada fallara.
 */
function recorrerCapitulos(
  tareas: readonly TareaControlada[],
): { cabecera: TareaControlada; descendientes: TareaControlada[] }[] {
  if (tareas.length === 0) return [];

  const orden = [...tareas].sort((a, b) => a.fila - b.fila);
  const nivelRaiz = Math.min(...orden.map((t) => t.nivel));
  const nivelCapitulo = nivelRaiz + 1;

  const salida: { cabecera: TareaControlada; descendientes: TareaControlada[] }[] =
    [];

  for (let i = 0; i < orden.length; i++) {
    const cabecera = orden[i]!;
    if (cabecera.nivel !== nivelCapitulo) continue;

    const descendientes: TareaControlada[] = [];
    for (let j = i + 1; j < orden.length && orden[j]!.nivel > nivelCapitulo; j++) {
      descendientes.push(orden[j]!);
    }
    salida.push({ cabecera, descendientes });
  }

  return salida;
}

/** Agrupa las tareas por capitulo y pondera cada uno por duracion. */
export function agruparPorCapitulo(
  tareas: readonly TareaControlada[],
): Capitulo[] {
  const capitulos: Capitulo[] = [];

  for (const { cabecera, descendientes } of recorrerCapitulos(tareas)) {
    // Un capitulo sin descendientes es el mismo una partida de trabajo: se
    // mide con sus propias cifras en vez de quedarse a cero.
    const medibles = descendientes.length > 0 ? descendientes : [cabecera];
    const hojas = medibles.filter((t) => !t.esResumen);

    /**
     * El PLANEADO del capitulo SE LEE de su propia fila; el REAL se calcula.
     *
     * No es una asimetria caprichosa, es el reparto que gobierna el modulo.
     * El plan lo manda MS Project, y el archivo ya trae el «% Planeado»
     * consolidado de cada capitulo: calcularlo por nuestra cuenta daba otra
     * cifra —67,82% donde el informe del cliente dice 64%— y descuadraba el
     * documento que ya se entrega.
     *
     * El real, en cambio, lo manda GCM: sale de las partidas hijas, cuyo
     * porcentaje es el reportado desde obra cuando lo hay. Leerlo del archivo
     * congelaria el avance en lo que dijera el ultimo export de Project.
     */
    const planeado = cabecera.porcentajePlaneado;
    const real = ponderarPorDuracion(medibles, (t) => t.porcentajeReal);

    capitulos.push({
      uid: cabecera.uid,
      codigo: cabecera.codigo,
      nombre: cabecera.nombre,
      planeado,
      real,
      desfase: restar(real, planeado) ?? "0.00",
      hojas: hojas.length,
      medible: hojas.some((t) => Number(t.duracionDias) > 0),
      atrasadas: hojas.filter((t) => Number(t.desfase) < 0).length,
      criticas: hojas.filter((t) => t.esCritico).length,
    });
  }

  return capitulos;
}

/**
 * De que capitulo cuelga cada tarea: uid de la tarea -> uid del capitulo.
 *
 * Usa el MISMO recorrido que `agruparPorCapitulo` —`recorrerCapitulos`— y no
 * una copia: si la regla de "que cuelga de que" divergiera, el parte diario
 * agruparia de una forma y el informe de otra, y no habria manera de saber
 * cual de las dos miente.
 *
 * La cabecera del capitulo tambien se apunta a si misma: un capitulo sin
 * descendientes es el mismo una partida de trabajo, igual que en
 * `agruparPorCapitulo`.
 */
export function capituloDeCadaTarea(
  tareas: readonly TareaControlada[],
): Map<number, number> {
  const mapa = new Map<number, number>();
  for (const { cabecera, descendientes } of recorrerCapitulos(tareas)) {
    mapa.set(cabecera.uid, cabecera.uid);
    for (const d of descendientes) mapa.set(d.uid, cabecera.uid);
  }
  return mapa;
}

/**
 * Los capitulos que el informe ensena, de los que salen de `agruparPorCapitulo`.
 *
 * Fuera quedan dos clases que ensucian el documento sin decir nada:
 *
 * - Los que no tienen trabajo MEDIBLE —los de puros hitos, cuyas partidas
 *   duran cero dias—. Su real ponderado sale 0 por construccion, y junto a un
 *   planeado del 100% describen un atraso que no existe.
 * - Los que estan enteros a cero, ni planeados ni empezados a la fecha del
 *   corte. Son capitulos de mas adelante y empujan fuera de la pagina a los
 *   que si estan en marcha.
 *
 * Vive aqui y no en la pantalla porque el informe se emite ya de dos maneras
 * —en papel y en hoja de calculo— y las dos tienen que listar exactamente los
 * mismos capitulos. Con la regla escrita dos veces, el dia que alguien afine
 * una el archivo y el papel empiezan a no cuadrar, y averiguar cual de los dos
 * miente cuesta mas que este comentario.
 */
export function capitulosDelInforme(
  capitulos: readonly Capitulo[],
): Capitulo[] {
  return capitulos.filter(
    (c) => c.medible && (Number(c.real) > 0 || Number(c.planeado) > 0),
  );
}

export type Severidad = "alta" | "media" | "baja";

export interface AlertaAtraso {
  uid: number;
  codigo: string | null;
  nombre: string;
  planeado: string;
  real: string;
  desfase: string;
  /// Dias de trabajo que faltan para ponerse al dia con el plan.
  diasAtraso: string;
  /// Cuanto queda por ejecutar de la tarea, en puntos.
  pendiente: string;
  severidad: Severidad;
  esCritico: boolean;
  /// Su fecha de fin ya paso y no esta terminada.
  vencida: boolean;
  /// Por que sube de nivel esta alerta. Vacio en las leves.
  motivo: string | null;
}

/**
 * Cuanto tiene que faltarle a una tarea vencida para tratarla como urgente.
 *
 * Sin este umbral, una partida al 95% cuya fecha acaba de pasar pesaba lo
 * mismo que una al 30%, y la lista ponia arriba lo que estaba practicamente
 * hecho. Que falte un 5% de una tarea es un remate; que falte la mitad es un
 * problema.
 */
const PENDIENTE_URGENTE = 10;

const ORDEN_SEVERIDAD: Record<Severidad, number> = { alta: 0, media: 1, baja: 2 };

/**
 * Las partidas que van por detras del plan, ordenadas por lo que importan.
 *
 * Solo se miran las HOJAS. Un capitulo atrasado no es una alerta aparte: lo
 * esta porque lo estan sus partidas, y listarlo ademas duplicaria el aviso y
 * le quitaria credibilidad al listado.
 *
 * La severidad no sale solo del tamano del desfase:
 * - ALTA si esta en la ruta critica y atrasada —empuja la fecha de termino de
 *   TODA la obra, aunque sea por cinco puntos—, o si su fecha ya paso y le
 *   queda trabajo de verdad por hacer.
 * - MEDIA si vencida con poco pendiente, o desde veinte puntos de desfase.
 * - BAJA el resto.
 *
 * El umbral de lo que queda por hacer es lo que evita el error de la primera
 * version: una partida al 95% con la fecha recien pasada salia igual de grave
 * que una al 30%, y la lista ponia arriba lo que ya estaba practicamente
 * hecho.
 *
 * Dentro de cada nivel se ordena por DIAS y no por porcentaje. Un 50% de una
 * partida de dos dias es un dia de trabajo; un 10% de una de veinte, dos dias.
 * Ordenar por porcentaje pondria primero la que menos trabajo cuesta.
 */
export function alertasDeAtraso(
  tareas: readonly TareaControlada[],
  fechaCorte: Date,
): AlertaAtraso[] {
  const alertas: AlertaAtraso[] = [];

  for (const t of tareas) {
    if (t.esResumen) continue;
    /**
     * Una tarea sin programar no puede estar atrasada.
     *
     * Sus fechas no son un plan: son el relleno que exige la columna, porque
     * la EDT sale del presupuesto y el presupuesto no trae fechas. Sin esta
     * linea, generar la EDT de una obra ya empezada publicaba de golpe una
     * alerta roja por cada partida —y el titular del tablero senalaba como
     * cuello de botella algo que nadie habia programado todavia—.
     */
    if (t.sinProgramar) continue;

    const desfase = Number(t.desfase);
    const real = Number(t.porcentajeReal) || 0;
    const terminada = real >= 100;
    const vencida = !terminada && t.fin.getTime() < fechaCorte.getTime();

    if (desfase >= 0 && !vencida) continue;

    // Lo que le falta a la tarea para estar terminada, que no es lo mismo que
    // su desfase: una partida al 95% cuya fecha paso va solo 5 puntos por
    // detras, pero lo que queda de ella es tambien un 5%.
    const pendiente = Math.max(0, 100 - real);

    const criticaAtrasada = t.esCritico && desfase < 0;
    const vencidaConTrabajo = vencida && pendiente >= PENDIENTE_URGENTE;

    const severidad: Severidad =
      criticaAtrasada || vencidaConTrabajo
        ? "alta"
        : vencida || desfase <= -20
          ? "media"
          : "baja";

    const motivo = criticaAtrasada
      ? "En la ruta critica: su atraso corre la fecha de fin de toda la obra"
      : vencidaConTrabajo
        ? `Su fecha ya paso y le queda un ${pendiente.toFixed(0)}% por ejecutar`
        : vencida
          ? "Su fecha ya paso, aunque esta casi terminada"
          : desfase <= -20
            ? "Va muy por detras de lo previsto"
            : null;

    // El atraso traducido a dias de la propia tarea. Es la forma de comparar
    // un 10% de una partida de veinte dias con un 40% de una de dos: en dias,
    // la primera pesa mas del doble.
    const dias = ((Number(t.duracionDias) || 0) * Math.max(0, -desfase)) / 100;

    alertas.push({
      uid: t.uid,
      codigo: t.codigo,
      nombre: t.nombre,
      planeado: t.porcentajePlaneado,
      real: t.porcentajeReal,
      desfase: t.desfase,
      diasAtraso: dias.toFixed(1),
      pendiente: pendiente.toFixed(0),
      severidad,
      esCritico: t.esCritico,
      vencida,
      motivo,
    });
  }

  return alertas.sort(
    (a, b) =>
      ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad] ||
      Number(b.diasAtraso) - Number(a.diasAtraso),
  );
}

export interface EslabonCritico {
  uid: number;
  codigo: string | null;
  nombre: string;
  /// Capitulo del que cuelga, para ver donde se concentra la cadena.
  capitulo: string | null;
  inicio: Date;
  fin: Date;
  duracionDias: string;
  porcentajePlaneado: string;
  porcentajeReal: string;
  desfase: string;
  /// Dias de la fecha de fin que esta costando YA este eslabon.
  diasAtraso: string;
  /// Duracion acumulada de la cadena hasta aqui, incluido.
  acumuladoDias: string;
  terminado: boolean;
  /// Ya deberia haber empezado a la fecha de corte.
  arrancado: boolean;
}

export interface CadenaCritica {
  eslabones: EslabonCritico[];
  /// Suma de las duraciones de la cadena.
  duracionTotal: string;
  /// Suma de lo que ya cuesta el atraso de sus eslabones.
  atrasoAcumulado: string;
  /// Cuantos eslabones van por detras del plan.
  atrasados: number;
  /// Donde se concentra, del capitulo con mas eslabones al que menos.
  concentracion: { capitulo: string; tareas: number }[];
}

/**
 * La ruta critica en secuencia, que es lo unico que la hace accionable.
 *
 * Saber que hay «25 tareas criticas» no permite decidir nada. Saber CUALES,
 * en que orden y cuales ya van tarde, si: un dia perdido en cualquiera de
 * ellas es un dia perdido de obra, y en las demas no es nada.
 *
 * Se dejan fuera los RESUMENES y los HITOS. Project marca como criticos los
 * capitulos que contienen cadena critica y los hitos de cierre, pero ninguno
 * de los dos es trabajo sobre el que se pueda actuar: meter cuadrilla en un
 * capitulo no significa nada. De las 26 filas criticas del cronograma real,
 * solo 15 son trabajo.
 *
 * El orden es por fecha de comienzo. La ruta critica puede tener ramas
 * paralelas, asi que no siempre es una fila india; ordenar por fecha es lo que
 * refleja el orden en que hay que atenderlas.
 */
export function cadenaCritica(
  tareas: readonly TareaControlada[],
  fechaCorte: Date,
): CadenaCritica {
  const orden = [...tareas].sort((a, b) => a.fila - b.fila);
  const nivelRaiz = orden.length > 0 ? Math.min(...orden.map((t) => t.nivel)) : 1;
  const nivelCapitulo = nivelRaiz + 1;

  // Capitulo vigente segun se recorre el documento: el esquema es un orden, no
  // un prefijo de codigo.
  const capitulos = new Map<number, string>();
  let actual: string | null = null;

  for (const t of orden) {
    if (t.nivel === nivelCapitulo) {
      actual = `${t.codigo ? `${t.codigo} ` : ""}${t.nombre}`;
    } else if (t.nivel > nivelCapitulo && actual !== null) {
      capitulos.set(t.uid, actual);
    }
  }

  const criticas = orden
    .filter((t) => t.esCritico && !t.esResumen && !t.esHito)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime() || a.fila - b.fila);

  const eslabones: EslabonCritico[] = [];
  const duraciones: string[] = [];
  const atrasos: string[] = [];

  for (const t of criticas) {
    duraciones.push(t.duracionDias);

    const desfase = Number(t.desfase) || 0;
    const dias = ((Number(t.duracionDias) || 0) * Math.max(0, -desfase)) / 100;
    atrasos.push(dias.toFixed(2));

    eslabones.push({
      uid: t.uid,
      codigo: t.codigo,
      nombre: t.nombre,
      capitulo: capitulos.get(t.uid) ?? null,
      inicio: t.inicio,
      fin: t.fin,
      duracionDias: t.duracionDias,
      porcentajePlaneado: t.porcentajePlaneado,
      porcentajeReal: t.porcentajeReal,
      desfase: t.desfase,
      diasAtraso: dias.toFixed(1),
      acumuladoDias: sumar(duraciones, 2),
      terminado: Number(t.porcentajeReal) >= 100,
      arrancado: t.inicio.getTime() <= fechaCorte.getTime(),
    });
  }

  const cuenta = new Map<string, number>();
  for (const e of eslabones) {
    const c = e.capitulo ?? "Sin capitulo";
    cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  }

  return {
    eslabones,
    duracionTotal: sumar(duraciones, 2),
    atrasoAcumulado: sumar(atrasos, 1),
    atrasados: eslabones.filter((e) => Number(e.desfase) < 0).length,
    concentracion: [...cuenta.entries()]
      .map(([capitulo, tareas]) => ({ capitulo, tareas }))
      .sort((a, b) => b.tareas - a.tareas),
  };
}

export interface PartidaActiva {
  uid: number;
  codigo: string | null;
  nombre: string;
  fila: number;
  inicio: Date;
  fin: Date;
  porcentajePlaneado: string;
  porcentajeReal: string;
  desfase: string;
  esCritico: boolean;
}

/**
 * Las partidas vivas en la semana del corte.
 *
 * Es el bloque «partidas activas destacadas» del informe: lo que se esta
 * ejecutando ahora mismo o arranca en los proximos dias. Sin este recorte, el
 * informe listaria las ciento y pico tareas del cronograma, la mayoria de
 * ellas ni empezadas ni previstas para semanas.
 *
 * Entra una tarea si su ventana toca la semana y no esta terminada. Las
 * terminadas se quedan fuera aunque caigan dentro: en un informe semanal lo
 * que interesa es lo que queda por hacer, y una lista con lo ya cerrado
 * diluye lo que hay que mirar.
 *
 * Se ordenan por desfase: primero las que van peor, que es el orden en que se
 * leen en una reunion de obra.
 */
export function partidasActivas(
  tareas: readonly TareaControlada[],
  fechaCorte: Date,
  diasVista = 7,
): PartidaActiva[] {
  const desde = fechaCorte.getTime();
  const hasta = desde + diasVista * 86400000;

  return tareas
    .filter((t) => {
      if (t.esResumen || t.esHito) return false;
      if (Number(t.porcentajeReal) >= 100) return false;

      // Su ventana se solapa con la semana: o empezo antes y sigue viva, o
      // arranca dentro de los proximos dias.
      return t.fin.getTime() >= desde && t.inicio.getTime() <= hasta;
    })
    .map((t) => ({
      uid: t.uid,
      codigo: t.codigo,
      nombre: t.nombre,
      fila: t.fila,
      inicio: t.inicio,
      fin: t.fin,
      porcentajePlaneado: t.porcentajePlaneado,
      porcentajeReal: t.porcentajeReal,
      desfase: t.desfase,
      esCritico: t.esCritico,
    }))
    .sort(
      (a, b) => Number(a.desfase) - Number(b.desfase) || a.fila - b.fila,
    );
}
