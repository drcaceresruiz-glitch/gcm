import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { analizarExcel } from "./excel-presupuesto";

/**
 * Construye un Excel que imita una exportacion real de S10: filas de
 * titulo antes de la tabla, cabecera con abreviaturas y capitulos
 * intercalados entre las partidas.
 */
async function construirLibro(
  filas: (string | number | null)[][],
  opciones: { cabecera?: string[]; titulos?: boolean } = {},
): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Presupuesto");

  if (opciones.titulos !== false) {
    hoja.addRow(["PRESUPUESTO DE OBRA"]);
    hoja.addRow(["Cliente: Criocord"]);
    hoja.addRow([]);
  }

  hoja.addRow(
    opciones.cabecera ?? ["Item", "Descripción", "Und.", "Metrado", "Precio Unitario", "Parcial"],
  );

  for (const f of filas) hoja.addRow(f);

  const buffer = await libro.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

describe("analizarExcel", () => {
  it("encuentra la cabecera aunque no este en la primera fila", async () => {
    const libro = await construirLibro([
      ["1.0", "CAPITULO I: TRABAJOS PRELIMINARES", null, null, null, null],
      ["1.1", "Trazo y replanteo", "m2", 120, 8.5, 1020],
    ]);

    const r = await analizarExcel(libro);

    expect(r.filaCabecera).toBe(4);
    expect(r.errores).toHaveLength(0);
    expect(r.columnasDetectadas["codigo"]).toBe("Item");
  });

  it("distingue capitulos de partidas por el codigo", async () => {
    const libro = await construirLibro([
      ["4.0", "CAPITULO IV: CIMENTACIONES", null, null, null, null],
      ["4.4", "Excavacion para zapatas", "m3", 4.25, 95, 403.75],
    ]);

    const r = await analizarExcel(libro);

    expect(r.totalCapitulos).toBe(1);
    expect(r.totalPartidas).toBe(1);
    expect(r.filas[0]?.tipo).toBe("CAPITULO");
    expect(r.filas[1]?.tipo).toBe("PARTIDA");
    expect(r.filas[1]?.nivel).toBe(1);
  });

  it("calcula los parciales con precision exacta", async () => {
    const libro = await construirLibro([
      ["4.0", "CAPITULO IV", null, null, null, null],
      ["4.4", "Excavacion para zapatas", "m3", 4.25, 95, null],
      ["4.6", "Acero corrugado", "kg", 285, 6.2, null],
      ["4.7", "Concreto f'c=210", "m3", 6.8, 420, null],
    ]);

    const r = await analizarExcel(libro);

    // 4.25 * 95 en coma flotante da 403.74999999999994
    expect(r.filas[1]?.parcial).toBe("403.75");
    expect(r.filas[2]?.parcial).toBe("1767.00");
    expect(r.filas[3]?.parcial).toBe("2856.00");
    expect(r.montoTotal).toBe("5026.75");
  });

  it("avisa cuando el parcial del archivo no cuadra", async () => {
    const libro = await construirLibro([
      ["1.1", "Partida manipulada", "m2", 10, 5, 999],
    ]);

    const r = await analizarExcel(libro);

    expect(r.filas[0]?.parcial).toBe("50.00");
    expect(r.filas[0]?.aviso).toContain("no coincide");
  });

  it("rechaza codigos duplicados indicando la fila original", async () => {
    const libro = await construirLibro([
      ["2.1", "Primera", "m2", 10, 5, null],
      ["2.1", "Repetida", "m2", 20, 5, null],
    ]);

    const r = await analizarExcel(libro);

    expect(r.filas).toHaveLength(1);
    expect(r.errores[0]?.mensaje).toContain("ya aparece en la fila");
  });

  it("rechaza codigos con formato invalido", async () => {
    const libro = await construirLibro([["A-1", "Codigo raro", "m2", 10, 5, null]]);

    const r = await analizarExcel(libro);

    expect(r.filas).toHaveLength(0);
    expect(r.errores[0]?.mensaje).toContain("no valido");
  });

  it("rechaza partidas sin metrado valido", async () => {
    const libro = await construirLibro([["3.1", "Sin metrado", "m2", "s/d", 5, null]]);

    const r = await analizarExcel(libro);

    expect(r.errores[0]?.mensaje).toContain("metrado");
  });

  it("acepta partidas sin unidad pero deja aviso", async () => {
    const libro = await construirLibro([["3.1", "Sin unidad", null, 10, 5, null]]);

    const r = await analizarExcel(libro);

    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]?.aviso).toContain("Sin unidad");
  });

  it("ignora filas totalmente vacias", async () => {
    const libro = await construirLibro([
      ["1.1", "Valida", "m2", 10, 5, null],
      [null, null, null, null, null, null],
      ["1.2", "Otra valida", "m2", 2, 3, null],
    ]);

    const r = await analizarExcel(libro);

    expect(r.filas).toHaveLength(2);
    expect(r.errores).toHaveLength(0);
  });

  it("avisa si no reconoce la tabla", async () => {
    const libro = await construirLibro([["x", "y"]], {
      cabecera: ["Columna A", "Columna B"],
    });

    const r = await analizarExcel(libro);

    expect(r.filaCabecera).toBeNull();
    expect(r.errores[0]?.mensaje).toContain("No se encontro la tabla");
  });

  it("soporta el formato S10 de tres niveles", async () => {
    const libro = await construirLibro([
      ["01", "ESTRUCTURAS", null, null, null, null],
      ["01.02", "CIMENTACIONES", null, null, null, null],
      ["01.02.01", "Zapatas", "m3", 12.5, 380, null],
    ]);

    const r = await analizarExcel(libro);

    expect(r.errores).toHaveLength(0);
    expect(r.filas[2]?.tipo).toBe("PARTIDA");
    expect(r.filas[2]?.nivel).toBe(2);
    expect(r.filas[2]?.parcial).toBe("4750.00");
  });
});
