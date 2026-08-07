import ExcelJS from "exceljs";

// Diagnostico: vuelca las celdas crudas de un rango de filas, tal cual
// vienen del Excel, para entender por que el analizador las rechaza.
//   npx tsx scripts/inspeccionar-filas.ts <archivo> <desde> <hasta>

async function main() {
  const [ruta, desde, hasta] = process.argv.slice(2);
  if (!ruta) {
    console.error("Uso: npx tsx scripts/inspeccionar-filas.ts <archivo> <desde> <hasta>");
    process.exit(1);
  }

  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta);
  const hoja = libro.worksheets[0]!;

  const ini = Number(desde ?? 1);
  const fin = Number(hasta ?? ini + 20);

  for (let n = ini; n <= fin; n++) {
    const fila = hoja.getRow(n);
    const celdas: string[] = [];

    for (let c = 1; c <= 8; c++) {
      const v = fila.getCell(c).value;
      const tipo = v === null || v === undefined ? "vacio" : typeof v;
      const texto = JSON.stringify(v)?.slice(0, 34) ?? "";
      celdas.push(`c${c}=${tipo}:${texto}`);
    }

    console.log(`F${String(n).padStart(3)} ${celdas.join("  ")}`);
  }
}

main().catch((e) => {
  console.error("Fallo:", e instanceof Error ? e.message : e);
  process.exit(1);
});
