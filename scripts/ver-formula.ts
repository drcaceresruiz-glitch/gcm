import ExcelJS from "exceljs";

// Muestra la formula y el resultado completos de una celda concreta.
//   npx tsx scripts/ver-formula.ts <archivo> <fila> <columna>

async function main() {
  const [ruta, fila, col] = process.argv.slice(2);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta!);
  const hoja = libro.worksheets[0]!;

  const celda = hoja.getRow(Number(fila)).getCell(Number(col ?? 8));
  console.log(JSON.stringify(celda.value, null, 2));
}

main().catch((e) => {
  console.error("Fallo:", e instanceof Error ? e.message : e);
  process.exit(1);
});
