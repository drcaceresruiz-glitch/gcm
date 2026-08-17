/**
 * Genera los dos Excel de una obra de ejemplo COMPLETA, en los formatos que
 * los importadores de GCM ya saben leer, y los verifica con los propios
 * lectores de la aplicacion antes de dejarlos escritos.
 *
 * El contenido es el del seed (`prisma/seed.ts`), que es el unico juego de
 * cifras verificado contra lo que la app calcula: el planeado del capitulo es
 * la ponderacion por duracion de sus hojas, y el real tambien. Inventar aqui
 * un 100 redondo haria que el informe se contradijera en la misma caja.
 */
import ExcelJS from "exceljs";
import { writeFile } from "node:fs/promises";
import { analizarExcel } from "@/lib/excel-presupuesto";
import { analizarCronogramaExcel } from "@/lib/excel-cronograma";

const OBRA = "OBRA DE EJEMPLO PARA SIMULACION";
const FECHA_CORTE = "2026-08-17";

/// A donde se escriben. Por defecto, al lado del repositorio.
///   npx tsx scripts/generar-excels-obra-ejemplo.ts [carpeta]
const SALIDA = process.argv[2] ?? ".";

const CAPITULOS: ReadonlyArray<readonly [string, string]> = [
  ["1.0", "CAPITULO I: OBRAS PROVISIONALES"],
  ["2.0", "CAPITULO II: TRABAJOS PRELIMINARES"],
  ["3.0", "CAPITULO III: DEMOLICIONES Y DESMONTAJES"],
  ["4.0", "CAPITULO IV: MOVIMIENTO DE TIERRA Y CIMENTACIONES"],
  ["5.0", "CAPITULO V: ESTRUCTURAS METALICAS Y LOSAS"],
  ["6.0", "CAPITULO VI: ACI (AGUA CONTRA INCENDIOS)"],
  ["7.0", "CAPITULO VII: INSTALACIONES SANITARIAS (AGUA Y DESAGUE)"],
  ["8.0", "CAPITULO VIII: INSTALACIONES ELECTRICAS Y COMUNICACIONES"],
  ["9.0", "CAPITULO IX: SISTEMA DE DETECCION Y ALARMA CONTRA INCENDIOS"],
  ["10.0", "CAPITULO X: HVAC (AIRE ACONDICIONADO Y VENTILACION)"],
  ["11.0", "CAPITULO XI: ARQUITECTURA Y ACABADOS"],
  ["12.0", "CAPITULO XII: CIERRE, PRUEBAS INTEGRALES Y ENTREGA"],
];

/** codigo, descripcion, unidad, metrado, precio unitario. */
const PARTIDAS: ReadonlyArray<readonly [string, string, string, number, number]> = [
  ["4.1", "Trazo y replanteo de cimentaciones", "m2", 120.0, 8.5],
  ["4.2", "Corte de losa de concreto existente", "ml", 30.0, 45.0],
  ["4.3", "Demolicion de losas de concreto", "und", 9.0, 180.0],
  ["4.4", "Excavacion para zapatas", "m3", 4.25, 95.0],
  ["4.5", "Solado para zapatas e=4 pulg", "m2", 12.0, 38.0],
  ["4.6", "Acero corrugado fy=4200 kg/cm2 en zapatas", "kg", 285.0, 6.2],
  ["4.7", "Concreto f'c=210 kg/cm2 en zapatas", "m3", 6.8, 420.0],
  ["4.8", "Eliminacion de desmonte con acarreo", "m3", 15.0, 55.0],
];

/**
 * uid, codigo, nombre, inicio, fin, dias, planeado, real.
 *
 * Las cifras del capitulo son la ponderacion por duracion de las ocho hojas:
 *   planeado = (2+2+2+3+1) x 100 / 15 = 66.67
 *   real     = ((2+2+2+3) x 100 + 1 x 60) / 15 = 64.00
 * La 4.6 empieza EL DIA del corte y por eso vale 0: `fraccion()` comprueba
 * `fecha <= inicio` antes que `fecha >= fin`.
 */
const TAREAS: ReadonlyArray<{
  uid: number; codigo: string; nombre: string; inicio: string; fin: string;
  dias: number; planeado: number; real: number; depende: string;
}> = [
  { uid: 41, codigo: "4.1", nombre: "Trazo y replanteo de cimentaciones", inicio: "2026-08-03", fin: "2026-08-04", dias: 2, planeado: 100, real: 100, depende: "" },
  { uid: 42, codigo: "4.2", nombre: "Corte de losa de concreto existente", inicio: "2026-08-05", fin: "2026-08-06", dias: 2, planeado: 100, real: 100, depende: "41" },
  { uid: 43, codigo: "4.3", nombre: "Demolicion de losas de concreto", inicio: "2026-08-07", fin: "2026-08-10", dias: 2, planeado: 100, real: 100, depende: "42" },
  { uid: 44, codigo: "4.4", nombre: "Excavacion para zapatas", inicio: "2026-08-11", fin: "2026-08-13", dias: 3, planeado: 100, real: 100, depende: "43" },
  { uid: 45, codigo: "4.5", nombre: "Solado para zapatas e=4 pulg", inicio: "2026-08-14", fin: "2026-08-14", dias: 1, planeado: 100, real: 60, depende: "44" },
  { uid: 46, codigo: "4.6", nombre: "Acero corrugado fy=4200 kg/cm2 en zapatas", inicio: "2026-08-17", fin: "2026-08-18", dias: 2, planeado: 0, real: 0, depende: "45" },
  { uid: 47, codigo: "4.7", nombre: "Concreto f'c=210 kg/cm2 en zapatas", inicio: "2026-08-19", fin: "2026-08-20", dias: 2, planeado: 0, real: 0, depende: "46" },
  { uid: 48, codigo: "4.8", nombre: "Eliminacion de desmonte con acarreo", inicio: "2026-08-21", fin: "2026-08-21", dias: 1, planeado: 0, real: 0, depende: "47" },
];

const CAP_DIAS = TAREAS.reduce((s, t) => s + t.dias, 0);
const pond = (v: (t: (typeof TAREAS)[number]) => number) =>
  Math.round((TAREAS.reduce((s, t) => s + t.dias * v(t), 0) / CAP_DIAS) * 100) / 100;

function cabecera(fila: ExcelJS.Row, textos: readonly string[]): void {
  textos.forEach((t, i) => {
    const c = fila.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F7186" } };
  });
}

async function presupuesto(): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "GCM";
  const hoja = libro.addWorksheet("Presupuesto");
  hoja.columns = [
    { width: 10 }, { width: 56 }, { width: 8 },
    { width: 12 }, { width: 16 }, { width: 16 },
  ];

  hoja.getCell("A1").value = "PRESUPUESTO DE OBRA";
  hoja.getCell("A1").font = { bold: true, size: 14 };
  hoja.getCell("A2").value = OBRA;

  cabecera(hoja.getRow(4), ["Ítem", "Descripción", "Und.", "Metrado", "Precio Unitario", "Parcial"]);

  let n = 5;
  for (const [codigo, descripcion] of CAPITULOS) {
    const fila = hoja.getRow(n++);
    fila.getCell(1).value = codigo;
    fila.getCell(2).value = descripcion;
    for (let c = 1; c <= 6; c++) fila.getCell(c).font = { bold: true };

    // Las partidas van INMEDIATAMENTE detras de su capitulo: la jerarquia del
    // presupuesto se lee por el codigo y por el orden de las filas.
    if (codigo !== "4.0") continue;

    for (const [cod, desc, unidad, metrado, pu] of PARTIDAS) {
      const f = hoja.getRow(n++);
      f.getCell(1).value = cod;
      f.getCell(2).value = desc;
      f.getCell(3).value = unidad;
      f.getCell(4).value = metrado;
      f.getCell(5).value = pu;
      f.getCell(6).value = Math.round(metrado * pu * 100) / 100;
      f.getCell(4).numFmt = "#,##0.00";
      f.getCell(5).numFmt = "#,##0.00";
      f.getCell(6).numFmt = "#,##0.00";
    }
  }

  return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
}

async function cronograma(): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "GCM";
  const hoja = libro.addWorksheet("Cronograma");
  hoja.columns = [
    { width: 8 }, { width: 8 }, { width: 7 }, { width: 12 }, { width: 52 },
    { width: 13 }, { width: 13 }, { width: 9 }, { width: 13 }, { width: 12 },
    { width: 16 },
  ];

  hoja.getCell("A1").value = "CRONOGRAMA DE OBRA";
  hoja.getCell("A1").font = { bold: true, size: 14 };
  hoja.getCell("A3").value = "Obra:";
  hoja.getCell("B3").value = OBRA;
  hoja.getCell("A4").value = "Fecha de corte:";
  hoja.getCell("B4").value = FECHA_CORTE;
  hoja.getCell("A5").value = "Minutos por día:";
  hoja.getCell("B5").value = 480;

  cabecera(hoja.getRow(6), [
    "N°", "ID", "Nivel", "Código", "Actividad", "Inicio", "Fin",
    "Días", "% Planeado", "% Avance", "Depende de",
  ]);

  // Una sola fila de Nivel 1: dos dejarian la obra partida en dos. La obra y
  // el capitulo llevan la ponderacion por duracion de las ocho hojas, no un
  // 100 redondo, porque la app LEE el planeado del padre y CALCULA el real de
  // las hijas: si difieren, el mismo informe imprime dos cifras distintas.
  const planeado = pond((t) => t.planeado);
  const real = pond((t) => t.real);

  const filas = [
    { n: 1, id: 1, nivel: 1, codigo: "", actividad: OBRA, inicio: "2026-08-03", fin: "2026-08-21", dias: CAP_DIAS, planeado, avance: real, depende: "" },
    { n: 2, id: 40, nivel: 2, codigo: "4.0", actividad: "CAPITULO IV: MOVIMIENTO DE TIERRA Y CIMENTACIONES", inicio: "2026-08-03", fin: "2026-08-21", dias: CAP_DIAS, planeado, avance: real, depende: "" },
    ...TAREAS.map((t, i) => ({
      n: i + 3, id: t.uid, nivel: 3, codigo: t.codigo, actividad: t.nombre,
      inicio: t.inicio, fin: t.fin, dias: t.dias,
      planeado: t.planeado, avance: t.real, depende: t.depende,
    })),
  ];

  filas.forEach((f, i) => {
    const fila = hoja.getRow(7 + i);
    const v = [f.n, f.id, f.nivel, f.codigo, f.actividad, f.inicio, f.fin, f.dias, f.planeado, f.avance, f.depende];
    v.forEach((x, c) => (fila.getCell(c + 1).value = x));
    for (const c of [8, 9, 10]) fila.getCell(c).numFmt = "#,##0.00";
    if (f.nivel <= 2) for (let c = 1; c <= 11; c++) fila.getCell(c).font = { bold: true };
  });

  return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
}

/**
 * Se verifica con los LECTORES DE LA APP, no a ojo: un Excel que parece bien
 * y que el importador rechaza no sirve de nada, y eso solo se sabe pasandolo
 * por el mismo codigo que lo va a leer en produccion.
 */
async function main() {
  const p = await presupuesto();
  const c = await cronograma();

  const ap = await analizarExcel(p);
  console.log("\n=== PRESUPUESTO ===");
  console.log(`capitulos=${ap.totalCapitulos} partidas=${ap.totalPartidas} errores=${ap.errores.length}`);
  console.log(`total S/ ${ap.filas.filter((f) => f.tipo === "PARTIDA").reduce((s, f) => s + Number(f.parcial ?? 0), 0).toFixed(2)}`);
  for (const e of ap.errores) console.log(`  ERROR fila ${e.fila}: ${e.mensaje}`);
  for (const f of ap.filas.filter((x) => x.aviso)) console.log(`  aviso fila ${f.fila}: ${f.aviso}`);

  const ac = await analizarCronogramaExcel(c);
  console.log("\n=== CRONOGRAMA ===");
  console.log(`tareas=${ac.totalTareas} hitos=${ac.totalHitos} corte=${ac.fechaCorte} plazo=${ac.inicio}..${ac.fin} dep=${ac.dependencias.length} errores=${ac.errores.length}`);
  for (const e of ac.errores) console.log(`  ERROR fila ${e.fila}: ${e.mensaje}`);
  for (const t of ac.tareas.filter((x) => x.aviso)) console.log(`  aviso ${t.codigo}: ${t.aviso}`);
  console.log("  raiz:", JSON.stringify(ac.tareas[0]?.porcentajePlaneado), "capitulo:", JSON.stringify(ac.tareas[1]?.porcentajePlaneado));

  if (ap.errores.length > 0 || ac.errores.length > 0) {
    throw new Error("Los lectores de GCM rechazan estos archivos: NO se escriben.");
  }

  await writeFile(`${SALIDA}/gcm-presupuesto-obra-ejemplo.xlsx`, Buffer.from(p));
  await writeFile(`${SALIDA}/gcm-cronograma-obra-ejemplo.xlsx`, Buffer.from(c));
  console.log(`\nESCRITOS en ${SALIDA}`);
}

main();
