import { describe, it, expect } from "vitest";
import { medirAvance, ultimoAvancePorTarea, type AvanceReportado } from "./cronograma";

function avance(
  uid: number,
  porcentaje: string,
  fecha: string,
  creado = `${fecha}T12:00:00Z`,
  reportadoPor = "Residente",
): AvanceReportado {
  return {
    uid,
    porcentaje,
    fecha: new Date(`${fecha}T00:00:00Z`),
    createdAt: new Date(creado),
    reportadoPor,
    nota: null,
  };
}

function tarea(uid: number, planeado: string, archivo: string) {
  return { uid, porcentajePlaneado: planeado, porcentajeArchivo: archivo };
}

describe("ultimoAvancePorTarea", () => {
  it("se queda con el reporte mas reciente de cada tarea", async () => {
    const ultimos = ultimoAvancePorTarea([
      avance(109, "30.00", "2026-08-03"),
      avance(109, "55.00", "2026-08-08"),
      avance(104, "100.00", "2026-08-05"),
    ]);

    expect(ultimos.get(109)?.porcentaje).toBe("55.00");
    expect(ultimos.get(104)?.porcentaje).toBe("100.00");
  });

  it("respeta el orden de llegada cuando la fecha es la misma", async () => {
    // Si el residente corrige por la tarde lo que dijo por la manana, manda
    // la correccion. Sin desempatar por `createdAt`, el resultado dependeria
    // del orden en que la base devolviera las filas.
    const ultimos = ultimoAvancePorTarea([
      avance(109, "60.00", "2026-08-08", "2026-08-08T16:00:00Z"),
      avance(109, "40.00", "2026-08-08", "2026-08-08T09:00:00Z"),
    ]);

    expect(ultimos.get(109)?.porcentaje).toBe("60.00");
  });
});

describe("medirAvance", () => {
  it("hace mandar al reporte de obra sobre lo que dice el archivo", async () => {
    // El archivo dice 30% y obra reporto 55%. A partir del primer reporte
    // manda GCM: es el reparto acordado con el usuario.
    const r = medirAvance([tarea(109, "83.00", "30.00")], [avance(109, "55.00", "2026-08-08")]);

    expect(r.tareas[0]?.porcentajeReal).toBe("55.00");
    expect(r.tareas[0]?.discrepa).toBe(true);
  });

  it("siembra con el porcentaje del archivo mientras nadie reporte nada", async () => {
    // Un cronograma recien importado se veria entero a cero teniendo Project
    // el dato, y eso haria desconfiar del sistema el primer dia.
    const r = medirAvance([tarea(109, "83.00", "30.00")], []);

    expect(r.tareas[0]?.porcentajeReal).toBe("30.00");
    expect(r.tareas[0]?.avance).toBeNull();
    expect(r.tareas[0]?.discrepa).toBe(false);
  });

  it("no marca discrepancia cuando obra confirma lo que decia el archivo", async () => {
    const r = medirAvance([tarea(126, "81.00", "81.00")], [avance(126, "81.00", "2026-08-08")]);

    expect(r.tareas[0]?.discrepa).toBe(false);
  });

  it("no confunde con una discrepancia dos cifras iguales escritas distinto", async () => {
    // Las columnas Decimal vuelven de la base sin los ceros finales ("81" y
    // no "81.00"). Comparando los textos, la tabla marcaria en conflicto
    // todas las tareas donde obra confirmo exactamente lo que decia Project.
    const r = medirAvance([tarea(126, "81.00", "81")], [avance(126, "81.00", "2026-08-08")]);

    expect(r.tareas[0]?.discrepa).toBe(false);
    expect(r.tareas[0]?.desfase).toBe("0.00");
  });

  it("calcula el desfase con signo y con aritmetica exacta", async () => {
    // El "% DESFASE" del propio archivo (Number2) esta roto: resta una escala
    // 0..100 de otra 0..1. Estas son las cuatro filas del informe del 08/08.
    const r = medirAvance(
      [
        tarea(104, "63.00", "100.00"),
        tarea(109, "83.00", "30.00"),
        tarea(125, "88.00", "100.00"),
        tarea(126, "81.00", "81.00"),
      ],
      [],
    );

    expect(r.tareas.map((t) => t.desfase)).toEqual(["37.00", "-53.00", "12.00", "0.00"]);
  });

  it("no pierde el reporte de una tarea que ya no esta en el cronograma", async () => {
    // Caso real: entre el corte del 02 y el del 09 el planificador borro la
    // partida 6.1 (UID 119), que estaba al 100%. El reporte se aparta para
    // poder ensenarlo; borrarlo en silencio seria tirar trabajo reportado.
    const r = medirAvance(
      [tarea(126, "81.00", "81.00")],
      [avance(119, "100.00", "2026-08-03"), avance(126, "81.00", "2026-08-08")],
    );

    expect(r.tareas).toHaveLength(1);
    expect(r.huerfanos.map((h) => h.uid)).toEqual([119]);
    expect(r.huerfanos[0]?.porcentaje).toBe("100.00");
  });

  it("conserva los campos de la tarea que recibe", async () => {
    // Se usa sobre las filas que vienen de la base, con sus fechas y su
    // nombre: perderlos obligaria a volver a cruzarlas en la pantalla.
    const r = medirAvance(
      [{ ...tarea(109, "83.00", "30.00"), codigo: "4.4", nombre: "Solados para zapatas" }],
      [],
    );

    expect(r.tareas[0]?.codigo).toBe("4.4");
    expect(r.tareas[0]?.nombre).toBe("Solados para zapatas");
  });
});
