import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { analizarExcel } from "../src/lib/excel-presupuesto";

// Compara, fila a fila, el parcial que calcula el analizador contra el
// SUB-TOTAL que trae el Excel, y ordena por diferencia. Sirve para localizar
// de un vistazo donde se descuadra el importe.

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v && typeof v === "object" && "result" in (v as object)) {
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

  const contenido = await readFile(ruta);
  const r = await analizarExcel(
    contenido.buffer.slice(
      contenido.byteOffset,
      contenido.byteOffset + contenido.byteLength,
    ) as ArrayBuffer,
  );

  const desvios: { fila: number; codigo: string; mio: number; excel: number }[] = [];
  let sumaMia = 0;

  for (const f of r.filas) {
    if (!f.parcial) continue;
    const mio = Number(f.parcial);
    sumaMia += mio;

    const excel = num(hoja.getRow(f.fila).getCell(7).value) ?? 0;
    if (Math.abs(mio - excel) > 0.05) {
      desvios.push({ fila: f.fila, codigo: f.codigo, mio, excel });
    }
  }

  console.log(`Suma del analizador: ${sumaMia.toFixed(2)}`);
  console.log(`Filas con parcial:   ${r.filas.filter((f) => f.parcial).length}`);
  console.log(`Filas descuadradas:  ${desvios.length}`);

  desvios.sort((a, b) => Math.abs(b.mio - b.excel) - Math.abs(a.mio - a.excel));

  console.log("\n=== 20 MAYORES DESVIOS ===");
  for (const d of desvios.slice(0, 20)) {
    const dif = (d.mio - d.excel).toFixed(2);
    console.log(
      `F${String(d.fila).padStart(3)} ${d.codigo.padEnd(10)} analizador=${d.mio.toFixed(2).padStart(12)}  excel=${d.excel.toFixed(2).padStart(12)}  dif=${dif.padStart(12)}`,
    );
  }
}

main().catch((e) => {
  console.error("Fallo:", e instanceof Error ? e.message : e);
  process.exit(1);
});
