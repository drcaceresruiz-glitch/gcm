import ExcelJS from "exceljs";
import { normalizarDecimal, multiplicar, sumar } from "@/lib/decimal";

/**
 * Lectura de presupuestos desde Excel.
 *
 * El importador nunca escribe nada por si mismo: analiza, valida y devuelve
 * una vista previa. La escritura ocurre en un segundo paso, ya con el
 * usuario habiendo visto lo que se va a cargar. Un presupuesto importado a
 * ciegas es peor que no importarlo.
 */

export type TipoFila = "CAPITULO" | "PARTIDA";

export interface FilaImportada {
  /// Numero de fila en el Excel, para que el usuario la localice.
  fila: number;
  codigo: string;
  tipo: TipoFila;
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
  // antes de comparar, asi que "Descripcion", "Descripción" y "DESCRIPCION"
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

/** Simbolos de grado y ordinal: aparecen en cabeceras como "N°" o "Nº". */
const ORDINALES = new RegExp("[\\u00b0\\u00ba]", "g");

function normalizarTexto(valor: unknown): string {
  return String(valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .replace(ORDINALES, "")
    .trim();
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
): { tipo: TipoFila; nivel: number } {
  const segmentos = codigo.split(".");
  const ultimo = segmentos.at(-1) ?? "";
  const nivel = Math.max(0, segmentos.length - 1);

  // Convencion explicita: un solo segmento ("1") o terminacion en cero
  // ("4.0") siempre es capitulo.
  if (segmentos.length === 1 || Number(ultimo) === 0) {
    return { tipo: "CAPITULO", nivel };
  }

  // Señal de contenido: en el formato S10 los niveles intermedios como
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
      filaCabecera: null, columnasDetectadas: {}, totalCapitulos: 0, totalPartidas: 0, montoTotal: "0.00",
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
      filaCabecera: null, columnasDetectadas: {}, totalCapitulos: 0, totalPartidas: 0, montoTotal: "0.00",
    };
  }

  const columnasDetectadas: Record<string, string> = {};
  for (const [campo, col] of mapa) {
    columnasDetectadas[campo] = textoCelda(hoja.getRow(filaCabecera).getCell(col)) || `Columna ${col}`;
  }

  const filas: FilaImportada[] = [];
  const codigosVistos = new Map<string, number>();
  const parciales: string[] = [];

  for (let n = filaCabecera + 1; n <= hoja.rowCount; n++) {
    const fila = hoja.getRow(n);

    const codigo = textoCelda(fila.getCell(mapa.get("codigo")!));
    const descripcion = textoCelda(fila.getCell(mapa.get("descripcion")!));

    // Filas vacias o de totales al pie: se ignoran en silencio.
    if (!codigo && !descripcion) continue;

    if (!codigo) {
      errores.push({ fila: n, columna: "codigo", mensaje: `Falta el codigo de "${descripcion.slice(0, 60)}".` });
      continue;
    }

    if (!/^\d+(\.\d+)*$/.test(codigo)) {
      errores.push({
        fila: n, columna: "codigo",
        mensaje: `Codigo "${codigo}" no valido. Se esperan numeros separados por punto, como 4.3 o 01.02.01.`,
      });
      continue;
    }

    if (!descripcion) {
      errores.push({ fila: n, columna: "descripcion", mensaje: `La partida ${codigo} no tiene descripcion.` });
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

    const colMetrado = mapa.get("metrado");
    const colPrecio = mapa.get("precioUnitario");
    const tieneDatosEconomicos =
      (colMetrado
        ? normalizarDecimal(valorCelda(fila.getCell(colMetrado)), 4) !== null
        : false) ||
      (colPrecio
        ? normalizarDecimal(valorCelda(fila.getCell(colPrecio)), 4) !== null
        : false);

    const { tipo, nivel } = clasificarCodigo(codigo, tieneDatosEconomicos);
    const registro = construirFila({ hoja, fila, n, mapa, codigo, descripcion, tipo, nivel, errores });

    if (registro) {
      filas.push(registro);
      if (registro.parcial) parciales.push(registro.parcial);
    }
  }

  return {
    filas,
    errores,
    filaCabecera,
    columnasDetectadas,
    totalCapitulos: filas.filter((f) => f.tipo === "CAPITULO").length,
    totalPartidas: filas.filter((f) => f.tipo === "PARTIDA").length,
    montoTotal: sumar(parciales),
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
  errores: ErrorImportacion[];
}

function construirFila(args: ArgsFila): FilaImportada | null {
  const { fila, n, mapa, codigo, descripcion, tipo, nivel, errores } = args;

  const leer = (campo: string) => {
    const col = mapa.get(campo);
    return col ? valorCelda(fila.getCell(col)) : null;
  };

  // Los capitulos solo agrupan: su importe es la suma de sus partidas y no
  // se toma del Excel, donde suele venir como subtotal ya calculado.
  if (tipo === "CAPITULO") {
    return {
      fila: n, codigo, tipo, descripcion, nivel,
      unidad: null, metrado: null, precioUnitario: null, parcial: null,
    };
  }

  const unidadTexto = String(leer("unidad") ?? "").trim();
  const metrado = normalizarDecimal(leer("metrado"), 4);
  const precioUnitario = normalizarDecimal(leer("precioUnitario"), 4);

  if (metrado === null) {
    errores.push({
      fila: n, columna: "metrado",
      mensaje: `La partida ${codigo} no tiene un metrado valido. Revisa el formato del numero.`,
    });
    return null;
  }

  if (precioUnitario === null) {
    errores.push({
      fila: n, columna: "precioUnitario",
      mensaje: `La partida ${codigo} no tiene un precio unitario valido.`,
    });
    return null;
  }

  const parcial = multiplicar(metrado, precioUnitario, 2);
  if (parcial === null) {
    errores.push({ fila: n, mensaje: `No se pudo calcular el parcial de la partida ${codigo}.` });
    return null;
  }

  let aviso: string | undefined;

  if (!unidadTexto) {
    aviso = "Sin unidad de medida. Se importa, pero conviene completarla.";
  }

  // Si el Excel trae su propio parcial, se contrasta. Una discrepancia
  // suele delatar celdas alteradas a mano o formulas rotas: el usuario
  // debe saberlo antes de dar el presupuesto por bueno.
  const parcialExcel = normalizarDecimal(leer("parcial"), 2);
  if (parcialExcel !== null && parcialExcel !== parcial && parcialExcel !== "0.00") {
    aviso =
      `El parcial del archivo (${parcialExcel}) no coincide con metrado x precio (${parcial}). ` +
      `Se usara el calculado.`;
  }

  return {
    fila: n, codigo, tipo, descripcion, nivel,
    unidad: unidadTexto || null,
    metrado, precioUnitario, parcial,
    ...(aviso ? { aviso } : {}),
  };
}
