import ExcelJS from "exceljs";

// Presupuesto de prueba con la forma de una exportacion real de S10:
// filas de titulo antes de la tabla, capitulos intercalados y un par de
// filas defectuosas a proposito para ver la validacion en pantalla.

const libro = new ExcelJS.Workbook();
const hoja = libro.addWorksheet("Presupuesto");

hoja.addRow(["PRESUPUESTO DE OBRA"]);
hoja.addRow(["Obra: LABORATORIO CRIOCORD - LURIN"]);
hoja.addRow(["Cliente: Criocord    Fecha: 07/08/2026"]);
hoja.addRow([]);
hoja.addRow(["Item", "Descripción", "Und.", "Metrado", "Precio Unitario", "Parcial"]);

const filas: (string | number | null)[][] = [
  ["1.0", "CAPITULO I: GESTION, SEGURIDAD Y COSTOS INDIRECTOS", null, null, null, null],
  ["1.1", "Elaboracion de expediente tecnico", "glb", 1, 8500, 8500],
  ["1.2", "Equipos de proteccion personal", "und", 24, 145.5, 3492],
  ["1.3", "Señalizacion y cintas de seguridad", "ml", 180, 6.8, 1224],

  ["2.0", "CAPITULO II: TRABAJOS PRELIMINARES", null, null, null, null],
  ["2.1", "Movilizacion y desmovilizacion de equipos", "glb", 1, 4200, 4200],
  ["2.2", "Instalaciones provisionales de obra", "m2", 45, 118.4, 5328],
  ["2.4", "Trazo y replanteo inicial", "m2", 620, 3.75, 2325],

  ["3.0", "CAPITULO III: DEMOLICIONES Y DESMONTAJES", null, null, null, null],
  ["3.1", "Demolicion de tabiqueria y falsos cielos", "m2", 310, 28.5, 8835],
  ["3.2", "Desmontaje de falso techo piso 2", "m2", 240, 19.9, 4776],
  ["3.3", "Eliminacion de desmonte con acarreo", "m3", 68, 55, 3740],

  ["4.0", "CAPITULO IV: MOVIMIENTO DE TIERRA Y CIMENTACIONES", null, null, null, null],
  ["4.1", "Trazo y replanteo de cimentaciones", "m2", 120, 8.5, 1020],
  ["4.2", "Corte de losa de concreto existente", "ml", 30, 45, 1350],
  ["4.3", "Demolicion de losas de concreto", "und", 9, 180, 1620],
  ["4.4", "Excavacion para zapatas", "m3", 4.25, 95, 403.75],
  ["4.5", "Solado para zapatas e=4 pulg", "m2", 12, 38, 456],
  ["4.6", "Acero corrugado fy=4200 kg/cm2 en zapatas", "kg", 285, 6.2, 1767],
  ["4.7", "Concreto f'c=210 kg/cm2 en zapatas", "m3", 6.8, 420, 2856],
  ["4.8", "Curado de concreto en zapatas", "m2", 34, 12.4, 421.6],

  ["5.0", "CAPITULO V: ESTRUCTURAS METALICAS Y LOSAS", null, null, null, null],
  ["5.1", "Suministro de perfiles metalicos", "kg", 1850, 9.8, 18130],
  ["5.2", "Montaje de estructura metalica", "kg", 1850, 4.2, 7770],
  ["5.3", "Instalacion de piso compuesto OSB 18mm", "m2", 210, 96.5, 20265],
  ["5.4", "Tratamiento anticorrosivo de soporteria", "m2", 95, 34.8, 3306],

  ["6.0", "CAPITULO VI: ACI (AGUA CONTRA INCENDIOS)", null, null, null, null],
  ["6.1", "Suministro e instalacion de tuberia SCH40 4 pulg", "ml", 145, 168.9, 24490.5],
  ["6.2", "Rociadores tipo pendent", "und", 62, 88.4, 5480.8],
  ["6.3", "Pruebas hidrostaticas del sistema", "glb", 1, 3800, 3800],

  ["7.0", "CAPITULO VII: INSTALACIONES SANITARIAS", null, null, null, null],
  ["7.1", "Corte de losa y excavacion para redes", "ml", 88, 62.5, 5500],
  ["7.2", "Red de agua fria PVC C-10", "ml", 220, 41.3, 9086],
  ["7.3", "Red de desague PVC SAL 4 pulg", "ml", 165, 53.7, 8860.5],

  // --- Filas defectuosas a proposito ---
  ["7.4", "Partida sin metrado legible", "ml", "por definir", 45, null],
  ["7.2", "Codigo repetido a proposito", "ml", 10, 20, 200],
  ["A-9", "Codigo con formato invalido", "und", 5, 10, 50],
  ["7.5", "Parcial que no cuadra con metrado x precio", "und", 10, 25, 999],
];

for (const f of filas) hoja.addRow(f);

hoja.getColumn(2).width = 52;
hoja.getRow(5).font = { bold: true };

const destino =
  "C:\\Users\\USER\\AppData\\Local\\Temp\\claude\\C--Projects-PROYECTO-CONSTRUCCION\\125b0607-be0e-41de-b7a5-a39160555922\\scratchpad\\PRESUPUESTO_CRIOCORD.xlsx";

async function main() {
  await libro.xlsx.writeFile(destino);
  console.log(`Generado: ${destino}`);
  console.log(`Filas de datos: ${filas.length}`);
}

main();
