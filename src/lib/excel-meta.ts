import ExcelJS from "exceljs";

import { normalizarDecimal } from "@/lib/decimal";
import { resumenGastosGenerales, type EntradaGasto } from "@/lib/bolsa";
import type { ErrorImportacion } from "@/lib/excel-presupuesto";

/**
 * La hoja de GASTOS GENERALES del libro de la meta.
 *
 * El costo directo de la meta lo lee `analizarExcel` sin tocar nada —son las
 * mismas columnas que un presupuesto— y por eso esa hoja va la primera del
 * libro. Esto es lo unico que hace falta ademas.
 *
 * Se pide MENSUAL y MESES por separado, y no un total, porque de ahi sale la
 * unica cifra que convierte un atraso en dinero: lo que cuesta cada mes de
 * mas. Un importe cerrado no se puede repartir hacia atras.
 */

export type TipoGastoLeido = "FIJO" | "VARIABLE";

export interface FilaGastoGeneral {
  /// Numero de fila en el Excel, para que el usuario la localice.
  fila: number;
  concepto: string;
  tipo: TipoGastoLeido;
  montoMensual: string | null;
  meses: string | null;
  montoFijo: string | null;
}

export interface ResultadoGastos {
  filas: FilaGastoGeneral[];
  errores: ErrorImportacion[];
  filaCabecera: number | null;
  /// Suma de los importes, ya resueltos (mensual x meses en los variables).
  total: string;
  /// Lo que cuesta cada mes de atraso: solo los variables.
  costeMensualDelAtraso: string;
}

/** El nombre que lleva la hoja en la plantilla. */
export const HOJA_GASTOS = "Gastos Generales";

function vacio(): ResultadoGastos {
  return {
    filas: [],
    errores: [],
    filaCabecera: null,
    total: "0.00",
    costeMensualDelAtraso: "0.00",
  };
}

function texto(celda: ExcelJS.Cell | undefined): string {
  const v = celda?.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "result" in v) return String(v.result ?? "").trim();
  if (typeof v === "object" && "richText" in v) {
    return v.richText.map((t) => t.text).join("").trim();
  }
  return String(v).trim();
}

/**
 * Localiza la cabecera buscando la fila que dice "concepto".
 *
 * Se busca por contenido y no por posicion fija porque la gente anade filas
 * de titulo encima sin pensarlo, igual que en el presupuesto. Devuelve tambien
 * en que columna cayo cada cosa: nadie garantiza el orden.
 */
function detectarCabecera(hoja: ExcelJS.Worksheet): {
  fila: number | null;
  columnas: Record<string, number>;
} {
  const CLAVES: [string, RegExp][] = [
    ["concepto", /^(concepto|descripcion|descripción|partida)$/i],
    ["tipo", /^tipo$/i],
    ["montoMensual", /^(monto\s*mensual|mensual|costo\s*mensual|s\/\s*mes)$/i],
    // El grado y el ordinal masculino se confunden en cualquier teclado, y
    // "N° meses" es como lo escribe medio Peru. Se aceptan los dos, el punto,
    // la almohadilla y la palabra entera con y sin tilde.
    [
      "meses",
      /^(meses|n[°º.]?\s*(de\s*)?meses|#\s*meses|n[uú]mero\s*de\s*meses|cantidad\s*de\s*meses|plazo\s*(en\s*)?meses)$/i,
    ],
    ["montoFijo", /^(importe\s*fijo|importe|monto\s*fijo|total)$/i],
  ];

  for (let f = 1; f <= Math.min(hoja.rowCount, 30); f++) {
    const fila = hoja.getRow(f);
    const columnas: Record<string, number> = {};

    for (let c = 1; c <= 12; c++) {
      const valor = texto(fila.getCell(c));
      if (!valor) continue;
      for (const [clave, patron] of CLAVES) {
        if (columnas[clave] === undefined && patron.test(valor)) columnas[clave] = c;
      }
    }

    if (columnas.concepto !== undefined && columnas.tipo !== undefined) {
      return { fila: f, columnas };
    }
  }

  return { fila: null, columnas: {} };
}

/**
 * Lee la hoja de gastos generales del libro de la meta.
 *
 * No lanza nunca: devuelve lo que pudo leer y una lista de errores con su
 * numero de fila, igual que el importador de presupuesto. Una hoja que falta
 * no es un error —una meta puede no tener gastos generales cargados todavia—
 * y se devuelve vacia.
 */
export async function analizarGastosGenerales(
  contenido: ArrayBuffer,
): Promise<ResultadoGastos> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(contenido);

  // Por nombre, no por indice: la hoja de costo directo tiene que ser la
  // primera —`analizarExcel` lee `worksheets[0]`— pero el resto puede moverse.
  const hoja =
    libro.getWorksheet(HOJA_GASTOS) ??
    libro.worksheets.find((h) => h.name.toLowerCase().includes("generales"));

  if (!hoja) return vacio();

  const { fila: filaCabecera, columnas } = detectarCabecera(hoja);
  if (filaCabecera === null) {
    return {
      ...vacio(),
      errores: [{
        fila: 0,
        mensaje:
          `La hoja "${hoja.name}" no tiene una tabla de gastos generales. Se ` +
          `necesitan al menos las columnas Concepto y Tipo.`,
      }],
    };
  }

  const filas: FilaGastoGeneral[] = [];
  const errores: ErrorImportacion[] = [];
  const leer = (f: ExcelJS.Row, clave: string) =>
    columnas[clave] === undefined ? "" : texto(f.getCell(columnas[clave]!));

  for (let n = filaCabecera + 1; n <= hoja.rowCount; n++) {
    const f = hoja.getRow(n);

    // Una fila oculta se deja fuera a proposito, como en el presupuesto: es
    // la forma habitual de retirar un concepto sin borrarlo.
    if (f.hidden) continue;

    const concepto = leer(f, "concepto");
    if (!concepto) continue;

    const bruto = leer(f, "tipo").toUpperCase();
    if (bruto !== "FIJO" && bruto !== "VARIABLE") {
      errores.push({
        fila: n,
        columna: "Tipo",
        mensaje: `"${concepto}": el tipo tiene que ser FIJO o VARIABLE, y dice "${leer(f, "tipo")}".`,
      });
      continue;
    }

    const tipo = bruto as TipoGastoLeido;
    const montoMensual = normalizarDecimal(leer(f, "montoMensual"), 2);
    const meses = normalizarDecimal(leer(f, "meses"), 2);
    const montoFijo = normalizarDecimal(leer(f, "montoFijo"), 2);

    if (tipo === "VARIABLE" && (montoMensual === null || meses === null)) {
      errores.push({
        fila: n,
        mensaje:
          `"${concepto}" es VARIABLE: necesita monto mensual y meses. Si es un ` +
          `importe cerrado que no depende del plazo, ponlo como FIJO.`,
      });
      continue;
    }

    if (tipo === "FIJO" && montoFijo === null) {
      errores.push({
        fila: n,
        mensaje:
          `"${concepto}" es FIJO: necesita su importe. Si se paga por mes, ` +
          `ponlo como VARIABLE con su monto mensual y sus meses.`,
      });
      continue;
    }

    filas.push({
      fila: n,
      concepto,
      tipo,
      montoMensual: tipo === "VARIABLE" ? montoMensual : null,
      meses: tipo === "VARIABLE" ? meses : null,
      montoFijo: tipo === "FIJO" ? montoFijo : null,
    });
  }

  // Los totales salen de `resumenGastosGenerales`, la MISMA funcion que usa
  // el servicio al guardar. Si el Excel sumara por su cuenta, la vista previa
  // y lo guardado podrian decir cifras distintas.
  const entradas: EntradaGasto[] = filas.map((f) => ({
    tipo: f.tipo,
    montoMensual: f.montoMensual,
    meses: f.meses,
    montoFijo: f.montoFijo,
  }));

  const resumen = resumenGastosGenerales(entradas);

  return {
    filas,
    errores,
    filaCabecera,
    total: resumen.total,
    costeMensualDelAtraso: resumen.costeMensualDelAtraso,
  };
}
