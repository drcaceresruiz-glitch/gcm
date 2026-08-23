import { describe, expect, it } from "vitest";
import {
  filasDelCronograma,
  hojaCronograma,
  type DatosCronograma,
} from "./informe-hoja-cronograma";
import { A4_APAISADO, type ElementoPdf } from "./informe-pdf";
import type { TareaControlada } from "./control-avance";

const medir = (texto: string, tamano: number) => texto.length * (tamano / 2);

let fila = 0;

const tarea = (
  nivel: number,
  nombre: string,
  parcial: Partial<TareaControlada> = {},
): TareaControlada => {
  fila += 1;
  return {
    uid: fila,
    fila,
    codigo: `${fila}.0`,
    nombre,
    nivel,
    esResumen: nivel <= 2,
    esHito: false,
    esCritico: false,
    duracionDias: "5",
    inicio: new Date(Date.UTC(2026, 7, 3)),
    fin: new Date(Date.UTC(2026, 7, 10)),
    porcentajePlaneado: "100.00",
    porcentajeReal: "50.00",
    desfase: "-50.00",
    ...parcial,
  };
};

/// Un cronograma con su fila de proyecto arriba, dos capitulos y sus hijas.
const cronograma = (): TareaControlada[] => {
  fila = 0;
  return [
    // La fila de proyecto NO lleva codigo: con codigo, la estructura la lee
    // como un capitulo unico y toda la jerarquia cambia.
    tarea(1, "PROGRAMACION EP", { esResumen: true, codigo: null }),
    tarea(2, "CAPÍTULO II: TRABAJOS PRELIMINARES"),
    tarea(3, "Movilización", { esResumen: false }),
    tarea(3, "Trazo y replanteo", { esResumen: false }),
    tarea(2, "CAPÍTULO IV: CIMENTACIONES"),
    tarea(3, "Excavación para zapatas", { esResumen: false, esCritico: true }),
  ];
};

const datos = (parcial: Partial<DatosCronograma> = {}): DatosCronograma => ({
  obra: "LABORATORIO CRIOCORD - LURÍN",
  empresa: "LARQUITECTURA STUDIO SAC",
  fechaCorte: new Date(Date.UTC(2026, 7, 8)),
  tareas: cronograma(),
  ...parcial,
});

const hoja = (parcial: Partial<DatosCronograma> = {}) =>
  hojaCronograma(datos(parcial), A4_APAISADO, medir);

const textos = (elementos: readonly ElementoPdf[]) =>
  elementos.filter((e) => e.tipo === "texto").map((e) => e.texto);

describe("filasDelCronograma", () => {
  it("ensena los capitulos, no las partidas de detalle", () => {
    // Un archivo real trae ciento y pico filas: imprimirlas son seis paginas
    // que nadie lee y que ademas ya estan en la aplicacion.
    const { filas } = filasDelCronograma(cronograma());
    expect(filas.map((f) => f.nombre)).toEqual([
      "CAPÍTULO II: TRABAJOS PRELIMINARES",
      "CAPÍTULO IV: CIMENTACIONES",
    ]);
  });

  it("los hitos entran aunque no sean capitulos", () => {
    const con = [...cronograma(), tarea(3, "Recepción final", { esHito: true })];
    const { filas } = filasDelCronograma(con);
    expect(filas.some((f) => f.nombre === "Recepción final")).toBe(true);
  });

  it("dice cuantas partidas de detalle quedan fuera", () => {
    // Un resumen que no confiesa serlo es lo mismo que un dato incompleto.
    const { ocultas } = filasDelCronograma(cronograma());
    expect(ocultas).toBe(4);
  });

  it("un cronograma sin jerarquia ensena sus tareas, no una hoja vacia", () => {
    fila = 0;
    const planas = [tarea(1, "Una", { esResumen: false }), tarea(1, "Otra", { esResumen: false })];
    const { filas } = filasDelCronograma(planas);
    expect(filas).toHaveLength(2);
  });
});

describe("hojaCronograma", () => {
  it("sin tareas no hay hoja", () => {
    expect(hoja({ tareas: [] })).toEqual([]);
  });

  it("cada fila lleva su nombre, sus fechas y su porcentaje", () => {
    const t = textos(hoja()[0]!.elementos);
    expect(t.some((x) => x.includes("CAPÍTULO II"))).toBe(true);
    expect(t).toContain("03/08/2026");
    expect(t).toContain("10/08/2026");
    expect(t).toContain("50%");
  });

  it("un hito se marca con un cuadrado, no con una barra de un dia", () => {
    // Una barra de un dia se leeria como trabajo de una jornada; un hito es
    // un instante.
    const con = [...cronograma(), tarea(3, "Recepción final", { esHito: true })];
    const el = hoja({ tareas: con })[0]!.elementos;
    const cuadros = el.filter((e) => e.tipo === "fondo" && e.ancho === 6 && e.alto === 6);
    expect(cuadros).toHaveLength(1);
  });

  it("la barra critica se tine distinto de las demas", () => {
    fila = 0;
    const criticos = [
      tarea(1, "PROYECTO", { esResumen: true, codigo: null }),
      tarea(2, "CAPÍTULO CRÍTICO", { esCritico: true }),
      tarea(2, "CAPÍTULO NORMAL"),
      tarea(3, "hija", { esResumen: false }),
    ];
    const el = hoja({ tareas: criticos })[0]!.elementos;
    const rellenos = el.filter(
      (e) => e.tipo === "fondo" && (e.tinta === "peligro" || e.tinta === "marca"),
    );
    expect(rellenos.map((r) => (r.tipo === "fondo" ? r.tinta : null))).toEqual([
      "peligro",
      "marca",
    ]);
  });

  it("la linea del corte cruza la tabla y va rotulada", () => {
    // Es lo que convierte el Gantt en una lectura: todo lo que queda a su
    // izquierda deberia estar hecho.
    const el = hoja()[0]!.elementos;
    expect(textos(el)).toContain("HOY");
    const vertical = el.filter(
      (e) => e.tipo === "linea" && e.x1 === e.x2 && e.tinta === "marca",
    );
    expect(vertical).toHaveLength(1);
  });

  it("un corte fuera del rango del cronograma no dibuja la linea", () => {
    // Pedir el informe a una fecha anterior al arranque de la obra es legitimo
    // y no puede sacar una raya pegada al borde del papel.
    const el = hoja({ fechaCorte: new Date(Date.UTC(2025, 0, 1)) })[0]!.elementos;
    expect(textos(el)).not.toContain("HOY");
  });

  it("la linea del corte se dibuja DESPUES de las barras", () => {
    // Si va antes, las filas donde importa la tapan.
    const el = hoja()[0]!.elementos;
    const corte = el.findIndex((e) => e.tipo === "linea" && e.tinta === "marca");
    const ultimaBarra = el.map((e) => e.tipo === "fondo").lastIndexOf(true);
    expect(corte).toBeGreaterThan(ultimaBarra);
  });

  it("nada se sale de la hoja, ni con la tabla llena", () => {
    fila = 0;
    const muchas = [
      tarea(1, "PROYECTO", { esResumen: true, codigo: null }),
      ...Array.from({ length: 30 }, (_, i) => tarea(2, `CAPÍTULO NÚMERO ${i}`)),
    ];
    const el = hoja({ tareas: muchas })[0]!.elementos;
    const suelo = A4_APAISADO.margen + A4_APAISADO.altoPie;
    for (const e of el) {
      if (e.tipo === "texto" || e.tipo === "fondo") {
        expect(e.y).toBeGreaterThanOrEqual(suelo);
        expect(e.y).toBeLessThanOrEqual(A4_APAISADO.alto);
      }
      if (e.tipo === "fondo") {
        expect(e.x + e.ancho).toBeLessThanOrEqual(A4_APAISADO.ancho - A4_APAISADO.margen + 0.01);
      }
    }
  });

  it("el rotulo del eje que no cabe no se escribe pisando el borde", () => {
    const el = hoja()[0]!.elementos;
    for (const e of el) {
      if (e.tipo === "texto") {
        expect(e.x).toBeLessThanOrEqual(A4_APAISADO.ancho - A4_APAISADO.margen);
      }
    }
  });
});
