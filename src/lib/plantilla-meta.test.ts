import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";

import {
  generarPlantillaMeta,
  FILAS_COSTO,
  TOTAL_COSTO_EJEMPLO,
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
    const r = await analizarExcel(await generarPlantillaMeta());

    expect(r.errores).toEqual([]);
    expect(r.filaCabecera).not.toBeNull();
  });

  it("clasifica capitulos y partidas, incluido el capitulo propio de la meta", async () => {
    const r = await analizarExcel(await generarPlantillaMeta());
    const porCodigo = new Map(r.filas.map((f) => [f.codigo, f]));

    expect(r.totalCapitulos).toBe(3);
    expect(r.totalPartidas).toBe(FILAS_COSTO.length - 3);

    expect(porCodigo.get("1.0")?.tipo).toBe("CAPITULO");
    expect(porCodigo.get("1.1")?.tipo).toBe("PARTIDA");
    // El capitulo 3 son los costos que el contrato no desglosa.
    expect(porCodigo.get("3.0")?.tipo).toBe("CAPITULO");
    expect(porCodigo.get("3.1")?.tipo).toBe("PARTIDA");
  });

  it("suma lo esperado y no estrena al usuario con el aviso de repetidos", async () => {
    const r = await analizarExcel(await generarPlantillaMeta());

    expect(r.montoTotal).toBe(TOTAL_COSTO_EJEMPLO);
    expect(r.gruposRepetidos).toEqual([]);
    expect(r.filasOcultas).toBe(0);
    expect(r.filasTextoOmitidas).toBe(0);
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
    const r = await analizarExcel(await generarPlantillaMeta());
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
    const r = await analizarExcel(await generarPlantillaMeta());
    const porCodigo = new Map(r.filas.map((f) => [f.codigo, f]));

    expect(porCodigo.get("1.0")?.porcentajeRecargo).toBe("18.00");
    expect(porCodigo.get("2.0")?.porcentajeRecargo).toBe("15.00");
    expect(porCodigo.get("3.0")?.porcentajeRecargo).toBe("22.00");

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
    const r = await analizarExcel(await generarPlantillaMeta());

    expect(r.columnasDetectadas["parcial"]).toBe("Parcial");
    expect(r.montoTotal).toBe(TOTAL_COSTO_EJEMPLO);
  });
});
