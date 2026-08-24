import { describe, it, expect } from "vitest";
import {
  importeDeFrente,
  avanceVigente,
  importeValorizado,
  resumenEncargo,
  coberturaObra,
  repartirContratado,
  comprometidoPorPartida,
  desgloseComprometido,
  type Valorizacion,
} from "./encargos";

function val(fecha: string, porcentaje: string, hora = "12:00:00"): Valorizacion {
  return {
    fecha: new Date(`${fecha}T00:00:00Z`),
    porcentaje,
    createdAt: new Date(`${fecha}T${hora}Z`),
  };
}

describe("importeDeFrente", () => {
  it("suma el parcial entero cuando la fraccion es 100", () => {
    const r = importeDeFrente([
      { parcial: "10000.00", fraccion: "100" },
      { parcial: "2500.50", fraccion: "100" },
    ]);
    expect(r).toBe("12500.50");
  });

  it("aplica la fraccion cuando una partida se reparte", () => {
    // 60% de 10.000 = 6.000. Es el frente de un encargo sobre una partida
    // compartida con otro proveedor.
    const r = importeDeFrente([{ parcial: "10000.00", fraccion: "60" }]);
    expect(r).toBe("6000.00");
  });

  it("es exacto con fracciones que darian coma flotante fea", () => {
    // 33,333% de 100 = 33,333 -> 33.33 a dos decimales. Sin aritmetica exacta
    // esto arrastraria el clasico 33.32999999.
    const r = importeDeFrente([{ parcial: "100.00", fraccion: "33.333" }]);
    expect(r).toBe("33.33");
  });

  it("da cero sin partidas", () => {
    expect(importeDeFrente([])).toBe("0.00");
  });
});

describe("avanceVigente", () => {
  it("toma la valorizacion de fecha mas reciente", () => {
    const r = avanceVigente([
      val("2026-08-01", "20"),
      val("2026-08-15", "45"),
      val("2026-08-08", "30"),
    ]);
    expect(r?.porcentaje).toBe("45");
  });

  it("a igualdad de fecha manda la ultima registrada", () => {
    const r = avanceVigente([
      val("2026-08-15", "45", "09:00:00"),
      val("2026-08-15", "48", "18:00:00"),
    ]);
    expect(r?.porcentaje).toBe("48");
  });

  it("null sin valorizaciones", () => {
    expect(avanceVigente([])).toBeNull();
  });
});

describe("importeValorizado", () => {
  it("es el monto contratado por el porcentaje", () => {
    // 45% de 50.000 = 22.500.
    expect(importeValorizado("50000.00", "45")).toBe("22500.00");
  });

  it("cero por defecto con porcentaje cero", () => {
    expect(importeValorizado("50000.00", "0")).toBe("0.00");
  });
});

describe("resumenEncargo", () => {
  it("compara contratado, presupuesto y comprometido sin mezclarlos", () => {
    const r = resumenEncargo({
      montoContratado: "50000.00",
      presupuestoFrente: "48000.00",
      comprometido: "30000.00",
      avancePorcentaje: "45",
    });

    // El proveedor cobra 2.000 mas de lo que costaba en tu presupuesto.
    expect(r.contraPresupuesto).toBe("2000.00");
    // Quedan 20.000 del contrato por formalizar en ordenes.
    expect(r.porComprometer).toBe("20000.00");
    expect(r.excesoComprometido).toBe("0.00");
    // Ha ejecutado el 45% de 50.000.
    expect(r.valorizado).toBe("22500.00");
  });

  it("reporta el exceso cuando las ordenes pasan del contrato", () => {
    const r = resumenEncargo({
      montoContratado: "50000.00",
      presupuestoFrente: "48000.00",
      comprometido: "55000.00",
      avancePorcentaje: null,
    });

    // No queda nada por comprometer, y el exceso se reporta aparte en vez de
    // dar un "por comprometer" negativo.
    expect(r.porComprometer).toBe("0.00");
    expect(r.excesoComprometido).toBe("5000.00");
    // Sin valorizar todavia: importe cero.
    expect(r.valorizado).toBe("0.00");
    expect(r.avancePorcentaje).toBeNull();
  });

  it("contra presupuesto negativo cuando el proveedor va por debajo", () => {
    const r = resumenEncargo({
      montoContratado: "40000.00",
      presupuestoFrente: "48000.00",
      comprometido: "0.00",
      avancePorcentaje: null,
    });
    expect(r.contraPresupuesto).toBe("-8000.00");
  });
});

describe("coberturaObra", () => {
  it("es la parte del presupuesto ya repartida", () => {
    const r = coberturaObra("100000.00", "60000.00");
    expect(r.porcentaje).toBeCloseTo(60);
    expect(r.sinAsignar).toBe("40000.00");
  });

  it("cero cuando la obra no tiene presupuesto, sin dividir por cero", () => {
    const r = coberturaObra("0.00", "0.00");
    expect(r.porcentaje).toBe(0);
    expect(r.sinAsignar).toBe("0.00");
  });
});

describe("repartirContratado", () => {
  it("reparte proporcional al peso parcial x fraccion", () => {
    // Pesos 10.000 y 5.000: dos tercios y un tercio de 9.000.
    const r = repartirContratado("9000.00", [
      { clave: "a", parcial: "10000.00", fraccion: "100" },
      { clave: "b", parcial: "10000.00", fraccion: "50" },
    ]);
    expect(r).toEqual([
      { clave: "a", importe: "6000.00" },
      { clave: "b", importe: "3000.00" },
    ]);
  });

  /**
   * LA INVARIANTE del modulo: las partes suman el monto EXACTO. 100 entre
   * tres pesos iguales da 33,33 tres veces y un centimo en el aire; ese
   * centimo va a una partida, no al limbo. Perderlo aqui es como los
   * capitulos empiezan a no cuadrar sin dar error.
   */
  it("no pierde ni un centimo al redondear", () => {
    const r = repartirContratado("100.00", [
      { clave: "a", parcial: "1000.00", fraccion: "100" },
      { clave: "b", parcial: "1000.00", fraccion: "100" },
      { clave: "c", parcial: "1000.00", fraccion: "100" },
    ]);
    const suma = r.reduce((acc, p) => acc + Number(p.importe), 0);
    expect(suma.toFixed(2)).toBe("100.00");
    // Y el residuo cayo en una sola fila, no repartido a ojo.
    expect(r.map((p) => p.importe).sort()).toEqual(["33.33", "33.33", "33.34"]);
  });

  it("con pesos que no suman nada reparte a partes iguales", () => {
    // Partidas aun sin costear: parcial 0. El monto no puede quedar invisible.
    const r = repartirContratado("300.00", [
      { clave: "a", parcial: "0", fraccion: "100" },
      { clave: "b", parcial: "0", fraccion: "100" },
    ]);
    expect(r).toEqual([
      { clave: "a", importe: "150.00" },
      { clave: "b", importe: "150.00" },
    ]);
  });

  /**
   * Un parcial negativo existe de verdad: el descuento comercial de CRIOCORD
   * es una partida en -26.821,60. El reparto lo respeta con su signo y la
   * suma sigue siendo el monto.
   */
  it("respeta un parcial negativo sin romper la suma", () => {
    const r = repartirContratado("8000.00", [
      { clave: "obra", parcial: "10000.00", fraccion: "100" },
      { clave: "descuento", parcial: "-2000.00", fraccion: "100" },
    ]);
    expect(r).toEqual([
      { clave: "obra", importe: "10000.00" },
      { clave: "descuento", importe: "-2000.00" },
    ]);
  });

  it("sin partidas no hay filas", () => {
    expect(repartirContratado("5000.00", [])).toEqual([]);
  });
});

describe("comprometidoPorPartida", () => {
  it("funde encargos repartidos y ordenes sueltas por partida", () => {
    const r = comprometidoPorPartida(
      [
        {
          montoVigente: "9000.00",
          partidas: [
            { clave: "a", parcial: "10000.00", fraccion: "100" },
            { clave: "b", parcial: "10000.00", fraccion: "50" },
          ],
        },
      ],
      [
        { clave: "a", importe: "500.00" },
        { clave: "c", importe: "1200.00" },
      ],
    );

    expect(r.get("a")).toBe("6500.00");
    expect(r.get("b")).toBe("3000.00");
    expect(r.get("c")).toBe("1200.00");
  });

  it("dos encargos sobre la misma partida se suman", () => {
    // Una partida repartida entre dos proveedores al 50/50.
    const r = comprometidoPorPartida(
      [
        {
          montoVigente: "4000.00",
          partidas: [{ clave: "a", parcial: "10000.00", fraccion: "50" }],
        },
        {
          montoVigente: "5500.00",
          partidas: [{ clave: "a", parcial: "10000.00", fraccion: "50" }],
        },
      ],
      [],
    );
    expect(r.get("a")).toBe("9500.00");
  });
});

describe("desgloseComprometido", () => {
  it("separa lo de encargos de lo suelto y suma el total", () => {
    const r = desgloseComprometido(["9000.00", "1000.00"], ["500.00"]);
    expect(r).toEqual({
      deEncargos: "10000.00",
      deOrdenesSueltas: "500.00",
      total: "10500.00",
    });
  });

  /**
   * El total sale de los MONTOS, no del reparto: un encargo sin partidas no
   * pinta ninguna fila, pero su dinero esta igual de comprometido. La
   * diferencia entre el total y la suma de filas se ensena, no se pierde.
   */
  it("un encargo sin partidas cuenta en el total aunque no tenga filas", () => {
    const filas = comprometidoPorPartida(
      [{ montoVigente: "7000.00", partidas: [] }],
      [],
    );
    const totales = desgloseComprometido(["7000.00"], []);

    expect(filas.size).toBe(0);
    expect(totales.total).toBe("7000.00");
  });

  it("sin nada, todo a cero", () => {
    expect(desgloseComprometido([], [])).toEqual({
      deEncargos: "0.00",
      deOrdenesSueltas: "0.00",
      total: "0.00",
    });
  });
});
