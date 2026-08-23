import { describe, expect, it } from "vitest";
import {
  hojaControl,
  porcentajeComprometido,
  type DatosControl,
} from "./informe-hoja-control";
import { A4_APAISADO, type ElementoPdf } from "./informe-pdf";

const medir = (texto: string, tamano: number) => texto.length * (tamano / 2);

const economia = (parcial: Partial<DatosControl["economia"]> = {}) => ({
  presupuesto: "745553.36",
  comprometido: "196400.50",
  saldo: "549152.86",
  conLineaBase: true,
  ...parcial,
});

const datos = (parcial: Partial<DatosControl> = {}): DatosControl => ({
  obra: "LABORATORIO CRIOCORD - LURÍN",
  empresa: "LARQUITECTURA STUDIO SAC",
  fechaCorte: new Date(Date.UTC(2026, 7, 8)),
  real: "11.00",
  economia: economia(),
  lastPlanner: null,
  ...parcial,
});

const hoja = (parcial: Partial<DatosControl> = {}) =>
  hojaControl(datos(parcial), A4_APAISADO, medir);

const textos = (elementos: readonly ElementoPdf[]) =>
  elementos.filter((e) => e.tipo === "texto").map((e) => e.texto);

const dice = (parcial: Partial<DatosControl>, fragmento: string) =>
  textos(hoja(parcial)[0]!.elementos).some((t) => t.includes(fragmento));

describe("porcentajeComprometido", () => {
  it("calcula la proporcion con la aritmetica de importes, no en coma flotante", () => {
    expect(porcentajeComprometido(economia())).toBeCloseTo(26.34, 1);
  });

  it("un presupuesto de cero no devuelve infinito: devuelve null", () => {
    // Dividir entre cero en coma flotante da Infinity y pinta una barra que
    // se sale del papel.
    expect(porcentajeComprometido(economia({ presupuesto: "0.00" }))).toBeNull();
  });

  it("un importe ilegible devuelve null en vez de NaN", () => {
    expect(porcentajeComprometido(economia({ comprometido: "" }))).toBeNull();
  });
});

describe("hojaControl - la mitad economica", () => {
  it("el cruce construido/comprometido es lo que justifica la hoja", () => {
    const t = textos(hoja()[0]!.elementos);
    expect(t).toContain("AVANCE FÍSICO EJECUTADO");
    expect(t).toContain("PRESUPUESTO COMPROMETIDO");
  });

  it("avisa por escrito cuando se ha comprometido mas de lo construido", () => {
    // La brecha va dicha con palabras y no solo dibujada: quien no sepa que
    // dos barras desiguales significan algo se quedaria sin el aviso.
    expect(dice({}, "más presupuesto del que se ha construido")).toBe(true);
  });

  it("y lo dice al reves cuando el presupuesto acompana a la obra", () => {
    expect(
      dice({ real: "60.00" }, "por detrás de lo construido"),
    ).toBe(true);
  });

  it("las tres cuentas salen con su importe", () => {
    const t = textos(hoja()[0]!.elementos);
    expect(t).toContain("Presupuesto");
    expect(t).toContain("Comprometido");
    expect(t).toContain("Saldo");
    expect(t.some((x) => x.includes("745,553.36"))).toBe(true);
  });

  it("un saldo que no se pudo calcular lo dice, en vez de escribir cero", () => {
    // La regla del dinero del proyecto: un importe que miente es peor que no
    // tener el importe.
    expect(dice({ economia: economia({ saldo: null }) }, "No se puede calcular")).toBe(
      true,
    );
  });

  it("sin linea base aprobada avisa de que faltan los adicionales", () => {
    expect(
      dice({ economia: economia({ conLineaBase: false }) }, "Sin línea base aprobada"),
    ).toBe(true);
  });

  it("sin permiso de ordenes explica el hueco en vez de imprimir un cero", () => {
    const t = textos(
      hoja({ economia: null, lastPlanner: { semana: null, compromisos: [], tendencia: [{ fecha: new Date(Date.UTC(2026, 7, 1)), ppc: 80 }], pareto: [] } })[0]!
        .elementos,
    );
    expect(t).toContain("SIN ACCESO A LAS CIFRAS DE DINERO");
  });
});

describe("hojaControl - la mitad de Last Planner", () => {
  it("sin semanas cerradas dibuja el hueco y lo explica", () => {
    // Es la correccion que costo rehacer la hoja entera: rellenar un PPC de
    // muestra cuando la obra no tiene ninguna semana cerrada.
    const t = textos(hoja()[0]!.elementos);
    expect(t).toContain("Todavía no hay nada que medir");
    expect(t.some((x) => x.includes("no tiene ninguna semana del plan cerrada"))).toBe(
      true,
    );
    expect(t).toContain("PPC semana a semana");
  });

  it("y NO inventa ni una sola cifra de PPC", () => {
    // La prueba que impide que vuelva a pasar: sin semanas cerradas no puede
    // haber ni una barra de PPC dibujada.
    const el = hoja()[0]!.elementos;
    const barras = el.filter(
      (e) =>
        e.tipo === "fondo" &&
        (e.tinta === "exito" || e.tinta === "alerta" || e.tinta === "peligro"),
    );
    expect(barras).toHaveLength(0);
    expect(textos(el)).toContain("SIN DATOS");
  });

  it("con semanas cerradas dibuja una barra por semana", () => {
    const tendencia = [
      { fecha: new Date(Date.UTC(2026, 7, 1)), ppc: 85 },
      { fecha: new Date(Date.UTC(2026, 7, 8)), ppc: 55 },
    ];
    const el = hoja({
      lastPlanner: { semana: null, compromisos: [], tendencia, pareto: [] },
    })[0]!.elementos;

    const rellenos = el.filter(
      (e) => e.tipo === "fondo" && (e.tinta === "exito" || e.tinta === "peligro"),
    );
    expect(rellenos.map((r) => (r.tipo === "fondo" ? r.tinta : null))).toEqual([
      "exito",
      "peligro",
    ]);
    expect(textos(el)).toContain("01/08");
  });

  it("una obra sin incumplimientos lo dice, en vez de dejar el bloque mudo", () => {
    const tendencia = [{ fecha: new Date(Date.UTC(2026, 7, 1)), ppc: 100 }];
    expect(
      dice(
        { lastPlanner: { semana: null, compromisos: [], tendencia, pareto: [] } },
        "Ningún compromiso incumplido",
      ),
    ).toBe(true);
  });
});

describe("hojaControl - la hoja como papel", () => {
  it("sin dinero y sin Last Planner no se imprime la hoja", () => {
    // No se gasta una pagina en explicar dos huecos a la vez.
    expect(hoja({ economia: null, lastPlanner: null })).toEqual([]);
  });

  it("nada se sale de la hoja ni invade el pie", () => {
    const tendencia = Array.from({ length: 20 }, (_, i) => ({
      fecha: new Date(Date.UTC(2026, 5, 1 + i * 7)),
      ppc: 40 + i,
    }));
    const pareto = Array.from({ length: 8 }, () => ({
      causa: "MATERIALES" as const,
      conteo: 3,
    }));
    const el = hoja({
      lastPlanner: { semana: null, compromisos: [], tendencia, pareto },
    })[0]!.elementos;

    const suelo = A4_APAISADO.margen + A4_APAISADO.altoPie;
    for (const e of el) {
      if (e.tipo === "texto" || e.tipo === "fondo") {
        expect(e.y).toBeGreaterThanOrEqual(suelo);
        expect(e.y).toBeLessThanOrEqual(A4_APAISADO.alto);
      }
      if (e.tipo === "fondo") {
        expect(e.x + e.ancho).toBeLessThanOrEqual(
          A4_APAISADO.ancho - A4_APAISADO.margen + 0.01,
        );
      }
    }
  });
});
