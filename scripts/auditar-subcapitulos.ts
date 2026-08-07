import ExcelJS from "exceljs";

// Compara, subcapitulo a subcapitulo de un capitulo dado, la suma de los
// importes de sus hijas contra el TOTAL que declara el propio Excel.
// Localiza donde se repiten importes por formula arrastrada.

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v && typeof v === "object" && "result" in (v as object)) {
    const r = (v as { result: unknown }).result;
    return typeof r === "number" && Number.isFinite(r) ? r : null;
  }
  return null;
}

async function main() {
  const [ruta, capitulo = "11"] = process.argv.slice(2);

  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta!);
  const hoja = libro.worksheets[0]!;

  const prefijo = `${capitulo}.`;
  const subs: { fila: number; codigo: string; h: number | null }[] = [];

  for (let n = 11; n <= hoja.rowCount; n++) {
    const c = String(hoja.getRow(n).getCell(2).value ?? "").trim();
    if (c.startsWith(prefijo) && c.split(".").length === 2) {
      subs.push({ fila: n, codigo: c, h: num(hoja.getRow(n).getCell(8).value) });
    }
  }

  console.log("sub        sumaHijas       totalH      exceso   repetidos");

  for (const [i, sub] of subs.entries()) {
    const fin = (subs[i + 1]?.fila ?? hoja.rowCount + 1) - 1;
    let suma = 0;
    const importes: number[] = [];

    for (let n = sub.fila + 1; n <= fin; n++) {
      const c = String(hoja.getRow(n).getCell(2).value ?? "").trim();
      if (!c.startsWith(`${sub.codigo}.`)) continue;
      const g = num(hoja.getRow(n).getCell(7).value);
      if (g === null) continue;
      suma += g;
      importes.push(g);
    }

    // Cuantos importes se repiten dentro del subcapitulo.
    const cuenta = new Map<number, number>();
    for (const v of importes) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
    const repetidos = [...cuenta.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0);

    const h = sub.h ?? 0;
    console.log(
      `${sub.codigo.padEnd(8)} ${suma.toFixed(2).padStart(13)} ${h.toFixed(2).padStart(12)} ${(suma - h).toFixed(2).padStart(12)} ${String(repetidos).padStart(6)}`,
    );
  }
}

main().catch((e) => {
  console.error("Fallo:", e instanceof Error ? e.message : e);
  process.exit(1);
});
