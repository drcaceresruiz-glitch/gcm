import { describe, it, expect } from "vitest";
import {
  ppcDePlan,
  paretoCausas,
  tendenciaPpc,
  proximoCorte,
  type CompromisoEvaluado,
} from "./plan-semanal";

const dc = (s: string) => new Date(`${s}T00:00:00Z`);

describe("ppcDePlan", () => {
  it("cumplidos entre el total, en %", () => {
    const c: CompromisoEvaluado[] = [
      { cumplido: true, causa: null },
      { cumplido: true, causa: null },
      { cumplido: true, causa: null },
      { cumplido: false, causa: "MATERIALES" },
    ];
    const r = ppcDePlan(c);
    expect(r.total).toBe(4);
    expect(r.cumplidos).toBe(3);
    expect(r.ppc).toBeCloseTo(75);
  });

  it("un compromiso sin evaluar cuenta como no cumplido", () => {
    const c: CompromisoEvaluado[] = [
      { cumplido: true, causa: null },
      { cumplido: null, causa: null },
    ];
    expect(ppcDePlan(c).ppc).toBeCloseTo(50);
  });

  it("sin compromisos, PPC null (no hay nada que medir)", () => {
    expect(ppcDePlan([]).ppc).toBeNull();
  });
});

describe("paretoCausas", () => {
  it("cuenta solo los no cumplidos con causa, de mayor a menor", () => {
    const c: CompromisoEvaluado[] = [
      { cumplido: false, causa: "MATERIALES" },
      { cumplido: false, causa: "MATERIALES" },
      { cumplido: false, causa: "CLIMA" },
      { cumplido: true, causa: null },
      { cumplido: false, causa: null }, // sin causa: no aporta
    ];
    const p = paretoCausas(c);
    expect(p).toEqual([
      { causa: "MATERIALES", conteo: 2 },
      { causa: "CLIMA", conteo: 1 },
    ]);
  });

  it("vacio si no hay fallos con causa", () => {
    expect(paretoCausas([{ cumplido: true, causa: null }])).toEqual([]);
  });
});

describe("tendenciaPpc", () => {
  it("ordena por fecha y descarta las semanas sin PPC", () => {
    const serie = tendenciaPpc([
      { fecha: dc("2026-08-14"), ppc: 80 },
      { fecha: dc("2026-08-07"), ppc: 60 },
      { fecha: dc("2026-08-21"), ppc: null },
    ]);
    expect(serie.map((p) => p.ppc)).toEqual([60, 80]);
  });
});

describe("proximoCorte", () => {
  it("devuelve hoy si hoy ya es el dia de corte", () => {
    const hoy = dc("2026-08-07");
    const dia = hoy.getUTCDay() === 0 ? 7 : hoy.getUTCDay();
    expect(proximoCorte(dia, hoy)).toEqual(hoy);
  });

  it("salta al proximo dia de corte", () => {
    const hoy = dc("2026-08-03");
    const dia = hoy.getUTCDay() === 0 ? 7 : hoy.getUTCDay();
    const siguiente = dia === 7 ? 1 : dia + 1;
    expect(proximoCorte(siguiente, hoy)).toEqual(dc("2026-08-04"));
  });
});
