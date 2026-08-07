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

  it("respeta el importe del archivo aunque no sea metrado x precio", async () => {
    const libro = await construirLibro([
      ["1.1", "Partida contratada en bloque", "m2", 10, 5, 999],
    ]);

    const r = await analizarExcel(libro);

    // El importe del presupuesto es la cifra pactada. En los documentos
    // reales no siempre equivale a metrado x precio, y sobrescribirla
    // falsea el contrato.
    expect(r.filas[0]?.parcial).toBe("999.00");
    expect(r.filas[0]?.aviso).toContain("no es metrado x precio");
  });

  it("detecta importes repetidos en filas consecutivas", async () => {
    // Sintoma de una formula arrastrada: todas las filas del grupo acaban
    // mostrando el importe de la primera.
    const libro = await construirLibro([
      ["11.01.01", "Tabique tipo A", "glb", 1, 79727.33, 79727.33],
      ["11.01.02", "Tabique tipo B", "glb", 1, 79727.33, 79727.33],
      ["11.01.03", "Tabique tipo C", "glb", 1, 79727.33, 79727.33],
      ["11.02.01", "Otra partida distinta", "glb", 1, 1000, 1000],
    ]);

    const r = await analizarExcel(libro);

    expect(r.gruposRepetidos).toHaveLength(1);
    expect(r.gruposRepetidos[0]?.filas).toHaveLength(3);
    expect(r.montoTotal).toBe("240181.99");
    expect(r.montoSinRepetidos).toBe("80727.33");
    expect(r.filas[1]?.aviso).toContain("formula arrastrada");
    // La primera del grupo conserva el importe y no lleva ese aviso.
    expect(r.filas[0]?.aviso ?? "").not.toContain("formula arrastrada");
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

  it("acepta una partida con precio pero sin metrado, avisando", async () => {
    const libro = await construirLibro([["3.1", "Sin metrado", "m2", "s/d", 5, null]]);

    const r = await analizarExcel(libro);

    expect(r.errores).toHaveLength(0);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]?.parcial).toBeNull();
    expect(r.filas[0]?.aviso).toContain("Sin metrado");
  });

  it("trata como agrupador la fila sin ningun dato economico", async () => {
    const libro = await construirLibro([
      ["3.1", "SUBTITULO SIN CIFRAS", null, null, null, null],
      ["3.2", "Esta si tiene precio", "m2", 10, 5, null],
    ]);

    const r = await analizarExcel(libro);

    // Sin metrado, precio ni importe no hay nada que costear: la fila
    // agrupa. Exigirle un metrado seria inventarle una naturaleza que no
    // tiene.
    expect(r.errores).toHaveLength(0);
    expect(r.filas[0]?.tipo).toBe("CAPITULO");
    expect(r.filas[1]?.tipo).toBe("PARTIDA");
    expect(r.montoTotal).toBe("50.00");
  });

  // --- Casos aprendidos del presupuesto real de CRIOCORD ---

  it("acepta grupos contratados a suma alzada", async () => {
    // El grupo lleva el importe en SUB-TOTAL y sus hijas solo detallan el
    // alcance, con metrado pero sin precio unitario.
    const libro = await construirLibro(
      [
        ["7.02.00", "REDES DE DESAGUE", null, null, null, 13109.04],
        ["7.02.01", "Corte de piso de concreto", "ml", 42, null, null],
        ["7.02.02", "Resane de piso con concreto", "ml", 42, null, null],
      ],
      { cabecera: ["ITEM", "DESCRIPCIÓN", "UND", "CANT", "PRECIO UNIT.", "SUB-TOTAL"] },
    );

    const r = await analizarExcel(libro);

    expect(r.errores).toHaveLength(0);
    expect(r.montoTotal).toBe("13109.04");
    expect(r.filas[1]?.metrado).toBe("42.0000");
    expect(r.filas[1]?.parcial).toBeNull();
    expect(r.filas[1]?.aviso).toContain("suma alzada");
  });

  it("distingue como esta contratada cada partida", async () => {
    const libro = await construirLibro(
      [
        // Importe = metrado x precio: precios unitarios.
        ["1.01", "Excavacion medida en obra", "m3", 10, 95, 950],
        // El importe no se explica por la multiplicacion: precio cerrado.
        ["1.02", "Paquete de red contratado en bloque", "Kit", 47, 44589.81, 44589.81],
        // Precio cerrado sin metrado con que descomponerlo.
        ["1.03", "REDES DE DESAGUE", null, null, null, 13109.04],
        // Metrado sin precio ni importe: detalla el alcance del anterior.
        ["1.04", "Corte de piso de concreto", "ml", 42, null, null],
        // Unidad global: el precio cubre el conjunto.
        ["1.05", "Movilizacion y desmovilizacion", "glb", 1, 1575, 1575],
      ],
      { cabecera: ["ITEM", "DESCRIPCIÓN", "UND", "CANT", "PRECIO UNIT.", "SUB-TOTAL"] },
    );

    const r = await analizarExcel(libro);

    expect(r.filas[0]?.modalidad).toBe("PRECIOS_UNITARIOS");
    expect(r.filas[1]?.modalidad).toBe("SUMA_ALZADA");
    expect(r.filas[2]?.modalidad).toBe("SUMA_ALZADA");
    expect(r.filas[3]?.modalidad).toBe("ALCANCE");
    expect(r.filas[4]?.modalidad).toBe("SUMA_ALZADA");
  });

  it("respeta las celdas combinadas: un importe compartido cuenta una vez", async () => {
    // Reproduce el bloque de drywall de CRIOCORD: nueve lineas que comparten
    // una unica celda de unidad, cantidad, precio e importe.
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Presupuesto");

    hoja.addRow(["ITEM", "DESCRIPCIÓN", "UND", "CANT", "PRECIO UNIT.", "SUB-TOTAL"]);
    hoja.addRow(["11.01.01", "Tabique ST", "glb", 1, 79727.33, 79727.33]);
    hoja.addRow(["11.01.02", "Tabique RH", null, null, null, null]);
    hoja.addRow(["11.01.03", "Suspension y accesorios", null, null, null, null]);
    hoja.addRow(["11.01.04", "Descuento comercial", "glb", 1, -5000, -5000]);

    // Filas 2 a 4 comparten unidad, cantidad, precio e importe.
    for (const col of ["C", "D", "E", "F"]) {
      hoja.mergeCells(`${col}2:${col}4`);
    }

    const r = await analizarExcel((await libro.xlsx.writeBuffer()) as ArrayBuffer);

    expect(r.errores).toHaveLength(0);

    // La primera del bloque lleva el importe y queda como suma alzada.
    expect(r.filas[0]?.modalidad).toBe("SUMA_ALZADA");
    expect(r.filas[0]?.parcial).toBe("79727.33");

    // Las cubiertas describen alcance y no tienen importe propio.
    expect(r.filas[1]?.modalidad).toBe("ALCANCE");
    expect(r.filas[1]?.parcial).toBeNull();
    expect(r.filas[2]?.parcial).toBeNull();
    expect(r.filas[1]?.aviso).toContain("Comparte importe");

    // Contar el importe una vez por linea daria 239.181,99 en lugar de esto.
    expect(r.montoTotal).toBe("74727.33");
  });

  it("reconoce la cabecera SUB-TOTAL con guion", async () => {
    const libro = await construirLibro([["1.1", "Partida", "glb", 1, 500, 500]], {
      cabecera: ["ITEM", "DESCRIPCIÓN", "UND", "CANT", "PRECIO UNIT.", "SUB-TOTAL"],
    });

    const r = await analizarExcel(libro);

    expect(r.columnasDetectadas["parcial"]).toBe("SUB-TOTAL");
  });

  it("omite el texto sin codigo sin truncar lo que viene despues", async () => {
    // En los presupuestos reales las clausulas del contrato aparecen
    // intercaladas, con capitulos posteriores. Cortar ahi perderia dinero.
    const libro = await construirLibro([
      ["11.1", "Ultima del capitulo 11", "glb", 1, 1000, null],
      [null, null, null, null, null, null],
      [null, "CLAUSULAS DE EJECUCION DEL PRESUPUESTO", null, null, null, null],
      [null, "1. ALCANCE: el presupuesto incluye...", null, null, null, null],
      [null, null, null, null, null, null],
      ["12", "CAPITULO XII: MOBILIARIO", null, null, null, null],
      ["12.01.01", "Tableros de acero inoxidable", "glb", 1, 2500, null],
    ]);

    const r = await analizarExcel(libro);

    expect(r.errores).toHaveLength(0);
    expect(r.filasTextoOmitidas).toBe(2);
    expect(r.montoTotal).toBe("3500.00");
    expect(r.filas.some((f) => f.codigo === "12.01.01")).toBe(true);
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
