import { describe, it, expect } from "vitest";
import { metricasEvm, valorDeAvance } from "./evm";

describe("metricasEvm", () => {
  it("calcula plazo y costo cuando estan las tres cifras", () => {
    // BAC 100k, planeado 40k, ganado 35k, costado 30k.
    const m = metricasEvm({ bac: "100000.00", pv: "40000.00", ev: "35000.00", ac: "30000.00" });
    expect(m.sv).toBe("-5000.00"); // 35 - 40: atrasado
    expect(m.cv).toBe("5000.00"); // 35 - 30: por debajo del costo
    expect(m.spi).toBeCloseTo(0.875);
    expect(m.cpi).toBeCloseTo(35000 / 30000);
    // EAC = BAC x AC/EV = 100000 x 30000/35000 = 85714.29
    expect(m.eac).toBe("85714.29");
    expect(m.vac).toBe("14285.71"); // BAC - EAC, sobraria
    expect(m.avance).toBeCloseTo(35);
  });

  it("sin AC se queda en la mitad de plazo, sin costo", () => {
    const m = metricasEvm({ bac: "100000.00", pv: "40000.00", ev: "35000.00", ac: null });
    expect(m.spi).toBeCloseTo(0.875);
    expect(m.sv).toBe("-5000.00");
    expect(m.cv).toBeNull();
    expect(m.cpi).toBeNull();
    expect(m.eac).toBeNull();
    expect(m.vac).toBeNull();
  });

  it("SPI null si no hay nada planeado (no divide por cero)", () => {
    const m = metricasEvm({ bac: "100000.00", pv: "0.00", ev: "0.00", ac: "0.00" });
    expect(m.spi).toBeNull();
  });

  it("CPI null si aun no se ha gastado nada", () => {
    const m = metricasEvm({ bac: "100000.00", pv: "10000.00", ev: "8000.00", ac: "0.00" });
    expect(m.cpi).toBeNull();
    expect(m.eac).toBeNull();
  });

  it("EAC null si no hay avance todavia", () => {
    const m = metricasEvm({ bac: "100000.00", pv: "5000.00", ev: "0.00", ac: "2000.00" });
    expect(m.eac).toBeNull();
    // CPI si existe (0/2000 = 0) — un costo sin nada ganado es CPI cero.
    expect(m.cpi).toBe(0);
  });

  it("adelantado y por debajo de costo dan indices > 1", () => {
    const m = metricasEvm({ bac: "100000.00", pv: "30000.00", ev: "35000.00", ac: "32000.00" });
    expect(m.spi).toBeGreaterThan(1);
    expect(m.cpi).toBeGreaterThan(1);
    expect(m.sv).toBe("5000.00");
  });
});

describe("valorDeAvance", () => {
  it("es el presupuesto por el porcentaje", () => {
    expect(valorDeAvance("100000.00", 35)).toBe("35000.00");
  });

  it("exacto con porcentajes de coma", () => {
    // 10.85% de 735255.61 = 79775.2...
    expect(valorDeAvance("735255.61", 10.85)).toBe("79775.23");
  });

  it("cero con avance cero o negativo", () => {
    expect(valorDeAvance("100000.00", 0)).toBe("0.00");
    expect(valorDeAvance("100000.00", -5)).toBe("0.00");
  });
});
