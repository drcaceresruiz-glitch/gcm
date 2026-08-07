import ExcelJS from "exceljs";
import { normalizarDecimal, multiplicar, sumar } from "@/lib/decimal";
import {
  sumarHojas,
  detectarImportesRepetidos,
  type GrupoRepetido,
} from "@/lib/jerarquia-partidas";

/**
 * Lectura de presupuestos desde Excel.
 *
 * El importador nunca escribe nada por si mismo: analiza, valida y devuelve
 * una vista previa. La escritura ocurre en un segundo paso, ya con el
 * usuario habiendo visto lo que se va a cargar. Un presupuesto importado a
 * ciegas es peor que no importarlo.
 */

export type TipoFila = "CAPITULO" | "PARTIDA";

export type Modalidad = "PRECIOS_UNITARIOS" | "SUMA_ALZADA" | "ALCANCE";

export interface FilaImportada {
  /// Numero de fila en el Excel, para que el usuario la localice.
  fila: number;
  codigo: string;
  tipo: TipoFila;
  /// Como esta contratada. Determina si el importe se recalcula al cambiar
  /// el metrado y como se valorizara su avance.
  modalidad: Modalidad;
  descripcion: string;
  nivel: number;
  unidad: string | null;
  metrado: string | null;
  precioUnitario: string | null;
  parcial: string | null;
  /// Aviso no bloqueante: la fila se importa igual.
  aviso?: string;
}

export interface ErrorImportacion {
  fila: number;
  columna?: string;
  mensaje: string;
}

export interface ResultadoAnalisis {
  filas: FilaImportada[];
  errores: ErrorImportacion[];
  filaCabecera: number | null;
  columnasDetectadas: Record<string, string>;
  totalCapitulos: number;
  totalPartidas: number;
  montoTotal: string;
  /// El mismo total contando una sola vez cada grupo de importes repetidos.
  montoSinRepetidos: string;
  /// Rachas de filas consecutivas con importe identico.
  gruposRepetidos: GrupoRepetido[];
  /// Filas de texto sin codigo: notas, subtitulos y clausulas del contrato.
  filasTextoOmitidas: number;
  /// Partidas ocultas en el Excel: quedaron fuera de alcance y no se importan.
  filasOcultas: number;
  /// Importe que suman esas partidas ocultas, para que se vea que se dejo fuera.
  importeOculto: string;
}

/** Numeros separados por punto: "4", "4.3", "01.02.01". */
const CODIGO_VALIDO = /^\d+(\.\d+)*$/;

export interface Combinacion {
  /// Fila que posee el valor; el resto lo comparten.
  maestra: number;
  ultima: number;
}

/**
 * Localiza las celdas combinadas verticalmente en las columnas de cifras.
 *
 * Una combinacion vertical significa que varias filas COMPARTEN un unico
 * importe: es una partida contratada a suma alzada cuyo alcance se detalla
 * en varias lineas. En el presupuesto de CRIOCORD, el paquete de drywall
 * ocupa nueve filas que comparten un solo precio de 79.727,33.
 *
 * Es la senal autoritativa, y sustituye a adivinarlo comparando importes
 * iguales: dos partidas distintas pueden costar lo mismo de forma legitima,
 * y confundirlas descuadraria el presupuesto.
 */
function detectarCombinaciones(
  hoja: ExcelJS.Worksheet,
  columnas: number[],
): Map<number, Combinacion> {
  const modelo = hoja.model as unknown as { merges?: string[] };
  const rangos = modelo.merges ?? [];

  const letras = new Set(columnas.map((c) => letraDeColumna(c)));
  const porFila = new Map<number, Combinacion>();

  for (const rango of rangos) {
    const [inicio, fin] = rango.split(":");
    const a = /^([A-Z]+)(\d+)$/.exec(inicio ?? "");
    const b = /^([A-Z]+)(\d+)$/.exec(fin ?? "");
    if (!a || !b) continue;

    const desde = Number(a[2]);
    const hasta = Number(b[2]);

    // Solo las verticales que tocan una columna de cifras.
    if (hasta <= desde || !letras.has(a[1]!)) continue;

    for (let n = desde; n <= hasta; n++) {
      porFila.set(n, { maestra: desde, ultima: hasta });
    }
  }

  return porFila;
}

function letraDeColumna(indice: number): string {
  let n = indice;
  let letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

/**
 * Sinonimos de cabecera aceptados.
 *
 * Los presupuestos peruanos suelen venir de S10, pero cada oficina retoca
 * los titulos. Se acepta la variedad real en vez de exigir una plantilla
 * exacta, que es lo que hace que un importador no se use nunca.
 */
const ALIAS: Record<string, string[]> = {
  // Los alias van sin tildes ni simbolos: la cabecera leida se normaliza
  // antes de comparar, asi que "Descripcion", "DescripciÃ³n" y "DESCRIPCION"
  // acaban siendo la misma cadena.
  codigo: ["item", "codigo", "cod", "nro", "n", "no", "num"],
  descripcion: ["descripcion", "partida", "detalle", "concepto", "actividad"],
  unidad: ["und", "und.", "unidad", "u.m.", "um", "medida", "unid"],
  metrado: ["metrado", "cantidad", "cant", "cant.", "metrados"],
  precioUnitario: ["precio unitario", "p.u.", "pu", "precio", "unitario", "costo unitario"],
  parcial: ["parcial", "subtotal", "importe", "total", "monto"],
};

/**
 * Rango Unicode de tildes y diacriticos combinantes (U+0300 a U+036F).
 *
 * Se construye desde texto y no como literal `/[...]/` a proposito: con los
 * caracteres escritos directamente, cualquier reguardado del archivo en
 * otra codificacion invierte el rango y rompe la expresion.
 */
const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

/** Simbolos de grado y ordinal: aparecen en cabeceras como "NÂ°" o "NÂº". */
const ORDINALES = new RegExp("[\\u00b0\\u00ba]", "g");

function normalizarTexto(valor: unknown): string {
  return (
    String(valor ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(DIACRITICOS, "")
      .replace(ORDINALES, "")
      // Guiones y guiones bajos se eliminan: "SUB-TOTAL" y "SUBTOTAL" son
      // la misma columna, y separarlas hacia fallar la deteccion en
      // presupuestos reales.
      .replace(/[-_]/g, "")
      // Espacios repetidos a uno solo.
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Extrae el texto de una celda, resolviendo formulas y texto enriquecido. */
function textoCelda(celda: ExcelJS.Cell | undefined): string {
  if (!celda) return "";
  const v = celda.value;

  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("result" in v) return String(v.result ?? "").trim();
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("text" in v) return String(v.text).trim();
  }
  return String(v).trim();
}

/** Valor crudo de una celda, resolviendo formulas. */
function valorCelda(celda: ExcelJS.Cell | undefined): unknown {
  if (!celda) return null;
  const v = celda.value;
  if (v !== null && typeof v === "object" && "result" in v) return v.result;
  return v;
}

/**
 * Localiza la fila de cabecera y a que campo corresponde cada columna.
 *
 * No se asume que la cabecera este en la fila 1: las exportaciones de S10
 * traen titulo de obra, cliente y fecha antes de la tabla.
 */
function detectarCabecera(hoja: ExcelJS.Worksheet): {
  filaCabecera: number | null;
  mapa: Map<string, number>;
} {
  const limite = Math.min(hoja.rowCount, 30);

  for (let n = 1; n <= limite; n++) {
    const fila = hoja.getRow(n);
    const mapa = new Map<string, number>();
    const usadas = new Set<number>();

    // Se resuelven primero los campos mas especificos: "precio unitario"
    // antes que "precio", y "descripcion" antes que "partida", que aparece
    // como sinonimo en dos campos distintos.
    const orden = ["metrado", "precioUnitario", "parcial", "unidad", "codigo", "descripcion"];

    for (const campo of orden) {
      const alias = ALIAS[campo] ?? [];

      for (let c = 1; c <= Math.min(hoja.columnCount, 40); c++) {
        if (usadas.has(c)) continue;

        const encabezado = normalizarTexto(textoCelda(fila.getCell(c)));
        if (!encabezado) continue;

        const coincide = alias.some(
          (a) => encabezado === a || encabezado.startsWith(`${a} `) || encabezado === `${a}.`,
        );

        if (coincide) {
          mapa.set(campo, c);
          usadas.add(c);
          break;
        }
      }
    }

    // Con codigo, descripcion y al menos un dato economico ya es una tabla
    // de presupuesto reconocible.
    if (mapa.has("codigo") && mapa.has("descripcion") && (mapa.has("metrado") || mapa.has("precioUnitario"))) {
      return { filaCabecera: n, mapa };
    }
  }

  return { filaCabecera: null, mapa: new Map() };
}

/**
 * Un codigo es de capitulo si termina en `.0` (1.0, 2.0) o si no tiene
 * separador (1, 2). El resto son partidas. El nivel se deduce de la
 * cantidad de segmentos, para soportar tambien el formato S10 de tres o
 * mas niveles ("01.01.02").
 */
function clasificarCodigo(
  codigo: string,
  tieneDatosEconomicos: boolean,
  tieneImporte: boolean,
): { tipo: TipoFila; nivel: number } {
  const segmentos = codigo.split(".");
  const ultimo = segmentos.at(-1) ?? "";
  const nivel = Math.max(0, segmentos.length - 1);

  // Si la fila lleva un importe propio, es costeable, y manda sobre
  // cualquier convencion de codigo. En los presupuestos reales hay grupos
  // como "7.02.00 REDES DE DESAGUE" que llevan el precio del subcontrato a
  // suma alzada mientras sus hijas solo detallan el alcance. Tratarlos como
  // capitulo por terminar en cero descartaria ese dinero.
  if (tieneImporte) {
    return { tipo: "PARTIDA", nivel };
  }

  // Convencion explicita: un solo segmento ("1") o terminacion en cero
  // ("4.0") es capitulo.
  if (segmentos.length === 1 || Number(ultimo) === 0) {
    return { tipo: "CAPITULO", nivel };
  }

  // SeÃ±al de contenido: en el formato S10 los niveles intermedios como
  // "01.02" son subtitulos que agrupan, sin metrado ni precio. Una fila sin
  // datos economicos agrupa; no es una partida a la que se le pueda exigir
  // un metrado.
  if (!tieneDatosEconomicos) {
    return { tipo: "CAPITULO", nivel };
  }

  return { tipo: "PARTIDA", nivel };
}

export async function analizarExcel(
  contenido: ArrayBuffer,
): Promise<ResultadoAnalisis> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(contenido);

  const hoja = libro.worksheets[0];
  const errores: ErrorImportacion[] = [];

  if (!hoja) {
    return {
      filas: [], errores: [{ fila: 0, mensaje: "El archivo no contiene ninguna hoja." }],
      filaCabecera: null, columnasDetectadas: {}, totalCapitulos: 0,
      totalPartidas: 0, montoTotal: "0.00", montoSinRepetidos: "0.00",
      gruposRepetidos: [], filasTextoOmitidas: 0,
      filasOcultas: 0, importeOculto: "0.00",
    };
  }

  const { filaCabecera, mapa } = detectarCabecera(hoja);

  if (filaCabecera === null) {
    return {
      filas: [],
      errores: [{
        fila: 0,
        mensaje:
          "No se encontro la tabla de partidas. Se necesitan al menos una columna de codigo, " +
          "una de descripcion y una de metrado o precio unitario.",
      }],
      filaCabecera: null, columnasDetectadas: {}, totalCapitulos: 0,
      totalPartidas: 0, montoTotal: "0.00", montoSinRepetidos: "0.00",
      gruposRepetidos: [], filasTextoOmitidas: 0,
      filasOcultas: 0, importeOculto: "0.00",
    };
  }

  const columnasDetectadas: Record<string, string> = {};
  for (const [campo, col] of mapa) {
    columnasDetectadas[campo] = textoCelda(hoja.getRow(filaCabecera).getCell(col)) || `Columna ${col}`;
  }

  const filas: FilaImportada[] = [];
  const codigosVistos = new Map<string, number>();

  let filasTextoOmitidas = 0;
  let filasOcultas = 0;
  const importesOcultos: string[] = [];

  // Filas que comparten un unico importe por estar combinadas en el Excel.
  const combinaciones = detectarCombinaciones(
    hoja,
    ["metrado", "precioUnitario", "parcial"]
      .map((c) => mapa.get(c))
      .filter((c): c is number => c !== undefined),
  );

  /**
   * Ultima fila con un codigo valido.
   *
   * Los presupuestos cierran con totales y con las clausulas contractuales,
   * que son parrafos de texto sin codigo. Delimitar la tabla por aqui evita
   * dos errores opuestos: leer el texto legal como partidas rotas, y cortar
   * la tabla al primer hueco en blanco, que existe entre capitulos y haria
   * perder presupuesto en silencio.
   */
  const colCodigo = mapa.get("codigo")!;
  let ultimaFila = filaCabecera;
  for (let n = filaCabecera + 1; n <= hoja.rowCount; n++) {
    const c = textoCelda(hoja.getRow(n).getCell(colCodigo));
    if (c && CODIGO_VALIDO.test(c)) ultimaFila = n;
  }

  // Si no hay ningun codigo valido se recorre la hoja entera igualmente.
  // De lo contrario el analisis terminaria sin leer nada y sin explicar por
  // que, que es la peor respuesta posible: el usuario ve cero partidas y
  // ningun motivo.
  if (ultimaFila === filaCabecera) ultimaFila = hoja.rowCount;

  for (let n = filaCabecera + 1; n <= ultimaFila; n++) {
    const fila = hoja.getRow(n);

    const codigo = textoCelda(fila.getCell(mapa.get("codigo")!));
    const descripcion = textoCelda(fila.getCell(mapa.get("descripcion")!));

    /**
     * Las filas ocultas no se importan.
     *
     * En un presupuesto, ocultar una fila es la forma habitual de dejar una
     * partida fuera de alcance sin borrarla, por si vuelve a entrar. Sus
     * formulas de total tampoco la incluyen. Contarla inflaria el
     * presupuesto con trabajo que nadie va a ejecutar.
     */
    if (fila.hidden) {
      const importe = normalizarDecimal(
        mapa.get("parcial") ? valorCelda(fila.getCell(mapa.get("parcial")!)) : null,
        2,
      );
      if (codigo || descripcion) {
        filasOcultas++;
        if (importe) importesOcultos.push(importe);
      }
      continue;
    }

    if (!codigo && !descripcion) continue;

    if (!codigo) {
      // Texto sin codigo: notas, subtitulos, filas de totales y clausulas
      // contractuales, que en los presupuestos reales aparecen intercaladas
      // entre capitulos. Se omiten en silencio y solo se cuentan.
      //
      // Listarlas como errores llenaria el informe de ruido, y un listado
      // ruidoso ensena al usuario a ignorarlo: entonces se pierde tambien
      // el error de verdad.
      filasTextoOmitidas++;
      continue;
    }

    if (!CODIGO_VALIDO.test(codigo)) {
      errores.push({
        fila: n, columna: "codigo",
        mensaje: `Codigo "${codigo}" no valido. Se esperan numeros separados por punto, como 4.3 o 01.02.01.`,
      });
      continue;
    }

    const tieneValor = (campo: string) => {
      const col = mapa.get(campo);
      return col
        ? normalizarDecimal(valorCelda(fila.getCell(col)), 4) !== null
        : false;
    };

    // Cualquiera de los tres convierte la fila en algo costeable o medible.
    // El subtotal cuenta por si solo: en los presupuestos reales hay grupos
    // contratados a suma alzada, con precio pero sin metrado ni unitario.
    const tieneImporte = tieneValor("parcial");
    const tieneDatosEconomicos =
      tieneValor("metrado") || tieneValor("precioUnitario") || tieneImporte;

    if (!descripcion) {
      // Un codigo suelto, sin descripcion ni cifras, es una fila residual
      // del Excel. No aporta nada: se omite como una fila vacia mas.
      if (!tieneDatosEconomicos) continue;

      errores.push({
        fila: n, columna: "descripcion",
        mensaje: `La partida ${codigo} tiene cifras pero le falta la descripcion.`,
      });
      continue;
    }

    const duplicado = codigosVistos.get(codigo);
    if (duplicado !== undefined) {
      errores.push({
        fila: n, columna: "codigo",
        mensaje: `El codigo ${codigo} ya aparece en la fila ${duplicado}. Cada partida debe ser unica.`,
      });
      continue;
    }
    codigosVistos.set(codigo, n);

    const { tipo, nivel } = clasificarCodigo(
      codigo,
      tieneDatosEconomicos,
      tieneImporte,
    );
    const registro = construirFila({
      hoja, fila, n, mapa, codigo, descripcion, tipo, nivel,
      combinacion: combinaciones.get(n) ?? null,
    });

    if (registro) {
      filas.push(registro);

    }
  }

  // Importes que se repiten en filas consecutivas: casi siempre una formula
  // arrastrada en el Excel. Se marcan y se ofrece el total sin ellos, para
  // que el usuario compare y decida.
  const repetidos = detectarImportesRepetidos(filas);

  /// Todas las filas del grupo menos la primera, que si cuenta.
  const filasRepetidas = new Set(repetidos.flatMap((g) => g.filas.slice(1)));

  for (const f of filas) {
    if (!filasRepetidas.has(f.fila)) continue;
    const nota =
      "Importe identico al de la fila anterior: posible formula arrastrada en el Excel.";
    f.aviso = f.aviso ? `${f.aviso} ${nota}` : nota;
  }

  return {
    filas,
    errores,
    filaCabecera,
    columnasDetectadas,
    totalCapitulos: filas.filter((f) => f.tipo === "CAPITULO").length,
    totalPartidas: filas.filter((f) => f.tipo === "PARTIDA").length,
    // Solo las hojas: si un grupo lleva importe propio y sus hijas tambien,
    // sumar ambos contaria el mismo dinero dos veces.
    montoTotal: sumarHojas(filas),
    montoSinRepetidos: sumarHojas(
      filas.map((f) =>
        filasRepetidas.has(f.fila) ? { ...f, parcial: null } : f,
      ),
    ),
    gruposRepetidos: repetidos,
    filasTextoOmitidas,
    filasOcultas,
    importeOculto: sumar(importesOcultos),
  };
}

interface ArgsFila {
  hoja: ExcelJS.Worksheet;
  fila: ExcelJS.Row;
  n: number;
  mapa: Map<string, number>;
  codigo: string;
  descripcion: string;
  tipo: TipoFila;
  nivel: number;
  /// Si la fila comparte importe con otras por estar combinada en el Excel.
  combinacion: Combinacion | null;
}

function construirFila(args: ArgsFila): FilaImportada | null {
  const { fila, n, mapa, codigo, descripcion, tipo, nivel, combinacion } = args;

  const leer = (campo: string) => {
    const col = mapa.get(campo);
    return col ? valorCelda(fila.getCell(col)) : null;
  };

  // Los capitulos solo agrupan: su importe es la suma de sus partidas y no
  // se toma del Excel, donde suele venir como subtotal ya calculado.
  if (tipo === "CAPITULO") {
    return {
      fila: n, codigo, tipo, modalidad: "PRECIOS_UNITARIOS", descripcion, nivel,
      unidad: null, metrado: null, precioUnitario: null, parcial: null,
    };
  }

  /**
   * Fila cubierta por una celda combinada.
   *
   * El importe pertenece al bloque entero, no a esta linea: al leerla, Excel
   * devuelve el valor de la celda maestra, y contarlo aqui multiplicaria el
   * presupuesto por el numero de filas combinadas. Esta linea solo describe
   * parte del alcance de la partida a suma alzada que encabeza el bloque.
   */
  if (combinacion && n !== combinacion.maestra) {
    const cuantas = combinacion.ultima - combinacion.maestra + 1;
    return {
      fila: n, codigo, tipo, modalidad: "ALCANCE", descripcion, nivel,
      unidad: null, metrado: null, precioUnitario: null, parcial: null,
      aviso: `Comparte importe con las filas ${combinacion.maestra} a ${combinacion.ultima} (${cuantas} lineas a suma alzada).`,
    };
  }

  const unidadTexto = String(leer("unidad") ?? "").trim();
  const metrado = normalizarDecimal(leer("metrado"), 4);
  const precioUnitario = normalizarDecimal(leer("precioUnitario"), 4);
  const parcialArchivo = normalizarDecimal(leer("parcial"), 2);

  const avisos: string[] = [];
  let parcial: string | null = null;

  /**
   * El subtotal del archivo MANDA sobre el calculo.
   *
   * Es la cifra pactada en el presupuesto, y en los documentos reales no
   * siempre equivale a metrado x precio unitario: hay partidas contratadas
   * en bloque donde el precio es del paquete completo y la cantidad es
   * informativa. En el presupuesto de CRIOCORD la formula de esas filas es
   * literalmente "=F225", sin multiplicar por la cantidad.
   *
   * Recalcularlas y sobrescribir el importe acordado inflaba el
   * presupuesto en varios millones. Se respeta el documento y, si el
   * calculo discrepa, se avisa para que alguien lo revise.
   */
  if (parcialArchivo !== null) {
    parcial = parcialArchivo;

    if (metrado !== null && precioUnitario !== null) {
      const calculado = multiplicar(metrado, precioUnitario, 2);
      if (calculado !== null && calculado !== parcialArchivo) {
        avisos.push(
          `El importe del archivo (${parcialArchivo}) no es metrado x precio (${calculado}). Se respeta el del archivo.`,
        );
      }
    } else {
      avisos.push("Importe a suma alzada, sin metrado o sin precio unitario.");
    }
  } else if (metrado !== null && precioUnitario !== null) {
    // Sin subtotal en el archivo, se calcula.
    parcial = multiplicar(metrado, precioUnitario, 2);
  }

  // Invariante garantizada por quien llama: una fila sin ningun dato
  // economico se clasifica como CAPITULO y ya salio arriba. Aqui siempre
  // hay al menos metrado, precio o importe.

  if (parcial === null) {
    avisos.push(
      metrado !== null
        ? "Sin precio unitario: se importa como desglose de alcance dentro de una partida a suma alzada."
        : "Sin metrado: no se puede calcular el importe de esta partida.",
    );
  }

  if (!unidadTexto && metrado !== null) {
    avisos.push("Sin unidad de medida. Conviene completarla.");
  }

  if (combinacion) {
    const cuantas = combinacion.ultima - combinacion.maestra + 1;
    avisos.push(
      `Importe unico compartido con ${cuantas - 1} linea(s) mas, hasta la fila ${combinacion.ultima}.`,
    );
  }

  return {
    fila: n, codigo, tipo,
    // Encabezar un bloque combinado es la definicion de suma alzada: un
    // precio cerrado que cubre todo el alcance descrito debajo.
    modalidad: combinacion
      ? "SUMA_ALZADA"
      : deducirModalidad({ metrado, precioUnitario, parcial, unidad: unidadTexto }),
    descripcion, nivel,
    unidad: unidadTexto || null,
    metrado, precioUnitario, parcial,
    ...(avisos.length > 0 ? { aviso: avisos.join(" ") } : {}),
  };
}

/** Unidades que en la practica significan "precio cerrado por el conjunto". */
const UNIDADES_GLOBALES = new Set(["glb", "glb.", "glob", "global", "und.glb", "glg"]);

/**
 * Deduce como esta contratada la partida.
 *
 * La senal decisiva es si el importe se explica por metrado x precio. Si no
 * se explica, o si no hay con que calcularlo, el precio esta cerrado por el
 * conjunto y el metrado es referencial.
 */
function deducirModalidad(d: {
  metrado: string | null;
  precioUnitario: string | null;
  parcial: string | null;
  unidad: string;
}): Modalidad {
  // Metrado sin importe ni precio: describe el alcance de la partida padre.
  if (d.parcial === null && d.precioUnitario === null && d.metrado !== null) {
    return "ALCANCE";
  }

  if (d.parcial !== null && d.metrado !== null && d.precioUnitario !== null) {
    const calculado = multiplicar(d.metrado, d.precioUnitario, 2);
    // El importe no se explica por la multiplicacion: es un precio cerrado.
    if (calculado !== d.parcial) return "SUMA_ALZADA";
  }

  // Precio cerrado sin metrado o sin unitario con que descomponerlo.
  if (d.parcial !== null && (d.metrado === null || d.precioUnitario === null)) {
    return "SUMA_ALZADA";
  }

  // Unidad global: el precio cubre el conjunto aunque la cantidad sea 1.
  if (UNIDADES_GLOBALES.has(d.unidad.trim().toLowerCase())) {
    return "SUMA_ALZADA";
  }

  return "PRECIOS_UNITARIOS";
}
