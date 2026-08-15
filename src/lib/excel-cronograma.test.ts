import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { analizarCronogramaExcel } from "@/lib/excel-cronograma";

/**
 * Los libros se construyen en memoria, sin ficheros de apoyo: asi la prueba
 * dice en su propio cuerpo que caso esta fijando, y no hay un .xlsx opaco que
 * nadie se atreve a tocar.
 */
type Celda = string | number | Date | null;

function libro(
  filas: readonly Celda[][],
  opciones: { cabecera?: readonly string[]; corte?: string | null; ocultar?: number[] } = {},
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet("Cronograma");

  if (opciones.corte !== null) {
    hoja.getCell("A1").value = "Fecha de corte:";
    hoja.getCell("B1").value = opciones.corte ?? "2026-08-14";
  }

  const cabecera = opciones.cabecera ?? [
    "N°", "ID", "Nivel", "Código", "Actividad", "Inicio", "Fin", "Días", "% Planeado", "% Avance", "Depende de",
  ];
  hoja.getRow(3).values = [...cabecera];

  filas.forEach((f, i) => {
    const fila = hoja.getRow(4 + i);
    fila.values = [...f];
    if (opciones.ocultar?.includes(i)) fila.hidden = true;
  });

  return wb.xlsx.writeBuffer().then(
    (b) => new Uint8Array(b as unknown as Uint8Array).buffer as ArrayBuffer,
  );
}

/** Una obra con un capitulo y una partida: el minimo que pasa la jerarquia. */
const OBRA: Celda[] = [1, 1, 1, "", "Obra de prueba", "2026-06-01", "2026-06-30", 20, 50, 40, ""];
const CAPITULO: Celda[] = [2, 2, 2, "1.0", "ESTRUCTURAS", "2026-06-01", "2026-06-30", 20, 50, 40, ""];
const PARTIDA: Celda[] = [3, 3, 3, "1.1", "Zapatas", "2026-06-01", "2026-06-30", 20, 50, 40, ""];

describe("lo que impide importar", () => {
  it("sin fecha de corte no se puede saber a que estan referidos los avances", async () => {
    const r = await analizarCronogramaExcel(
      await libro([OBRA, CAPITULO, PARTIDA], { corte: null }),
    );

    expect(r.errores.some((e) => e.fila === 0 && e.mensaje.includes("fecha de corte"))).toBe(true);
    expect(r.fechaCorte).toBeNull();
  });

  it("caza el 31 de febrero, que Date acepta rodando al 3 de marzo", async () => {
    const r = await analizarCronogramaExcel(
      await libro([OBRA, CAPITULO, [3, 3, 3, "1.1", "Zapatas", "2026-02-31", "2026-06-30", 20, 50, 40, ""]]),
    );

    const e = r.errores.find((x) => x.uid === 3);
    expect(e?.mensaje).toContain("no es una fecha valida");
  });

  it("una tarea que acaba antes de empezar inflaria la curva de toda la obra", async () => {
    const r = await analizarCronogramaExcel(
      await libro([OBRA, CAPITULO, [3, 3, 3, "1.1", "Zapatas", "2026-06-30", "2026-06-01", 20, 50, 40, ""]]),
    );

    expect(r.errores.find((x) => x.uid === 3)?.mensaje).toContain("anterior al inicio");
  });

  it("un ID repetido pegaria el avance de dos tareas al mismo sitio", async () => {
    const r = await analizarCronogramaExcel(
      await libro([OBRA, CAPITULO, [3, 2, 3, "1.1", "Zapatas", "2026-06-01", "2026-06-30", 20, 50, 40, ""]]),
    );

    expect(r.errores.some((e) => e.mensaje.includes("ya aparece en la fila"))).toBe(true);
  });

  it("sin columna Nivel no hay jerarquia que leer", async () => {
    const r = await analizarCronogramaExcel(
      await libro([OBRA], {
        cabecera: ["N°", "ID", "Sobra", "Código", "Actividad", "Inicio", "Fin", "Días", "% Planeado", "% Avance", "Depende de"],
      }),
    );

    expect(r.errores.some((e) => e.fila === 0 && e.mensaje.includes("Falta la columna Nivel"))).toBe(true);
  });

  it("dos filas de Nivel 1 dejarian la obra partida en dos", async () => {
    const r = await analizarCronogramaExcel(
      await libro([OBRA, [2, 2, 1, "", "Otra obra", "2026-06-01", "2026-06-30", 20, 50, 40, ""]]),
    );

    expect(r.errores.some((e) => e.mensaje.includes("Solo puede haber una"))).toBe(true);
  });

  it("un salto de nivel deja la partida sin capitulo del que colgar", async () => {
    const r = await analizarCronogramaExcel(
      await libro([OBRA, [2, 2, 3, "1.1", "Zapatas", "2026-06-01", "2026-06-30", 20, 50, 40, ""]]),
    );

    expect(r.errores.some((e) => e.mensaje.includes("falta la fila intermedia"))).toBe(true);
  });
});

describe("lo que tolera", () => {
  it("acepta que renombren las columnas", async () => {
    const r = await analizarCronogramaExcel(
      await libro([OBRA, CAPITULO, PARTIDA], {
        cabecera: ["Ítem", "UID", "Esquema", "WBS", "Descripción", "Comienzo", "Término", "Duración", "% Programado", "% Real", "Predecesoras"],
      }),
    );

    expect(r.errores).toEqual([]);
    expect(r.tareas).toHaveLength(3);
  });

  /** Es como la gente escribe las fechas aqui, y exceljs las trae como texto. */
  it("acepta fechas en dd/mm/aaaa", async () => {
    const r = await analizarCronogramaExcel(
      await libro([
        [1, 1, 1, "", "Obra", "01/06/2026", "30/06/2026", 20, 50, 40, ""],
        [2, 2, 2, "1.0", "ESTRUCTURAS", "01/06/2026", "30/06/2026", 20, 50, 40, ""],
      ], { corte: "14/08/2026" }),
    );

    expect(r.errores).toEqual([]);
    expect(r.tareas[0]?.inicio).toBe("2026-06-01");
    expect(r.fechaCorte).toBe("2026-08-14");
  });

  /** Excel devuelve Date cuando la celda tiene formato de fecha. */
  it("acepta celdas con formato de fecha sin correr el dia", async () => {
    const r = await analizarCronogramaExcel(
      await libro([
        [1, 1, 1, "", "Obra", new Date(Date.UTC(2026, 5, 1)), new Date(Date.UTC(2026, 5, 30)), 20, 50, 40, ""],
        [2, 2, 2, "1.0", "ESTRUCTURAS", new Date(Date.UTC(2026, 5, 1)), new Date(Date.UTC(2026, 5, 30)), 20, 50, 40, ""],
      ]),
    );

    expect(r.errores).toEqual([]);
    expect(r.tareas[0]?.inicio).toBe("2026-06-01");
    expect(r.tareas[0]?.fin).toBe("2026-06-30");
  });

  /** Ocultar una fila es como se deja algo fuera de alcance sin borrarlo. */
  it("no importa las filas ocultas, pero dice cuantas dejo fuera", async () => {
    const r = await analizarCronogramaExcel(
      await libro([OBRA, CAPITULO, PARTIDA], { ocultar: [2] }),
    );

    expect(r.errores).toEqual([]);
    expect(r.tareas).toHaveLength(2);
    expect(r.filasOmitidas).toBe(1);
  });

  it("un enlace a un ID que no existe se descarta con aviso, no rompe", async () => {
    const r = await analizarCronogramaExcel(
      await libro([OBRA, [2, 2, 2, "1.0", "ESTRUCTURAS", "2026-06-01", "2026-06-30", 20, 50, 40, "99"]]),
    );

    expect(r.errores).toEqual([]);
    expect(r.dependenciasDescartadas).toBe(1);
    expect(r.tareas[1]?.aviso).toContain("no hay ninguna tarea con ese ID");
  });
});
