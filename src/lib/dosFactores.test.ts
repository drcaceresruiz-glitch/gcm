import { describe, it, expect } from "vitest";
import {
  normalizarCodigo,
  codigoBienFormado,
  LONGITUD_CODIGO,
} from "./dosFactores";

describe("normalizarCodigo", () => {
  it("quita espacios de sobra al pegar desde el correo", () => {
    expect(normalizarCodigo("  123456  ")).toBe("123456");
  });

  it("junta el codigo que el cliente de correo partio en dos", () => {
    expect(normalizarCodigo("123 456")).toBe("123456");
  });

  it("descarta guiones y cualquier otro adorno", () => {
    expect(normalizarCodigo("123-456")).toBe("123456");
  });

  it("deja vacio lo que no tiene cifras", () => {
    expect(normalizarCodigo("abcdef")).toBe("");
  });
});

describe("codigoBienFormado", () => {
  it("acepta las seis cifras justas", () => {
    expect(codigoBienFormado("123456")).toBe(true);
  });

  it("acepta seis cifras aunque vengan sucias", () => {
    expect(codigoBienFormado(" 123 456 ")).toBe(true);
  });

  it("rechaza de menos", () => {
    expect(codigoBienFormado("12345")).toBe(false);
  });

  it("rechaza de mas", () => {
    expect(codigoBienFormado("1234567")).toBe(false);
  });

  it("mantiene la longitud declarada", () => {
    expect(codigoBienFormado("9".repeat(LONGITUD_CODIGO))).toBe(true);
  });
});
