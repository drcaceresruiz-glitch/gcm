import ExcelJS from "exceljs";

// Suma los TOTALES de los capitulos de primer nivel y los contrasta con el
// SUB TOTAL 1 declarado, para descubrir como agrega realmente el archivo.

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v && typeof v === "object" && "result" in (v as object)) {
    const r = (v as { result: unknown }).result;
    return typeof r === "number" && Number.isFinite(r) ? r : null;
  }
  return null;
}

async function main() {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(process.argv[2]!);
  const hoja = libro.worksheets[0]!;

  let total = 0;
  console.log("=== CAPITULOS DE PRIMER NIVEL (codigo sin punto) ===");

  for (let n = 11; n <= hoja.rowCount; n++) {
    const fila = hoja.getRow(n);
    const codigo = String(fila.getCell(2).value ?? "").trim();
    if (!codigo || !/^\d+$/.test(codigo)) continue;

    const h = num(fila.getCell(8).value);
    const g = num(fila.getCell(7).value);
    const desc = String(fila.getCell(3).value ?? "").slice(0, 42);

    console.log(
      `F${String(n).padStart(3)} cap ${codigo.padStart(3)} ${desc.padEnd(42)} H=${(h?.toFixed(2) ?? "-").padStart(13)} G=${(g?.toFixed(2) ?? "-").padStart(12)}`,
    );
    if (h !== null) total += h;
  }

  console.log(`\nSuma de TOTALES de capitulo: ${total.toFixed(2)}`);
  console.log(`SUB TOTAL 1 declarado:       762077.15`);
  console.log(`Diferencia:                  ${(total - 762077.15).toFixed(2)}`);
}

main().catch((e) => {
  console.error("Fallo:", e instanceof Error ? e.message : e);
  process.exit(1);
});
