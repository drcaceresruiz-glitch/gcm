/**
 * Genera las dos hojas de calculo del trabajo de campo de la tesis.
 *
 *   npx tsx scripts/generar-hojas-validacion.ts "C:/ruta/donde/dejarlas"
 *
 * - **V de Aiken**: se teclean las valoraciones de los jueces y sale la V por
 *   elemento, por criterio y global, con el veredicto contra el 0,80.
 * - **Kappa de Cohen**: se teclean las dos clasificaciones y sale el acuerdo
 *   observado, el esperado por azar y el Kappa, con su interpretacion.
 *
 * NINGUNA FORMULA LLEVA UN `IF` SOBRE UN RANGO. Es la leccion del 28/08/2026:
 * `IF(ISNUMBER(rango),rango,0)` dentro de un SUMPRODUCT solo se evalua bien
 * como formula matricial, y escrita normal devuelve #!VALOR!. Aqui se usan
 * COUNT, SUM, COUNTIF y SUMPRODUCT de dos rangos, que funcionan siempre.
 */
import { writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";

const VERDE = "FFE8F5E9";
const AZUL = "FFE3F2FD";
const GRIS = "FFF5F5F5";

const INDICADORES: [string, string][] = [
  ["PPC", "Compromisos cumplidos entre comprometidos, por cien"],
  ["Tasa de liberacion oportuna", "Restricciones resueltas dentro de la fecha comprometida"],
  ["Retraso de liberacion", "Dias entre la fecha comprometida y la real"],
  ["Desviacion de plazo por tarea", "Dias entre el fin planificado y el real"],
  ["HHI de causas", "Concentracion de las causas de incumplimiento"],
  ["TRC", "Frecuencia de una causa despues entre antes del analisis"],
  ["LRO", "Semanas entre el primer fallo y la apertura del analisis"],
  ["TCAC", "Acciones correctivas cerradas entre comprometidas"],
];

const ITEMS_TAM: [string, string][] = [
  ["UP1", "Usar el sistema me permite terminar mis tareas mas rapido"],
  ["UP2", "Usar el sistema mejora mi desempeno en la obra"],
  ["UP3", "Usar el sistema aumenta lo que consigo avanzar"],
  ["UP4", "Usar el sistema me hace mas efectivo en mi trabajo"],
  ["UP5", "Usar el sistema me facilita hacer mi trabajo"],
  ["UP6", "En general, el sistema me resulta util en la obra"],
  ["FU1", "Aprender a usar el sistema me resulto facil"],
  ["FU2", "Consigo que el sistema haga lo que necesito sin dificultad"],
  ["FU3", "Lo que el sistema muestra en pantalla es claro y se entiende"],
  ["FU4", "El sistema se adapta a la forma en que trabajamos en obra"],
  ["FU5", "Me resulto facil llegar a manejarlo con soltura"],
  ["FU6", "En general, el sistema me resulta facil de usar"],
];

const CAUSAS = [
  "PRERREQUISITO", "MATERIALES", "MANO_OBRA", "EQUIPOS", "INFORMACION",
  "CLIENTE_TERCEROS", "CLIMA", "REPROGRAMACION", "OTRA",
];

function titulo(hoja: ExcelJS.Worksheet, fila: number, texto: string, sub?: string) {
  hoja.getCell(fila, 1).value = texto;
  hoja.getCell(fila, 1).font = { bold: true, size: 14 };
  if (sub) {
    hoja.getCell(fila + 1, 1).value = sub;
    hoja.getCell(fila + 1, 1).font = { italic: true, size: 10, color: { argb: "FF666666" } };
  }
}

function cabecera(hoja: ExcelJS.Worksheet, fila: number, textos: string[], color: string) {
  textos.forEach((t, i) => {
    const c = hoja.getCell(fila, i + 1);
    c.value = t;
    c.font = { bold: true, size: 10 };
    c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    c.border = {
      top: { style: "thin" }, left: { style: "thin" },
      bottom: { style: "thin" }, right: { style: "thin" },
    };
  });
  hoja.getRow(fila).height = 32;
}

// ---------------------------------------------------------------------------
// 1. V de Aiken
// ---------------------------------------------------------------------------
function hojaAiken(libro: ExcelJS.Workbook) {
  const h = libro.addWorksheet("Valoraciones");
  h.columns = [
    { width: 10 }, { width: 52 },
    { width: 7 }, { width: 7 }, { width: 7 },
    { width: 7 }, { width: 7 }, { width: 7 },
    { width: 7 }, { width: 7 }, { width: 7 },
    { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 14 },
  ];

  titulo(h, 1, "VALIDACION POR JUICIO DE EXPERTOS  ·  V de Aiken",
    "Escribe solo las celdas verdes: la valoracion de 1 a 4 de cada juez. Todo lo demas se calcula solo.");

  h.getCell(4, 1).value = "Escala: 1 = no cumple · 2 = bajo nivel · 3 = aceptable · 4 = cumple plenamente     Criterio de aceptacion: V mayor o igual que 0,80";
  h.getCell(4, 1).font = { size: 10, italic: true };

  const FILA_CAB = 6;
  h.mergeCells(FILA_CAB - 1, 3, FILA_CAB - 1, 5);
  h.mergeCells(FILA_CAB - 1, 6, FILA_CAB - 1, 8);
  h.mergeCells(FILA_CAB - 1, 9, FILA_CAB - 1, 11);
  h.mergeCells(FILA_CAB - 1, 12, FILA_CAB - 1, 16);
  for (const [col, texto] of [[3, "EXPERTO 1"], [6, "EXPERTO 2"], [9, "EXPERTO 3"], [12, "RESULTADO"]] as [number, string][]) {
    const c = h.getCell(FILA_CAB - 1, col);
    c.value = texto;
    c.font = { bold: true, size: 10 };
    c.alignment = { horizontal: "center" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col === 12 ? AZUL : GRIS } };
  }

  cabecera(h, FILA_CAB, [
    "Codigo", "Elemento que se valora",
    "Pert.", "Relev.", "Clar.",
    "Pert.", "Relev.", "Clar.",
    "Pert.", "Relev.", "Clar.",
    "V pertinencia", "V relevancia", "V claridad", "V del elemento", "Veredicto",
  ], AZUL);

  let f = FILA_CAB + 1;
  const filasElemento: number[] = [];

  const bloque = (rotulo: string, filas: [string, string][], prefijo: string) => {
    const c = h.getCell(f, 1);
    c.value = rotulo;
    c.font = { bold: true, size: 11 };
    h.mergeCells(f, 1, f, 16);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    f++;
    for (const [cod, texto] of filas) {
      h.getCell(f, 1).value = prefijo ? cod : cod;
      h.getCell(f, 2).value = texto;
      h.getCell(f, 2).alignment = { wrapText: true };

      // Las nueve celdas de entrada.
      for (let col = 3; col <= 11; col++) {
        const celda = h.getCell(f, col);
        celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
        celda.alignment = { horizontal: "center" };
        celda.border = {
          top: { style: "hair" }, left: { style: "hair" },
          bottom: { style: "hair" }, right: { style: "hair" },
        };
        celda.dataValidation = {
          type: "whole", operator: "between", formulae: [1, 4],
          allowBlank: true, showErrorMessage: true,
          errorTitle: "Valor fuera de la escala",
          error: "La valoracion va de 1 a 4.",
        };
      }

      /*
       * V = S / (n * (c-1)), con S = suma de (valoracion - 1).
       *
       * El numero de jueces se CUENTA en vez de fijarse en tres: asi la hoja
       * sigue valiendo si un experto no devuelve la ficha o si se suma un
       * cuarto. `COUNT` ignora las celdas vacias, que es justo lo que hace
       * falta -y no hay ningun IF sobre un rango, que es lo que rompe en
       * Excel-.
       */
      const vDe = (celdas: string) =>
        `IF(COUNT(${celdas})=0,"",(SUM(${celdas})-COUNT(${celdas}))/(COUNT(${celdas})*3))`;

      h.getCell(f, 12).value = { formula: vDe(`C${f},F${f},I${f}`), result: undefined };
      h.getCell(f, 13).value = { formula: vDe(`D${f},G${f},J${f}`), result: undefined };
      h.getCell(f, 14).value = { formula: vDe(`E${f},H${f},K${f}`), result: undefined };
      h.getCell(f, 15).value = { formula: vDe(`C${f}:K${f}`), result: undefined };
      h.getCell(f, 16).value = {
        formula: `IF(O${f}="","",IF(O${f}>=0.8,"Aceptado","REVISAR"))`,
        result: undefined,
      };
      for (let col = 12; col <= 15; col++) {
        h.getCell(f, col).numFmt = "0.000";
        h.getCell(f, col).alignment = { horizontal: "center" };
      }
      h.getCell(f, 16).alignment = { horizontal: "center" };
      h.getCell(f, 16).font = { bold: true };

      filasElemento.push(f);
      f++;
    }
  };

  bloque("PARTE A · Indicadores de la ficha de registro (instrumento principal)", INDICADORES, "");
  bloque("PARTE B · Items del cuestionario de percepcion (adaptacion del TAM)", ITEMS_TAM, "");

  // El resumen del instrumento.
  const primera = filasElemento[0]!;
  const ultima = filasElemento.at(-1)!;
  f += 1;
  h.getCell(f, 2).value = "V GLOBAL DEL INSTRUMENTO";
  h.getCell(f, 2).font = { bold: true, size: 12 };
  for (let col = 12; col <= 15; col++) {
    const letra = String.fromCharCode(64 + col);
    h.getCell(f, col).value = {
      formula: `IF(COUNT(${letra}${primera}:${letra}${ultima})=0,"",AVERAGE(${letra}${primera}:${letra}${ultima}))`,
      result: undefined,
    };
    h.getCell(f, col).numFmt = "0.000";
    h.getCell(f, col).font = { bold: true };
    h.getCell(f, col).alignment = { horizontal: "center" };
  }
  h.getCell(f, 16).value = {
    formula: `IF(O${f}="","",IF(O${f}>=0.8,"Aceptado","REVISAR"))`,
    result: undefined,
  };
  h.getCell(f, 16).font = { bold: true };
  h.getCell(f, 16).alignment = { horizontal: "center" };

  f += 2;
  h.getCell(f, 2).value = "Elementos por debajo de 0,80 (hay que corregirlos o retirarlos, y documentar la decision):";
  h.getCell(f, 2).font = { bold: true };
  h.getCell(f, 12).value = {
    formula: `COUNTIF(P${primera}:P${ultima},"REVISAR")`,
    result: undefined,
  };
  h.getCell(f, 12).font = { bold: true };
  h.getCell(f, 12).alignment = { horizontal: "center" };

  h.views = [{ state: "frozen", xSplit: 2, ySplit: FILA_CAB }];
  return h;
}

function hojaExpertos(libro: ExcelJS.Workbook) {
  const h = libro.addWorksheet("Los expertos");
  h.columns = [{ width: 22 }, { width: 34 }, { width: 34 }, { width: 34 }];
  titulo(h, 1, "QUIENES VALIDARON",
    "Va como anexo de la tesis. Sin esto, la validacion no se puede acreditar.");

  const filas = [
    "Nombres y apellidos", "Grado academico", "Cargo actual e institucion",
    "Anos de experiencia en gestion de obra", "Fecha de la valoracion",
    "Dictamen general", "Observaciones",
  ];
  cabecera(h, 3, ["", "Experto 1", "Experto 2", "Experto 3"], AZUL);
  filas.forEach((r, i) => {
    const fila = 4 + i;
    h.getCell(fila, 1).value = r;
    h.getCell(fila, 1).font = { bold: true, size: 10 };
    for (let c = 2; c <= 4; c++) {
      h.getCell(fila, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
      h.getCell(fila, c).border = {
        top: { style: "hair" }, left: { style: "hair" },
        bottom: { style: "hair" }, right: { style: "hair" },
      };
      h.getCell(fila, c).alignment = { wrapText: true, vertical: "top" };
    }
    h.getRow(fila).height = r === "Observaciones" ? 60 : 20;
  });

  h.getCell(12, 1).value =
    "Con tres expertos y escala de cuatro puntos, el denominador de la V es 3 x 3 = 9. " +
    "Al menos uno debe tener grado academico, y todos experiencia acreditada en gestion de obra o Lean Construction.";
  h.getCell(12, 1).font = { italic: true, size: 10 };
  h.mergeCells(12, 1, 12, 4);
  h.getRow(12).height = 30;
}

// ---------------------------------------------------------------------------
// 2. Kappa de Cohen
// ---------------------------------------------------------------------------
function hojaKappa(libro: ExcelJS.Workbook) {
  const h = libro.addWorksheet("Clasificaciones");
  h.columns = [{ width: 8 }, { width: 15 }, { width: 52 }, { width: 22 }, { width: 22 }, { width: 12 }];

  titulo(h, 1, "CONFIABILIDAD DE LA CLASIFICACION  ·  Kappa de Cohen",
    "Dos personas clasifican POR SEPARADO los mismos incumplimientos. Escribe solo las celdas verdes.");

  h.getCell(4, 1).value =
    "Hacen falta entre 30 y 50 incumplimientos. Los dos evaluadores no se consultan entre si, " +
    "y ninguno ve lo que puso el otro hasta que terminan. Se recomienda coger casos de las DOS fases del estudio.";
  h.getCell(4, 1).font = { italic: true, size: 10 };
  h.mergeCells(4, 1, 4, 6);
  h.getRow(4).height = 30;

  const CAB = 6;
  cabecera(h, CAB, ["N.o", "Semana", "Que paso (el incumplimiento)", "Evaluador 1", "Evaluador 2", "Coincide"], AZUL);

  const FILAS = 50;
  for (let i = 0; i < FILAS; i++) {
    const f = CAB + 1 + i;
    h.getCell(f, 1).value = i + 1;
    h.getCell(f, 1).alignment = { horizontal: "center" };
    for (const col of [2, 3, 4, 5]) {
      h.getCell(f, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
      h.getCell(f, col).border = {
        top: { style: "hair" }, left: { style: "hair" },
        bottom: { style: "hair" }, right: { style: "hair" },
      };
    }
    for (const col of [4, 5]) {
      h.getCell(f, col).dataValidation = {
        type: "list", allowBlank: true,
        formulae: [`"${CAUSAS.join(",")}"`],
        showErrorMessage: true,
        errorTitle: "Causa no valida",
        error: "Elige una de las nueve causas de la lista.",
      };
    }
    h.getCell(f, 6).value = {
      formula: `IF(OR(D${f}="",E${f}=""),"",IF(D${f}=E${f},1,0))`,
      result: undefined,
    };
    h.getCell(f, 6).alignment = { horizontal: "center" };
  }

  h.views = [{ state: "frozen", ySplit: CAB }];

  // ---- La hoja del calculo
  const c = libro.addWorksheet("Calculo del Kappa");
  c.columns = [{ width: 26 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 40 }];
  titulo(c, 1, "CALCULO DEL KAPPA", "Se calcula solo desde la hoja anterior. No hay nada que escribir aqui.");

  const primera = CAB + 1;
  const ultima = CAB + FILAS;
  const rangoD = `Clasificaciones!$D$${primera}:$D$${ultima}`;
  const rangoE = `Clasificaciones!$E$${primera}:$E$${ultima}`;

  cabecera(c, 4, ["Causa", "Evaluador 1", "Evaluador 2", "Proporcion 1", "Proporcion 2", "Producto"], AZUL);
  CAUSAS.forEach((causa, i) => {
    const f = 5 + i;
    c.getCell(f, 1).value = causa;
    c.getCell(f, 2).value = { formula: `COUNTIF(${rangoD},A${f})`, result: undefined };
    c.getCell(f, 3).value = { formula: `COUNTIF(${rangoE},A${f})`, result: undefined };
    c.getCell(f, 4).value = { formula: `IF($B$${5 + CAUSAS.length}=0,"",B${f}/$B$${5 + CAUSAS.length})`, result: undefined };
    c.getCell(f, 5).value = { formula: `IF($C$${5 + CAUSAS.length}=0,"",C${f}/$C$${5 + CAUSAS.length})`, result: undefined };
    c.getCell(f, 6).value = { formula: `IF(D${f}="","",D${f}*E${f})`, result: undefined };
    for (const col of [4, 5, 6]) c.getCell(f, col).numFmt = "0.0000";
  });

  const fTot = 5 + CAUSAS.length;
  c.getCell(fTot, 1).value = "TOTAL";
  c.getCell(fTot, 1).font = { bold: true };
  c.getCell(fTot, 2).value = { formula: `SUM(B5:B${fTot - 1})`, result: undefined };
  c.getCell(fTot, 3).value = { formula: `SUM(C5:C${fTot - 1})`, result: undefined };
  c.getCell(fTot, 6).value = { formula: `SUM(F5:F${fTot - 1})`, result: undefined };
  c.getCell(fTot, 6).numFmt = "0.0000";
  for (const col of [2, 3, 6]) c.getCell(fTot, col).font = { bold: true };

  const r = fTot + 3;
  const filas: [string, string, string][] = [
    ["Casos clasificados por los dos", `COUNT(Clasificaciones!$F$${primera}:$F$${ultima})`,
      "Solo cuentan los que tienen las dos clasificaciones."],
    ["Acuerdos", `SUM(Clasificaciones!$F$${primera}:$F$${ultima})`,
      "En cuantos coincidieron."],
    ["Po - acuerdo observado", `IF(B${r}=0,"",B${r + 1}/B${r})`,
      "La proporcion en que coinciden, sin descontar el azar."],
    ["Pe - acuerdo esperado por azar", `F${fTot}`,
      "Lo que coincidirian dos personas clasificando al tuntun, dada la frecuencia de cada causa."],
    ["KAPPA DE COHEN", `IF(OR(B${r + 2}="",B${r + 3}=1),"",(B${r + 2}-B${r + 3})/(1-B${r + 3}))`,
      "El acuerdo que queda una vez descontado el azar."],
  ];
  filas.forEach(([rotulo, formula, nota], i) => {
    const f = r + i;
    c.getCell(f, 1).value = rotulo;
    c.getCell(f, 1).font = { bold: i === 4, size: i === 4 ? 12 : 11 };
    c.getCell(f, 2).value = { formula, result: undefined };
    c.getCell(f, 2).numFmt = i < 2 ? "0" : "0.0000";
    c.getCell(f, 2).font = { bold: i === 4, size: i === 4 ? 12 : 11 };
    c.getCell(f, 2).alignment = { horizontal: "center" };
    c.getCell(f, 6).value = nota;
    c.getCell(f, 6).font = { italic: true, size: 9, color: { argb: "FF666666" } };
    c.getCell(f, 6).alignment = { wrapText: true };
  });

  const fK = r + 4;
  const fInterp = fK + 2;
  c.getCell(fInterp, 1).value = "Interpretacion";
  c.getCell(fInterp, 1).font = { bold: true };
  c.getCell(fInterp, 2).value = {
    formula:
      `IF(B${fK}="","",` +
      `IF(B${fK}<0.21,"Ligero - no sirve",` +
      `IF(B${fK}<0.41,"Aceptable bajo - no sirve",` +
      `IF(B${fK}<0.61,"Moderado - insuficiente",` +
      `IF(B${fK}<0.81,"Sustancial - SATISFACTORIO",` +
      `"Casi perfecto - SATISFACTORIO")))))`,
    result: undefined,
  };
  c.getCell(fInterp, 2).font = { bold: true };
  c.mergeCells(fInterp, 2, fInterp, 4);

  c.getCell(fInterp + 2, 1).value =
    "Criterio de la tesis: se acepta con Kappa mayor que 0,61 (Landis y Koch, 1977). " +
    "Por debajo, la clasificacion de causas no es fiable y hay que afinar las definiciones ANTES de seguir midiendo.";
  c.getCell(fInterp + 2, 1).font = { italic: true, size: 10 };
  c.mergeCells(fInterp + 2, 1, fInterp + 2, 6);
  c.getRow(fInterp + 2).height = 30;
}

async function main() {
  const destino = process.argv[2] ?? ".";

  const aiken = new ExcelJS.Workbook();
  aiken.creator = "GCM";
  hojaAiken(aiken);
  hojaExpertos(aiken);
  await writeFile(
    `${destino}/1 - Validacion por expertos (V de Aiken).xlsx`,
    Buffer.from(await aiken.xlsx.writeBuffer()),
  );

  const kappa = new ExcelJS.Workbook();
  kappa.creator = "GCM";
  hojaKappa(kappa);
  await writeFile(
    `${destino}/2 - Confiabilidad de la clasificacion (Kappa de Cohen).xlsx`,
    Buffer.from(await kappa.xlsx.writeBuffer()),
  );

  console.log("generadas las dos hojas en:", destino);
}

main();
