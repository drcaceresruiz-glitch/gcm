import { describe, it, expect } from "vitest";
import {
  ventanaLookahead,
  estadoDeTarea,
  confiabilidad,
  normalizarSemanas,
  FLUJOS_RESTRICCION,
  TIPOS_RESTRICCION,
  SEMANAS_POR_DEFECTO,
  SEMANAS_MINIMO,
  SEMANAS_MAXIMO,
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

describe("normalizarSemanas", () => {
  it("sin valor usa el defecto, que sigue siendo 3", () => {
    // Cambiar el defecto le movería la ventana a todo el mundo en silencio.
    expect(SEMANAS_POR_DEFECTO).toBe(3);
    expect(normalizarSemanas(undefined)).toBe(3);
    expect(normalizarSemanas(null)).toBe(3);
    expect(normalizarSemanas("")).toBe(3);
  });

  it("acepta el numero venga como texto o como numero", () => {
    expect(normalizarSemanas("6")).toBe(6);
    expect(normalizarSemanas(6)).toBe(6);
  });

  it("lo que no es un numero cae al defecto en vez de fallar", () => {
    // Llega de la URL: una ventana rara no puede tumbar la pantalla.
    expect(normalizarSemanas("seis")).toBe(3);
    expect(normalizarSemanas("<script>")).toBe(3);
  });

  it("recorta al rango en vez de rechazar", () => {
    expect(normalizarSemanas(0)).toBe(SEMANAS_MINIMO);
    expect(normalizarSemanas(-4)).toBe(SEMANAS_MINIMO);
    expect(normalizarSemanas(99)).toBe(SEMANAS_MAXIMO);
  });

  it("trunca los decimales: media semana no significa nada aqui", () => {
    expect(normalizarSemanas("4.7")).toBe(4);
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
