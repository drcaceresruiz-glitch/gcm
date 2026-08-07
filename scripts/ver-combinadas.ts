import ExcelJS from "exceljs";

// Lista las celdas combinadas de la hoja. Una combinacion vertical en las
// columnas de importe significa que varias filas COMPARTEN un unico monto:
// es una partida a suma alzada cuyo detalle ocupa varias lineas.

async function main() {
  const ruta = process.argv[2]!;
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta);
  const hoja = libro.worksheets[0]!;

  const modelo = hoja.model as unknown as { merges?: string[] };
  const merges = modelo.merges ?? [];

  console.log(`Combinaciones en la hoja: ${merges.length}`);

  // Solo interesan las verticales que tocan las columnas de cifras (E..H).
  const verticales = merges
    .map((r) => {
      const [ini, fin] = r.split(":");
      const m1 = /^([A-Z]+)(\d+)$/.exec(ini ?? "");
      const m2 = /^([A-Z]+)(\d+)$/.exec(fin ?? "");
      if (!m1 || !m2) return null;
      return {
        rango: r,
        col: m1[1]!,
        desde: Number(m1[2]),
        hasta: Number(m2[2]),
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .filter((m) => m.hasta > m.desde && ["D", "E", "F", "G", "H"].includes(m.col));

  console.log(`Combinaciones verticales en columnas de cifras: ${verticales.length}\n`);

  for (const v of verticales.slice(0, 25)) {
    const codigoIni = String(hoja.getRow(v.desde).getCell(2).value ?? "").trim();
    const codigoFin = String(hoja.getRow(v.hasta).getCell(2).value ?? "").trim();
    console.log(
      `${v.rango.padEnd(12)} filas ${v.desde}-${v.hasta} (${v.hasta - v.desde + 1})  ${codigoIni} .. ${codigoFin}`,
    );
  }
}

main().catch((e) => {
  console.error("Fallo:", e instanceof Error ? e.message : e);
  process.exit(1);
});
