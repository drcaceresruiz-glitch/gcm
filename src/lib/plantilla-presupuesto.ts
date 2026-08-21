import ExcelJS from "exceljs";

/**
 * La plantilla ideal de presupuesto, generada desde codigo.
 *
 * No es un archivo suelto en `public/`: se CONSTRUYE aqui, con las mismas
 * convenciones que `analizarExcel` sabe leer, y un test de ida y vuelta
 * (generar -> analizar) garantiza que plantilla e importador no puedan
 * divergir jamas. Un archivo estatico se habria quedado viejo al primer
 * cambio del importador, y una plantilla que el propio sistema no puede
 * importar es peor que ninguna.
 *
 * Las filas de ejemplo son didacticas a proposito: ensenan la convencion de
 * codigos (1.0 capitulo, 1.1 partida) y los tres modos de contratar una
 * partida (precios unitarios, suma alzada, y la global "glb"), que es
 * exactamente lo que el usuario pregunto no entender. La segunda hoja lo
 * explica en palabras.
 */

/** La fila donde empieza la tabla (antes van titulo y nombre de la obra). */
const FILA_CABECERA = 4;

/**
 * Filas preparadas con formula por debajo de los ejemplos.
 *
 * CADA OBRA TIENE UN NUMERO DISTINTO DE PARTIDAS. Van vacias: sin
 * descripcion el importador las salta, y la formula aparece sola en cuanto
 * se escribe la linea.
 */
const FILAS_PREPARADAS = 60;

const CABECERAS = [
  "Ítem",
  "Descripción",
  "Und.",
  "Metrado",
  "Precio Unitario",
  "Parcial",
] as const;

interface FilaEjemplo {
  codigo: string;
  descripcion: string;
  unidad?: string;
  metrado?: number;
  precioUnitario?: number;
  parcial?: number;
}

/**
 * Los ejemplos. Los importes son todos DISTINTOS a proposito: dos importes
 * iguales consecutivos disparan el aviso de "formula arrastrada" del
 * importador, y la plantilla debe analizar limpia.
 */
export const FILAS_EJEMPLO: readonly FilaEjemplo[] = [
  { codigo: "1.0", descripcion: "OBRAS PROVISIONALES Y TRABAJOS PRELIMINARES" },
  {
    codigo: "1.1",
    descripcion: "Cartel de identificación de obra 3.60 × 2.40 m",
    unidad: "und",
    metrado: 1,
    precioUnitario: 850,
    parcial: 850,
  },
  {
    codigo: "1.2",
    descripcion: "Cerco provisional de obra con paneles metálicos",
    unidad: "m",
    metrado: 45,
    precioUnitario: 32.5,
    parcial: 1462.5,
  },
  { codigo: "2.0", descripcion: "ESTRUCTURAS" },
  {
    codigo: "2.1",
    descripcion: "Concreto premezclado f'c = 210 kg/cm² en columnas",
    unidad: "m3",
    metrado: 12.5,
    precioUnitario: 385,
    parcial: 4812.5,
  },
  {
    codigo: "2.2",
    descripcion: "Acero de refuerzo fy = 4200 kg/cm², habilitado y colocado",
    unidad: "kg",
    metrado: 980,
    precioUnitario: 5.8,
    parcial: 5684,
  },
  { codigo: "3.0", descripcion: "INSTALACIONES ELÉCTRICAS" },
  {
    codigo: "3.1",
    descripcion: "Sistema de puesta a tierra (suministro e instalación)",
    unidad: "glb",
    metrado: 1,
    precioUnitario: 2500,
    parcial: 2500,
  },
  {
    codigo: "3.2",
    descripcion: "Tablero eléctrico general, incluye llaves termomagnéticas",
    unidad: "und",
    metrado: 2,
    precioUnitario: 1600,
  },
] as const;

/** Suma de las partidas de ejemplo, para que el test la fije. */
export const TOTAL_EJEMPLO = "18509.00";

const INSTRUCCIONES: readonly (readonly [string, string])[] = [
  ["Cómo llenar esta plantilla", ""],
  ["", ""],
  [
    "1. Códigos",
    "Números separados por punto. Un código que termina en .0 (1.0, 2.0) o sin punto (1, 2) es un CAPÍTULO: agrupa y no lleva cifras. Los demás (1.1, 2.3, 01.02.01) son PARTIDAS. No repitas códigos.",
  ],
  [
    "2. Capítulo",
    "Solo código y descripción. Su importe NO se escribe: el sistema lo calcula sumando sus partidas.",
  ],
  [
    "3. Partida a precios unitarios",
    "Lleva unidad, metrado, precio unitario y parcial (metrado × precio). Es la forma normal de contratar: si el metrado cambia, el importe se recalcula. Ejemplos: filas 1.1, 1.2, 2.1 y 2.2.",
  ],
  [
    "4. Partida a suma alzada",
    "Precio cerrado por el conjunto: escribe el parcial y deja metrado y precio unitario vacíos, o usa la unidad global glb con metrado 1 (fila 3.1). El importe pactado no cambia aunque cambie la cantidad.",
  ],
  [
    "5. El parcial manda",
    "Si escribes metrado, precio y parcial, y el parcial no es la multiplicación exacta, el sistema respeta el PARCIAL del archivo y te lo avisa. Es la cifra pactada del presupuesto.",
  ],
  [
    "6. Filas ocultas",
    "Una fila oculta en Excel NO se importa: es la forma habitual de dejar una partida fuera de alcance sin borrarla. El sistema te dirá cuántas dejó fuera y cuánto sumaban.",
  ],
  [
    "7. Cabeceras",
    "Puedes renombrar las columnas: el sistema reconoce los títulos habituales (Ítem/Código, Descripción/Partida, Und./Unidad, Metrado/Cantidad, Precio Unitario/P.U., Parcial/Subtotal/Importe). También puedes añadir filas de título encima de la tabla.",
  ],
  [
    "8. Antes de importar",
    "Borra estas filas de ejemplo y escribe tu presupuesto. Al importar verás una vista previa con totales y avisos ANTES de confirmar: nada se guarda sin que lo revises.",
  ],
];

export async function generarPlantillaPresupuesto(): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "GCM";

  // La hoja del presupuesto va PRIMERA: el importador lee worksheets[0].
  const hoja = libro.addWorksheet("Presupuesto");

  hoja.columns = [
    { width: 10 },
    { width: 56 },
    { width: 8 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
  ];

  hoja.getCell("A1").value = "PRESUPUESTO DE OBRA";
  hoja.getCell("A1").font = { bold: true, size: 14 };
  hoja.getCell("A2").value = "Obra: (escribe aquí el nombre de tu obra)";
  hoja.getCell("A2").font = { italic: true, color: { argb: "FF667788" } };

  const cabecera = hoja.getRow(FILA_CABECERA);
  CABECERAS.forEach((titulo, i) => {
    const celda = cabecera.getCell(i + 1);
    celda.value = titulo;
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celda.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0D5C56" },
    };
    celda.alignment = { horizontal: i < 2 ? "left" : "center" };
  });

  let n = FILA_CABECERA;
  for (const f of FILAS_EJEMPLO) {
    n++;
    const fila = hoja.getRow(n);
    fila.getCell(1).value = f.codigo;
    fila.getCell(2).value = f.descripcion;
    if (f.unidad) fila.getCell(3).value = f.unidad;
    if (f.metrado !== undefined) fila.getCell(4).value = f.metrado;
    if (f.precioUnitario !== undefined) fila.getCell(5).value = f.precioUnitario;
    // El parcial se CALCULA, con su resultado dentro: ExcelJS no recalcula,
    // y sin resultado el archivo se lee como celdas vacias si se sube sin
    // haberlo abierto antes en Excel. Los capitulos suman sus hijas.
    if (f.metrado !== undefined && f.precioUnitario !== undefined) {
      fila.getCell(6).value = {
        formula: `D${n}*E${n}`,
        result: f.metrado * f.precioUnitario,
      };
    } else if (f.parcial !== undefined) {
      // Suma alzada: lleva importe pero no metrado x precio. Sin esto se
      // perdia entera, y el presupuesto salia 3.200 mas barato.
      fila.getCell(6).value = f.parcial;
    }

    fila.getCell(3).alignment = { horizontal: "center" };
    fila.getCell(4).numFmt = "#,##0.00";
    fila.getCell(5).numFmt = "#,##0.00";
    fila.getCell(6).numFmt = "#,##0.00";

    // Los capitulos, en negrita y con fondo suave, como en un presupuesto
    // real: se distinguen de un vistazo sin leer el codigo.
    const esCapitulo = f.codigo.endsWith(".0") || !f.codigo.includes(".");
    if (esCapitulo) {
      for (let c = 1; c <= 6; c++) {
        fila.getCell(c).font = { bold: true };
        fila.getCell(c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE8F0EF" },
        };
      }
    }
  }

  /**
   * Filas listas para las partidas de CADA obra.
   *
   * Cada presupuesto tiene un numero distinto de partidas, asi que la
   * plantilla no puede traer solo las del ejemplo. Se preparan de mas, vacias
   * y con su formula: el importador salta las que no tengan descripcion.
   */
  const primera = FILA_CABECERA + 1;
  const ultima = FILA_CABECERA + FILAS_PREPARADAS;

  for (let f = n + 1; f <= ultima; f++) {
    const fila = hoja.getRow(f);
    fila.getCell(4).numFmt = "#,##0.00";
    fila.getCell(5).numFmt = "#,##0.00";
    fila.getCell(6).numFmt = "#,##0.00";
    fila.getCell(6).value = {
      formula: `IF(B${f}="","",D${f}*E${f})`,
      result: "",
    };
  }

  // Bloqueo y leyenda: lo calculado no se toca, y se ve que no se toca.
  for (let f = primera; f <= ultima; f++) {
    const fila = hoja.getRow(f);
    for (const col of [1, 2, 3, 4, 5]) {
      fila.getCell(col).protection = { locked: false };
    }
    const parcial = fila.getCell(6);
    parcial.protection = { locked: true };
    parcial.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F3F5" },
    };
    parcial.note = "Se calcula solo: metrado x precio unitario. No escribas aquí.";
  }

  const filaTotal = ultima + 2;
  const total = hoja.getRow(filaTotal);
  total.getCell(2).value = "TOTAL COSTO DIRECTO";
  total.getCell(2).font = { bold: true };
  total.getCell(6).value = {
    // Suma solo las HOJAS: los capitulos ya suman las suyas, y contarlos otra
    // vez duplicaria el presupuesto entero.
    formula:
      `SUMPRODUCT((RIGHT($A$${primera}:$A$${ultima},2)<>".0")*` +
      `($A$${primera}:$A$${ultima}<>"")*N($F$${primera}:$F$${ultima}))`,
    result: FILAS_EJEMPLO.reduce(
      (s, f) => s + (f.metrado ?? 0) * (f.precioUnitario ?? 0),
      0,
    ),
  };
  total.getCell(6).numFmt = "#,##0.00";
  total.getCell(6).font = { bold: true };

  hoja.getCell("A3").value =
    "Las celdas en gris se calculan solas y están bloqueadas. Escribe solo en las blancas. " +
    "Hay " + FILAS_PREPARADAS + " filas listas con sus fórmulas: rellena las que necesites y deja el resto vacías.";
  hoja.getCell("A3").font = {
    italic: true,
    size: 10,
    color: { argb: "FF667788" },
  };

  // Se deja insertar filas: cada obra tiene las partidas que tiene.
  hoja.protect("", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: true,
    formatColumns: true,
    formatRows: true,
    insertRows: true,
    deleteRows: true,
    sort: true,
    autoFilter: true,
  });

  const instrucciones = libro.addWorksheet("Instrucciones");
  instrucciones.columns = [{ width: 30 }, { width: 100 }];
  INSTRUCCIONES.forEach(([titulo, cuerpo], i) => {
    const fila = instrucciones.getRow(i + 1);
    fila.getCell(1).value = titulo;
    fila.getCell(1).font = { bold: true };
    fila.getCell(2).value = cuerpo;
    fila.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });
  instrucciones.getRow(1).font = { bold: true, size: 13 };

  // `writeBuffer` devuelve un Buffer de Node; se copia a un ArrayBuffer
  // exacto para que quien llama (el analizador del test y la Response de la
  // descarga) no dependa de Node.
  const salida = await libro.xlsx.writeBuffer();
  return new Uint8Array(salida as unknown as Uint8Array).buffer as ArrayBuffer;
}
