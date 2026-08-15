import { describe, expect, it } from "vitest";
import {
  MUESTRA_PALETA,
  PALETAS,
  paletaValida,
  temaEfectivo,
  temaValido,
} from "@/lib/tema";

describe("temaValido", () => {
  it("acepta los tres temas", () => {
    expect(temaValido("claro")).toBe("claro");
    expect(temaValido("oscuro")).toBe("oscuro");
    expect(temaValido("auto")).toBe("auto");
  });

  /** Lo guardado lo escribe el navegador y alguien puede haberlo tocado. */
  it("cae en claro ante cualquier otra cosa", () => {
    expect(temaValido(null)).toBe("claro");
    expect(temaValido(undefined)).toBe("claro");
    expect(temaValido("")).toBe("claro");
    expect(temaValido("azul")).toBe("claro");
  });
});

describe("paletaValida", () => {
  it("acepta las paletas declaradas", () => {
    expect(paletaValida("ambar")).toBe("ambar");
    expect(paletaValida("grafito")).toBe("grafito");
    expect(paletaValida("vino")).toBe("vino");
    expect(paletaValida("marino")).toBe("marino");
  });

  it("cae en teal ante cualquier otra cosa", () => {
    expect(paletaValida(null)).toBe("teal");
    expect(paletaValida("fucsia")).toBe("teal");
  });
});

describe("temaEfectivo", () => {
  /** `auto` no debe llegar nunca al atributo: el CSS solo conoce dos casos. */
  it("resuelve auto contra la preferencia del sistema", () => {
    expect(temaEfectivo("auto", true)).toBe("oscuro");
    expect(temaEfectivo("auto", false)).toBe("claro");
  });

  it("una eleccion explicita ignora al sistema", () => {
    expect(temaEfectivo("claro", true)).toBe("claro");
    expect(temaEfectivo("oscuro", false)).toBe("oscuro");
  });
});

describe("muestras del selector", () => {
  /**
   * No es una cifra tecnica: es la promesa hecha al producto de que cada
   * empresa encuentra una identidad propia entre las opciones. Quitar una
   * paleta por limpieza tiene que romper algo.
   */
  it("hay al menos siete paletas para elegir", () => {
    expect(PALETAS.length).toBeGreaterThanOrEqual(7);
  });

  /**
   * Si faltara una muestra, su boton saldria transparente y la fila
   * aparentaria menos paletas de las que hay.
   */
  it("cada paleta tiene su color de muestra", () => {
    for (const p of PALETAS) {
      expect(MUESTRA_PALETA[p]).toMatch(/^oklch\(/);
    }
  });

  /** Dos muestras iguales harian indistinguibles dos opciones distintas. */
  it("no hay dos muestras repetidas", () => {
    const vistas = Object.values(MUESTRA_PALETA);
    expect(new Set(vistas).size).toBe(vistas.length);
  });
});
