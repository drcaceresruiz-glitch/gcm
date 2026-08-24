import { describe, expect, it } from "vitest";

import { ritmoPorTramos, type TareaDelRitmo } from "./ritmo-de-obra";
import type { AvanceReportado } from "@/lib/cronograma";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const t = (
  uid: number,
  capitulo: string,
  duracionDias = "10",
): TareaDelRitmo => ({
  uid,
  capitulo,
  duracionDias,
  esResumen: false,
  porcentajePlaneado: "0.00",
  porcentajeArchivo: "0.00",
});

const a = (
  uid: number,
  fecha: string,
  porcentaje: string,
  createdAt = `${fecha}T08:00:00.000Z`,
): AvanceReportado => ({
  uid,
  fecha: d(fecha),
  porcentaje,
  createdAt: new Date(createdAt),
  reportadoPor: "Residente",
  nota: null,
});

const SEMANAS = [d("2026-08-01"), d("2026-08-08"), d("2026-08-15")];

describe("ritmoPorTramos", () => {
  it("reparte el avance entre los tramos en que se gano", () => {
    const r = ritmoPorTramos(
      [t(1, "ESTRUCTURAS")],
      [a(1, "2026-08-05", "40.00"), a(1, "2026-08-12", "70.00")],
      SEMANAS,
    );

    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ ganado: 40, acumulado: 40 });
    expect(r[1]).toMatchObject({ ganado: 30, acumulado: 70 });
  });

  it("SEPARA lo que se movio de lo que aporto a la obra", () => {
    // Un capitulo corto que se dispara y uno largo que no se mueve. El corto
    // gana 100 puntos SUYOS, pero la obra solo avanza los que le tocan por
    // peso. Confundir las dos cifras haria leer «la obra avanzo 100».
    const r = ritmoPorTramos(
      [t(1, "CARTELES", "1"), t(2, "ESTRUCTURAS", "99")],
      [a(1, "2026-08-05", "100.00")],
      [SEMANAS[0]!, SEMANAS[1]!],
    );

    const carteles = r[0]!.capitulos.find((c) => c.capitulo === "CARTELES")!;
    expect(carteles.ganado).toBe(100);
    expect(carteles.aporte).toBe(1);
    // Y el total del tramo es el aporte, no lo que se movio.
    expect(r[0]!.ganado).toBe(1);
  });

  it("el total del tramo es EXACTAMENTE la suma de los aportes", () => {
    // Si el total se recalculara aparte, la barra apilada dejaria un hueco de
    // redondeo que nadie sabe explicar.
    const r = ritmoPorTramos(
      [t(1, "A", "3"), t(2, "B", "7"), t(3, "C", "11")],
      [
        a(1, "2026-08-04", "33.00"),
        a(2, "2026-08-05", "66.00"),
        a(3, "2026-08-06", "99.00"),
      ],
      [SEMANAS[0]!, SEMANAS[1]!],
    );

    const suma = r[0]!.capitulos.reduce((s, c) => s + c.aporte, 0);
    expect(r[0]!.ganado).toBeCloseTo(suma, 10);
  });

  it("UN SEGUNDO PARTE EL MISMO DIA MANDA, Y NO SE CUENTA DOS VECES", () => {
    // `AvanceTarea` solo crece y no tiene unicidad por tarea y dia: el
    // residente corrige por la tarde lo que dijo por la manana. El desempate
    // es por `createdAt` y va en la LECTURA.
    const r = ritmoPorTramos(
      [t(1, "ESTRUCTURAS")],
      [
        a(1, "2026-08-05", "40.00", "2026-08-05T08:00:00.000Z"),
        a(1, "2026-08-05", "25.00", "2026-08-05T18:00:00.000Z"),
      ],
      [SEMANAS[0]!, SEMANAS[1]!],
    );

    // 25, el de la tarde. Ni 40 ni 65.
    expect(r[0]!.ganado).toBe(25);
  });

  it("ordena los capitulos por lo que aportaron", () => {
    const r = ritmoPorTramos(
      [t(1, "LENTO"), t(2, "RAPIDO")],
      [a(1, "2026-08-05", "10.00"), a(2, "2026-08-05", "80.00")],
      [SEMANAS[0]!, SEMANAS[1]!],
    );

    expect(r[0]!.capitulos.map((c) => c.capitulo)).toEqual(["RAPIDO", "LENTO"]);
  });

  it("un tramo sin partes se ve como parada, no como hueco", () => {
    const r = ritmoPorTramos(
      [t(1, "ESTRUCTURAS")],
      [a(1, "2026-08-05", "40.00")],
      SEMANAS,
    );

    // La segunda semana existe, con cero ganado y el acumulado intacto.
    expect(r[1]).toMatchObject({ ganado: 0, acumulado: 40 });
  });

  it("no cuenta los resumenes", () => {
    // Su porcentaje es el de sus hijas: contarlos seria sumar dos veces el
    // mismo trabajo.
    const r = ritmoPorTramos(
      [{ ...t(9, "ESTRUCTURAS"), esResumen: true }, t(1, "ESTRUCTURAS")],
      [a(9, "2026-08-05", "100.00"), a(1, "2026-08-05", "50.00")],
      [SEMANAS[0]!, SEMANAS[1]!],
    );

    expect(r[0]!.ganado).toBe(50);
  });

  it("sin al menos dos fechas no hay tramo que medir", () => {
    expect(ritmoPorTramos([t(1, "A")], [], [SEMANAS[0]!])).toEqual([]);
  });
});

/**
 * EL RITMO SE MIDE CON LA MISMA VARA QUE LA CURVA DE ESA OBRA.
 *
 * Hasta el 24 de agosto de 2026 el ritmo pesaba siempre por duracion mientras
 * la curva S de la misma obra ya podia pesar por dinero. Dos pantallas
 * hablando del mismo avance con dos varas es el modo de fallo que este
 * proyecto lleva dias quitando de en medio.
 */
describe("el peso llega de fuera, no se decide aqui", () => {
  /// Dos tareas que duran lo mismo y valen muy distinto.
  const BARATA = t(1, "ACABADOS", "10");
  const CARA = t(2, "ESTRUCTURAS", "10");

  /// Solo avanza la CARA. Por duracion pesa la mitad; por dinero, casi todo.
  const AVANCES = [a(2, "2026-08-08", "100.00")];

  const porDinero = (x: TareaDelRitmo) =>
    x.uid === 2 ? "90000.0000" : "10000.0000";

  it("por defecto pesa por duracion, como siempre", () => {
    const r = ritmoPorTramos([BARATA, CARA], AVANCES, SEMANAS);
    // Dos tareas iguales en duracion, una al 100 %: la mitad de la obra.
    expect(r[0]?.acumulado).toBeCloseTo(50, 5);
  });

  it("con el peso por dinero, la tarea cara manda", () => {
    const r = ritmoPorTramos([BARATA, CARA], AVANCES, SEMANAS, porDinero);
    // La cara es el 90 % del dinero y esta al 100 %.
    expect(r[0]?.acumulado).toBeCloseTo(90, 5);
  });

  /**
   * Y EL REPARTO POR CAPITULOS TAMBIEN. Si el avance se pesara por dinero pero
   * los capitulos siguieran repartiendose por duracion, la suma de lo que
   * aporta cada capitulo dejaria de dar el avance de la obra.
   */
  it("los capitulos se reparten con la misma vara", () => {
    const r = ritmoPorTramos([BARATA, CARA], AVANCES, SEMANAS, porDinero);
    const aporte = r[0]?.capitulos.reduce((s, c) => s + c.aporte, 0) ?? 0;

    expect(aporte).toBeCloseTo(r[0]?.ganado ?? -1, 5);
    const estructuras = r[0]?.capitulos.find((c) => c.capitulo === "ESTRUCTURAS");
    // ESTRUCTURAS es el 90 % del dinero: se lleva casi todo el ganado.
    expect(estructuras?.aporte).toBeCloseTo(90, 5);
  });
});
