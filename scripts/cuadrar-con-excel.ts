import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { analizarExcel } from "../src/lib/excel-presupuesto";
import { codigoPadre, sumarHojas } from "../src/lib/jerarquia-partidas";

// Contrasta, capitulo a capitulo, lo que calcula el sistema contra el TOTAL
// que declara el Excel mas sus descuentos. Localiza donde no cuadra.

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

  // Filas cuyo importe se repite: solo cuenta la primera de cada grupo.
  const ignoradas = new Set(r.gruposRepetidos.flatMap((g) => g.filas.slice(1)));

  const codigos = new Set(r.filas.map((f) => f.codigo));
  const capituloDe = (codigo: string): string => {
    let actual = codigo;
    for (let i = 0; i < 10; i++) {
      const padre = codigoPadre(actual, codigos);
      if (padre === null) return actual;
      actual = padre;
    }
    return actual;
  };

  const porCapitulo = new Map<string, typeof r.filas>();
  for (const f of r.filas) {
    const cap = capituloDe(f.codigo);
    porCapitulo.set(cap, [...(porCapitulo.get(cap) ?? []), f]);
  }

  console.log("cap        sistema       excel+desc      diferencia");
  let totalSistema = 0;
  let totalObjetivo = 0;

  for (const [cap, filas] of [...porCapitulo].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const sinRepetidos = filas.map((f) =>
      ignoradas.has(f.fila) ? { ...f, parcial: null } : f,
    );
    const sistema = Number(sumarHojas(sinRepetidos));

    // Total declarado por el capitulo en la columna H.
    const filaCap = filas.find((f) => f.codigo === cap)?.fila;
    const h = filaCap ? (num(hoja.getRow(filaCap).getCell(8).value) ?? 0) : 0;

    // Los descuentos van fuera de las sumas del Excel: se reincorporan.
    const descuentos = filas
      .filter((f) => /descuento/i.test(f.descripcion) && f.parcial)
      .reduce((s, f) => s + Number(f.parcial), 0);

    const objetivo = h + descuentos;
    totalSistema += sistema;
    totalObjetivo += objetivo;

    console.log(
      `${cap.padStart(3)} ${sistema.toFixed(2).padStart(14)} ${objetivo.toFixed(2).padStart(14)} ${(sistema - objetivo).toFixed(2).padStart(14)}`,
    );
  }

  console.log(`\nSistema:  ${totalSistema.toFixed(2)}`);
  console.log(`Objetivo: ${totalObjetivo.toFixed(2)}`);
  console.log(`SUB TOTAL 2 del Excel: 735255.55`);
}

main().catch((e) => {
  console.error("Fallo:", e instanceof Error ? e.message : e);
  process.exit(1);
});
