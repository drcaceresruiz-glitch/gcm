import { describe, expect, it } from "vitest";

import { mesesAjustadosAlPlazo } from "@/lib/gastos-contra-plazo";

/**
 * El ajuste que corrige el aviso desde la propia pantalla.
 *
 * Es la MISMA regla con la que se genera la plantilla: lo que propone el Excel
 * y lo que arregla el boton tienen que dar el mismo numero, o el usuario ve
 * dos verdades.
 */

const PLANTILLA = [
  { concepto: "Residente de obra", tipo: "VARIABLE", meses: "8.00" },
  { concepto: "Maestro de obra", tipo: "VARIABLE", meses: "8.00" },
  { concepto: "Almacenero", tipo: "VARIABLE", meses: "6.00" },
  { concepto: "Carta fianza", tipo: "FIJO", meses: null },
];

describe("ajustar los meses al plazo de la obra", () => {
  it("reescala conservando la proporcion entre lineas", () => {
    // El caso real: la plantilla a 8 meses en una obra de 2,17. El almacenero
    // llevaba 6 de los 8 —entra mas tarde— y tiene que seguir entrando mas
    // tarde: 6/8 de 2,17 son 1,63.
    const ajustes = mesesAjustadosAlPlazo(PLANTILLA, "2.17");

    expect(ajustes).toEqual([
      { indice: 0, antes: "8.00", despues: "2.17" },
      { indice: 1, antes: "8.00", despues: "2.17" },
      { indice: 2, antes: "6.00", despues: "1.63" },
    ]);
  });

  it("los FIJO se quedan fuera: el plazo no los mueve", () => {
    const ajustes = mesesAjustadosAlPlazo(PLANTILLA, "2.17");
    expect(ajustes.some((a) => a.indice === 3)).toBe(false);
  });

  it("no propone cambios cuando los meses ya cuadran", () => {
    // El control que evita un boton que siempre «corrige» algo.
    const ajustes = mesesAjustadosAlPlazo(
      [{ concepto: "Residente", tipo: "VARIABLE", meses: "8.00" }],
      "8.00",
    );
    expect(ajustes).toEqual([]);
  });

  it("nunca deja una linea en cero meses", () => {
    // Cero meses no cuesta nada: la linea desapareceria de la suma sin que
    // nadie la haya quitado. El suelo es 0,01.
    const ajustes = mesesAjustadosAlPlazo(
      [
        { concepto: "Largo", tipo: "VARIABLE", meses: "100.00" },
        { concepto: "Corto", tipo: "VARIABLE", meses: "1.00" },
      ],
      "0.50",
    );

    const corto = ajustes.find((a) => a.indice === 1);
    expect(Number(corto?.despues)).toBeGreaterThan(0);
  });

  it("sin plazo de obra no toca nada", () => {
    expect(mesesAjustadosAlPlazo(PLANTILLA, "0.00")).toEqual([]);
  });
});
