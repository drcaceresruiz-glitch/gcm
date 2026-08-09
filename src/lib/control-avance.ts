import { restar } from "@/lib/decimal";
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
  esCritico: boolean;
  duracionDias: string;
  fin: Date;
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
  /// Cuantas de ellas van por detras del plan.
  atrasadas: number;
  criticas: number;
}

/**
 * Agrupa las tareas por capitulo y pondera cada uno por duracion.
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
 */
export function agruparPorCapitulo(
  tareas: readonly TareaControlada[],
): Capitulo[] {
  if (tareas.length === 0) return [];

  const orden = [...tareas].sort((a, b) => a.fila - b.fila);
  const nivelRaiz = Math.min(...orden.map((t) => t.nivel));
  const nivelCapitulo = nivelRaiz + 1;

  const capitulos: Capitulo[] = [];

  for (let i = 0; i < orden.length; i++) {
    const cabecera = orden[i]!;
    if (cabecera.nivel !== nivelCapitulo) continue;

    const descendientes: TareaControlada[] = [];
    for (let j = i + 1; j < orden.length && orden[j]!.nivel > nivelCapitulo; j++) {
      descendientes.push(orden[j]!);
    }

    // Un capitulo sin descendientes es el mismo una partida de trabajo: se
    // mide con sus propias cifras en vez de quedarse a cero.
    const medibles = descendientes.length > 0 ? descendientes : [cabecera];
    const hojas = medibles.filter((t) => !t.esResumen);

    const planeado = ponderarPorDuracion(medibles, (t) => t.porcentajePlaneado);
    const real = ponderarPorDuracion(medibles, (t) => t.porcentajeReal);

    capitulos.push({
      uid: cabecera.uid,
      codigo: cabecera.codigo,
      nombre: cabecera.nombre,
      planeado,
      real,
      desfase: restar(real, planeado) ?? "0.00",
      hojas: hojas.length,
      atrasadas: hojas.filter((t) => Number(t.desfase) < 0).length,
      criticas: hojas.filter((t) => t.esCritico).length,
    });
  }

  return capitulos;
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
