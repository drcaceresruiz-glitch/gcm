import { describe, expect, it } from "vitest";

import {
  cifrasDeLaMeta,
  esPorMes,
  sobrecostePorMesesDeMas,
} from "@/lib/costo-meta";

/**
 * Estas pruebas existen por un fallo con nombre y apellidos.
 *
 * El 23 de agosto de 2026 la pantalla del contractual decia que la obra
 * costaba 600 y perdia 200. Costaba 700 y perdia 300, y el recargo minimo no
 * era 50 % sino 75 %. El sueldo del residente estaba escrito en el Excel, se
 * veia en su hoja, y valia cero en la cuenta: vivia en una tabla aparte cuyo
 * total llegaba a cero al guardar.
 *
 * Lo que se fija aqui es que TODAS las cifras salgan de la MISMA lista. Dos
 * cifras que salen de la misma funcion no se pueden desincronizar.
 */

const PARTIDA = { codigoRef: "1.1", unidad: "m3", precioUnitario: "100.00" };

describe("un sueldo cuenta en el costo total", () => {
  it("las lineas sin codigo suman igual que las partidas", () => {
    const c = cifrasDeLaMeta([
      { ...PARTIDA, parcial: "400.00" },
      {
        codigoRef: null,
        unidad: "mes",
        precioUnitario: "200.00",
        parcial: "200.00",
      },
    ]);

    expect(c.costoDirecto).toBe("400.00");
    expect(c.costoPropio).toBe("200.00");
    expect(c.costoTotal).toBe("600.00");
  });

  it("EL CASO REAL: 400 en partidas, 200 en propios y 100 de residente", () => {
    // Es la meta exacta que enseñaba 600. El residente entra, y son 700.
    const c = cifrasDeLaMeta([
      { ...PARTIDA, parcial: "400.00" },
      { codigoRef: null, unidad: "glb", precioUnitario: "200.00", parcial: "200.00" },
      { codigoRef: null, unidad: "mes", precioUnitario: "100.00", parcial: "100.00" },
    ]);

    expect(c.costoTotal).toBe("700.00");
  });

  it("el total es SIEMPRE la suma de las dos mitades", () => {
    // La invariante entera del modulo. Si algun dia se rompe, vuelve el fallo.
    const c = cifrasDeLaMeta([
      { ...PARTIDA, parcial: "1234.56" },
      { codigoRef: "1.2", unidad: "m", precioUnitario: "1.00", parcial: "0.07" },
      { codigoRef: null, unidad: "mes", precioUnitario: "99.99", parcial: "99.99" },
    ]);

    expect(c.costoTotal).toBe("1334.62");
  });

  it("un capitulo no lleva importe y no descuadra nada", () => {
    const c = cifrasDeLaMeta([
      { codigoRef: "1.0", unidad: null, precioUnitario: null, parcial: null },
      { ...PARTIDA, parcial: "400.00" },
    ]);

    expect(c.costoDirecto).toBe("400.00");
    expect(c.costoTotal).toBe("400.00");
  });

  it("un parcial vacio no se cuela como cero ni rompe la suma", () => {
    const c = cifrasDeLaMeta([
      { ...PARTIDA, parcial: "" },
      { ...PARTIDA, parcial: "400.00" },
    ]);

    expect(c.costoDirecto).toBe("400.00");
  });
});

describe("lo que cuesta cada mes de mas", () => {
  const CON_MESES = [
    { codigoRef: "1.1", unidad: "m3", precioUnitario: "5000.00", parcial: "5000.00" },
    { codigoRef: null, unidad: "mes", precioUnitario: "6500.00", parcial: "52000.00" },
    { codigoRef: null, unidad: "mes", precioUnitario: "4200.00", parcial: "33600.00" },
    { codigoRef: null, unidad: "glb", precioUnitario: "9500.00", parcial: "9500.00" },
  ];

  it("suma el precio MENSUAL, no el importe entero", () => {
    // Es la razon de pedir la unidad. Un sueldo escrito como 8 x 6.500 dice
    // lo que cuesta estirarse; escrito como 52.000 a secas, no dice nada.
    const c = cifrasDeLaMeta(CON_MESES);

    expect(c.costeMensualDelAtraso).toBe("10700.00");
    expect(c.lineasPorMes).toBe(2);
  });

  it("lo que no depende del plazo se queda fuera", () => {
    // Una carta fianza no cuesta mas porque la obra se alargue.
    const c = cifrasDeLaMeta(CON_MESES);
    expect(c.costeMensualDelAtraso).not.toContain("9500");
  });

  it("una PARTIDA medida en meses tampoco cuenta", () => {
    // Alquilar una grua como partida se le factura al cliente: si la obra se
    // alarga, se valoriza mas grua. No es un sobrecosto que asuma la empresa.
    const c = cifrasDeLaMeta([
      { codigoRef: "1.1", unidad: "mes", precioUnitario: "8000.00", parcial: "8000.00" },
    ]);

    expect(c.lineasPorMes).toBe(0);
    expect(c.costeMensualDelAtraso).toBe("0.00");
  });

  it("tres meses de atraso se convierten en dinero", () => {
    const c = cifrasDeLaMeta(CON_MESES);
    expect(sobrecostePorMesesDeMas(c, "3")).toBe("32100.00");
  });

  it("sin lineas por meses devuelve null, NUNCA cero", () => {
    // Un cero diria «alargarse no cuesta nada», que es lo contrario de lo que
    // pasa y la mentira mas cara que esta pantalla puede contar.
    const c = cifrasDeLaMeta([{ ...PARTIDA, parcial: "400.00" }]);

    expect(c.costeMensualDelAtraso).toBe("0.00");
    expect(sobrecostePorMesesDeMas(c, "3")).toBeNull();
  });
});

describe("que unidad significa «al mes»", () => {
  it("acepta singular, plural, mayusculas y espacios de mas", () => {
    // Lo teclea una persona en un Excel.
    for (const u of ["mes", "MES", "Meses", " mes ", "meses"]) {
      expect(esPorMes(u)).toBe(true);
    }
  });

  it("no confunde «m» con «mes»", () => {
    // «m» es metro, y tratarlo como mensual convertiria cada metro de cerco
    // en un sobrecosto de atraso.
    expect(esPorMes("m")).toBe(false);
    expect(esPorMes("m2")).toBe(false);
    expect(esPorMes("mensual")).toBe(false);
    expect(esPorMes(null)).toBe(false);
    expect(esPorMes("")).toBe(false);
  });
});
