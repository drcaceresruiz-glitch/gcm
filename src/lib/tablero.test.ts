import { describe, it, expect } from "vitest";
import {
  MODULOS,
  MODULOS_POR_DEFECTO,
  modulosValidos,
  semaforoIndice,
  semaforoDesfase,
} from "./tablero";

describe("modulosValidos", () => {
  it("sin cookie los ensena todos", () => {
    expect(modulosValidos(undefined)).toEqual([...MODULOS_POR_DEFECTO]);
    expect(modulosValidos(null)).toEqual([...MODULOS_POR_DEFECTO]);
  });

  it("la cadena vacia es 'ninguno apagado', no 'ninguno encendido'", () => {
    expect(modulosValidos("")).toEqual([...MODULOS_POR_DEFECTO]);
  });

  it("quita los apagados y deja el resto", () => {
    const visibles = modulosValidos("plazo,ordenes");
    expect(visibles).not.toContain("plazo");
    expect(visibles).not.toContain("ordenes");
    expect(visibles).toContain("avance");
    expect(visibles).toHaveLength(MODULOS.length - 2);
  });

  it("un modulo NUEVO aparece encendido para quien ya tenia preferencia", () => {
    // Este es el motivo de guardar los apagados. Con la lista de encendidos,
    // una cookie escrita antes de que existiera el PPC lo dejaba fuera para
    // siempre: no estaba nombrada en ella.
    const apagoUnoHaceMeses = "plazo";
    expect(modulosValidos(apagoUnoHaceMeses)).toContain("ppc");
    expect(modulosValidos(apagoUnoHaceMeses)).toContain("confiabilidad");
    expect(modulosValidos(apagoUnoHaceMeses)).toContain("causas");
  });

  it("apagarlos todos si se puede representar", () => {
    const todas = MODULOS.map((m) => m.clave).join(",");
    expect(modulosValidos(todas)).toEqual([]);
  });

  it("una clave que ya no existe en el catalogo no estorba", () => {
    // Se filtra el catalogo, asi que un nombre viejo simplemente no aparta
    // nada. No hace falta migrar la cookie al renombrar o retirar un modulo.
    expect(modulosValidos("modulo-de-otra-version")).toEqual([
      ...MODULOS_POR_DEFECTO,
    ]);
  });

  it("respeta el orden del catalogo, no el de la cookie", () => {
    const visibles = modulosValidos("avance");
    const esperado = MODULOS.filter((m) => m.clave !== "avance").map(
      (m) => m.clave,
    );
    expect(visibles).toEqual(esperado);
  });

  it("tolera espacios alrededor de las claves", () => {
    expect(modulosValidos(" plazo , ordenes ")).not.toContain("plazo");
  });
});

describe("semaforoIndice", () => {
  it("ir justo al plan es ambar, no verde", () => {
    expect(semaforoIndice(1)).toBe("ambar");
    expect(semaforoIndice(1.01)).toBe("verde");
    expect(semaforoIndice(0.9)).toBe("ambar");
    expect(semaforoIndice(0.89)).toBe("rojo");
  });

  it("sin indice no hay color", () => {
    expect(semaforoIndice(null)).toBeNull();
    expect(semaforoIndice(NaN)).toBeNull();
  });
});

describe("semaforoDesfase", () => {
  it("cinco puntos por detras es el borde de lo grave", () => {
    expect(semaforoDesfase(0)).toBe("verde");
    expect(semaforoDesfase(-4.9)).toBe("ambar");
    expect(semaforoDesfase(-5)).toBe("rojo");
  });
});
