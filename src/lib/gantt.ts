/**
 * Geometria del diagrama de Gantt. Logica pura, sin React ni SVG: solo
 * numeros. De pintar se encarga el componente; de que las barras caigan donde
 * deben, esto —y se prueba sin navegador—.
 *
 * El eje X esta en DIAS desde el inicio de la obra, no en pixeles: asi el
 * calculo no depende del ancho de la pantalla y el SVG estira lo que haga
 * falta. Un dia = una unidad; la barra de una tarea de cinco dias mide cinco.
 */

export interface TareaGantt {
  uid: number;
  fila: number;
  codigo: string | null;
  nombre: string;
  nivel: number;
  esResumen: boolean;
  esHito: boolean;
  esCritico: boolean;
  inicio: Date;
  fin: Date;
  duracionDias: string;
  porcentajePlaneado: string;
  porcentajeReal: string;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias de calendario entre dos fechas, por sus componentes UTC. */
function dias(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
  const b = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate());
  return Math.round((b - a) / DIA_MS);
}

export interface RangoGantt {
  inicio: Date;
  fin: Date;
  /// Dias totales del eje, al menos 1.
  totalDias: number;
}

/**
 * El rango que cubre el eje: de la tarea que antes empieza a la que mas tarde
 * acaba. Se miran solo las tareas con duracion —los resumenes ya quedan
 * dentro de sus hijas y los hitos son un instante—, pero si no hubiera
 * ninguna se cae a las fechas de todas para no devolver un rango vacio.
 */
export function rangoGantt(tareas: readonly TareaGantt[]): RangoGantt | null {
  if (tareas.length === 0) return null;

  const base = tareas.filter((t) => !t.esResumen);
  const fuente = base.length > 0 ? base : tareas;

  let inicio = fuente[0]!.inicio;
  let fin = fuente[0]!.fin;
  for (const t of fuente) {
    if (t.inicio < inicio) inicio = t.inicio;
    if (t.fin > fin) fin = t.fin;
  }

  return { inicio, fin, totalDias: Math.max(1, dias(inicio, fin)) };
}

export interface Barra {
  /// Dias desde el inicio del eje hasta el comienzo de la tarea.
  x: number;
  /// Ancho en dias. Al menos 1, para que una tarea de un dia se vea.
  ancho: number;
  /// Donde cae el corte del %real dentro de la barra, en dias (0..ancho).
  relleno: number;
}

/**
 * La geometria de la barra de una tarea sobre el eje.
 *
 * El relleno es la fraccion ejecutada de la propia barra: una tarea al 40 %
 * pinta llenos los primeros dos quintos. No es donde deberia ir segun el
 * plan —eso lo dice la posicion de la barra en el tiempo—, es cuanto de ELLA
 * esta hecho.
 */
export function geometriaBarra(
  tarea: TareaGantt,
  rango: RangoGantt,
): Barra {
  const x = dias(rango.inicio, tarea.inicio);
  const ancho = Math.max(1, dias(tarea.inicio, tarea.fin));
  const real = Math.min(100, Math.max(0, Number(tarea.porcentajeReal) || 0));

  return { x, ancho, relleno: (ancho * real) / 100 };
}

/** Posicion en dias de una fecha sobre el eje (0 = inicio, negativo antes). */
export function posicionDia(fecha: Date, rango: RangoGantt): number {
  return dias(rango.inicio, fecha);
}

export interface MarcaCalendario {
  /// Dias desde el inicio del eje.
  x: number;
  etiqueta: string;
  /// Primero de mes: la marca lleva mas peso visual.
  inicioDeMes: boolean;
}

const MES_CORTO = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/**
 * Las marcas del eje temporal, con el paso adecuado al plazo.
 *
 * Un plazo corto se marca por semanas —cada lunes— y uno largo por meses: mil
 * rayitas en un Gantt de dos años no dicen mas que doce, solo emborronan. El
 * umbral es noventa dias, mas o menos un trimestre.
 */
export function marcasCalendario(rango: RangoGantt): MarcaCalendario[] {
  const marcas: MarcaCalendario[] = [];
  const porMeses = rango.totalDias > 90;

  const inicio = new Date(
    Date.UTC(
      rango.inicio.getUTCFullYear(),
      rango.inicio.getUTCMonth(),
      rango.inicio.getUTCDate(),
    ),
  );

  if (porMeses) {
    // Un tick el primero de cada mes dentro del rango.
    const cursor = new Date(
      Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1),
    );
    // Si el rango no arranca en dia 1, el primer mes se salta hasta el
    // siguiente para no pintar una marca fuera del eje.
    if (cursor < inicio) cursor.setUTCMonth(cursor.getUTCMonth() + 1);

    while (dias(rango.inicio, cursor) <= rango.totalDias) {
      marcas.push({
        x: dias(rango.inicio, cursor),
        etiqueta: `${MES_CORTO[cursor.getUTCMonth()]} ${String(cursor.getUTCFullYear()).slice(2)}`,
        inicioDeMes: true,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else {
    // Un tick cada lunes. Se busca el primer lunes en el rango o antes.
    const cursor = new Date(inicio);
    const diaSemana = cursor.getUTCDay(); // 0 domingo .. 1 lunes
    const aLunes = (diaSemana + 6) % 7; // dias para retroceder al lunes
    cursor.setUTCDate(cursor.getUTCDate() - aLunes);

    while (dias(rango.inicio, cursor) <= rango.totalDias) {
      const x = dias(rango.inicio, cursor);
      if (x >= 0) {
        marcas.push({
          x,
          etiqueta: `${String(cursor.getUTCDate()).padStart(2, "0")}/${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`,
          inicioDeMes: cursor.getUTCDate() <= 7,
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  return marcas;
}

/**
 * Que filas se ven, contraidos algunos resumenes.
 *
 * Contraer un resumen esconde TODO lo que cuelga de el —sus hijas y las hijas
 * de sus hijas—, no solo el primer nivel: en un esquema, plegar un capitulo es
 * plegar el capitulo entero. Se sabe que algo cuelga de un resumen contraido
 * porque su nivel es mayor y aun no ha aparecido otra fila de nivel igual o
 * menor que cierre la rama.
 *
 * El orden es el del documento (`fila`), que es lo que hace legible un Gantt:
 * las tareas caen en el mismo orden que en Project.
 */
export function filasVisibles(
  tareas: readonly TareaGantt[],
  colapsados: ReadonlySet<number>,
): TareaGantt[] {
  const orden = [...tareas].sort((a, b) => a.fila - b.fila);
  const visibles: TareaGantt[] = [];

  // Nivel por debajo del cual todo esta oculto; null si no ocultamos nada.
  let ocultarDesde: number | null = null;

  for (const t of orden) {
    if (ocultarDesde !== null) {
      // Seguimos ocultos mientras estemos MAS abajo que el resumen contraido.
      if (t.nivel > ocultarDesde) continue;
      // Volvimos al nivel del resumen o mas arriba: se acaba el ocultamiento.
      ocultarDesde = null;
    }

    visibles.push(t);

    if (colapsados.has(t.uid) && t.esResumen) {
      ocultarDesde = t.nivel;
    }
  }

  return visibles;
}

/**
 * Los uid de los resumenes que TIENEN algo debajo, para saber cuales llevan
 * triangulo de plegado. Un resumen sin hijas —raro, pero pasa— no se pliega.
 */
export function resumenesPlegables(
  tareas: readonly TareaGantt[],
): Set<number> {
  const orden = [...tareas].sort((a, b) => a.fila - b.fila);
  const plegables = new Set<number>();

  for (let i = 0; i < orden.length; i++) {
    const t = orden[i]!;
    if (!t.esResumen) continue;
    const siguiente = orden[i + 1];
    if (siguiente && siguiente.nivel > t.nivel) plegables.add(t.uid);
  }

  return plegables;
}
