import { describe, expect, it } from "vitest";

import {
  inventarioEjecutable,
  suerteDeLaPromesa,
  tasaDeLiberacion,
  type RestriccionMedible,
  type TareaParaInventario,
} from "@/lib/indicadores-lps";

const HOY = new Date("2026-08-15T12:00:00Z");
const dia = (d: string) => new Date(`${d}T00:00:00Z`);

function tarea(
  uid: number,
  fase: TareaParaInventario["fase"],
  comprometida: unknown[] = [],
): TareaParaInventario {
  return { uid, nombre: `T${uid}`, codigo: null, zona: null, fase, comprometida };
}

describe("SWI: el inventario de trabajo ejecutable", () => {
  it("solo cuenta lo LISTO y ademas sin comprometer", () => {
    const i = inventarioEjecutable([
      tarea(1, "LISTA"),
      tarea(2, "LISTA", [{ planId: "p1" }]),
      tarea(3, "CON_PENDIENTES"),
      tarea(4, "SIN_ANALIZAR"),
    ]);

    expect(i.disponibles).toBe(1);
    expect(i.listas).toBe(2);
    expect(i.total).toBe(4);
    expect(i.tareas.map((t) => t.uid)).toEqual([1]);
  });

  it("una tarea lista pero ya prometida NO es colchon", () => {
    // Tiene dueño y fecha: si mañana se cae otra cosa, esta no sustituye a
    // nadie porque ya estaba contada.
    const i = inventarioEjecutable([tarea(1, "LISTA", [{ planId: "p1" }])]);

    expect(i.listas).toBe(1);
    expect(i.disponibles).toBe(0);
    expect(i.porcentajeLibre).toBe(0);
  });
});

describe("SWI: sin nada listo no hay porcentaje", () => {
  it("devuelve null y no cero", () => {
    // Un 0 % se leeria como «todo comprometido», que es justo lo contrario de
    // «no hay nada listo». Son dos situaciones distintas y dos consejos
    // distintos, asi que no pueden dar el mismo numero.
    const i = inventarioEjecutable([tarea(1, "CON_PENDIENTES")]);

    expect(i.porcentajeLibre).toBeNull();
    expect(i.disponibles).toBe(0);
  });

  it("sin ninguna tarea tampoco inventa un cero", () => {
    const i = inventarioEjecutable([]);

    expect(i.total).toBe(0);
    expect(i.porcentajeLibre).toBeNull();
  });
});

describe("TA: que paso con cada promesa", () => {
  const caso = (r: Partial<RestriccionMedible>): RestriccionMedible => ({
    fechaCompromiso: null,
    resuelta: false,
    resueltaAt: null,
    ...r,
  });

  it("liberada el mismo dia prometido cuenta como a tiempo", () => {
    // El borde importa: prometer para el viernes y cerrarla el viernes es
    // cumplir, no incumplir por un dia.
    expect(
      suerteDeLaPromesa(
        caso({ fechaCompromiso: dia("2026-08-10"), resuelta: true, resueltaAt: dia("2026-08-10") }),
        HOY,
      ),
    ).toBe("a_tiempo");
  });

  it("abierta con la fecha pasada es vencida, aunque nadie la haya cerrado", () => {
    // Esperar a que alguien la cierre para contarla premiaria el olvido: la
    // que nadie toca saldria del indicador en vez de hundirlo.
    expect(
      suerteDeLaPromesa(caso({ fechaCompromiso: dia("2026-08-10") }), HOY),
    ).toBe("vencida");
  });

  it("abierta con la fecha por llegar NO cuenta", () => {
    expect(
      suerteDeLaPromesa(caso({ fechaCompromiso: dia("2026-08-20") }), HOY),
    ).toBe("en_plazo");
  });

  it("resuelta sin fecha de resolucion cuenta como tarde, no como a tiempo", () => {
    // Ante la duda el indicador no se regala: si no consta cuando se cerro,
    // no hay prueba de que llegara a tiempo.
    expect(
      suerteDeLaPromesa(
        caso({ fechaCompromiso: dia("2026-08-10"), resuelta: true }),
        HOY,
      ),
    ).toBe("tarde");
  });

  it("sin fecha prometida no se puede medir", () => {
    expect(suerteDeLaPromesa(caso({ resuelta: true }), HOY)).toBe("sin_promesa");
  });
});

describe("TA: la tasa y su denominador", () => {
  const r = (
    fechaCompromiso: Date | null,
    resuelta: boolean,
    resueltaAt: Date | null = null,
  ): RestriccionMedible => ({ fechaCompromiso, resuelta, resueltaAt });

  it("planificar con antelacion no puede empeorar la tasa", () => {
    // Es la trampa del indicador. Dos obras con el MISMO historial, pero una
    // mira mas hacia delante y tiene diez promesas abiertas en plazo. Si esas
    // contaran, saldria peor por hacerlo mejor.
    const historial = [
      r(dia("2026-08-01"), true, dia("2026-08-01")),
      r(dia("2026-08-02"), true, dia("2026-08-05")),
    ];
    const previsora = [...historial, ...Array.from({ length: 10 }, () => r(dia("2026-09-01"), false))];

    expect(tasaDeLiberacion(historial, HOY).porcentaje).toBe(50);
    expect(tasaDeLiberacion(previsora, HOY).porcentaje).toBe(50);
    expect(tasaDeLiberacion(previsora, HOY).enPlazo).toBe(10);
  });

  it("cuenta aparte lo que no se puede medir", () => {
    // Un 100 % sobre dos promesas de cincuenta restricciones no es un 100 %:
    // es que casi nadie promete. Sin este contador, el numero engaña.
    const t = tasaDeLiberacion(
      [
        r(dia("2026-08-01"), true, dia("2026-08-01")),
        ...Array.from({ length: 48 }, () => r(null, true, dia("2026-08-01"))),
      ],
      HOY,
    );

    expect(t.porcentaje).toBe(100);
    expect(t.medidas).toBe(1);
    expect(t.sinPromesa).toBe(48);
  });

  it("sin ni una promesa cumplida su plazo, no hay tasa", () => {
    // Null y no cero: «no se puede saber» y «se incumple todo» son cosas
    // distintas, y el cero es la que asusta sin motivo.
    const t = tasaDeLiberacion([r(dia("2026-09-01"), false), r(null, false)], HOY);

    expect(t.porcentaje).toBeNull();
    expect(t.medidas).toBe(0);
  });

  it("las vencidas hunden la tasa, como debe ser", () => {
    const t = tasaDeLiberacion(
      [
        r(dia("2026-08-01"), true, dia("2026-08-01")),
        r(dia("2026-08-02"), false),
        r(dia("2026-08-03"), false),
      ],
      HOY,
    );

    expect(t.aTiempo).toBe(1);
    expect(t.vencidas).toBe(2);
    expect(t.porcentaje).toBe(33);
  });

  it("sin restricciones no revienta", () => {
    const t = tasaDeLiberacion([], HOY);

    expect(t.medidas).toBe(0);
    expect(t.porcentaje).toBeNull();
    expect(t.sinPromesa).toBe(0);
  });
});
