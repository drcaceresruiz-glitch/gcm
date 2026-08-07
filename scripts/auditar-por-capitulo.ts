import ExcelJS from "exceljs";

// Para cada capitulo de primer nivel, suma la columna SUB-TOTAL de sus filas
// y la contrasta con el TOTAL que el propio capitulo declara. Localiza en
// que capitulo se descuadra el presupuesto.

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

  const capitulos: { fila: number; codigo: string; h: number | null }[] = [];

  for (let n = 11; n <= hoja.rowCount; n++) {
    const codigo = String(hoja.getRow(n).getCell(2).value ?? "").trim();
    if (/^\d+$/.test(codigo)) {
      capitulos.push({ fila: n, codigo, h: num(hoja.getRow(n).getCell(8).value) });
    }
  }

  console.log("cap   filas      sumaG      totalH     exceso");
  let excesoTotal = 0;

  for (const [i, cap] of capitulos.entries()) {
    const fin = (capitulos[i + 1]?.fila ?? hoja.rowCount + 1) - 1;
    let sumaG = 0;

    for (let n = cap.fila + 1; n <= fin; n++) {
      const codigo = String(hoja.getRow(n).getCell(2).value ?? "").trim();
      if (!codigo || !/^\d+(\.\d+)*$/.test(codigo)) continue;
      sumaG += num(hoja.getRow(n).getCell(7).value) ?? 0;
    }

    const h = cap.h ?? 0;
    const exceso = sumaG - h;
    excesoTotal += exceso;

    console.log(
      `${cap.codigo.padStart(3)} ${String(fin - cap.fila).padStart(6)} ${sumaG.toFixed(2).padStart(12)} ${h.toFixed(2).padStart(12)} ${exceso.toFixed(2).padStart(12)}`,
    );
  }

  console.log(`\nExceso total: ${excesoTotal.toFixed(2)}`);
}

main().catch((e) => {
  console.error("Fallo:", e instanceof Error ? e.message : e);
  process.exit(1);
});
