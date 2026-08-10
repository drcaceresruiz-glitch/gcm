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
    parcial: 3200,
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
    "Precio cerrado por el conjunto: escribe el parcial y deja metrado y precio unitario vacíos (fila 3.2), o usa la unidad global glb (fila 3.1). El importe pactado no cambia aunque cambie la cantidad.",
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
    if (f.parcial !== undefined) fila.getCell(6).value = f.parcial;

    fila.getCell(3).alignment = { horizontal: "center" };
    fila.getCell(4).numFmt = "#,##0.0000";
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
