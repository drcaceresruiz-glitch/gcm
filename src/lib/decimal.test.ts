import { describe, it, expect } from "vitest";
import {
  normalizarDecimal,
  multiplicar,
  sumar,
  esPositivo,
  esNegativo,
} from "./decimal";

describe("normalizarDecimal", () => {
  it("acepta numeros y textos simples", () => {
    expect(normalizarDecimal(4.25, 4)).toBe("4.2500");
    expect(normalizarDecimal("120", 4)).toBe("120.0000");
    expect(normalizarDecimal("8.5", 2)).toBe("8.50");
  });

  it("entiende el separador de miles peruano", () => {
    expect(normalizarDecimal("1,234.56", 2)).toBe("1234.56");
    expect(normalizarDecimal("1,234,567.89", 2)).toBe("1234567.89");
  });

  it("entiende la coma decimal de otras configuraciones regionales", () => {
    expect(normalizarDecimal("1234,56", 2)).toBe("1234.56");
    expect(normalizarDecimal("8,5", 2)).toBe("8.50");
  });

  it("rechaza el caso irresoluble en lugar de adivinar", () => {
    // "12,500" vale 12500 en formato peruano y 12.5 en formato europeo.
    // No hay forma de saberlo: se rechaza y se pide corregir el archivo.
    expect(normalizarDecimal("12,500", 2)).toBeNull();
  });

  it("redondea hacia arriba en el medio exacto", () => {
    expect(normalizarDecimal("0.125", 2)).toBe("0.13");
    expect(normalizarDecimal("2.345", 2)).toBe("2.35");
  });

  it("rechaza lo que no es un numero", () => {
    expect(normalizarDecimal("", 2)).toBeNull();
    expect(normalizarDecimal("abc", 2)).toBeNull();
    expect(normalizarDecimal("12.5.3", 2)).toBeNull();
    expect(normalizarDecimal(null, 2)).toBeNull();
    expect(normalizarDecimal(undefined, 2)).toBeNull();
    expect(normalizarDecimal(Infinity, 2)).toBeNull();
  });

  it("conserva los negativos", () => {
    expect(normalizarDecimal("-15.5", 2)).toBe("-15.50");
  });
});

describe("multiplicar", () => {
  it("resuelve los casos donde la coma flotante falla", () => {
    // 4.25 * 95 en coma flotante da 403.74999999999994
    expect(multiplicar("4.2500", "95.0000", 2)).toBe("403.75");
    // 0.1 * 0.2 da 0.020000000000000004
    expect(multiplicar("0.1", "0.2", 4)).toBe("0.0200");
  });

  it("calcula los parciales de las partidas sembradas", () => {
    expect(multiplicar("120.0000", "8.5000", 2)).toBe("1020.00");
    expect(multiplicar("285.0000", "6.2000", 2)).toBe("1767.00");
    expect(multiplicar("6.8000", "420.0000", 2)).toBe("2856.00");
  });

  it("mantiene la precision con metrados de 4 decimales", () => {
    expect(multiplicar("0.3333", "3.0000", 4)).toBe("0.9999");
  });

  it("devuelve null ante entradas invalidas", () => {
    expect(multiplicar("abc", "2", 2)).toBeNull();
  });
});

describe("sumar", () => {
  it("suma sin arrastrar error", () => {
    // 0.1 + 0.2 + 0.3 en coma flotante no da exactamente 0.6
    expect(sumar(["0.1", "0.2", "0.3"], 2)).toBe("0.60");
  });

  it("reproduce el subtotal del Capitulo IV", () => {
    const parciales = [
      "1020.00",
      "1350.00",
      "1620.00",
      "403.75",
      "456.00",
      "1767.00",
      "2856.00",
      "825.00",
    ];
    expect(sumar(parciales)).toBe("10297.75");
  });

  it("ignora los valores invalidos en lugar de romper", () => {
    expect(sumar(["10.00", "x", "5.00"])).toBe("15.00");
  });

  it("devuelve cero con la lista vacia", () => {
    expect(sumar([])).toBe("0.00");
  });
});

describe("signo", () => {
  it("distingue positivos, negativos y cero", () => {
    expect(esPositivo("0.01")).toBe(true);
    expect(esPositivo("0.00")).toBe(false);
    expect(esNegativo("-0.01")).toBe(true);
    expect(esNegativo("0.00")).toBe(false);
  });
});
