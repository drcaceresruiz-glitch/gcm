import { describe, expect, it } from "vitest";

import { lineasMasLargasQueLaObra } from "@/lib/gastos-contra-plazo";

/**
 * El caso real: la plantilla trae los ejemplos a 8 meses y nadie comprobaba
 * que eso tuviera que ver con la obra. En una de trece dias (0,43 meses)
 * entraron ocho meses de residente, ocho de maestro y seis de almacenero: de
 * ahi salieron 125.700 de gastos generales sobre 15.478 de costo directo.
 */

const OBRA_CORTA = "0.43";

describe("gastos que duran mas que la obra", () => {
  it("caza las lineas de la plantilla en una obra de trece dias", () => {
    const largas = lineasMasLargasQueLaObra(
      [
        { concepto: "Residente de obra", tipo: "VARIABLE", meses: "8.00" },
        { concepto: "Almacenero", tipo: "VARIABLE", meses: "6.00" },
      ],
      OBRA_CORTA,
    );

    expect(largas).toEqual([
      { concepto: "Residente de obra", meses: "8.00", exceso: "7.57" },
      { concepto: "Almacenero", meses: "6.00", exceso: "5.57" },
    ]);
  });

  it("una linea que cabe en el plazo no se lista", () => {
    // El control que impide que el aviso salte siempre.
    const largas = lineasMasLargasQueLaObra(
      [{ concepto: "Residente", tipo: "VARIABLE", meses: "6.00" }],
      "8.00",
    );

    expect(largas).toEqual([]);
  });

  it("el borde: durar EXACTAMENTE lo que la obra no es exceso", () => {
    const largas = lineasMasLargasQueLaObra(
      [{ concepto: "Residente", tipo: "VARIABLE", meses: "8.00" }],
      "8.00",
    );

    expect(largas).toEqual([]);
  });

  it("los FIJO no se miran: el plazo no los mueve", () => {
    // Una carta fianza no dura «meses de obra»; es un importe y punto.
    const largas = lineasMasLargasQueLaObra(
      [{ concepto: "Carta fianza", tipo: "FIJO", meses: null }],
      OBRA_CORTA,
    );

    expect(largas).toEqual([]);
  });

  it("sin plazo de obra no se inventa un aviso", () => {
    // Un aviso que salta siempre deja de leerse. Sin plazo no hay contra que
    // comparar, asi que se calla.
    const largas = lineasMasLargasQueLaObra(
      [{ concepto: "Residente", tipo: "VARIABLE", meses: "8.00" }],
      "0.00",
    );

    expect(largas).toEqual([]);
  });
});
