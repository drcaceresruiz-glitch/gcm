import { describe, it, expect, vi } from "vitest";
import ExcelJS from "exceljs";

import {
  generarPlantillaProveedores,
  leerFilasDelLibro,
} from "./proveedores-excel.service";
import { CAMPOS_EXCEL, FILA_CABECERA } from "@/lib/proveedores-excel";

// Ninguna de las dos funciones probadas aqui toca la base -son la parte
// PURA de este servicio-, pero el archivo entero importa `@/lib/prisma` en
// su cabecera (lo usa `importarProveedores`, que esto no ejercita). Sin
// este doble, importar el modulo arrastra el cliente real de Prisma, que
// en una maquina de CI recien clonada no esta generado: el 21 de agosto de
// 2026 esto tumbo el despliegue #525 con "Cannot find package
// '@prisma/client'", porque en un checkout local ya generado el fallo no
// se ve.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

/**
 * El contrato de la plantilla: lo que GCM regala para descargar, GCM lo
 * tiene que poder leer limpio. Mismo patron que
 * `plantilla-presupuesto.test.ts` y compania -generar y volver a analizar-,
 * pero via `leerFilasDelLibro` en vez de una funcion "analizar" unica: aqui
 * la parte pura vivia mezclada con la escritura en base, y esto es lo que la
 * separo para poder probarla.
 */
describe("plantilla de proveedores, de ida y vuelta", () => {
  it("la fila de ejemplo se lee sin error y sin recortes", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaProveedores());
    const hoja = libro.worksheets[0]!;

    const resultado = leerFilasDelLibro(hoja);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    // Debajo de la cabecera van dos filas: la de ayuda de opciones (sin RUC
    // ni razon social, "fila vacía") y la de ejemplo. `leerFilasDelLibro`
    // devuelve las dos -es `importarProveedores` quien calla la vacía-.
    expect(resultado.filas).toHaveLength(2);
    expect(resultado.filas[0]?.leida).toEqual({ ok: false, motivo: "fila vacía" });

    const { fila, leida } = resultado.filas[1]!;
    expect(fila).toBe(FILA_CABECERA + 2);
    expect(leida.ok).toBe(true);
    if (!leida.ok) return;

    expect(leida.aviso).toBeUndefined();

    // Cada campo de la plantilla vuelve tal cual: las listas (rol,
    // tipoImpuesto...) ya vienen en mayusculas en el propio ejemplo.
    for (const campo of CAMPOS_EXCEL) {
      expect(leida.datos[campo.clave]).toBe(campo.ejemplo);
    }
  });

  it("un texto que pasa de su columna se recorta y avisa, tambien via la plantilla", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaProveedores());
    const hoja = libro.worksheets[0]!;

    const filaEjemplo = hoja.getRow(FILA_CABECERA + 2);
    const columnaBanco = CAMPOS_EXCEL.findIndex((c) => c.clave === "banco") + 1;
    filaEjemplo.getCell(columnaBanco).value = "B".repeat(90);

    const resultado = leerFilasDelLibro(hoja);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const { leida } = resultado.filas[1]!;
    expect(leida.ok).toBe(true);
    if (!leida.ok) return;

    expect(leida.datos.banco).toBe("B".repeat(80));
    expect(leida.aviso).toContain("80 caracteres");
  });
});
