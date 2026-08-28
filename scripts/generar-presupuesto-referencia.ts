/**
 * El presupuesto de referencia con el que se comprueba el importador.
 *
 *   npx tsx scripts/generar-presupuesto-referencia.ts
 *
 * POR QUE EXISTE. Las comprobaciones de punta a punta usaban el presupuesto de
 * un cliente, y eso tenia dos problemas. Uno de fondo: sus formulas estan mal
 * -rangos que se quedan cortos, un total que suma dos columnas, un capitulo sin
 * formula- y aunque eso lo hace un banco de pruebas util, no puede ser el
 * UNICO: un archivo defectuoso no sirve para saber si lo correcto entra bien.
 * Y uno practico: ese archivo no se versiona -es de un tercero y el repositorio
 * es publico-, asi que quien clone el proyecto no puede correr nada.
 *
 * Este es nuestro, esta BIEN construido, y trae a proposito los casos que
 * cuestan:
 *
 *   - Un subcapitulo escrito con ceros (`3.01.00`), la forma peruana que
 *     confunde la profundidad.
 *   - Una partida a suma alzada con su alcance colgando sin cifra.
 *   - Un descuento comercial en negativo.
 *   - Un capitulo con los porcentajes de su contratista.
 *   - Y un capitulo con DOS contratistas, cada uno en su subcapitulo.
 *
 * Las cifras son redondas para que las comprobaciones se lean, y estan
 * calculadas a mano en `docs/presupuesto-referencia.md`.
 */
import { writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";

const CABECERA = [
  "Ítem", "Descripción", "Und.", "Metrado", "Precio Unitario", "Parcial",
  "% Dcto", "% GG", "% Utilidad", "% Recargo",
];

type Fila = (string | number | null)[];

const FILAS: Fila[] = [
  // --- Capitulo simple, sin contratista. Suma llana: 8.000 ---------------
  ["1", "OBRAS PROVISIONALES", null, null, null, null, null, null, null, 15],
  ["1.01", "Cerco de obra", "ml", 100, 50, 5000, null, null, null, null],
  ["1.02", "Caseta de guardiania", "glb", 1, 3000, 3000, null, null, null, null],

  // --- Capitulo con contratista: 5% dcto, 8% GG, 10% utilidad -----------
  // 20.000 x 0,95 x 1,18 = 22.420
  ["2", "INSTALACIONES ELECTRICAS", null, null, null, null, 5, 8, 10, 20],
  ["2.01", "Salidas de luz", "und", 100, 100, 10000, null, null, null, null],
  ["2.02", "Tomacorrientes", "und", 60, 100, 6000, null, null, null, null],
  ["2.03", "Tableros", "und", 4, 1000, 4000, null, null, null, null],

  // --- Capitulo con subcapitulo escrito con CEROS y suma alzada ---------
  ["3", "INSTALACIONES SANITARIAS", null, null, null, null, null, null, null, 18],
  // La cabecera de grupo, un escalon por encima de sus partidas.
  ["3.01.00", "PRIMER PISO", null, null, null, null, null, null, null, null],
  ["3.01.01", "Punto de agua", "pto", 20, 150, 3000, null, null, null, null],
  ["3.01.02", "Punto de desague", "pto", 10, 200, 2000, null, null, null, null],
  // Suma alzada: el precio esta arriba y las hijas solo describen el alcance.
  ["3.02.00", "RED DE DESAGUE (subcontrato)", "glb", 1, null, 5000, null, null, null, null],
  ["3.02.01", "Incluye excavacion de zanja", "ml", 40, null, null, null, null, null, null],
  ["3.02.02", "Incluye tuberia y accesorios", "ml", 40, null, null, null, null, null, null],
  // Y un descuento comercial, que RESTA y no sustituye a nadie.
  ["3.03", "Descuento comercial sanitarias", "glb", 1, -500, -500, null, null, null, null],

  // --- Capitulo con DOS contratistas, uno por subcapitulo ---------------
  ["4", "ACABADOS", null, null, null, null, null, null, null, 22],
  // A: 10.000 x 0,90 x 1,15 = 10.350
  ["4.01.00", "PISOS - contratista A", null, null, null, null, 10, 5, 10, null],
  ["4.01.01", "Porcelanato", "m2", 200, 40, 8000, null, null, null, null],
  ["4.01.02", "Contrazocalo", "ml", 100, 20, 2000, null, null, null, null],
  // B: 6.000 x 1,20 = 7.200 (no descuenta, solo carga margen)
  ["4.02.00", "PINTURA - contratista B", null, null, null, null, null, 10, 10, null],
  ["4.02.01", "Pintura latex en muros", "m2", 400, 12, 4800, null, null, null, null],
  ["4.02.02", "Pintura en cielo raso", "m2", 100, 12, 1200, null, null, null, null],
];

/**
 * El libro, en memoria.
 *
 * Se EXPORTA en vez de dejar solo el archivo escrito, y esa es la gracia: los
 * guiones de comprobacion lo construyen al vuelo y no dependen de ningun
 * binario del repositorio. Asi cualquiera que clone el proyecto puede correr
 * las comprobaciones sin tener que pedir un archivo por correo, y no hay ni un
 * `.xlsx` versionado que alguien pueda confundir con el de un cliente.
 */
export async function construirPresupuestoReferencia(): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "GCM";
  const h = libro.addWorksheet("Costo Directo");

  h.columns = [
    { width: 10 }, { width: 40 }, { width: 8 }, { width: 10 },
    { width: 14 }, { width: 14 }, { width: 8 }, { width: 8 },
    { width: 10 }, { width: 10 },
  ];

  h.addRow(["PRESUPUESTO DE REFERENCIA - GCM"]);
  h.addRow(["Solo para comprobaciones. No es de ninguna obra real."]);
  h.addRow([]);
  h.addRow(CABECERA);
  h.getRow(4).font = { bold: true };

  for (const f of FILAS) {
    const fila = h.addRow(f);
    // El codigo, como TEXTO: si no, Excel convierte "3.01.00" en un numero.
    fila.getCell(1).numFmt = "@";
    for (const c of [4, 5, 6]) fila.getCell(c).numFmt = "#,##0.00";
  }

  return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Escribirlo a disco solo sirve para MIRARLO: nada del sistema lo lee. */
async function main() {
  await writeFile(
    "docs/presupuesto-referencia.xlsx",
    Buffer.from(await construirPresupuestoReferencia()),
  );
  console.log("escrito docs/presupuesto-referencia.xlsx con", FILAS.length, "filas");
  console.log("(no se versiona: los guiones lo construyen en memoria)");
}

if (process.argv[1]?.includes("generar-presupuesto-referencia")) main();
