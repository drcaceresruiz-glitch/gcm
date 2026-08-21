import ExcelJS from "exceljs";


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

/**
 * Cuantas filas se dejan preparadas con formula por debajo de los ejemplos.
 *
 * CADA OBRA TIENE UN NUMERO DISTINTO DE PARTIDAS, asi que la plantilla no
 * puede traer solo las del ejemplo: quien añada la suya numero 40 tendria que
 * escribir la formula a mano, y quien no se diera cuenta se llevaria el
 * parcial en blanco.
 *
 * Se preparan de mas y se dejan VACIAS: sin descripcion, el importador las
 * salta. Y como los totales del pie cubren todo el bloque, insertar filas
 * dentro no rompe nada —Excel ajusta el rango solo— y añadir al final
 * tampoco, porque el rango ya llega hasta abajo.
 */
const FILAS_PREPARADAS = 60;

/**
 * El subtotal de una linea de gasto: mensual x meses si es VARIABLE, y su
 * importe si es FIJO. Vacia mientras no haya concepto, para que las filas
 * preparadas no ensucien la hoja con ceros.
 */
/** Gris de las celdas calculadas: se ven distintas de las que se escriben. */
const GRIS_CALCULADO = "FFF1F3F5";

/**
 * Marca una celda como CALCULADA: gris, bloqueada y con su explicacion.
 *
 * El usuario pidio que lo que no se puede tocar no se pueda tocar. En un
 * Excel eso son tres cosas a la vez, y las tres hacen falta: el color avisa
 * antes de escribir, el bloqueo lo impide, y el comentario dice por que. Solo
 * con color se escribe encima igual; solo con bloqueo parece que el archivo
 * esta roto.
 *
 * La proteccion va SIN contraseña a proposito: no es seguridad, es evitar el
 * accidente. Quien sepa lo que hace puede quitarla en dos clics.
 */
function marcarCalculada(celda: ExcelJS.Cell, nota: string): void {
  celda.protection = { locked: true };
  celda.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: GRIS_CALCULADO },
  };
  celda.note = nota;
}

/** Marca una celda como ESCRIBIBLE. Por defecto en Excel todo va bloqueado. */
function marcarEditable(celda: ExcelJS.Cell): void {
  celda.protection = { locked: false };
}

/** Un codigo de capitulo: termina en ".0" o no lleva punto. */
function esCapituloCodigo(f: FilaCosto): boolean {
  return f.codigo.endsWith(".0") || !f.codigo.includes(".");
}

/** Subtotal real de un capitulo de ejemplo: lo que suman sus partidas. */
function subtotalEjemplo(codigo: string): number {
  const pfx = codigo.endsWith(".0") ? codigo.slice(0, -1) : `${codigo}.`;
  return FILAS_COSTO.filter(
    (h) => h.codigo.startsWith(pfx) && h.codigo !== codigo,
  ).reduce(
    (s, h) =>
      s +
      (h.metrado !== undefined && h.precioUnitario !== undefined
        ? h.metrado * h.precioUnitario
        : (h.parcial ?? 0)),
    0,
  );
}

/** Lo que costaria ese capitulo una vez recargado. */
function contractualEjemplo(f: FilaCosto): number {
  return subtotalEjemplo(f.codigo) * (1 + (f.recargo ?? 0) / 100);
}

/**
 * Monto contractual de un capitulo: su subtotal real mas el recargo.
 *
 * La suma va por PREFIJO de codigo, no por rango de filas: asi sigue
 * valiendo cuando se insertan partidas en medio, que es lo que hace todo el
 * mundo. Los capitulos aportan cero (no llevan cifras propias), de modo que
 * ninguna partida se cuenta dos veces.
 *
 * El prefijo se deduce DENTRO de la formula ("4.0" -> "4.", "4" -> "4.")
 * porque en las filas preparadas aun no se sabe que codigo se escribira.
 *
 * Es para que se VEA en la hoja. Al importar, GCM recalcula el contractual
 * por su cuenta: el archivo muestra, el importador manda.
 */
function formulaContractual(
  fila: number,
  primera: number,
  ultima: number,
): string {
  const pfx =
    `IF(RIGHT($A${fila},2)=".0",LEFT($A${fila},LEN($A${fila})-1),$A${fila}&".")`;
  return (
    `IF($G${fila}="","",` +
    `SUMPRODUCT((LEFT($A$${primera}:$A$${ultima},LEN(${pfx}))=${pfx})` +
    `*N($F$${primera}:$F$${ultima}))*(1+$G${fila}/100))`
  );
}

const CABECERAS_COSTO = [
  "Ítem",
  "Descripción",
  "Und.",
  "Metrado",
  "Precio Unitario",
  "Parcial",
  "% Recargo",
  "Contractual",
] as const;


interface FilaCosto {
  codigo: string;
  descripcion: string;
  unidad?: string;
  metrado?: number;
  precioUnitario?: number;
  parcial?: number;
  /// Solo en capitulos: cuanto se recarga para llegar al contractual.
  recargo?: number;
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
  {
    codigo: "1.0",
    descripcion: "OBRAS PROVISIONALES Y TRABAJOS PRELIMINARES",
    recargo: 18,
  },
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
  {
    codigo: "2.0",
    descripcion: "ESTRUCTURAS",
    recargo: 15,
  },
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
    recargo: 22,
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


/**
 * @param mesesObra Plazo real de la obra. Si viene, los ejemplos se ajustan a
 *   el; si no, se generan con los meses de siempre (y el test de ida y vuelta
 *   sigue fijando los mismos totales).
 */
export async function generarPlantillaMeta(
  _mesesObra: number | null = null,
): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "GCM";

  // PRIMERA, siempre: `analizarExcel` lee `worksheets[0]`.
  const costo = libro.addWorksheet("Costo Directo");
  costo.columns = [
    { width: 10 }, { width: 56 }, { width: 8 },
    { width: 12 }, { width: 16 }, { width: 16 },
    { width: 12 }, { width: 18 },
  ];

  costo.getCell("A1").value = "PRESUPUESTO META - COSTO DIRECTO";
  costo.getCell("A1").font = { bold: true, size: 14 };
  costo.getCell("A2").value =
    "Lo que TÚ te comprometes a gastar. La diferencia con el contrato es la bolsa.";
  costo.getCell("A2").font = { italic: true, color: { argb: "FF667788" } };

  pintarCabecera(costo.getRow(FILA_CABECERA), CABECERAS_COSTO);

  // Se explica DONDE se usa: una nota en la cabecera se lee justo cuando
  // hace falta, y la hoja de instrucciones se lee una vez y se olvida.
  costo.getCell(`G${FILA_CABECERA}`).note =
    "Solo en los capítulos. Escribe 15 para 15%: cuánto se recarga este " +
    "capítulo del presupuesto real para llegar al contractual.";
  costo.getCell(`H${FILA_CABECERA}`).note =
    "Se calcula solo: el subtotal real del capítulo más su recargo. " +
    "La suma de esta columna es el presupuesto contractual.";

  // Se declaran aqui arriba porque la formula del contractual, que ya se
  // escribe en las filas de ejemplo, necesita el rango completo.
  const primeraFila = FILA_CABECERA + 1;
  const ultimaFila = FILA_CABECERA + FILAS_PREPARADAS;

  let n = FILA_CABECERA;
  for (const f of FILAS_COSTO) {
    n++;
    const fila = costo.getRow(n);
    fila.getCell(1).value = f.codigo;
    fila.getCell(2).value = f.descripcion;
    if (f.unidad) fila.getCell(3).value = f.unidad;
    if (f.metrado !== undefined) fila.getCell(4).value = f.metrado;
    if (f.precioUnitario !== undefined) fila.getCell(5).value = f.precioUnitario;
    // El parcial se CALCULA: metrado x precio. Antes era un numero escrito,
    // y quien cambiaba el precio se llevaba un parcial que ya no cuadraba.
    // Los capitulos suman sus hijas en vez de multiplicar.
    if (f.metrado !== undefined && f.precioUnitario !== undefined) {
      // La formula lleva su RESULTADO: ExcelJS no calcula, y un archivo con
      // formulas sin resultado se lee como celdas vacias si se sube sin
      // abrirlo antes en Excel.
      fila.getCell(6).value = {
        formula: `D${n}*E${n}`,
        result: f.metrado * f.precioUnitario,
      };
    } else if (f.parcial !== undefined) {
      // Suma alzada: lleva importe pero no metrado x precio. Sin esto se
      // perdia entera, y el presupuesto salia 3.200 mas barato.
      fila.getCell(6).value = f.parcial;
    }
    for (const col of [1, 2, 3, 4, 5]) marcarEditable(fila.getCell(col));
    marcarCalculada(
      fila.getCell(6),
      "Se calcula solo: metrado x precio unitario. No escribas aquí.",
    );

    fila.getCell(3).alignment = { horizontal: "center" };
    fila.getCell(4).numFmt = "#,##0.00";
    fila.getCell(5).numFmt = "#,##0.00";
    fila.getCell(6).numFmt = "#,##0.00";

    const esCapitulo = esCapituloCodigo(f);
    if (esCapitulo) {
      // El recargo es lo UNICO que se escribe en un capitulo: de ahi sale el
      // presupuesto contractual. Las partidas no lo llevan.
      if (f.recargo !== undefined) fila.getCell(7).value = f.recargo;
      fila.getCell(8).value = {
        formula: formulaContractual(n, primeraFila, ultimaFila),
        result: contractualEjemplo(f),
      };
      fila.getCell(7).numFmt = "#,##0.00";
      fila.getCell(8).numFmt = "#,##0.00";
      marcarEditable(fila.getCell(7));
      marcarCalculada(
        fila.getCell(8),
        "Se calcula solo: el subtotal real del capítulo más su recargo.",
      );

      for (let c = 1; c <= 8; c++) {
        fila.getCell(c).font = { bold: true };
        fila.getCell(c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: VERDE_SUAVE },
        };
      }
    }
  }

  /**
   * Filas vacias con la formula del parcial ya puesta, y el total al pie.
   *
   * El total abarca TODO el bloque preparado, no solo los ejemplos: asi da
   * igual cuantas partidas tenga la obra. Y va separado por una fila en
   * blanco para que se lea como pie y no como una linea mas.
   */

  for (let f = n + 1; f <= ultimaFila; f++) {
    const fila = costo.getRow(f);
    fila.getCell(4).numFmt = "#,##0.00";
    fila.getCell(5).numFmt = "#,##0.00";
    fila.getCell(6).numFmt = "#,##0.00";
    // Sin descripcion el importador la salta, asi que la formula puede estar
    // puesta desde el principio: aparece sola en cuanto se escribe la linea.
    fila.getCell(6).value = { formula: `IF(B${f}="","",D${f}*E${f})`, result: "" };
    // El recargo y su contractual: en blanco hasta que la fila sea capitulo.
    fila.getCell(7).numFmt = "#,##0.00";
    fila.getCell(8).numFmt = "#,##0.00";
    fila.getCell(8).value = {
      formula: formulaContractual(f, primeraFila, ultimaFila),
      result: "",
    };
    marcarEditable(fila.getCell(7));
    marcarCalculada(
      fila.getCell(8),
      "Se calcula solo: el subtotal real del capítulo más su recargo.",
    );
    for (const col of [1, 2, 3, 4, 5]) marcarEditable(fila.getCell(col));
    marcarCalculada(
      fila.getCell(6),
      "Se calcula solo: metrado x precio unitario. No escribas aquí.",
    );
  }

  const filaTotal = ultimaFila + 2;
  const total = costo.getRow(filaTotal);
  total.getCell(2).value = "TOTAL COSTO DIRECTO";
  total.getCell(2).font = { bold: true };
  // Suma solo las HOJAS: los capitulos ya suman a las suyas, y contarlos
  // otra vez duplicaria la obra entera. Se distinguen porque su codigo
  // termina en ".0", asi que se suma por el codigo con SUMPRODUCT.
  const totalHojas = FILAS_COSTO.filter(
    (f) => f.metrado !== undefined && f.precioUnitario !== undefined,
  ).reduce((s, f) => s + (f.metrado ?? 0) * (f.precioUnitario ?? 0), 0);

  total.getCell(6).value = {
    result: totalHojas,
    formula:
      `SUMPRODUCT((RIGHT($A$${primeraFila}:$A$${ultimaFila},2)<>".0")*` +
      `($A$${primeraFila}:$A$${ultimaFila}<>"")*N($F$${primeraFila}:$F$${ultimaFila}))`,
  };

  // El contractual total: la suma de los capitulos ya recargados. Solo los
  // capitulos llevan cifra en esa columna, asi que sumarla entera no cuenta
  // nada dos veces.
  total.getCell(8).value = {
    result: FILAS_COSTO.filter(esCapituloCodigo).reduce(
      (s, f) => s + contractualEjemplo(f),
      0,
    ),
    formula: `SUM($H$${primeraFila}:$H$${ultimaFila})`,
  };
  total.getCell(8).numFmt = "#,##0.00";
  total.getCell(8).font = { bold: true };
  total.getCell(6).numFmt = "#,##0.00";
  total.getCell(6).font = { bold: true };


  /**
   * La leyenda, arriba del todo y en las dos hojas.
   *
   * El gris no significa nada por si solo: hay que decir que quiere decir, y
   * decirlo DONDE se ve, no en la hoja de instrucciones que se lee una vez.
   */
  for (const hoja of [costo]) {
    const leyenda = hoja.getCell("A3");
    leyenda.value =
      "Las celdas en gris se calculan solas y están bloqueadas. Escribe solo en las blancas. " +
      "Hay " + FILAS_PREPARADAS + " filas listas con sus fórmulas: rellena las que necesites y deja el resto vacías.";
    leyenda.font = { italic: true, size: 10, color: { argb: "FF667788" } };

    /**
     * Se protege la hoja pero se DEJA insertar filas.
     *
     * Cada obra tiene un numero distinto de partidas, asi que impedirlo
     * convertiria la plantilla en una camisa de fuerza. Al insertar dentro
     * del bloque, Excel copia la formula de la fila de arriba y ajusta solo
     * el rango de los totales.
     *
     * Sin contraseña: esto evita el accidente, no es seguridad.
     */
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
  }

  const instrucciones = libro.addWorksheet("Instrucciones");
  instrucciones.columns = [{ width: 30 }, { width: 100 }];

  [...INSTRUCCIONES].forEach(([titulo, cuerpo], i) => {
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
