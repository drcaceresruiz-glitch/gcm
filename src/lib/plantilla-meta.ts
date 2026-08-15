import ExcelJS from "exceljs";

import { HOJA_GASTOS } from "@/lib/excel-meta";

/**
 * La plantilla del PRESUPUESTO META, generada desde codigo.
 *
 * Mismo trato que la del presupuesto: no es un archivo suelto en `public/`,
 * se construye aqui con las convenciones que saben leer `analizarExcel` y
 * `analizarGastosGenerales`, y un test de ida y vuelta impide que plantilla e
 * importadores diverjan.
 *
 * La hoja de COSTO DIRECTO va la primera porque `analizarExcel` lee
 * `worksheets[0]`, y sus columnas son exactamente las del presupuesto: asi el
 * mismo importador sirve para los dos y no hay una segunda copia que mantener.
 *
 * Los ejemplos ensenan las dos cosas que el usuario pregunta siempre al ver
 * este documento por primera vez: que la meta lleva SUS precios (mas bajos
 * que los del contrato, ahi esta la bolsa) y que puede llevar lineas propias
 * que el contrato no desglosa. Y en la otra hoja, por que la utilidad no
 * aparece por ninguna parte.
 */

const FILA_CABECERA = 4;

const CABECERAS_COSTO = [
  "Ítem",
  "Descripción",
  "Und.",
  "Metrado",
  "Precio Unitario",
  "Parcial",
] as const;

const CABECERAS_GASTOS = [
  "Concepto",
  "Tipo",
  "Monto mensual",
  "Meses",
  "Importe fijo",
] as const;

interface FilaCosto {
  codigo: string;
  descripcion: string;
  unidad?: string;
  metrado?: number;
  precioUnitario?: number;
  parcial?: number;
}

/**
 * Los ejemplos del costo directo.
 *
 * Los codigos 1.x y 2.x espejan los de la plantilla de presupuesto a
 * proposito, con precios MAS BAJOS: puestos uno al lado del otro se ve de un
 * vistazo de donde sale la bolsa. El capitulo 3 no existe en el contrato y es
 * la otra mitad de la leccion.
 *
 * Todos los importes son distintos, como en la otra plantilla: dos iguales
 * seguidos disparan el aviso de "formula arrastrada" del importador y la
 * plantilla tiene que analizar limpia.
 */
export const FILAS_COSTO: readonly FilaCosto[] = [
  { codigo: "1.0", descripcion: "OBRAS PROVISIONALES Y TRABAJOS PRELIMINARES" },
  {
    codigo: "1.1",
    descripcion: "Cartel de identificación de obra 3.60 × 2.40 m",
    unidad: "und",
    metrado: 1,
    precioUnitario: 700,
    parcial: 700,
  },
  {
    codigo: "1.2",
    descripcion: "Cerco provisional de obra con paneles metálicos",
    unidad: "m",
    metrado: 45,
    precioUnitario: 28,
    parcial: 1260,
  },
  { codigo: "2.0", descripcion: "ESTRUCTURAS" },
  {
    codigo: "2.1",
    descripcion: "Concreto premezclado f'c = 210 kg/cm² en columnas",
    unidad: "m3",
    metrado: 12.5,
    precioUnitario: 352,
    parcial: 4400,
  },
  {
    codigo: "2.2",
    descripcion: "Acero de refuerzo fy = 4200 kg/cm², habilitado y colocado",
    unidad: "kg",
    metrado: 980,
    precioUnitario: 5.1,
    parcial: 4998,
  },
  {
    codigo: "3.0",
    descripcion: "COSTOS PROPIOS DE LA META (el contrato no los desglosa)",
  },
  {
    codigo: "3.1",
    descripcion: "Andamio metálico en alquiler",
    unidad: "mes",
    metrado: 4,
    precioUnitario: 380,
    parcial: 1520,
  },
  {
    codigo: "3.2",
    descripcion: "Cuadrilla de apoyo (ayudantes de obra)",
    unidad: "glb",
    metrado: 1,
    precioUnitario: 2600,
    parcial: 2600,
  },
] as const;

/** Suma de las filas de ejemplo, para que el test la fije. */
export const TOTAL_COSTO_EJEMPLO = "15478.00";

interface FilaGasto {
  concepto: string;
  tipo: "FIJO" | "VARIABLE";
  montoMensual?: number;
  meses?: number;
  montoFijo?: number;
}

/**
 * Los ejemplos de gastos generales.
 *
 * El almacenero lleva 6 meses de los 8 del plazo, y eso es deliberado: los
 * meses se piden POR LINEA porque nadie esta en obra todo el plazo, y con un
 * unico plazo global el numero saldria siempre de mas.
 */
export const FILAS_GASTOS: readonly FilaGasto[] = [
  { concepto: "Residente de obra", tipo: "VARIABLE", montoMensual: 6500, meses: 8 },
  { concepto: "Maestro de obra", tipo: "VARIABLE", montoMensual: 4200, meses: 8 },
  { concepto: "Almacenero", tipo: "VARIABLE", montoMensual: 2000, meses: 6 },
  {
    concepto: "Camioneta y combustible",
    tipo: "VARIABLE",
    montoMensual: 1800,
    meses: 8,
  },
  {
    concepto: "Carta fianza de fiel cumplimiento",
    tipo: "FIJO",
    montoFijo: 9500,
  },
  { concepto: "Póliza CAR", tipo: "FIJO", montoFijo: 4200 },
] as const;

/** Totales de los ejemplos, fijados por el test. */
export const TOTAL_GASTOS_EJEMPLO = "125700.00";
export const COSTE_MENSUAL_EJEMPLO = "14500.00";

const INSTRUCCIONES: readonly (readonly [string, string])[] = [
  ["Cómo llenar el presupuesto meta", ""],
  ["", ""],
  [
    "Qué es esto",
    "El presupuesto META es lo que TÚ te comprometes a gastar, no lo que el cliente paga. La diferencia entre los dos es la BOLSA OPERATIVA de la obra: el margen que gestionas.",
  ],
  [
    "1. Hoja «Costo Directo»",
    "Mismas columnas que la plantilla de presupuesto, con TUS precios reales: los rendimientos que de verdad consigues y lo que de verdad te cuestan tus subcontratos. Normalmente por debajo del contrato; ahí está la bolsa.",
  ],
  [
    "2. Espeja los códigos del contrato",
    "Usa el MISMO código de partida que el presupuesto contractual (1.1, 2.1…). Así la comparación sale línea a línea y puedes ver qué partida se come el margen. Si un código no coincide, esa línea no tendrá con qué compararse.",
  ],
  [
    "3. Líneas propias de la meta",
    "Puedes añadir costos que el contrato no desglosa: andamio alquilado, cuadrilla de apoyo, encofrado metálico (capítulo 3 del ejemplo). Ponles un código que NO exista en el contrato. Consumen bolsa, que es exactamente lo que hacen en la obra.",
  ],
  [
    "4. Lo que NO pongas se nota",
    "Si dejas una partida del contrato sin línea aquí, el sistema NO la cuenta como ahorro: te la marca como «sin meta» y te dice cuánto suma. Una meta incompleta parece un margen excelente, y no lo es.",
  ],
];

const INSTRUCCIONES_GASTOS: readonly (readonly [string, string])[] = [
  ["", ""],
  [
    "5. Hoja «Gastos Generales»",
    "Aquí NO se pide un porcentaje, se pide una lista. Los gastos generales no crecen con la producción: crecen con los MESES. Un porcentaje sobre el costo directo esconde el sobrecosto más caro que tiene una obra, que es la que se estira con todas sus partidas en meta.",
  ],
  [
    "6. VARIABLE contra FIJO",
    "VARIABLE es lo que se paga por mes (residente, maestro, camioneta, oficina): llena «Monto mensual» y «Meses», y deja «Importe fijo» vacío. FIJO es lo que no se mueve aunque la obra se alargue (cartas fianza, pólizas, licencias): llena solo «Importe fijo».",
  ],
  [
    "7. Los meses son por línea",
    "El almacenero del ejemplo está 6 meses de los 8 del plazo. Nadie está en obra todo el plazo, y con un único número global el gasto saldría siempre de más.",
  ],
  [
    "8. Para qué sirve separarlos",
    "De los VARIABLES sale lo que cuesta cada mes de atraso. En el ejemplo son S/ 14 500 al mes: eso es lo que pierdes por cada mes de más, y no se recupera trabajando mejor, solo terminando antes.",
  ],
  ["", ""],
  [
    "¿Y la utilidad?",
    "No aparece por ninguna parte, y es a propósito. La utilidad NO es un costo que puedas gastar: es el resultado. Si entra en la meta se vuelve presupuesto, la obra se la gasta y nadie lo nota hasta la liquidación. GCM la muestra aparte, al lado de la bolsa, etiquetada como lo que es.",
  ],
  [
    "Antes de importar",
    "Borra las filas de ejemplo de las dos hojas y escribe lo tuyo. Al importar verás una vista previa con totales y avisos ANTES de confirmar: nada se guarda sin que lo revises.",
  ],
];

const VERDE = "FF0D5C56";
const VERDE_SUAVE = "FFE8F0EF";

function pintarCabecera(fila: ExcelJS.Row, titulos: readonly string[]) {
  titulos.forEach((titulo, i) => {
    const celda = fila.getCell(i + 1);
    celda.value = titulo;
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    celda.alignment = { horizontal: i < 2 ? "left" : "center" };
  });
}

export async function generarPlantillaMeta(): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "GCM";

  // PRIMERA, siempre: `analizarExcel` lee `worksheets[0]`.
  const costo = libro.addWorksheet("Costo Directo");
  costo.columns = [
    { width: 10 }, { width: 56 }, { width: 8 },
    { width: 12 }, { width: 16 }, { width: 16 },
  ];

  costo.getCell("A1").value = "PRESUPUESTO META - COSTO DIRECTO";
  costo.getCell("A1").font = { bold: true, size: 14 };
  costo.getCell("A2").value =
    "Lo que TÚ te comprometes a gastar. La diferencia con el contrato es la bolsa.";
  costo.getCell("A2").font = { italic: true, color: { argb: "FF667788" } };

  pintarCabecera(costo.getRow(FILA_CABECERA), CABECERAS_COSTO);

  let n = FILA_CABECERA;
  for (const f of FILAS_COSTO) {
    n++;
    const fila = costo.getRow(n);
    fila.getCell(1).value = f.codigo;
    fila.getCell(2).value = f.descripcion;
    if (f.unidad) fila.getCell(3).value = f.unidad;
    if (f.metrado !== undefined) fila.getCell(4).value = f.metrado;
    if (f.precioUnitario !== undefined) fila.getCell(5).value = f.precioUnitario;
    if (f.parcial !== undefined) fila.getCell(6).value = f.parcial;

    fila.getCell(3).alignment = { horizontal: "center" };
    fila.getCell(4).numFmt = "#,##0.0000";
    fila.getCell(5).numFmt = "#,##0.00";
    fila.getCell(6).numFmt = "#,##0.00";

    const esCapitulo = f.codigo.endsWith(".0") || !f.codigo.includes(".");
    if (esCapitulo) {
      for (let c = 1; c <= 6; c++) {
        fila.getCell(c).font = { bold: true };
        fila.getCell(c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: VERDE_SUAVE },
        };
      }
    }
  }

  const gastos = libro.addWorksheet(HOJA_GASTOS);
  gastos.columns = [
    { width: 44 }, { width: 12 }, { width: 16 }, { width: 10 }, { width: 16 },
  ];

  gastos.getCell("A1").value = "PRESUPUESTO META - GASTOS GENERALES";
  gastos.getCell("A1").font = { bold: true, size: 14 };
  gastos.getCell("A2").value =
    "No es un porcentaje: es una lista con plazo. Crecen con los MESES, no con la producción.";
  gastos.getCell("A2").font = { italic: true, color: { argb: "FF667788" } };

  pintarCabecera(gastos.getRow(FILA_CABECERA), CABECERAS_GASTOS);

  let g = FILA_CABECERA;
  for (const f of FILAS_GASTOS) {
    g++;
    const fila = gastos.getRow(g);
    fila.getCell(1).value = f.concepto;
    fila.getCell(2).value = f.tipo;
    if (f.montoMensual !== undefined) fila.getCell(3).value = f.montoMensual;
    if (f.meses !== undefined) fila.getCell(4).value = f.meses;
    if (f.montoFijo !== undefined) fila.getCell(5).value = f.montoFijo;

    fila.getCell(2).alignment = { horizontal: "center" };
    fila.getCell(3).numFmt = "#,##0.00";
    fila.getCell(4).alignment = { horizontal: "center" };
    fila.getCell(5).numFmt = "#,##0.00";
  }

  const instrucciones = libro.addWorksheet("Instrucciones");
  instrucciones.columns = [{ width: 30 }, { width: 100 }];

  [...INSTRUCCIONES, ...INSTRUCCIONES_GASTOS].forEach(([titulo, cuerpo], i) => {
    const fila = instrucciones.getRow(i + 1);
    fila.getCell(1).value = titulo;
    fila.getCell(1).font = { bold: true };
    fila.getCell(2).value = cuerpo;
    fila.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });
  instrucciones.getRow(1).font = { bold: true, size: 13 };

  const salida = await libro.xlsx.writeBuffer();
  return new Uint8Array(salida as unknown as Uint8Array).buffer as ArrayBuffer;
}
