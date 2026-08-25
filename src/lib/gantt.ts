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
 * Cuantas marcas como mucho, pase lo que pase con las fechas.
 *
 * No es un gusto de diseño, es un tope de trabajo. El eje se recorre de marca
 * en marca, asi que sin tope el coste crece con el PLAZO y no con el tamaño
 * del cronograma: una tarea con el año mal tecleado —un 9999 por un 2026—
 * pedia noventa y siete mil marcas mensuales. Medido el 25/08/2026 sobre una
 * obra de sonda de 1900 a 9999: el Gantt tardaba 10 s y el PDF del informe
 * semanal **39 s**, con dos tareas dentro. En produccion eso no es lentitud,
 * es la pantalla caida.
 *
 * Con el tope, el paso se ensancha —cada dos meses, cada año, cada decada— en
 * vez de multiplicarse las marcas. Un plazo normal ni lo nota: el paso se
 * queda en 1 y las marcas salen exactamente donde salian.
 */
const TOPE_MARCAS = 120;

/**
 * Las marcas del eje temporal, con el paso adecuado al plazo.
 *
 * Un plazo corto se marca por semanas —cada lunes— y uno largo por meses: mil
 * rayitas en un Gantt de dos años no dicen mas que doce, solo emborronan. El
 * umbral es noventa dias, mas o menos un trimestre.
 *
 * Y el paso se ensancha si aun asi no caben: ver `TOPE_MARCAS`.
 */
export function marcasCalendario(rango: RangoGantt): MarcaCalendario[] {
  const marcas: MarcaCalendario[] = [];
  const porMeses = rango.totalDias > 90;
  // 30,44 dias por mes: el promedio del año, para estimar cuantas marcas
  // saldrian antes de empezar a recorrerlas.
  const pasoMeses = Math.max(1, Math.ceil(rango.totalDias / 30.44 / TOPE_MARCAS));
  const pasoSemanas = Math.max(1, Math.ceil(rango.totalDias / 7 / TOPE_MARCAS));

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
      cursor.setUTCMonth(cursor.getUTCMonth() + pasoMeses);
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
      cursor.setUTCDate(cursor.getUTCDate() + 7 * pasoSemanas);
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

/** Lo minimo de una tarea de la LINEA BASE para dibujar su barra gris. */
export interface TareaBase {
  uid: number;
  inicio: Date;
  fin: Date;
}

/**
 * Donde estaba la tarea segun el plan congelado, o null si no estaba.
 *
 * Null y una barra de ancho cero NO son lo mismo: una tarea que nacio despues
 * de fijar la base no tiene con que compararse, y pintarle una barra gris en
 * el origen diria que se movio desde el dia uno. Ausencia no es «no se movio».
 */
export function barraLineaBase(
  base: TareaBase | undefined,
  rango: RangoGantt,
): Pick<Barra, "x" | "ancho"> | null {
  if (!base) return null;

  return {
    x: dias(rango.inicio, base.inicio),
    ancho: Math.max(1, dias(base.inicio, base.fin)),
  };
}

export type TipoEnlace = "FC" | "CC" | "FF" | "CF";

export interface DependenciaGantt {
  tareaUid: number;
  predecesoraUid: number;
  /// FC, CC, FF o CF. Cualquier otra cosa se descarta.
  tipo: string;
  desfaseDias: string;
}

export interface EnlaceGantt {
  tareaUid: number;
  predecesoraUid: number;
  tipo: TipoEnlace;
  /// Ambos extremos son criticos: es la cadena que manda sobre el plazo.
  critica: boolean;
  /// La polilinea, en DIAS (x) y FILAS (y). El componente multiplica.
  puntos: { x: number; y: number }[];
}

/** Cuanto sobresale el codo antes de girar, en dias de eje. */
const SALIENTE = 0.6;

/**
 * Por que borde sale el enlace y por cual entra.
 *
 * Es la mitad del significado de una dependencia, y equivocarla dibuja una
 * atadura que no existe —peor que no dibujar nada—. FC (fin-comienzo) es la
 * comun: la siguiente empieza cuando la anterior acaba. CC arrancan juntas,
 * FF acaban juntas, CF la siguiente ACABA cuando la anterior empieza.
 */
const BORDES: Record<TipoEnlace, { sale: "fin" | "inicio"; entra: "inicio" | "fin" }> = {
  FC: { sale: "fin", entra: "inicio" },
  CC: { sale: "inicio", entra: "inicio" },
  FF: { sale: "fin", entra: "fin" },
  CF: { sale: "inicio", entra: "fin" },
};

function esTipo(t: string): t is TipoEnlace {
  return t === "FC" || t === "CC" || t === "FF" || t === "CF";
}

/**
 * Las flechas dibujables entre las filas VISIBLES.
 *
 * Se descarta el enlace cuyo origen o destino esta escondido bajo un capitulo
 * plegado: no hay donde anclarlo sin inventar. Reanclarlo al resumen dibujaria
 * una dependencia entre capitulos que en los datos no existe, y eso se lee
 * como una restriccion real. El filtro vive AQUI, en logica pura, para poder
 * probarlo sin montar el DOM.
 *
 * Las coordenadas salen en dias y filas —nunca en pixeles—, que es la regla
 * de todo este modulo: asi la geometria se prueba sin ancho de pantalla.
 */
export function flechasDeDependencia(
  dependencias: readonly DependenciaGantt[],
  visibles: readonly TareaGantt[],
  rango: RangoGantt,
): EnlaceGantt[] {
  const fila = new Map<number, number>();
  visibles.forEach((t, i) => fila.set(t.uid, i));
  const porUid = new Map(visibles.map((t) => [t.uid, t]));

  const flechas: EnlaceGantt[] = [];

  for (const d of dependencias) {
    if (!esTipo(d.tipo)) continue;

    const desde = porUid.get(d.predecesoraUid);
    const hasta = porUid.get(d.tareaUid);
    // Uno de los dos esta plegado: no se dibuja.
    if (!desde || !hasta) continue;

    const filaDesde = fila.get(d.predecesoraUid)!;
    const filaHasta = fila.get(d.tareaUid)!;

    const bordes = BORDES[d.tipo];
    const desfase = Number(d.desfaseDias) || 0;

    // El desfase corre el punto de SALIDA: un «24FC+3 dias» arranca tres dias
    // despues del fin de la predecesora, no en el fin.
    const xSale =
      dias(rango.inicio, bordes.sale === "fin" ? desde.fin : desde.inicio) + desfase;
    const xEntra = dias(
      rango.inicio,
      bordes.entra === "fin" ? hasta.fin : hasta.inicio,
    );

    // El centro vertical de cada fila. La fila 0 tiene su centro en 0,5.
    const ySale = filaDesde + 0.5;
    const yEntra = filaHasta + 0.5;

    flechas.push({
      tareaUid: d.tareaUid,
      predecesoraUid: d.predecesoraUid,
      tipo: d.tipo,
      critica: desde.esCritico && hasta.esCritico,
      puntos: ruta(xSale, ySale, xEntra, yEntra, bordes.sale, bordes.entra),
    });
  }

  return flechas;
}

/** Quita puntos consecutivos repetidos: dejan tramos de longitud cero. */
function sinRepetidos(
  puntos: { x: number; y: number }[],
): { x: number; y: number }[] {
  return puntos.filter(
    (p, i) => i === 0 || p.x !== puntos[i - 1]!.x || p.y !== puntos[i - 1]!.y,
  );
}

/**
 * La polilinea ORTOGONAL entre dos bordes de barra.
 *
 * Cada tramo cambia solo en x o solo en y. Una diagonal se lee como «va de
 * aqui a alla» sin decir por donde, y con veinte enlaces encima el diagrama
 * se vuelve un ovillo.
 *
 * Dos formas segun donde caiga el destino:
 *
 *  - **Directo** (el caso comun, FC hacia adelante): se sale del borde, se
 *    corre hasta la vertical del destino, se baja y se entra. Cuatro puntos.
 *  - **Rodeo**: cuando el destino queda DETRAS en el sentido de salida —pasa
 *    con desfases negativos, con CC entre tareas solapadas y con CF—, ir en
 *    linea recta obligaria a atravesar la propia barra hacia atras. Se sale,
 *    se baja al pasillo entre las dos filas, se recorre por ahi y se sube.
 *
 * En la MISMA fila el pasillo baja un poco: quedarse a la altura de la fila
 * significaria cruzar la barra por encima.
 */
function ruta(
  xSale: number,
  ySale: number,
  xEntra: number,
  yEntra: number,
  sale: "inicio" | "fin",
  entra: "inicio" | "fin",
): { x: number; y: number }[] {
  const dirSale = sale === "fin" ? 1 : -1;
  const dirEntra = entra === "inicio" ? -1 : 1;

  const xCodoSale = xSale + SALIENTE * dirSale;
  const xCodoEntra = xEntra + SALIENTE * dirEntra;

  const mismaFila = ySale === yEntra;
  const yPasillo = mismaFila ? ySale + 0.45 : (ySale + yEntra) / 2;

  // ¿El destino queda POR DELANTE en el sentido en que se sale? Si no, hay
  // que rodear: ir en recta significaria volver atras sobre la propia barra.
  const adelante = dirSale > 0 ? xEntra >= xSale : xEntra <= xSale;

  /**
   * Por donde baja el tramo vertical.
   *
   * Normalmente por el codo de entrada. Pero con dos tareas PEGADAS —una
   * acaba el 7 y la siguiente empieza el 8, que es el caso mas comun de
   * todos— los dos codos de 0,6 dias suman mas que el hueco de 1 dia y se
   * cruzan: el trazo salia con un zigzag de seis puntos donde tocaba un
   * escalon. Cuando se solapan se baja por el PUNTO MEDIO, que da el escalon
   * limpio de siempre.
   */
  const solapan =
    dirSale > 0 ? xCodoEntra < xCodoSale : xCodoEntra > xCodoSale;
  const xVertical = solapan ? (xSale + xEntra) / 2 : xCodoEntra;

  return sinRepetidos(
    adelante
      ? [
          { x: xSale, y: ySale },
          { x: xVertical, y: ySale },
          { x: xVertical, y: yEntra },
          { x: xEntra, y: yEntra },
        ]
      : [
          { x: xSale, y: ySale },
          { x: xCodoSale, y: ySale },
          { x: xCodoSale, y: yPasillo },
          { x: xCodoEntra, y: yPasillo },
          { x: xCodoEntra, y: yEntra },
          { x: xEntra, y: yEntra },
        ],
  );
}
