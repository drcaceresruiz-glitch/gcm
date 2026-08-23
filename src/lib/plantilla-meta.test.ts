import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";

import {
  generarPlantillaMeta,
  TOTAL_COSTO_EJEMPLO,
  TOTAL_GASTOS_EJEMPLO,
  COSTE_MENSUAL_EJEMPLO,
} from "./plantilla-meta";
import { analizarExcel } from "./excel-presupuesto";
import { analizarGastosGenerales, HOJA_GASTOS } from "./excel-meta";

/**
 * El contrato de la plantilla de la meta: lo que GCM regala para descargar,
 * GCM lo tiene que poder importar limpio. Se genera y se pasa por los MISMOS
 * analizadores que usa el importador. Si alguien cambia las reglas y la
 * plantilla se queda atras, esto revienta antes de produccion.
 */

/** Un libro con solo la hoja de gastos, para los casos que fallan. */
async function libroDeGastos(
  filas: (string | number | null)[][],
  opciones: { cabecera?: string[]; ocultar?: number[] } = {},
): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  // La primera hoja se deja vacia a proposito: aqui solo se prueba la otra.
  libro.addWorksheet("Costo Directo");
  const hoja = libro.addWorksheet(HOJA_GASTOS);

  hoja.addRow(["GASTOS GENERALES"]);
  hoja.addRow(
    opciones.cabecera ?? ["Concepto", "Tipo", "Monto mensual", "Meses", "Importe fijo"],
  );
  for (const f of filas) hoja.addRow(f);

  for (const n of opciones.ocultar ?? []) hoja.getRow(n).hidden = true;

  return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("la hoja de costo directo de la plantilla meta", () => {
  it("la lee el MISMO importador que el presupuesto, sin un solo error", async () => {
    // Es la razon de que esta hoja vaya la primera y con las mismas columnas:
    // no hay un segundo importador que mantener.
    const r = await analizarExcel(await generarPlantillaMeta(), { propiasDeLaMeta: true });

    expect(r.errores).toEqual([]);
    expect(r.filaCabecera).not.toBeNull();
  });

  it("clasifica capitulos y partidas", async () => {
    const r = await analizarExcel(await generarPlantillaMeta(), { propiasDeLaMeta: true });
    const porCodigo = new Map(r.filas.map((f) => [f.codigo, f]));

    expect(r.totalCapitulos).toBe(2);
    expect(porCodigo.get("1.0")?.tipo).toBe("CAPITULO");
    expect(porCodigo.get("1.1")?.tipo).toBe("PARTIDA");
  });

  it("los costos propios de la meta salen SIN codigo, y por eso no van al contrato", async () => {
    /*
     * Es la mitad importante de lo que ensena la plantilla. Con codigo, un
     * andamio alquilado entraria al presupuesto del cliente como una linea
     * mas -y de ahi al cronograma, como una tarea que alguien tendria que
     * ejecutar-. Sin codigo cuesta igual, cuenta en la meta y en la bolsa, y
     * su dinero se cubre con el recargo del resto.
     */
    const r = await analizarExcel(await generarPlantillaMeta(), { propiasDeLaMeta: true });

    expect(r.propiasDeLaMeta.map((f) => f.descripcion)).toEqual([
      "Andamio metálico en alquiler",
      "Encofrado metálico en alquiler (varias partidas)",
    ]);
    expect(r.propiasDeLaMeta.map((f) => f.parcial)).toEqual(["1520.00", "2600.00"]);

    // Y ninguno aparece entre las filas con codigo.
    expect(r.filas.some((f) => f.descripcion.includes("Andamio"))).toBe(false);
  });

  it("sin la opcion, el importador del contrato las sigue ignorando", async () => {
    // La opcion es SOLO de la hoja de la meta: en el importador del
    // presupuesto contractual una fila sin codigo es una nota o un subtitulo,
    // y recogerla meteria texto suelto en el arbol de partidas.
    const r = await analizarExcel(await generarPlantillaMeta());

    expect(r.propiasDeLaMeta).toEqual([]);
    expect(r.filas.some((f) => f.descripcion.includes("Andamio"))).toBe(false);
  });

  it("suma lo esperado y no estrena al usuario con el aviso de repetidos", async () => {
    const r = await analizarExcel(await generarPlantillaMeta(), { propiasDeLaMeta: true });

    expect(r.montoTotal).toBe(TOTAL_COSTO_EJEMPLO);
    expect(r.gruposRepetidos).toEqual([]);
    expect(r.filasOcultas).toBe(0);
    // Una: el subtitulo del bloque de costos propios, que es texto y nada
    // mas. La fila de TOTAL del final no cuenta porque queda fuera de la
    // tabla, que es donde tiene que quedarse.
    expect(r.filasTextoOmitidas).toBe(1);
  });
});

describe("la hoja de gastos generales de la plantilla", () => {
  /*
   * Volvio a la plantilla el 23 de agosto. Salio el 21 con el argumento de
   * que "los reconoce el contrato y los gestiona la empresa": cierto de cara
   * al CLIENTE -el contrato los reconoce englobados- pero no de cara a la
   * empresa, que paga al residente igual. Sin ellos la meta no es lo que la
   * obra cuesta, solo lo que cuestan sus partidas.
   */
  it("la lee su propio analizador, sin un error", async () => {
    const r = await analizarGastosGenerales(await generarPlantillaMeta());

    expect(r.errores).toEqual([]);
    expect(r.total).toBe(TOTAL_GASTOS_EJEMPLO);
    // La cifra que convierte "vamos un mes tarde" en dinero.
    expect(r.costeMensualDelAtraso).toBe(COSTE_MENSUAL_EJEMPLO);
  });

  it("los meses de ejemplo se recortan al plazo real de la obra", async () => {
    // Sin esto, la plantilla de una obra de dos meses propone ocho meses de
    // residente y quien la rellena deprisa se lleva un gasto general cuatro
    // veces mayor que su obra.
    const r = await analizarGastosGenerales(await generarPlantillaMeta(2));

    expect(r.errores).toEqual([]);
    for (const f of r.filas) {
      if (f.tipo === "VARIABLE" && f.meses !== null) {
        expect(Number(f.meses)).toBeLessThanOrEqual(2);
      }
    }
  });

  it("el costo directo NO se contamina con los gastos generales", async () => {
    // Van en hojas distintas y por analizadores distintos a proposito: si un
    // sueldo entrara como partida, acabaria en el contrato del cliente y en
    // el cronograma como una tarea.
    const r = await analizarExcel(await generarPlantillaMeta(), {
      propiasDeLaMeta: true,
    });

    expect(r.montoTotal).toBe(TOTAL_COSTO_EJEMPLO);
    expect(r.filas.some((f) => f.descripcion.includes("Residente"))).toBe(false);
    expect(r.propiasDeLaMeta.some((f) => f.descripcion.includes("Residente"))).toBe(
      false,
    );
  });
});

describe("las formulas de la plantilla se abren en cualquier programa", () => {
  it("no usan N() sobre un rango: solo Excel la evalua como matriz", async () => {
    /*
     * Con `N(rango)` dentro de un SUMPRODUCT, Google Sheets y LibreOffice
     * colapsan el rango a su primera celda y el producto entero sale CERO:
     * la columna Contractual aparecia a 0,00 en la hoja descargada. La
     * plantilla se abre en lo que cada constructora tenga.
     */
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;

    const formulas: string[] = [];
    hoja.eachRow((fila) => {
      fila.eachCell((celda) => {
        const v = celda.value;
        if (v && typeof v === "object" && "formula" in v) {
          formulas.push((v as { formula: string }).formula);
        }
      });
    });

    expect(formulas.length).toBeGreaterThan(0);
    expect(formulas.filter((f) => /N\(\$?[A-Z]+\$?\d+:/.test(f))).toEqual([]);
    expect(formulas.some((f) => f.includes("ISNUMBER("))).toBe(true);
  });

  it("las celdas calculadas traen su resultado, para que se vean sin recalcular", async () => {
    // Un visor que no recalcula -una vista previa de correo, el explorador-
    // ensena la celda vacia si el archivo no trae el valor cacheado.
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;

    // Fila 5 es el primer capitulo del ejemplo, con su 18 % de recargo.
    const contractual = hoja.getRow(5).getCell("H").value as { result?: number };
    expect(contractual.result).toBeCloseTo(2312.8, 2);
  });
});

describe("lo que el analizador de gastos rechaza, y como lo dice", () => {
  it("un VARIABLE sin meses no se cuela como si costara su mensual", async () => {
    const r = await analizarGastosGenerales(
      await libroDeGastos([["Residente", "VARIABLE", 6500, null, null]]),
    );

    expect(r.filas).toEqual([]);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]!.mensaje).toContain("necesita monto mensual y meses");
    // Y sobre todo: no suma nada. Un gasto a medias no es medio gasto.
    expect(r.total).toBe("0.00");
  });

  it("un FIJO sin importe tampoco", async () => {
    const r = await analizarGastosGenerales(
      await libroDeGastos([["Carta fianza", "FIJO", null, null, null]]),
    );

    expect(r.filas).toEqual([]);
    expect(r.errores[0]!.mensaje).toContain("necesita su importe");
  });

  it("un tipo que no es ni FIJO ni VARIABLE se senala con su fila", async () => {
    const r = await analizarGastosGenerales(
      await libroDeGastos([["Andamios", "MENSUAL", 400, 3, null]]),
    );

    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]!.fila).toBe(3);
    expect(r.errores[0]!.columna).toBe("Tipo");
  });
});

describe("tolerancia del analizador de gastos", () => {
  it("una fila oculta se deja fuera, como en el presupuesto", async () => {
    // Es la forma habitual de retirar un concepto sin borrarlo.
    const r = await analizarGastosGenerales(
      await libroDeGastos(
        [
          ["Residente", "VARIABLE", 6500, 8, null],
          ["Topografo", "VARIABLE", 3000, 2, null],
        ],
        { ocultar: [4] },
      ),
    );

    expect(r.filas.map((f) => f.concepto)).toEqual(["Residente"]);
    expect(r.total).toBe("52000.00");
  });

  it("acepta que renombren las columnas", async () => {
    const r = await analizarGastosGenerales(
      await libroDeGastos([["Residente", "variable", 6500, 8, null]], {
        cabecera: ["Descripción", "Tipo", "Costo mensual", "N° meses", "Importe"],
      }),
    );

    expect(r.errores).toEqual([]);
    expect(r.total).toBe("52000.00");
  });

  it("sin hoja de gastos no hay error: una meta puede no tenerlos aun", async () => {
    const libro = new ExcelJS.Workbook();
    libro.addWorksheet("Costo Directo");
    const solo = (await libro.xlsx.writeBuffer()) as ArrayBuffer;

    const r = await analizarGastosGenerales(solo);

    expect(r.errores).toEqual([]);
    expect(r.filas).toEqual([]);
    expect(r.total).toBe("0.00");
  });
});

describe("una fecha escrita como TEXTO", () => {
  /**
   * Pasa constantemente: se pega desde otro archivo, o la columna quedo con
   * formato de texto y Excel guarda "01/08/2026" como cadena en vez de como
   * fecha. Hasta hoy eso se descartaba EN SILENCIO y la partida entraba sin
   * fechas: el usuario creia haberlas cargado y solo se enteraba al ver la
   * EDT entera sin programar.
   */
  async function conTextoEnLasFechas(
    codigo: string,
    inicio: unknown,
    fin: unknown,
  ): Promise<ArrayBuffer> {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;

    let filaPartida: ExcelJS.Row | null = null;
    hoja.eachRow((fila) => {
      if (fila.getCell(1).value === codigo) filaPartida = fila;
    });
    if (!filaPartida) throw new Error(`No se encontro la partida ${codigo}.`);

    (filaPartida as ExcelJS.Row).getCell(9).value = inicio as never;
    (filaPartida as ExcelJS.Row).getCell(10).value = fin as never;

    return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
  }

  const analizar = async (inicio: unknown, fin: unknown) =>
    analizarExcel(await conTextoEnLasFechas("1.1", inicio, fin), {
      propiasDeLaMeta: true,
    });

  it("dd/mm/aaaa se entiende, que es como se escribe en obra", async () => {
    const r = await analizar("01/08/2026", "15/08/2026");
    const p = r.filas.find((f) => f.codigo === "1.1");

    expect(r.errores).toEqual([]);
    expect(p?.fechaInicio).toBe("2026-08-01");
    expect(p?.fechaFin).toBe("2026-08-15");
  });

  it("con guiones o puntos tambien", async () => {
    const r = await analizar("1-8-2026", "15.8.2026");
    const p = r.filas.find((f) => f.codigo === "1.1");

    expect(r.errores).toEqual([]);
    expect(p?.fechaInicio).toBe("2026-08-01");
  });

  it("aaaa-mm-dd tambien, que es lo que exporta cualquier sistema", async () => {
    const r = await analizar("2026-08-01", "2026-08-15");
    expect(r.filas.find((f) => f.codigo === "1.1")?.fechaInicio).toBe("2026-08-01");
  });

  it("lo que no se entiende da ERROR, no se ignora callando", async () => {
    const r = await analizar("agosto", "15/08/2026");

    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]!.mensaje).toContain("agosto");
    expect(r.errores[0]!.mensaje).toContain("no se entiende como fecha");
    // Y la partida no entra a medias: se para y se dice cual es.
    expect(r.filas.some((f) => f.codigo === "1.1")).toBe(false);
  });

  it("un 31 de febrero no se convierte en marzo sin avisar", async () => {
    const r = await analizar("31/02/2026", "15/03/2026");

    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]!.columna).toBe("fecha inicio");
  });

  it("el ano de dos cifras se rechaza: 26 puede ser 1926", async () => {
    // Adivinar el siglo en un contrato no es aceptable.
    const r = await analizar("01/08/26", "15/08/26");
    expect(r.errores).toHaveLength(1);
  });

  it("una celda vacia sigue siendo una partida sin fechas, sin error", async () => {
    const r = await analizar(null, null);

    expect(r.errores).toEqual([]);
    expect(r.filas.find((f) => f.codigo === "1.1")?.fechaInicio).toBeNull();
  });
});

describe("las fechas opcionales de la plantilla meta", () => {
  /**
   * La plantilla no trae fechas de ejemplo a proposito (demuestra que son
   * opcionales), asi que aqui se escribe una a mano sobre el libro ya
   * generado -mismo mecanismo que usa `generarPlantillaMeta`, ExcelJS
   * escribiendo un `Date`- y se vuelve a analizar. Esto es lo que certifica
   * que la fecha sobrevive el viaje sin correrse un dia por la zona horaria
   * de Peru: si `leerFecha` usara getters locales en vez de UTC, esta prueba
   * fallaria.
   */
  async function conFechaEnLaPartida(
    codigo: string,
    fechaInicio: Date,
    fechaFin: Date,
  ): Promise<ArrayBuffer> {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;

    let filaPartida: ExcelJS.Row | null = null;
    hoja.eachRow((fila) => {
      if (fila.getCell(1).value === codigo) filaPartida = fila;
    });
    if (!filaPartida) throw new Error(`No se encontro la partida ${codigo} en la plantilla.`);

    (filaPartida as ExcelJS.Row).getCell(9).value = fechaInicio;
    (filaPartida as ExcelJS.Row).getCell(10).value = fechaFin;

    return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
  }

  it("una partida con fecha sale con esa fecha, sin correrse un dia", async () => {
    const r = await analizarExcel(
      await conFechaEnLaPartida(
        "1.1",
        new Date("2026-09-01T00:00:00.000Z"),
        new Date("2026-09-15T00:00:00.000Z"),
      ),
    );

    expect(r.errores).toEqual([]);
    const porCodigo = new Map(r.filas.map((f) => [f.codigo, f]));
    expect(porCodigo.get("1.1")?.fechaInicio).toBe("2026-09-01");
    expect(porCodigo.get("1.1")?.fechaFin).toBe("2026-09-15");
  });

  it("una partida sin fecha (el ejemplo tal cual) sale con null, no con error", async () => {
    const r = await analizarExcel(await generarPlantillaMeta(), { propiasDeLaMeta: true });
    const porCodigo = new Map(r.filas.map((f) => [f.codigo, f]));

    expect(r.errores).toEqual([]);
    expect(porCodigo.get("2.1")?.fechaInicio).toBeNull();
    expect(porCodigo.get("2.1")?.fechaFin).toBeNull();
  });

  it("solo una de las dos fechas es un error bloqueante", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await generarPlantillaMeta());
    const hoja = libro.worksheets[0]!;
    let filaPartida: ExcelJS.Row | null = null;
    hoja.eachRow((fila) => {
      if (fila.getCell(1).value === "1.1") filaPartida = fila;
    });
    (filaPartida as unknown as ExcelJS.Row).getCell(9).value = new Date("2026-09-01T00:00:00.000Z");
    // Fecha fin se deja en blanco a proposito.

    const r = await analizarExcel((await libro.xlsx.writeBuffer()) as ArrayBuffer);

    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]!.mensaje).toContain("no la otra");
  });
});

describe("el recargo que genera el presupuesto contractual", () => {
  it("llega al importador, y solo en los capitulos", async () => {
    const r = await analizarExcel(await generarPlantillaMeta(), { propiasDeLaMeta: true });
    const porCodigo = new Map(r.filas.map((f) => [f.codigo, f]));

    expect(porCodigo.get("1.0")?.porcentajeRecargo).toBe("18.00");
    expect(porCodigo.get("2.0")?.porcentajeRecargo).toBe("15.00");
    // El bloque de costos propios NO lleva recargo: no va al contrato, asi
    // que no hay nada que recargar.

    // El recargo es del capitulo entero: una partida no lo lleva.
    expect(porCodigo.get("1.1")?.porcentajeRecargo).toBeNull();
  });

  it("no le roba la columna al parcial", async () => {
    /**
     * La columna se llama "Contractual" y no "Total contractual" por esto.
     *
     * El alias de `parcial` incluye "total", "monto" e "importe", y la
     * deteccion admite prefijos: una cabecera que empezara por cualquiera de
     * esos podria quedarse con la columna del importe real, y el presupuesto
     * entraria inflado sin que nada avisara.
     */
    const r = await analizarExcel(await generarPlantillaMeta(), { propiasDeLaMeta: true });

    expect(r.columnasDetectadas["parcial"]).toBe("Parcial");
    expect(r.montoTotal).toBe(TOTAL_COSTO_EJEMPLO);
  });
});
