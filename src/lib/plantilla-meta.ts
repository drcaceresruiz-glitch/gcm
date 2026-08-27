import ExcelJS from "exceljs";

import { esPorMes } from "@/lib/costo-meta";


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
 *
 * CUATROCIENTAS, y no las sesenta que hubo hasta el 23 de agosto de 2026.
 * Sesenta parecian de sobra hasta que se miro un presupuesto de verdad: la
 * obra CRIOCORD tiene 368 partidas. Quien pasaba de la fila 64 tenia que
 * anadir filas a mano, y una fila escrita a mano nace SIN formulas —ni el
 * parcial ni el contractual— asi que el presupuesto salia corto sin que nada
 * lo dijera. Cuatrocientas filas cuestan 50 KB mas en el archivo; una columna
 * que no suma cuesta mucho mas.
 */
const FILAS_PREPARADAS = 400;

/**
 * El subtotal de una linea de gasto: mensual x meses si es VARIABLE, y su
 * importe si es FIJO. Vacia mientras no haya concepto, para que las filas
 * preparadas no ensucien la hoja con ceros.
 */
/** Gris de las celdas calculadas: se ven distintas de las que se escriben. */
const GRIS_CALCULADO = "FFF1F3F5";

/**
 * Marca una celda como CALCULADA: gris, con su explicacion y con el flag.
 *
 * EL COLOR Y LA NOTA AVISAN; YA NO IMPIDEN NADA, y ese cambio tiene fecha y
 * dueño. Naciendo, esta plantilla protegia la hoja para que lo calculado no se
 * pudiera tocar. El 27 de agosto de 2026 el cliente pidio lo contrario: quiere
 * PEGAR de una sentada los capitulos, partidas y subpartidas que ya tiene en
 * su propio Excel, y pegar escribe sobre las celdas de destino -incluidas las
 * de formula-, asi que la hoja protegida lo cortaba con «la celda que intenta
 * cambiar esta en una hoja protegida». Se prefiere que la plantilla se pueda
 * llenar de golpe: la fila que pierde su formula no pierde su dinero, porque
 * `analizarExcel` recalcula el Parcial con el metrado y el precio.
 *
 * El flag `locked` se conserva aunque la hoja ya no se proteja. No cuesta
 * nada, sigue diciendo QUE celda es de que tipo -que es como esta escrita la
 * bateria de esta plantilla- y vuelve a tener efecto el dia que alguien
 * proteja la hoja por su cuenta.
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

/**
 * Un codigo de capitulo: termina en ".0" o no lleva punto.
 *
 * EL VACIO NO ES UN CAPITULO, y olvidarlo costo caro. Una fila sin codigo es
 * un COSTO PROPIO de la meta -un sueldo, un alquiler, una poliza-, pero
 * `!"".includes(".")` es cierto, asi que hasta el 23 de agosto de 2026 la
 * plantilla las escribia como capitulos: en negrita, en verde y con la
 * formula del contractual. El importador las leia como titulos y se dejaba su
 * importe por el camino, de modo que la plantilla que GCM regala no
 * sobrevivia a su propio importador.
 */
function esCapituloCodigo(f: FilaCosto): boolean {
  if (f.codigo === "") return false;
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
 *
 * **`IF(ISNUMBER(rango),rango,0)` y no `N(rango)`**, aunque `N` sea mas
 * corto. `N` solo se evalua como matriz en Excel; Google Sheets y LibreOffice
 * la colapsan a la primera celda, con lo que el producto entero sale CERO y
 * la columna Contractual aparece a 0,00 -que es exactamente como se vio-. La
 * plantilla se abre en lo que cada constructora tenga, no en lo que nosotros
 * suponemos.
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
    `*IF(ISNUMBER($F$${primera}:$F$${ultima}),$F$${primera}:$F$${ultima},0))` +
    `*(1+$G${fila}/100))`
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
  // Las dos siguientes van AL FINAL a proposito: `formulaContractual`
  // referencia columnas por letra fija ($A, $F, $G), e insertar en medio
  // correria esas referencias y romperia la plantilla.
  "Fecha Inicio",
  "Fecha Fin",
] as const;





interface FilaCosto {
  /// Vacio = COSTO PROPIO DE LA META: cuesta de verdad, pero el contrato no
  /// lo desglosa y por tanto no tiene codigo contractual al que apuntar.
  codigo: string;
  descripcion: string;
  unidad?: string;
  metrado?: number;
  precioUnitario?: number;
  parcial?: number;
  /// Solo en capitulos: cuanto se recarga para llegar al contractual.
  recargo?: number;
  /// Opcionales, y los ejemplos de FILAS_COSTO se dejan sin ellas a
  /// proposito: el propio ejemplo demuestra que no hacen falta.
  fechaInicio?: string;
  fechaFin?: string;
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
  /**
   * El bloque SIN codigo: los costos propios de la meta.
   *
   * Van sin Item a proposito, y es la mitad importante de la leccion. Un
   * costo con codigo entra al presupuesto del cliente como una linea mas -y
   * de ahi al cronograma, como una tarea que alguien tendria que ejecutar-.
   * Estos no: cuestan, cuentan en tu meta y en tu bolsa, y su dinero se cubre
   * con el recargo del resto. El generador del contractual los deja fuera y
   * avisa de cuanto suman.
   *
   * AQUI VA TODO LO QUE SE PAGA Y NO SE FACTURA LINEA A LINEA, y desde el 23
   * de agosto de 2026 eso incluye al personal indirecto. Antes el residente,
   * el almacenero y la camioneta vivian en una hoja «Gastos Generales»
   * aparte, y esa hoja podia valer cero sin que nada avisara: una meta
   * enseñaba 600 de costo cuando eran 700. Se quito la hoja y sus filas
   * bajaron aqui.
   *
   * LO QUE SIGUE SIN IR AQUI son los ayudantes de una partida: esos van
   * dentro de su precio unitario. Ponerlos tambien aqui es contar el mismo
   * costo dos veces.
   *
   * La unidad «mes» no es decorativa: `esPorMes` (`lib/costo-meta.ts`) la lee
   * para saber que cuesta cada mes de atraso. Un sueldo escrito como
   * 8 x 6.500 dice lo que cuesta estirarse; escrito como 52.000 a secas, no.
   */
  {
    codigo: "",
    descripcion: "COSTOS PROPIOS DE LA META — sin Ítem: no van al contrato",
  },
  {
    codigo: "",
    descripcion: "Residente de obra",
    unidad: "mes",
    metrado: 8,
    precioUnitario: 6500,
    parcial: 52000,
  },
  {
    codigo: "",
    descripcion: "Maestro de obra",
    unidad: "mes",
    metrado: 8,
    precioUnitario: 4200,
    parcial: 33600,
  },
  {
    // Seis meses de los ocho del plazo, y es deliberado: los meses van POR
    // LINEA porque nadie esta en obra todo el plazo. Con un plazo global el
    // numero saldria siempre de mas.
    codigo: "",
    descripcion: "Almacenero",
    unidad: "mes",
    metrado: 6,
    precioUnitario: 2000,
    parcial: 12000,
  },
  {
    codigo: "",
    descripcion: "Camioneta y combustible",
    unidad: "mes",
    metrado: 8,
    precioUnitario: 1800,
    parcial: 14400,
  },
  {
    // Los que NO dependen del plazo llevan «glb»: un mes mas de obra no los
    // mueve, y por eso no entran en el coste del atraso.
    codigo: "",
    descripcion: "Carta fianza de fiel cumplimiento",
    unidad: "glb",
    metrado: 1,
    precioUnitario: 9500,
    parcial: 9500,
  },
  {
    codigo: "",
    descripcion: "Póliza CAR",
    unidad: "glb",
    metrado: 1,
    precioUnitario: 4200,
    parcial: 4200,
  },
  {
    codigo: "",
    descripcion: "Andamio metálico en alquiler",
    unidad: "mes",
    metrado: 4,
    precioUnitario: 380,
    parcial: 1520,
  },
  {
    codigo: "",
    descripcion: "Encofrado metálico en alquiler (varias partidas)",
    unidad: "glb",
    metrado: 1,
    precioUnitario: 2600,
    parcial: 2600,
  },
] as const;

/** Suma de las filas de ejemplo, para que el test la fije. */
export const TOTAL_COSTO_EJEMPLO = "141178.00";

/**
 * El total CONTRACTUAL que produce este mismo ejemplo al generarse.
 *
 * Es el resultado de correr el pipeline real —`analizarExcel` sobre el
 * archivo que genera esta plantilla, y `generarContractual` (`@/lib/
 * contractual-desde-meta`) sobre esas filas, recargando cada capitulo con su
 * `porcentajeRecargo`—, no una cuenta hecha a mano. `datos-de-ejemplo.ts` lo
 * usa para detectar una obra cuyo contractual sigue siendo el del ejemplo:
 * desde el 20 de agosto de 2026 esa es la UNICA via (ya no se importa un
 * contractual directo), asi que ya no coincide con `TOTAL_EJEMPLO` de
 * `plantilla-presupuesto.ts` —esa era la cifra de la via retirada—. Si algo
 * en este archivo o en `contractual-desde-meta.ts` cambia el calculo, hay
 * que volver a correr el pipeline para fijar la cifra nueva, no adivinarla.
 */
export const TOTAL_CONTRACTUAL_EJEMPLO = "18146.90";



/** Totales de los ejemplos, fijados por el test. */

/// Lo que suman las filas SIN Item: sueldos, alquileres, fianzas, polizas.
export const COSTO_PROPIO_EJEMPLO = "129820.00";
/// Lo que cuesta cada mes de mas: los precios unitarios de las filas en «mes».
export const COSTE_MENSUAL_EJEMPLO = "14880.00";

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
    "Todo lo que se paga y el contrato no desglosa línea a línea: el residente, el maestro, la camioneta, las cartas fianza, las pólizas, un andamio alquilado. Van SIN Ítem —deja la primera columna vacía— y por eso no aparecen en el presupuesto del cliente ni se convierten en tareas del cronograma. Consumen bolsa, que es exactamente lo que hacen en la obra.",
  ],
  [
    "3a. El recargo va por capítulo, y por partida cuando haga falta",
    "Escribe 15 para 15%. Puesto en el CAPÍTULO lo heredan todas sus partidas, y con eso basta casi siempre. Pero puedes ponerlo también en una PARTIDA suelta, y entonces gana el suyo: sirve para la que lleve un margen distinto —una subcontrata que ya viene cerrada no admite el mismo que la mano de obra propia—. Un 0 NO es lo mismo que dejarlo vacío: 0 significa «esta entra a precio de costo, y lo sé»; vacío significa «que herede». Las filas sin Ítem no se recargan: su costo se cubre con el recargo del resto.",
  ],
  [
    "3b. Añadir filas (es más fácil de lo que parece)",
    "Al final: escribe en la primera fila vacía, ya hay 400 listas. En medio: botón derecho sobre el número de la fila > Insertar, y escribe. Ya está. Aunque la fila nueva salga sin fórmula y el Parcial se quede en blanco, GCM lo calcula al importar con el metrado y el precio unitario, y el TOTAL del pie también la cuenta. Si además quieres ver el Parcial en la pantalla de Excel, copia antes una fila vacía (clic en su número, Ctrl+C) y usa «Insertar celdas copiadas» en vez de «Insertar»: así la fórmula viaja con ella.",
  ],
  [
    "3c. ¿Ya tienes el presupuesto en tu propio Excel?",
    "Pégalo aquí y ya está: la hoja no está protegida, así que puedes traerte capítulos, partidas y subpartidas de una sola vez. Solo cuida que cada cosa caiga en su columna (Ítem, Descripción, Und., Metrado, Precio Unitario) y que los códigos sean números con puntos: 1, 1.01, 1.01.02. Al pegar encima, las columnas grises pierden su fórmula y se quedan en blanco: no importa, GCM las recalcula al importar. Y si prefieres no pegar nada: sube tu propio Excel tal cual, sin esta plantilla, que el importador reconoce las cabeceras más habituales (Item, Descripción, Und, Cantidad, P.U., Parcial) aunque estén en otro orden o con otro nombre.",
  ],
  [
    "4. Lo que NO pongas se nota",
    "Si dejas una partida del contrato sin línea aquí, el sistema NO la cuenta como ahorro: te la marca como «sin meta» y te dice cuánto suma. Una meta incompleta parece un margen excelente, y no lo es.",
  ],
  [
    "5. Fecha Inicio / Fecha Fin (opcional)",
    "Si las pones, esa partida sale de generar la EDT ya programada con esas fechas en vez de pendiente. Si las dejas en blanco, todo sigue funcionando igual que hoy: la EDT se genera igual y programas las fechas después, en la tabla del cronograma. Van juntas: si pones una, hace falta la otra.",
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
 * Los meses de ejemplo, recortados al plazo real de la obra.
 *
 * Sin esto la plantilla de una obra de dos meses propone ocho meses de
 * residente, y quien la rellena deprisa se lleva un costo cuatro veces mayor
 * que su obra. Se recorta y no se reparte: los meses son un dato de cada
 * linea -nadie esta en obra todo el plazo- y ajustarlos con una regla mas
 * fina seria inventarle al usuario cuanto va a estar cada uno.
 *
 * Solo toca las filas medidas en MESES. Una carta fianza no dura menos
 * porque la obra sea corta.
 */
function recortarAlPlazo(
  filas: readonly FilaCosto[],
  mesesObra: number | null,
): FilaCosto[] {
  if (mesesObra === null || mesesObra <= 0) return [...filas];
  const tope = Math.round(mesesObra * 100) / 100;

  return filas.map((f) => {
    if (!esPorMes(f.unidad ?? null)) return f;
    if (f.metrado === undefined || f.metrado <= tope) return f;
    // El parcial se rehace: dejarlo con el de ocho meses seria peor que no
    // recortar, porque la fila diria una cosa y su importe otra.
    const parcial =
      f.precioUnitario === undefined
        ? f.parcial
        : Math.round(tope * f.precioUnitario * 100) / 100;
    return { ...f, metrado: tope, parcial };
  });
}

/**
 * Las instrucciones de los costos propios.
 *
 * Separadas de las del costo directo porque son la leccion que mas cuesta:
 * que lo que se paga por mes no es un porcentaje del costo directo.
 */
const INSTRUCCIONES_GASTOS: readonly (readonly [string, string])[] = [
  ["", ""],
  [
    "5. Los sueldos y las pólizas van en la MISMA hoja",
    "Hasta el 23 de agosto de 2026 había una hoja «Gastos Generales» aparte. Ya no: el residente, el maestro, la camioneta, las cartas fianza y las pólizas son filas del costo directo SIN Ítem, igual que los alquileres. Una sola lista y una sola suma. Con dos listas, una podía quedarse en cero sin que nada avisara —y pasó: una meta enseñaba S/ 600 de costo cuando eran S/ 700, con el sueldo del residente escrito en el Excel y valiendo cero en la cuenta—.",
  ],
  [
    "6. Aquí NO se pide un porcentaje",
    "Se pide una lista. Lo que se paga por mes no crece con la producción: crece con los MESES. Un porcentaje sobre el costo directo esconde el sobrecosto más caro que tiene una obra, que es la que se estira con todas sus partidas en meta.",
  ],
  [
    "7. La unidad «mes» no es decorativa",
    "Una fila sin Ítem con unidad «mes» le dice a GCM que ese costo crece si la obra se alarga: metrado = meses, precio unitario = lo que cuesta cada mes. De ahí sale lo que cuesta cada mes de atraso —en el ejemplo, S/ 14 880 al mes—, y eso no se recupera trabajando mejor, solo terminando antes. Un sueldo escrito como 8 × 6 500 dice lo que cuesta estirarse; escrito como 52 000 a secas, no dice nada. Lo que no depende del plazo (fianzas, pólizas, licencias) va con unidad «glb».",
  ],
  [
    "8. Los meses son por línea",
    "El almacenero del ejemplo está 6 meses de los 8 del plazo. Nadie está en obra todo el plazo, y con un único número global el costo saldría siempre de más.",
  ],
  [
    "9. Esto NO se le desglosa al cliente",
    "Las filas sin Ítem no van al contractual ni se convierten en tareas del cronograma: el contrato las reconoce englobadas, no sueldo a sueldo. Cuestan igual, y por eso tienen que estar aquí: la bolsa operativa se mide contra TODO lo que hay que pagar.",
  ],
  ["", ""],
  [
    "¿Y la utilidad?",
    "No aparece por ninguna parte, y es a propósito. La utilidad NO es un costo que puedas gastar: es el resultado. Si entra en la meta se vuelve presupuesto, la obra se la gasta y nadie lo nota hasta la liquidación. GCM la muestra aparte, al lado de la bolsa, etiquetada como lo que es.",
  ],
];

/**
 * @param mesesObra Plazo real de la obra. Si viene, los ejemplos medidos en
 *   meses se ajustan a el; si no, se generan con los meses de siempre (y el
 *   test de ida y vuelta sigue fijando los mismos totales).
 */
export async function generarPlantillaMeta(
  mesesObra: number | null = null,
): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "GCM";

  // PRIMERA, siempre: `analizarExcel` lee `worksheets[0]`.
  const costo = libro.addWorksheet("Costo Directo");
  costo.columns = [
    { width: 10 }, { width: 56 }, { width: 8 },
    { width: 12 }, { width: 16 }, { width: 16 },
    { width: 12 }, { width: 18 },
    { width: 14 }, { width: 14 },
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
    "Escribe 15 para 15%: cuánto se recarga para llegar al contractual. " +
    "Ponlo en el CAPÍTULO y lo heredan todas sus partidas. Puedes ponerlo " +
    "también en una PARTIDA suelta, y entonces gana el suyo: sirve para la " +
    "que lleve un margen distinto, como una subcontrata ya cerrada. Un 0 no " +
    "es lo mismo que dejarlo vacío: 0 es «entra a precio de costo», vacío " +
    "es «hereda». Las filas sin Ítem no se recargan.";
  costo.getCell(`H${FILA_CABECERA}`).note =
    "Se calcula solo: el subtotal real del capítulo más su recargo. " +
    "La suma de esta columna es el presupuesto contractual.";
  costo.getCell(`I${FILA_CABECERA}`).note =
    "Opcional. Si la pones, la EDT sale con esta partida ya programada en " +
    "vez de pendiente. Si la dejas en blanco, todo sigue igual que hoy: se " +
    "programa después, en la tabla del cronograma. " +
    "Escríbela 01/08/2026 (o 2026-08-01). Va en las PARTIDAS, no en los " +
    "capítulos: la fecha del capítulo se calcula sola, desde la primera y la " +
    "última de las partidas que cuelgan de él.";
  costo.getCell(`J${FILA_CABECERA}`).note =
    "Opcional, pero si pones la fecha de inicio también hace falta esta: " +
    "las dos van juntas o ninguna. Y no puede ser anterior al inicio.";

  // Se declaran aqui arriba porque la formula del contractual, que ya se
  // escribe en las filas de ejemplo, necesita el rango completo.
  const primeraFila = FILA_CABECERA + 1;
  const ultimaFila = FILA_CABECERA + FILAS_PREPARADAS;

  let n = FILA_CABECERA;
  for (const f of recortarAlPlazo(FILAS_COSTO, mesesObra)) {
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
    // Opcionales: los ejemplos de FILAS_COSTO no las traen a proposito, para
    // que la plantilla misma demuestre que no hacen falta.
    if (f.fechaInicio) fila.getCell(9).value = new Date(`${f.fechaInicio}T00:00:00.000Z`);
    if (f.fechaFin) fila.getCell(10).value = new Date(`${f.fechaFin}T00:00:00.000Z`);

    for (const col of [1, 2, 3, 4, 5, 9, 10]) marcarEditable(fila.getCell(col));
    marcarCalculada(
      fila.getCell(6),
      "Se calcula solo: metrado x precio unitario. No escribas aquí.",
    );

    /*
     * EL RECARGO SE PUEDE PONER EN UNA PARTIDA, no solo en su capitulo.
     *
     * `generarContractual` siempre supo aplicarlo -resuelve empezando por el
     * codigo de la propia linea y solo sube al padre si esa no lo trae- pero
     * hasta el 23 de agosto de 2026 esta celda quedaba BLOQUEADA en las
     * partidas, asi que no habia forma de escribirlo. Y hace falta: una
     * subcontrata ya cerrada no admite el mismo margen que la mano de obra
     * propia, y un porcentaje unico por capitulo obliga a inventarse la
     * media.
     *
     * Una fila SIN Item se queda marcada como calculada, y no por descuido:
     * no se le factura al cliente linea a linea, asi que no hay nada que
     * recargar. Desde que la hoja no se protege eso ya no lo impide -el gris
     * y la nota avisan, no prohiben-, pero el servicio la rechaza igual: un
     * recargo sin codigo no tiene contra que aplicarse.
     */
    if (f.codigo !== "") {
      fila.getCell(7).numFmt = "#,##0.00";
      marcarEditable(fila.getCell(7));
    } else {
      marcarCalculada(
        fila.getCell(7),
        "Una línea sin Ítem no se le factura al cliente línea a línea, así " +
          "que no se recarga: su costo se cubre con el recargo del resto.",
      );
    }

    fila.getCell(3).alignment = { horizontal: "center" };
    fila.getCell(4).numFmt = "#,##0.00";
    fila.getCell(5).numFmt = "#,##0.00";
    fila.getCell(6).numFmt = "#,##0.00";
    fila.getCell(9).numFmt = "dd/mm/yyyy";
    fila.getCell(10).numFmt = "dd/mm/yyyy";

    const esCapitulo = esCapituloCodigo(f);
    if (esCapitulo) {
      // El recargo es lo UNICO que se escribe en un capitulo: de ahi sale el
      // presupuesto contractual. Las partidas no lo llevan.
      if (f.recargo !== undefined) fila.getCell(7).value = f.recargo;
      fila.getCell(8).value = {
        formula: formulaContractual(n, primeraFila, ultimaFila),
        result: contractualEjemplo(f),
      };
      fila.getCell(8).numFmt = "#,##0.00";
      marcarCalculada(
        fila.getCell(8),
        "Se calcula solo: el subtotal real del capítulo más su recargo.",
      );

      for (let c = 1; c <= 10; c++) {
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
    fila.getCell(9).numFmt = "dd/mm/yyyy";
    fila.getCell(10).numFmt = "dd/mm/yyyy";
    for (const col of [1, 2, 3, 4, 5, 9, 10]) marcarEditable(fila.getCell(col));
    marcarCalculada(
      fila.getCell(6),
      "Se calcula solo: metrado x precio unitario. No escribas aquí.",
    );
  }

  const filaTotal = ultimaFila + 2;
  const total = costo.getRow(filaTotal);
  total.getCell(2).value = "TOTAL COSTO DIRECTO";
  total.getCell(2).font = { bold: true };
  /**
   * El TOTAL suma todo lo que cuesta, y sobrevive a una fila escrita a mano.
   *
   * DOS COSAS QUE ARREGLA, las dos del 23 de agosto de 2026:
   *
   * 1. Antes exigia `$A<>""`, o sea que solo contaba las filas CON codigo. El
   *    dia que los sueldos y las polizas bajaron al bloque sin Item, esa
   *    condicion dejo fuera 129.820 soles: la hoja enseñaba un total y GCM
   *    importaba otro. Ahora el unico excluido es el CAPITULO, que no se
   *    cuenta porque ya suman sus hijas.
   *
   * 2. El segundo sumando cubre las filas SIN formula en Parcial, que es como
   *    nace una fila insertada a mano. Se usan su metrado y su precio, que es
   *    exactamente lo que hace el importador cuando la celda viene vacia
   *    (`excel-presupuesto.ts`: «Sin subtotal en el archivo, se calcula»). Con
   *    esto la hoja y GCM dicen el mismo numero pase lo que pase, y anadir una
   *    fila deja de tener trampa: insertala y escribe.
   *
   * `IF(ISNUMBER(rango),rango,0)` y no `N(rango)`: el segundo solo evalua como
   * matriz dentro de Excel y da 0,00 en cualquier otro programa. La
   * multiplicacion en vez de `NOT(...)` por lo mismo, para no depender de que
   * una funcion logica se evalue por matriz.
   */
  const esCapitulo = (f: FilaCosto) => f.codigo.endsWith(".0");
  const totalHojas = FILAS_COSTO.filter((f) => !esCapitulo(f)).reduce(
    (acc, f) =>
      acc +
      (f.parcial ??
        (f.metrado !== undefined && f.precioUnitario !== undefined
          ? f.metrado * f.precioUnitario
          : 0)),
    0,
  );

  const rango = (col: string) =>
    `$${col}$${primeraFila}:$${col}$${ultimaFila}`;
  const numero = (col: string) =>
    `IF(ISNUMBER(${rango(col)}),${rango(col)},0)`;
  /// Un capitulo no se cuenta: sus hijas ya estan en la suma.
  const noEsCapitulo = `(RIGHT(${rango("A")},2)<>".0")`;

  total.getCell(6).value = {
    result: Math.round(totalHojas * 100) / 100,
    formula:
      `SUMPRODUCT(${noEsCapitulo}*${numero("F")})+` +
      `SUMPRODUCT(${noEsCapitulo}*(1-IF(ISNUMBER(${rango("F")}),1,0))*` +
      `${numero("D")}*${numero("E")})`,
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
   * La leyenda, arriba del todo.
   *
   * El gris no significa nada por si solo: hay que decir que quiere decir, y
   * decirlo DONDE se ve, no en la hoja de instrucciones que se lee una vez.
   */
  for (const hoja of [costo]) {
    const leyenda = hoja.getCell("A3");
    leyenda.value =
      "Las celdas en gris se calculan solas: puedes escribir o pegar encima, pero pierden la fórmula. " +
      "¿Ya tienes tu presupuesto en otro Excel? Pega aquí tus capítulos y partidas de una vez, en las columnas que les toquen: la hoja no está protegida. " +
      "Aunque el Parcial se quede en blanco no pierdes nada, GCM lo calcula con el metrado y el precio al importar. " +
      "Hay " + FILAS_PREPARADAS + " filas listas: usa las que necesites y deja el resto vacías. " +
      "Las filas SIN Ítem son costos propios (sueldos, alquileres, pólizas): cuestan, pero no se le facturan al cliente línea a línea. " +
      "Las fechas son opcionales, van en las partidas (01/08/2026) y las dos o ninguna.";
    leyenda.font = { italic: true, size: 10, color: { argb: "FF667788" } };

    /**
     * LA HOJA NO SE PROTEGE, y esto es lo que costo el candado.
     *
     * Nacio protegida -sin contraseña, para evitar el accidente de escribir
     * encima de una formula- y con permiso explicito para insertar filas. El
     * 23 de agosto de 2026 se reporto que PEGAR seguia fallando, y se
     * documento como una limitacion de Excel: pegar escribe sobre las celdas
     * de destino y las de formula estaban bloqueadas, asi que la unica
     * operacion que funcionaba era «Insertar celdas copiadas». La leyenda
     * llego a explicar ese menu.
     *
     * El 27 de agosto el cliente pidio lo que ese rodeo escondia: quiere
     * traerse de una vez los capitulos, partidas y subpartidas que ya tiene
     * en su Excel, pegandolos. Enseñar un truco de menu para esquivar una
     * proteccion que ponemos nosotros es reconocer que la proteccion sobra.
     *
     * QUE SE PIERDE Y POR QUE COMPENSA: pegar encima machaca las formulas del
     * Parcial y del Contractual, y esa columna se queda en blanco en Excel.
     * No se pierde ni un sol: `analizarExcel` calcula el Parcial con el
     * metrado y el precio cuando no viene, y el Contractual lo recalcula GCM
     * de todos modos al importar -el archivo muestra, el importador manda-.
     * El gris y las notas siguen ahi para avisar de que esas celdas se
     * calculan solas.
     */
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
