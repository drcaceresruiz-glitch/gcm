import type { TareaControlada } from "./control-avance";
import { estructuraDelCronograma } from "./estructura-cronograma";
import {
  geometriaBarra,
  marcasCalendario,
  posicionDia,
  rangoGantt,
  type TareaGantt,
} from "./gantt";
import { fechaCsv } from "./informe-documento";
import type { ElementoPdf, OpcionesPdf, PaginaPdf, TintaPdf } from "./informe-pdf";
import { aWinAnsi, partirEnLineas, type Medir } from "./pdf-texto";

/**
 * El cronograma en una hoja: la tabla de la izquierda y el Gantt a la derecha.
 *
 * Traduce a PDF la hoja «Cronograma tipo MS Project» disenada sobre el volcado
 * real del cliente (`docs/informe-plantillas/hojas/cronograma.fix.html`). El
 * informe ya contaba el avance por capitulo en cifras; lo que no habia en
 * ningun documento es CUANDO pasa cada cosa y cuanto queda por delante.
 *
 * **Es el cronograma RESUMIDO, y lo dice.** Un archivo real trae ciento y pico
 * filas: imprimirlas todas son seis paginas que nadie lee y que ademas ya
 * estan en la aplicacion. Aqui salen los capitulos y los hitos —el esqueleto
 * del proyecto— y al pie se dice cuantas partidas de detalle quedan fuera. Un
 * resumen que no confiesa serlo es lo mismo que un dato incompleto.
 *
 * La geometria no se reinventa: sale de `gantt.ts`, el mismo modulo que
 * dibuja el Gantt de la pantalla, asi que el papel y la aplicacion no pueden
 * colocar la misma barra en dos sitios distintos. Lo que se anade aqui es la
 * escala a puntos de PDF y la linea del corte.
 */

/// Filas que caben sin apretar la tabla. Con mas, la hoja deja de leerse.
const FILAS_VISIBLES = 20;

/// Ancho de la columna de nombres, en puntos. El resto es Gantt.
const ANCHO_TABLA = 300;

export interface DatosCronograma {
  obra: string;
  empresa: string;
  fechaCorte: Date;
  tareas: readonly TareaControlada[];
}

/**
 * Las filas que se dibujan: capitulos e hitos, en el orden del documento.
 *
 * El nivel donde viven los capitulos lo decide `estructuraDelCronograma`, la
 * misma regla que ya usa el resto del informe para agrupar. Duplicarla aqui
 * —«los de nivel 2»— seria empezar a contar capitulos distintos en dos sitios
 * del mismo documento.
 */
export function filasDelCronograma(
  tareas: readonly TareaControlada[],
): { filas: TareaControlada[]; ocultas: number } {
  const { nivelCapitulo } = estructuraDelCronograma(tareas);

  const candidatas = tareas.filter(
    (t) => (nivelCapitulo !== null && t.nivel === nivelCapitulo) || t.esHito,
  );

  // Sin jerarquia no hay capitulos que resumir: se ensenan las primeras
  // tareas tal cual, que es mas util que una hoja vacia.
  const fuente = candidatas.length > 0 ? candidatas : [...tareas];

  return {
    filas: fuente.slice(0, FILAS_VISIBLES),
    ocultas: tareas.length - Math.min(fuente.length, FILAS_VISIBLES),
  };
}

/// Una tarea del informe, vista como la quiere `gantt.ts`. Los campos son los
/// mismos; el tipo es mas estrecho porque el Gantt no necesita el desfase.
function aGantt(t: TareaControlada): TareaGantt {
  return {
    uid: t.uid,
    fila: t.fila,
    codigo: t.codigo,
    nombre: t.nombre,
    nivel: t.nivel,
    esResumen: t.esResumen,
    esHito: t.esHito,
    esCritico: t.esCritico,
    inicio: t.inicio,
    fin: t.fin,
    duracionDias: t.duracionDias,
    porcentajePlaneado: t.porcentajePlaneado,
    porcentajeReal: t.porcentajeReal,
  };
}

export function hojaCronograma(
  d: DatosCronograma,
  o: OpcionesPdf,
  medir: Medir,
): PaginaPdf[] {
  const { filas, ocultas } = filasDelCronograma(d.tareas);
  // Sin cronograma no hay hoja: el informe ya avisa por otro lado de que
  // falta el plan, y una hoja con un eje vacio no anade nada.
  if (filas.length === 0) return [];

  const rango = rangoGantt(d.tareas.map(aGantt));
  if (rango === null) return [];

  const el: ElementoPdf[] = [];
  const izq = o.margen;
  const der = o.ancho - o.margen;

  const texto = (
    x: number,
    y: number,
    contenido: string,
    tam: number,
    opciones: { negrita?: boolean; tinta?: TintaPdf } = {},
  ) => {
    el.push({
      tipo: "texto",
      x,
      y,
      texto: aWinAnsi(contenido),
      tam,
      negrita: opciones.negrita ?? false,
      gris: false,
      tinta: opciones.tinta ?? "tinta",
    });
  };

  // ---- Cabecera -----------------------------------------------------------

  let y = o.alto - o.margen - 13;
  texto(izq, y, "CRONOGRAMA AL CORTE", 13, { negrita: true });
  const rotulo = `Corte del ${fechaCsv(d.fechaCorte)}`;
  texto(der - medir(rotulo, 9), y + 2, rotulo, 9, { tinta: "marca", negrita: true });

  y -= 12;
  texto(izq, y, `${d.obra}  ·  ${d.empresa}`, 8, { tinta: "tinta-suave" });

  y -= 10;
  el.push({ tipo: "linea", x1: izq, y1: y, x2: der, y2: y, tinta: "linea" });

  // ---- Escala del eje -----------------------------------------------------

  const xGantt = izq + ANCHO_TABLA;
  const anchoGantt = der - xGantt;
  /// De dias a puntos. `totalDias` es al menos 1, asi que nunca divide por 0.
  const porDia = anchoGantt / rango.totalDias;
  const enX = (dias: number) => xGantt + dias * porDia;

  // Las marcas del calendario, con su rotulo. Salen del mismo modulo que las
  // de la pantalla, asi que las dos vistas parten el tiempo igual.
  const marcas = marcasCalendario(rango);
  const yCabecera = y - 12;

  texto(izq, yCabecera, "CAPÍTULO / HITO", 7, { negrita: true, tinta: "tinta-suave" });
  texto(izq + 178, yCabecera, "INICIO", 7, { negrita: true, tinta: "tinta-suave" });
  texto(izq + 226, yCabecera, "FIN", 7, { negrita: true, tinta: "tinta-suave" });
  texto(izq + 272, yCabecera, "%", 7, { negrita: true, tinta: "tinta-suave" });

  for (const marca of marcas) {
    const x = enX(marca.x);
    // Una marca cuyo rotulo se saldria por la derecha no se escribe: es lo que
    // deja el ultimo mes pisando el borde de la hoja.
    if (x > der - 4) continue;
    texto(x, yCabecera, marca.etiqueta, 6, { tinta: "tinta-suave" });
  }

  const yTabla = yCabecera - 5;
  el.push({ tipo: "linea", x1: izq, y1: yTabla, x2: der, y2: yTabla, tinta: "linea" });

  // ---- Filas --------------------------------------------------------------

  const altoFila = 17;
  const altoBarra = 7;
  const primeraFila = yTabla - 13;

  filas.forEach((t, i) => {
    const yFila = primeraFila - i * altoFila;

    const nombre = [t.codigo, t.nombre].filter(Boolean).join(" ");
    const linea = partirEnLineas(nombre, 172, 7.5, medir)[0] ?? nombre;
    texto(izq, yFila, linea, 7.5, { negrita: t.esHito });
    texto(izq + 178, yFila, fechaCsv(t.inicio), 7, { tinta: "tinta-suave" });
    texto(izq + 226, yFila, fechaCsv(t.fin), 7, { tinta: "tinta-suave" });
    texto(izq + 272, yFila, `${Number(t.porcentajeReal).toFixed(0)}%`, 7, {
      negrita: true,
    });

    const g = geometriaBarra(aGantt(t), rango);

    if (t.esHito) {
      // Un hito no dura: es un instante. Se marca con un cuadradito y no con
      // una barra de un dia, que se leeria como trabajo de una jornada.
      el.push({
        tipo: "fondo",
        x: enX(g.x) - 3,
        y: yFila - 1,
        ancho: 6,
        alto: 6,
        tinta: Number(t.porcentajeReal) >= 100 ? "exito" : "tinta",
      });
      return;
    }

    // La barra entera en gris —lo planeado— y encima el tramo ejecutado. La
    // critica va en su tinta: es la que marca el plazo de la obra.
    el.push({
      tipo: "fondo",
      x: enX(g.x),
      y: yFila - 1,
      ancho: Math.max(1, g.ancho * porDia),
      alto: altoBarra,
      tinta: "linea",
    });
    if (g.relleno > 0) {
      el.push({
        tipo: "fondo",
        x: enX(g.x),
        y: yFila - 1,
        ancho: Math.max(1, g.relleno * porDia),
        alto: altoBarra,
        tinta: t.esCritico ? "peligro" : "marca",
      });
    }
  });

  // ---- La linea del corte -------------------------------------------------

  /**
   * Va la ULTIMA, encima de las barras, y de arriba abajo de la tabla.
   *
   * Es lo que convierte el Gantt en una lectura y no en un dibujo: todo lo que
   * queda a su izquierda deberia estar hecho. Dibujarla antes que las barras
   * la dejaria tapada justo en las filas donde importa.
   */
  const xCorte = enX(posicionDia(d.fechaCorte, rango));
  if (xCorte >= xGantt && xCorte <= der) {
    const abajo = primeraFila - (filas.length - 1) * altoFila - 6;
    el.push({
      tipo: "linea",
      x1: xCorte,
      y1: abajo,
      x2: xCorte,
      y2: yTabla,
      tinta: "marca",
      grosor: 1,
    });
    const chip = "HOY";
    texto(xCorte - medir(chip, 6) / 2, yTabla + 3, chip, 6, {
      negrita: true,
      tinta: "marca",
    });
  }

  // ---- Pie ----------------------------------------------------------------

  if (ocultas > 0) {
    const yPie = primeraFila - filas.length * altoFila - 6;
    texto(
      izq,
      yPie,
      `Vista resumida: ${filas.length} capítulos e hitos de ${ocultas} partidas de detalle. El cronograma completo está en la aplicación.`,
      7,
      { tinta: "tinta-suave" },
    );
  }

  return [{ elementos: el }];
}
