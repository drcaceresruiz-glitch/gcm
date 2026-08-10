import { describe, it, expect } from "vitest";
import {
  ventanaLookahead,
  estadoDeTarea,
  confiabilidad,
  FLUJOS_RESTRICCION,
  TIPOS_RESTRICCION,
} from "./lookahead";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("ventanaLookahead", () => {
  it("por defecto abarca 3 semanas (21 dias) desde hoy", () => {
    const { desde, hasta } = ventanaLookahead(d("2026-08-10"));
    expect(desde).toEqual(d("2026-08-10"));
    expect(hasta).toEqual(d("2026-08-31"));
  });

  it("respeta el numero de semanas indicado", () => {
    const { hasta } = ventanaLookahead(d("2026-08-10"), 6);
    expect(hasta).toEqual(d("2026-09-21"));
  });
});

describe("FLUJOS_RESTRICCION", () => {
  it("son los 7 flujos del Last Planner, sin repetir", () => {
    expect(FLUJOS_RESTRICCION).toHaveLength(7);
    expect(new Set(TIPOS_RESTRICCION).size).toBe(7);
  });
});

describe("estadoDeTarea", () => {
  it("sin restricciones es PENDIENTE (no hay analisis todavia)", () => {
    expect(estadoDeTarea([])).toBe("PENDIENTE");
  });

  it("con alguna sin resolver es PENDIENTE", () => {
    expect(
      estadoDeTarea([{ resuelta: true }, { resuelta: false }]),
    ).toBe("PENDIENTE");
  });

  it("con todas resueltas es LISTO", () => {
    expect(
      estadoDeTarea([{ resuelta: true }, { resuelta: true }]),
    ).toBe("LISTO");
  });
});

describe("confiabilidad", () => {
  it("cuenta las LISTAS y saca el porcentaje entero", () => {
    const r = confiabilidad([
      { estado: "LISTO" },
      { estado: "LISTO" },
      { estado: "PENDIENTE" },
      { estado: "BLOQUEADO" },
    ]);
    expect(r).toEqual({ listas: 2, total: 4, porcentaje: 50 });
  });

  it("ventana vacia: 0% sin dividir por cero", () => {
    expect(confiabilidad([])).toEqual({ listas: 0, total: 0, porcentaje: 0 });
  });
});
