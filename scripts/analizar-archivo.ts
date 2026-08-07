import { readFile } from "node:fs/promises";
import { analizarExcel } from "../src/lib/excel-presupuesto";

// Utilidad de diagnostico: ejecuta el analizador contra un Excel real y
// muestra lo que detecta, sin tocar la base de datos.
//   npx tsx scripts/analizar-archivo.ts "ruta\al\presupuesto.xlsx"

async function main() {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error("Uso: npx tsx scripts/analizar-archivo.ts <archivo.xlsx>");
    process.exit(1);
  }

  const contenido = await readFile(ruta);
  const r = await analizarExcel(
    contenido.buffer.slice(
      contenido.byteOffset,
      contenido.byteOffset + contenido.byteLength,
    ) as ArrayBuffer,
  );

  console.log("=== DETECCION ===");
  console.log(`Fila de cabecera: ${r.filaCabecera}`);
  console.log("Columnas:", r.columnasDetectadas);

  console.log("\n=== RESUMEN ===");
  console.log(`Capitulos:  ${r.totalCapitulos}`);
  console.log(`Partidas:   ${r.totalPartidas}`);
  console.log(`Presupuesto (todo):        S/ ${r.montoTotal}`);
  console.log(`Presupuesto (sin repetir): S/ ${r.montoSinRepetidos}`);
  console.log(`Grupos con importe repetido: ${r.gruposRepetidos.length}`);
  console.log(`Incidencias: ${r.errores.length}`);

  if (r.errores.length > 0) {
    console.log("\n=== INCIDENCIAS ===");
    for (const e of r.errores.slice(0, 25)) {
      console.log(`  Fila ${e.fila}: ${e.mensaje}`);
    }
  }

  const avisos = r.filas.filter((f) => f.aviso);
  if (avisos.length > 0) {
    console.log(`\n=== AVISOS (${avisos.length}) ===`);
    for (const f of avisos.slice(0, 15)) {
      console.log(`  Fila ${f.fila} [${f.codigo}]: ${f.aviso}`);
    }
  }

  console.log("\n=== PRIMERAS 25 FILAS ===");
  for (const f of r.filas.slice(0, 25)) {
    const marca = f.tipo === "CAPITULO" ? "#" : " ";
    const desc = f.descripcion.slice(0, 46).padEnd(46);
    const und = (f.unidad ?? "").padEnd(5);
    const met = (f.metrado ?? "").padStart(12);
    const pu = (f.precioUnitario ?? "").padStart(12);
    const par = (f.parcial ?? "").padStart(12);
    console.log(`${marca} ${f.codigo.padEnd(10)} ${desc} ${und} ${met} ${pu} ${par}`);
  }
}

main().catch((e) => {
  console.error("Fallo:", e instanceof Error ? e.message : e);
  process.exit(1);
});
