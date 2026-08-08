import { describe, it, expect } from "vitest";
import { ponderarPorDuracion, serieCurvaS, type TareaParaCurva } from "./curva-s";
import type { AvanceReportado } from "./cronograma";

function tarea(
  uid: number,
  duracionDias: string,
  porcentajePlaneado: string,
  porcentajeArchivo: string,
  esResumen = false,
): TareaParaCurva {
  return { uid, duracionDias, porcentajePlaneado, porcentajeArchivo, esResumen };
}

function avance(uid: number, porcentaje: string, fecha: string): AvanceReportado {
  return {
    uid,
    porcentaje,
    fecha: new Date(`${fecha}T00:00:00Z`),
    createdAt: new Date(`${fecha}T12:00:00Z`),
    reportadoPor: "Residente",
    nota: null,
  };
}

describe("ponderarPorDuracion", () => {
  it("pesa cada tarea por su duracion, no las promedia", async () => {
    // Una partida de 20 dias al 0% y una de 1 dia al 100%. El promedio simple
    // diria 50%; la verdad es 4,76%.
    const r = ponderarPorDuracion(
      [tarea(1, "20.00", "0.00", "0.00"), tarea(2, "1.00", "100.00", "100.00")],
      (t) => t.porcentajePlaneado,
    );

    expect(r).toBe("4.76");
  });

  it("no cuenta las tareas resumen", async () => {
    // El resumen ya lleva consolidado el avance de sus hijas: sumarlo con
    // ellas contaria dos veces el mismo trabajo. Es la misma trampa que
    // `sumarHojas` resolvio en el presupuesto.
    const r = ponderarPorDuracion(
      [
        tarea(1, "10.00", "100.00", "100.00", true),
        tarea(2, "5.00", "100.00", "100.00"),
        tarea(3, "5.00", "0.00", "0.00"),
      ],
      (t) => t.porcentajePlaneado,
    );

    expect(r).toBe("50.00");
  });

  it("devuelve cero si ninguna tarea tiene duracion", async () => {
    // Un cronograma de puros hitos no tiene avance ponderable. Debe dar cero
    // y no romper la pantalla con una division por cero.
    const r = ponderarPorDuracion(
      [tarea(1, "0.00", "100.00", "100.00"), tarea(2, "0.00", "0.00", "0.00")],
      (t) => t.porcentajePlaneado,
    );

    expect(r).toBe("0.00");
  });

  it("acumula con precision y no arrastra los redondeos", async () => {
    // Tres tercios de 33,33: redondeando cada aporte a dos decimales antes de
    // dividir, el resultado se desvia.
    const r = ponderarPorDuracion(
      [
        tarea(1, "1.00", "33.33", "0.00"),
        tarea(2, "1.00", "33.33", "0.00"),
        tarea(3, "1.00", "33.34", "0.00"),
      ],
      (t) => t.porcentajePlaneado,
    );

    expect(r).toBe("33.33");
  });
});

describe("serieCurvaS", () => {
  const corte = (version: number, fecha: string, tareas: TareaParaCurva[]) => ({
    version,
    fechaCorte: new Date(`${fecha}T00:00:00Z`),
    tareas,
  });

  it("ordena los cortes por fecha aunque se hayan cargado al reves", async () => {
    // Nada impide cargar despues un corte antiguo para completar el
    // historico, y la curva tiene que salir igualmente de izquierda a derecha.
    const serie = serieCurvaS(
      [
        corte(2, "2026-08-03", [tarea(1, "10.00", "20.00", "10.00")]),
        corte(1, "2026-08-08", [tarea(1, "10.00", "60.00", "50.00")]),
      ],
      [],
    );

    expect(serie.map((p) => p.version)).toEqual([2, 1]);
    expect(serie.map((p) => p.planeado)).toEqual(["20.00", "60.00"]);
  });

  it("usa el reporte de obra vigente en la fecha del corte, no el de hoy", async () => {
    // La curva cuenta lo que se sabia entonces. Si tomara siempre el ultimo
    // reporte, el pasado se reescribiria cada vez que alguien reporta hoy y
    // la curva dejaria de ser un historico.
    const tareas = [tarea(1, "10.00", "50.00", "0.00")];

    const serie = serieCurvaS(
      [corte(1, "2026-08-03", tareas), corte(2, "2026-08-08", tareas)],
      [avance(1, "30.00", "2026-08-02"), avance(1, "90.00", "2026-08-08")],
    );

    expect(serie[0]?.real).toBe("30.00");
    expect(serie[1]?.real).toBe("90.00");
  });

  it("cae al porcentaje del archivo mientras la tarea no tenga reporte", async () => {
    const serie = serieCurvaS(
      [corte(1, "2026-08-08", [tarea(1, "10.00", "80.00", "45.00")])],
      [],
    );

    expect(serie[0]?.real).toBe("45.00");
  });

  it("calcula el desfase con signo", async () => {
    const serie = serieCurvaS(
      [
        corte(1, "2026-08-03", [tarea(1, "10.00", "20.00", "35.00")]),
        corte(2, "2026-08-08", [tarea(1, "10.00", "80.00", "45.00")]),
      ],
      [],
    );

    expect(serie.map((p) => p.desfase)).toEqual(["15.00", "-35.00"]);
  });
});
