import { describe, it, expect } from "vitest";
import {
  metricasEvm,
  valorDeAvance,
  hayBaseParaProyectar,
  textoSinCosto,
  AVANCE_MINIMO_PROYECCION,
} from "./evm";

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
    expect(m.motivoSinCosto).toBe("sin_permiso");
  });

  it("con base para proyectar no hay motivo que explicar", () => {
    const m = metricasEvm({ bac: "100000.00", pv: "40000.00", ev: "35000.00", ac: "30000.00" });
    expect(m.motivoSinCosto).toBeNull();
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

  it("sin nada ganado no hay EAC ni CPI", () => {
    const m = metricasEvm({ bac: "100000.00", pv: "5000.00", ev: "0.00", ac: "2000.00" });
    expect(m.eac).toBeNull();
    // Antes se devolvia CPI 0 (0/2000). Un cero se lee como "lo estas haciendo
    // infinitamente mal", cuando lo cierto es que aun no hay nada que medir.
    expect(m.cpi).toBeNull();
    expect(m.motivoSinCosto).toBe("sin_gasto");
  });

  it("adelantado y por debajo de costo dan indices > 1", () => {
    const m = metricasEvm({ bac: "100000.00", pv: "30000.00", ev: "35000.00", ac: "32000.00" });
    expect(m.spi).toBeGreaterThan(1);
    expect(m.cpi).toBeGreaterThan(1);
    expect(m.sv).toBe("5000.00");
  });
});

/**
 * El caso que rompio la pantalla en CRIOCORD: 8% de avance y una sola orden
 * aprobada de 11 mil frente a 62 mil ganados. La formula daba CPI 5,6 y un VAC
 * de +634 mil —"te vas a ahorrar el 82% del presupuesto"—.
 */
describe("metricasEvm con poco costo registrado (caso CRIOCORD)", () => {
  const criocord = {
    bac: "772000.00",
    pv: "95000.00",
    ev: "62000.00",
    ac: "11000.00",
  };

  it("NO anuncia un ahorro fantasma", () => {
    const m = metricasEvm(criocord);
    expect(m.vac).toBeNull();
    expect(m.eac).toBeNull();
    expect(m.cpi).toBeNull();
  });

  it("deja el plazo intacto: el SPI no depende del costo", () => {
    const m = metricasEvm(criocord);
    expect(m.spi).toBeCloseTo(62000 / 95000);
    expect(m.sv).toBe("-33000.00");
    expect(m.avance).toBeCloseTo((62000 / 772000) * 100);
  });

  it("el CV si se muestra: es un hecho de hoy, no una proyeccion", () => {
    const m = metricasEvm(criocord);
    expect(m.cv).toBe("51000.00");
    expect(m.ac).toBe("11000.00");
  });

  it("explica por que faltan las cifras", () => {
    const m = metricasEvm(criocord);
    expect(m.motivoSinCosto).toBe("avance_insuficiente");
    expect(textoSinCosto("avance_insuficiente")).toContain(
      String(AVANCE_MINIMO_PROYECCION),
    );
  });
});

describe("hayBaseParaProyectar", () => {
  it("sin AC visible es falta de permiso, no falta de gasto", () => {
    expect(hayBaseParaProyectar(null, "50000.00", "100000.00")).toEqual({
      ok: false,
      motivo: "sin_permiso",
    });
  });

  it("AC cero es sin gasto", () => {
    expect(hayBaseParaProyectar("0.00", "50000.00", "100000.00")).toEqual({
      ok: false,
      motivo: "sin_gasto",
    });
  });

  it("por debajo del avance minimo no se proyecta aunque el costo cuadre", () => {
    // 10% de avance, AC = EV: el costo respalda perfectamente lo ganado, pero
    // con tan poca obra un solo pedido mueve el indice entero.
    const r = hayBaseParaProyectar("10000.00", "10000.00", "100000.00");
    expect(r).toEqual({ ok: false, motivo: "avance_insuficiente" });
  });

  it("con avance de sobra pero costo rezagado tampoco", () => {
    // 40% de avance y solo 30% de lo ganado respaldado en ordenes.
    const r = hayBaseParaProyectar("12000.00", "40000.00", "100000.00");
    expect(r).toEqual({ ok: false, motivo: "costo_rezagado" });
  });

  it("justo en el limite del respaldo (la mitad) ya vale", () => {
    expect(hayBaseParaProyectar("20000.00", "40000.00", "100000.00")).toEqual({
      ok: true,
    });
  });

  it("justo en el avance minimo ya vale", () => {
    const ev = (100000 * AVANCE_MINIMO_PROYECCION) / 100;
    expect(hayBaseParaProyectar(String(ev), String(ev), "100000.00")).toEqual({
      ok: true,
    });
  });

  it("gastar de mas nunca bloquea: ese es justo el aviso que hay que dar", () => {
    // AC muy por encima del EV = obra cara. No hay razon para ocultarlo.
    expect(hayBaseParaProyectar("90000.00", "40000.00", "100000.00")).toEqual({
      ok: true,
    });
  });
});

describe("textoSinCosto", () => {
  it("da un motivo legible para cada caso", () => {
    for (const motivo of [
      "sin_permiso",
      "sin_gasto",
      "avance_insuficiente",
      "costo_rezagado",
    ] as const) {
      expect(textoSinCosto(motivo).length).toBeGreaterThan(20);
    }
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
