import { describe, it, expect } from "vitest";
import {
  generarPlantillaPresupuesto,
  FILAS_EJEMPLO,
  TOTAL_EJEMPLO,
} from "./plantilla-presupuesto";
import { analizarExcel } from "./excel-presupuesto";

/**
 * El contrato de la plantilla: lo que GCM regala para descargar, GCM lo
 * tiene que poder importar limpio. Este test genera la plantilla y la pasa
 * por el MISMO analizador que usa el importador. Si alguien cambia las
 * reglas del importador y la plantilla queda atras, esto es lo que revienta
 * antes de llegar a produccion.
 */
describe("plantilla de presupuesto", () => {
  it("se analiza sin un solo error", async () => {
    const buffer = await generarPlantillaPresupuesto();
    const resultado = await analizarExcel(buffer);

    expect(resultado.errores).toEqual([]);
    expect(resultado.filaCabecera).not.toBeNull();
  });

  it("clasifica capitulos y partidas como ensenan los ejemplos", async () => {
    const resultado = await analizarExcel(await generarPlantillaPresupuesto());

    expect(resultado.totalCapitulos).toBe(3);
    expect(resultado.totalPartidas).toBe(
      FILAS_EJEMPLO.length - resultado.totalCapitulos,
    );

    const porCodigo = new Map(resultado.filas.map((f) => [f.codigo, f]));

    // La convencion de codigos: .0 agrupa, el resto costea.
    expect(porCodigo.get("1.0")?.tipo).toBe("CAPITULO");
    expect(porCodigo.get("1.1")?.tipo).toBe("PARTIDA");

    // Las tres modalidades que la plantilla ensena.
    expect(porCodigo.get("2.1")?.modalidad).toBe("PRECIOS_UNITARIOS");
    // Unidad global: precio cerrado aunque metrado x precio cuadre.
    expect(porCodigo.get("3.1")?.modalidad).toBe("SUMA_ALZADA");
    // 3.2 es una partida normal: metrado x precio con formula.
    expect(porCodigo.get("3.2")?.modalidad).toBe("PRECIOS_UNITARIOS");
  });

  it("suma el total esperado y no dispara el aviso de repetidos", async () => {
    const resultado = await analizarExcel(await generarPlantillaPresupuesto());

    expect(resultado.montoTotal).toBe(TOTAL_EJEMPLO);
    // Importes todos distintos a proposito: la plantilla no debe estrenar
    // al usuario con el aviso de "formula arrastrada".
    expect(resultado.gruposRepetidos).toEqual([]);
    expect(resultado.montoSinRepetidos).toBe(TOTAL_EJEMPLO);
  });

  it("no deja filas ocultas ni texto suelto que ensucie el analisis", async () => {
    const resultado = await analizarExcel(await generarPlantillaPresupuesto());

    expect(resultado.filasOcultas).toBe(0);
    expect(resultado.filasTextoOmitidas).toBe(0);
  });
});
