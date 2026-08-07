import ExcelJS from "exceljs";

// Contrasta lo que suma el analizador contra los totales que el propio
// Excel declara. Sin esta comprobacion, un importador puede devolver una
// cifra creible y equivocada.

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && "result" in (v as object)) {
    const r = (v as { result: unknown }).result;
    return typeof r === "number" && Number.isFinite(r) ? r : null;
  }
  return null;
}

async function main() {
  const ruta = process.argv[2]!;
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta);
  const hoja = libro.worksheets[0]!;

  let sumaG = 0;
  let cuentaG = 0;
  let sumaH = 0;
  let cuentaH = 0;

  for (let n = 11; n <= hoja.rowCount; n++) {
    const fila = hoja.getRow(n);
    const codigo = String(fila.getCell(2).value ?? "").trim();
    if (!codigo || !/^\d+(\.\d+)*$/.test(codigo)) continue;

    const g = num(fila.getCell(7).value);
    const h = num(fila.getCell(8).value);
    if (g !== null) { sumaG += g; cuentaG++; }
    if (h !== null) { sumaH += h; cuentaH++; }
  }

  console.log(`Columna G (SUB-TOTAL): ${cuentaG} celdas, suma = ${sumaG.toFixed(2)}`);
  console.log(`Columna H (TOTALES):   ${cuentaH} celdas, suma = ${sumaH.toFixed(2)}`);

  console.log("\n=== TOTALES DECLARADOS POR EL ARCHIVO ===");
  for (let n = 355; n <= 366; n++) {
    const fila = hoja.getRow(n);
    const etiqueta = String(fila.getCell(4).value ?? "").trim();
    const h = num(fila.getCell(8).value);
    const f = num(fila.getCell(6).value);
    if (etiqueta || h !== null) {
      console.log(
        `F${n} ${etiqueta.slice(0, 40).padEnd(40)} F=${(f ?? "").toString().padStart(8)} H=${(h?.toFixed(2) ?? "").padStart(14)}`,
      );
    }
  }
}

main().catch((e) => {
  console.error("Fallo:", e instanceof Error ? e.message : e);
  process.exit(1);
});
