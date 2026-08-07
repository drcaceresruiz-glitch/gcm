import ExcelJS from "exceljs";

// Lista las filas ocultas de la hoja y cuanto importe contienen.
// En los presupuestos, ocultar una fila suele significar que esa partida
// quedo fuera de alcance: contarla inflaria el total.

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

  const ocultas: { fila: number; codigo: string; desc: string; importe: number }[] = [];
  let sumaOculta = 0;

  for (let n = 11; n <= hoja.rowCount; n++) {
    const fila = hoja.getRow(n);
    if (!fila.hidden) continue;

    const codigo = String(fila.getCell(2).value ?? "").trim();
    const importe = num(fila.getCell(7).value) ?? 0;
    sumaOculta += importe;

    ocultas.push({
      fila: n,
      codigo,
      desc: String(fila.getCell(3).value ?? "").slice(0, 38),
      importe,
    });
  }

  console.log(`Filas ocultas: ${ocultas.length}`);
  console.log(`Importe contenido en filas ocultas: ${sumaOculta.toFixed(2)}\n`);

  for (const o of ocultas.slice(0, 40)) {
    console.log(
      `F${String(o.fila).padStart(3)} ${o.codigo.padEnd(10)} ${o.importe.toFixed(2).padStart(12)}  ${o.desc}`,
    );
  }

  if (ocultas.length > 40) console.log(`... y ${ocultas.length - 40} mas`);
}

main().catch((e) => {
  console.error("Fallo:", e instanceof Error ? e.message : e);
  process.exit(1);
});
