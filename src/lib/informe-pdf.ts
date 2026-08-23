import type { SeccionInforme, SerieGrafico } from "./informe-documento";
import { aWinAnsi, partirEnLineas, repartirColumnas, type Medir } from "./pdf-texto";

/**
 * El informe al corte, repartido en paginas de PDF.
 *
 * Aqui se decide QUE cae en cada pagina y en que coordenada, sin dibujar nada:
 * el servicio que llama recorre los elementos y los pinta con `pdf-lib`. Esa
 * separacion es la que permite probar lo unico que de verdad puede salir mal
 * —que una tabla se corte a media fila, que la cabecera no se repita al pasar
 * de pagina, que algo se salga del margen— sin generar un PDF y mirarlo.
 *
 * **A4 APAISADO.** La tabla de partidas atrasadas tiene once columnas; en
 * vertical le tocarian 47 puntos a cada una y no se leeria ninguna. Un informe
 * de obra es sobre todo tablas, asi que manda la tabla.
 *
 * El origen de coordenadas del PDF esta ABAJO a la izquierda, asi que `y` baja
 * segun se avanza por la pagina. Es al reves que en la pantalla y es la fuente
 * habitual de errores al tocar esto.
 */

export interface OpcionesPdf {
  ancho: number;
  alto: number;
  margen: number;
  /// Alto reservado abajo para el pie con la paginacion.
  altoPie: number;
  tamTituloDocumento: number;
  tamTituloSeccion: number;
  tamTexto: number;
  /// Separacion entre lineas de una misma celda.
  interlineado: number;
  /// Aire dentro de cada celda, arriba y abajo.
  relleno: number;
}

/// A4 apaisado en puntos (1 pt = 1/72 pulgada).
export const A4_APAISADO: OpcionesPdf = {
  ancho: 842,
  alto: 595,
  margen: 36,
  altoPie: 24,
  tamTituloDocumento: 16,
  tamTituloSeccion: 10,
  tamTexto: 8,
  interlineado: 1.15,
  relleno: 3,
};

/**
 * Los colores del informe, POR SU PAPEL y no por su valor.
 *
 * Este modulo decide QUE se dibuja y DONDE; que sea terracota o azul es cosa
 * del pintor, que es el unico que conoce la marca de la constructora. Por eso
 * aqui se nombra el papel —"esto es una alerta"— y nunca el color.
 *
 * Es la misma disciplina que ya siguen las hojas de diseno en
 * `docs/informe-plantillas/`, que solo usan `var(--token)` y tienen prohibido
 * el hex crudo: un color suelto en la capa de maquetacion es un color que
 * nadie encuentra el dia que la empresa cambia de identidad.
 */
export type TintaPdf =
  | "tinta"
  | "tinta-suave"
  | "linea"
  | "marca"
  | "plan"
  | "exito"
  | "alerta"
  | "peligro";

export type ElementoPdf =
  | {
      tipo: "texto";
      x: number;
      y: number;
      texto: string;
      tam: number;
      negrita: boolean;
      gris: boolean;
      /// Gana sobre `gris` cuando esta puesta. `gris` se queda por las
      /// decenas de llamadas que ya lo usan y no necesitan mas de dos tintas.
      tinta?: TintaPdf;
    }
  | { tipo: "linea"; x1: number; y1: number; x2: number; y2: number; tinta?: TintaPdf; grosor?: number }
  | {
      tipo: "fondo";
      x: number;
      y: number;
      ancho: number;
      alto: number;
      /// Sin tinta es el gris de cabecera de tabla de toda la vida.
      tinta?: TintaPdf;
    }
  /**
   * Un tramo de anillo, para el donut de avance.
   *
   * Los angulos van en GRADOS y en sentido horario desde las 12, que es como
   * se lee un porcentaje en un anillo: 0 arriba, 90 a la derecha, 180 abajo.
   * No es el convenio de la trigonometria —antihorario desde las 3— y por eso
   * se dice aqui: el pintor hace la conversion, nadie mas.
   */
  | {
      tipo: "arco";
      cx: number;
      cy: number;
      radio: number;
      grosor: number;
      desde: number;
      hasta: number;
      tinta: TintaPdf;
    }
  /**
   * La CAJA donde va una imagen. Viaja por CLAVE, no por contenido: la
   * maquetacion es codigo puro que se prueba sin tocar disco, y un Buffer
   * aqui dentro obligaria a cargar las fotos para comprobar donde cae una
   * caja.
   *
   * `ancho` y `alto` son el limite, NO la forma final: el pintor encaja la
   * imagen dentro conservando su proporcion y la centra, igual que hace con
   * el logo. Aqui no se puede saber cuantos pixeles mide de verdad.
   */
  | { tipo: "imagen"; x: number; y: number; ancho: number; alto: number; clave: string }
  /// Un tramo de curva. Se emite uno por cada par de puntos consecutivos, para
  /// que quien dibuje no tenga que saber nada de series ni de escalas.
  | {
      tipo: "trazo";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      papel: "plan" | "real";
    };

/// Alto del area del grafico de la curva. Suficiente para leer la separacion
/// entre las dos lineas sin comerse media pagina.
const ALTO_GRAFICO = 150;

export interface PaginaPdf {
  elementos: ElementoPdf[];
}

/**
 * Un cursor que va bajando por las paginas y abre una nueva cuando se acaba
 * el sitio.
 *
 * Existe para que ninguna de las funciones de dibujo tenga que acordarse de
 * comprobar el margen inferior: piden sitio y escriben. Olvidarse de esa
 * comprobacion en UNA de ellas es exactamente como se cuela una tabla que se
 * sale de la hoja.
 */
class Lienzo {
  paginas: PaginaPdf[] = [];
  private actual: PaginaPdf = { elementos: [] };
  y: number;

  constructor(private o: OpcionesPdf) {
    this.y = o.alto - o.margen;
    this.paginas.push(this.actual);
  }

  get limiteInferior(): number {
    return this.o.margen + this.o.altoPie;
  }

  /// Sitio que queda por debajo del cursor en esta pagina.
  get disponible(): number {
    return this.y - this.limiteInferior;
  }

  /// Asegura `alto` puntos libres; si no los hay, pasa de pagina.
  reservar(alto: number): void {
    if (alto <= this.disponible) return;
    this.nuevaPagina();
  }

  nuevaPagina(): void {
    this.actual = { elementos: [] };
    this.paginas.push(this.actual);
    this.y = this.o.alto - this.o.margen;
  }

  poner(elemento: ElementoPdf): void {
    this.actual.elementos.push(elemento);
  }

  texto(
    x: number,
    texto: string,
    tam: number,
    opciones: { negrita?: boolean; gris?: boolean } = {},
  ): void {
    this.poner({
      tipo: "texto",
      x,
      // `y` marca la BASE del texto: hay que bajar el alto de la linea antes
      // de escribir, o la primera linea sale medio fuera de la hoja.
      y: this.y - tam,
      texto: aWinAnsi(texto),
      tam,
      negrita: opciones.negrita ?? false,
      gris: opciones.gris ?? false,
    });
  }
}

/// Cuantas filas de tabla tienen que caber para que valga la pena empezarla
/// en esta pagina. Con menos, la tabla arranca con la cabecera y una fila
/// suelta al pie y sigue en la siguiente: se lee peor que empezarla entera
/// arriba.
const FILAS_MINIMAS = 3;

export function paginasDelInforme(
  secciones: readonly SeccionInforme[],
  titulo: string,
  subtitulo: string,
  opciones: OpcionesPdf,
  medir: Medir,
): PaginaPdf[] {
  const o = opciones;
  const lienzo = new Lienzo(o);
  const anchoUtil = o.ancho - o.margen * 2;

  // Portada del documento, arriba de la primera pagina de tablas.
  lienzo.texto(o.margen, titulo, o.tamTituloDocumento, { negrita: true });
  lienzo.y -= o.tamTituloDocumento + 6;
  lienzo.texto(o.margen, subtitulo, o.tamTexto, { gris: true });
  lienzo.y -= o.tamTexto + 10;

  for (const seccion of secciones) {
    dibujarSeccion(lienzo, seccion, o, anchoUtil, medir);
  }

  return lienzo.paginas;
}

function dibujarSeccion(
  lienzo: Lienzo,
  seccion: SeccionInforme,
  o: OpcionesPdf,
  anchoUtil: number,
  medir: Medir,
): void {
  const altoTitulo = o.tamTituloSeccion + 8;

  // Un titulo de seccion solo al pie de la pagina no es un titulo: se exige
  // sitio para el y para algo debajo.
  lienzo.reservar(altoTitulo + o.tamTexto * 3);

  lienzo.texto(o.margen, seccion.titulo, o.tamTituloSeccion, { negrita: true });
  lienzo.y -= altoTitulo;

  if (seccion.clase === "nota") {
    lienzo.texto(o.margen, seccion.texto, o.tamTexto, { gris: true });
    lienzo.y -= o.tamTexto + 12;
    return;
  }

  if (seccion.clase === "datos") {
    const cabeceras = seccion.cabecera ? [...seccion.cabecera] : ["", ""];
    const filas = seccion.filas.map(([k, v]) => [String(k), v === null || v === undefined ? "" : String(v)]);
    dibujarTabla(lienzo, cabeceras, filas, seccion.cabecera !== null, o, anchoUtil, medir);
    return;
  }

  // El grafico va ANTES de su tabla: es lo que se mira, y la tabla esta
  // debajo para quien quiera el numero exacto.
  //
  // Y va TAMBIEN cuando la tabla esta vacia. Es el caso de una obra recien
  // arrancada: no hay avance reportado, la tabla de la curva no tiene ni una
  // fila, pero el plan si existe y ver la forma prevista de la obra vale.
  if (seccion.grafico) dibujarGrafico(lienzo, seccion.grafico, o, anchoUtil);

  if (seccion.filas.length === 0) {
    lienzo.texto(o.margen, seccion.siNoHay, o.tamTexto, { gris: true });
    lienzo.y -= o.tamTexto + 12;
    return;
  }

  const filas = seccion.filas.map((f) =>
    f.map((c) => (c === null || c === undefined ? "" : String(c))),
  );
  dibujarTabla(lienzo, [...seccion.cabeceras], filas, true, o, anchoUtil, medir);
}

function dibujarTabla(
  lienzo: Lienzo,
  cabeceras: readonly string[],
  filas: readonly (readonly string[])[],
  conCabecera: boolean,
  o: OpcionesPdf,
  anchoUtil: number,
  medir: Medir,
): void {
  const anchos = repartirColumnas(cabeceras, filas, anchoUtil);
  const xs: number[] = [];
  let x = o.margen;
  for (const ancho of anchos) {
    xs.push(x);
    x += ancho;
  }

  const altoLinea = o.tamTexto * o.interlineado;

  /// Las lineas de cada celda de una fila, y lo que mide la fila entera.
  const componer = (fila: readonly string[]) => {
    const celdas = fila.map((texto, i) =>
      partirEnLineas(texto, (anchos[i] ?? anchoUtil) - o.relleno * 2, o.tamTexto, medir),
    );
    const lineas = Math.max(1, ...celdas.map((c) => c.length));
    return { celdas, alto: lineas * altoLinea + o.relleno * 2 };
  };

  const cabecera = componer(cabeceras);

  const pintarCabecera = () => {
    if (!conCabecera) return;
    lienzo.poner({
      tipo: "fondo",
      x: o.margen,
      y: lienzo.y - cabecera.alto,
      ancho: anchoUtil,
      alto: cabecera.alto,
    });
    pintarFila(lienzo, cabecera, xs, anchos, o, altoLinea, true);
  };

  // Si de la tabla solo caben la cabecera y una fila suelta, se empieza en la
  // pagina siguiente: partirla ahi no ahorra papel y se lee peor.
  const filasQueCaben = Math.floor(
    (lienzo.disponible - cabecera.alto) / (o.tamTexto * o.interlineado + o.relleno * 2),
  );
  if (filasQueCaben < Math.min(FILAS_MINIMAS, filas.length)) lienzo.nuevaPagina();

  pintarCabecera();

  for (const fila of filas) {
    const compuesta = componer(fila);

    if (compuesta.alto > lienzo.disponible) {
      lienzo.nuevaPagina();
      // La cabecera se REPITE: una tabla que sigue en la pagina siguiente sin
      // rotulos obliga a volver atras para saber que columna es cual.
      pintarCabecera();
    }

    pintarFila(lienzo, compuesta, xs, anchos, o, altoLinea, false);
  }

  lienzo.y -= 12;
}

function pintarFila(
  lienzo: Lienzo,
  compuesta: { celdas: string[][]; alto: number },
  xs: readonly number[],
  anchos: readonly number[],
  o: OpcionesPdf,
  altoLinea: number,
  esCabecera: boolean,
): void {
  const arriba = lienzo.y;

  compuesta.celdas.forEach((lineas, columna) => {
    const x = (xs[columna] ?? o.margen) + o.relleno;
    lineas.forEach((linea, i) => {
      lienzo.poner({
        tipo: "texto",
        x,
        y: arriba - o.relleno - altoLinea * (i + 1) + (altoLinea - o.tamTexto) / 2,
        texto: linea,
        tam: o.tamTexto,
        negrita: esCabecera,
        gris: false,
      });
    });
  });

  const abajo = arriba - compuesta.alto;

  // Una raya fina bajo cada fila. Sin ella, una tabla de veinte filas con
  // celdas de varias lineas se lee como un bloque de texto.
  lienzo.poner({
    tipo: "linea",
    x1: o.margen,
    y1: abajo,
    x2: o.margen + anchos.reduce((a, b) => a + b, 0),
    y2: abajo,
  });

  lienzo.y = abajo;
}

/**
 * La curva de avance, dibujada.
 *
 * Es el grafico del informe: dice de un vistazo si la obra va por encima o por
 * debajo del plan, cosa que la tabla de la curva solo dice si te pones a
 * comparar columna con columna.
 *
 * El eje Y va SIEMPRE de 0 a 100 y no de minimo a maximo: una curva de avance
 * reescalada a su propio rango exagera cualquier diferencia y engana. El eje X
 * abarca de la primera a la ultima fecha de todas las series juntas, para que
 * las dos lineas compartan escala.
 */
function dibujarGrafico(
  lienzo: Lienzo,
  series: readonly SerieGrafico[],
  o: OpcionesPdf,
  anchoUtil: number,
): void {
  const conPuntos = series.filter((s) => s.puntos.length > 0);
  if (conPuntos.length === 0) return;

  const tiempos = conPuntos.flatMap((s) => s.puntos.map((p) => p.fecha.getTime()));
  const desde = Math.min(...tiempos);
  const hasta = Math.max(...tiempos);
  const span = hasta - desde || 1;

  lienzo.reservar(ALTO_GRAFICO + 24);

  const arriba = lienzo.y;
  const abajo = arriba - ALTO_GRAFICO;
  // Sitio a la izquierda para los rotulos del eje.
  const izquierda = o.margen + 24;
  const derecha = o.margen + anchoUtil;

  const aX = (t: number) => izquierda + ((t - desde) / span) * (derecha - izquierda);
  const aY = (v: number) => abajo + (Math.min(100, Math.max(0, v)) / 100) * ALTO_GRAFICO;

  // Rejilla horizontal cada 25%, con su rotulo.
  for (const marca of [0, 25, 50, 75, 100]) {
    const y = aY(marca);
    lienzo.poner({ tipo: "linea", x1: izquierda, y1: y, x2: derecha, y2: y });
    lienzo.poner({
      tipo: "texto",
      x: o.margen,
      y: y - 2,
      texto: `${marca}%`,
      tam: 6,
      negrita: false,
      gris: true,
    });
  }

  for (const serie of conPuntos) {
    const puntos = [...serie.puntos].sort(
      (a, b) => a.fecha.getTime() - b.fecha.getTime(),
    );
    for (let i = 1; i < puntos.length; i++) {
      lienzo.poner({
        tipo: "trazo",
        x1: aX(puntos[i - 1]!.fecha.getTime()),
        y1: aY(puntos[i - 1]!.valor),
        x2: aX(puntos[i]!.fecha.getTime()),
        y2: aY(puntos[i]!.valor),
        papel: serie.papel,
      });
    }
  }

  lienzo.y = abajo - 4;

  // Fechas de los extremos y leyenda, debajo del area.
  lienzo.poner({
    tipo: "texto",
    x: izquierda,
    y: lienzo.y - 6,
    texto: fechaCorta(new Date(desde)),
    tam: 6,
    negrita: false,
    gris: true,
  });
  lienzo.poner({
    tipo: "texto",
    x: derecha - 40,
    y: lienzo.y - 6,
    texto: fechaCorta(new Date(hasta)),
    tam: 6,
    negrita: false,
    gris: true,
  });
  lienzo.texto(
    izquierda + 90,
    conPuntos.map((s) => s.nombre).join("   ·   "),
    6,
    { gris: true },
  );

  lienzo.y -= 16;
}

/// dd/mm/aa para los extremos del eje. En UTC, como el resto del informe.
function fechaCorta(fecha: Date): string {
  const d = String(fecha.getUTCDate()).padStart(2, "0");
  const m = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${String(fecha.getUTCFullYear()).slice(2)}`;
}
