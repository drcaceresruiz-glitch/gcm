import { describe, expect, it } from "vitest";

import { cruceFisicoEconomico, type PartidaDelCruce } from "./fisico-vs-economico";

const p = (
  codigo: string,
  parcial: string | null,
  nombre = `Partida ${codigo}`,
): PartidaDelCruce => ({ codigo, parcial, nombre });

describe("cruceFisicoEconomico", () => {
  it("compara los dos porcentajes sobre la MISMA base", () => {
    // 1.1 vale 100 y va al 50%; se gastaron 80. Fisico 50, economico 80.
    const filas = cruceFisicoEconomico(
      [p("1", null, "ESTRUCTURAS"), p("1.1", "100.00")],
      new Map([["1.1", "80.00"]]),
      new Map([["1.1", "50.00"]]),
    );

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      codigo: "1",
      nombre: "ESTRUCTURAS",
      presupuesto: "100.00",
      gastado: "80.00",
      baseMedible: "100.00",
      sinMedir: "0.00",
      fisico: 50,
      economico: 80,
      avisa: true,
    });
  });

  it("UNA PARTIDA SIN AVANCE CONOCIDO NO CUENTA COMO 0%", () => {
    // Es el modo de fallo caro: contarla como cero hunde el fisico del
    // capitulo e inventa un problema que no existe. Queda fuera de la base y
    // se declara en `sinMedir`.
    const filas = cruceFisicoEconomico(
      [p("1", null), p("1.1", "100.00"), p("1.2", "900.00")],
      new Map(),
      new Map([["1.1", "60.00"]]),
    );

    expect(filas[0]).toMatchObject({
      presupuesto: "1000.00",
      baseMedible: "100.00",
      sinMedir: "900.00",
      // 60, no 6: la 1.2 no arrastra el promedio hacia abajo.
      fisico: 60,
    });
  });

  it("EL DINERO IMPUTADO A UN CAPITULO CON HIJAS COSTEADAS NO SE PIERDE", () => {
    // `aportantes` excluye ese capitulo del presupuesto —es un titulo—, pero
    // la orden se pago igual. Sin recogerlo, el gasto desapareceria del cruce
    // sin dar ningun error.
    const filas = cruceFisicoEconomico(
      [p("1", "999.00"), p("1.1", "100.00")],
      new Map([
        ["1", "40.00"],
        ["1.1", "10.00"],
      ]),
      new Map(),
    );

    // El presupuesto del capitulo es el de su hija, no los 999 de suma alzada.
    expect(filas[0]!.presupuesto).toBe("100.00");
    // Pero el gasto son los dos.
    expect(filas[0]!.gastado).toBe("50.00");
  });

  it("sin ninguna partida medible no inventa porcentajes", () => {
    const filas = cruceFisicoEconomico(
      [p("1", null), p("1.1", "100.00")],
      new Map([["1.1", "70.00"]]),
      new Map(),
    );

    expect(filas[0]).toMatchObject({
      fisico: null,
      economico: null,
      avisa: false,
      sinMedir: "100.00",
    });
  });

  it("no avisa cuando el gasto va por detras o dentro del margen", () => {
    const filas = cruceFisicoEconomico(
      [p("1", null), p("1.1", "100.00"), p("2", null), p("2.1", "100.00")],
      new Map([
        ["1.1", "55.00"],
        ["2.1", "90.00"],
      ]),
      new Map([
        ["1.1", "50.00"],
        ["2.1", "50.00"],
      ]),
    );

    // 55 contra 50: cinco puntos, dentro del margen de acopios y adelantos.
    expect(filas.find((f) => f.codigo === "1")!.avisa).toBe(false);
    // 90 contra 50: cuarenta puntos, eso si.
    expect(filas.find((f) => f.codigo === "2")!.avisa).toBe(true);
  });

  it("suma por la cadena real de padres, con niveles intermedios ausentes", () => {
    // En los presupuestos de verdad faltan filas: "1.2.1" existe sin que
    // exista "1.2". Cortar el codigo por los puntos perderia ese importe.
    const filas = cruceFisicoEconomico(
      [p("1", null), p("1.1", "100.00"), p("1.2.1", "50.00")],
      new Map(),
      new Map(),
    );

    expect(filas).toHaveLength(1);
    expect(filas[0]!.presupuesto).toBe("150.00");
  });

  it("cada capitulo raiz sale por separado y en orden", () => {
    const filas = cruceFisicoEconomico(
      [
        p("2", null, "ESTRUCTURAS"),
        p("2.1", "200.00"),
        p("1", null, "PRELIMINARES"),
        p("1.1", "100.00"),
        p("10", null, "VARIOS"),
        p("10.1", "300.00"),
      ],
      new Map(),
      new Map(),
    );

    // Orden natural: 10 va detras de 2, no entre 1 y 2.
    expect(filas.map((f) => f.codigo)).toEqual(["1", "2", "10"]);
    expect(filas.map((f) => f.presupuesto)).toEqual(["100.00", "200.00", "300.00"]);
  });
});
