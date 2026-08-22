import { describe, it, expect } from "vitest";
import {
  diaIso,
  esLaborable,
  diasLaborablesEntre,
  avanzarDiasLaborables,
  horasPorSemana,
  validarCalendario,
  type DiaLaboral,
} from "./calendario";

/// Todo el archivo trabaja en UTC (ver el comentario de cabecera de
/// `calendario.ts`); las fechas de las pruebas se anclan igual, para no
/// depender de la zona horaria de quien corre el test.
const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/// El de CRIOCORD: L-V 8h, sabado 5h, domingo libre.
const CRIOCORD: DiaLaboral[] = [
  { diaSemana: 1, laborable: true, horas: "8" },
  { diaSemana: 2, laborable: true, horas: "8" },
  { diaSemana: 3, laborable: true, horas: "8" },
  { diaSemana: 4, laborable: true, horas: "8" },
  { diaSemana: 5, laborable: true, horas: "8" },
  { diaSemana: 6, laborable: true, horas: "5" },
  { diaSemana: 7, laborable: false, horas: "0" },
];

/// Turno corrido de obra vial o minera.
const CORRIDO: DiaLaboral[] = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  diaSemana: n,
  laborable: true,
  horas: "10",
}));

describe("diaIso", () => {
  it("el domingo es 7, no 0 como en JavaScript", () => {
    // 09/08/2026 es domingo.
    expect(diaIso(utc("2026-08-09"))).toBe(7);
    expect(diaIso(utc("2026-08-10"))).toBe(1);
    expect(diaIso(utc("2026-08-15"))).toBe(6);
  });
});

describe("esLaborable", () => {
  it("respeta el calendario de la obra", () => {
    expect(esLaborable(utc("2026-08-09"), CRIOCORD)).toBe(false);
    expect(esLaborable(utc("2026-08-15"), CRIOCORD)).toBe(true);
    expect(esLaborable(utc("2026-08-09"), CORRIDO)).toBe(true);
  });

  it("sin fila para ese dia cuenta como laborable", () => {
    // Contar de mas es preferible a esconder trabajo ya programado.
    expect(esLaborable(utc("2026-08-09"), [])).toBe(true);
  });
});

describe("diasLaborablesEntre", () => {
  it("cuenta ambos extremos incluidos", () => {
    // Lunes 10 a domingo 16: 6 laborables en CRIOCORD, 7 en turno corrido.
    expect(diasLaborablesEntre(utc("2026-08-10"), utc("2026-08-16"), CRIOCORD)).toBe(6);
    expect(diasLaborablesEntre(utc("2026-08-10"), utc("2026-08-16"), CORRIDO)).toBe(7);
  });

  it("un solo dia laborable cuenta uno", () => {
    expect(diasLaborablesEntre(utc("2026-08-10"), utc("2026-08-10"), CRIOCORD)).toBe(1);
  });

  it("un solo dia de descanso cuenta cero", () => {
    expect(diasLaborablesEntre(utc("2026-08-09"), utc("2026-08-09"), CRIOCORD)).toBe(0);
  });

  it("si la fecha final es anterior devuelve cero, no negativo", () => {
    expect(diasLaborablesEntre(utc("2026-08-16"), utc("2026-08-10"), CRIOCORD)).toBe(0);
  });
});

describe("horasPorSemana", () => {
  it("suma solo los dias laborables", () => {
    expect(horasPorSemana(CRIOCORD)).toBe(45);
    expect(horasPorSemana(CORRIDO)).toBe(70);
  });
});

describe("validarCalendario", () => {
  it("acepta el calendario completo y ordena los dias", () => {
    const r = validarCalendario([...CRIOCORD].reverse());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dias.map((x) => x.diaSemana)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("un dia de descanso queda con cero horas aunque manden otra cosa", () => {
    // "Domingo, no laborable, 5 horas" es un dato que se contradice y que
    // alguien acabaria sumando.
    const r = validarCalendario(
      CRIOCORD.map((x) => (x.diaSemana === 7 ? { ...x, horas: "5" } : x)),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dias[6]).toEqual({ diaSemana: 7, laborable: false, horas: "0" });
  });

  it("exige horas en un dia laborable", () => {
    const r = validarCalendario(
      CRIOCORD.map((x) => (x.diaSemana === 1 ? { ...x, horas: "0" } : x)),
    );
    expect(r.ok).toBe(false);
  });

  it("rechaza mas de 24 horas y dias repetidos", () => {
    expect(
      validarCalendario(
        CRIOCORD.map((x) => (x.diaSemana === 1 ? { ...x, horas: "30" } : x)),
      ).ok,
    ).toBe(false);
    expect(
      validarCalendario(CRIOCORD.map((x) => ({ ...x, diaSemana: 1 }))).ok,
    ).toBe(false);
  });

  it("no deja una obra sin ningun dia laborable", () => {
    const r = validarCalendario(
      CRIOCORD.map((x) => ({ ...x, laborable: false, horas: "0" })),
    );
    expect(r.ok).toBe(false);
  });

  it("acepta coma decimal", () => {
    const r = validarCalendario(
      CRIOCORD.map((x) => (x.diaSemana === 6 ? { ...x, horas: "4,5" } : x)),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dias[5]?.horas).toBe("4.50");
  });
});

describe("avanzarDiasLaborables", () => {
  it("adelanta saltando un dia no laborable", () => {
    // Viernes 14 + 2 laborables: sabado 15 (laborable), domingo 16 (no
    // cuenta), lunes 17 (laborable) — cruza el fin de semana.
    const r = avanzarDiasLaborables(utc("2026-08-14"), 2, CRIOCORD, 1);
    expect(r.toISOString().slice(0, 10)).toBe("2026-08-17");
  });

  it("retrocede saltando un dia no laborable, en sentido contrario", () => {
    const r = avanzarDiasLaborables(utc("2026-08-17"), 2, CRIOCORD, -1);
    expect(r.toISOString().slice(0, 10)).toBe("2026-08-14");
  });

  it("cero dias no mueve la fecha", () => {
    const r = avanzarDiasLaborables(utc("2026-08-14"), 0, CRIOCORD, 1);
    expect(r.toISOString().slice(0, 10)).toBe("2026-08-14");
  });

  it("en turno corrido (siete dias laborables) avanza dia natural por dia", () => {
    const r = avanzarDiasLaborables(utc("2026-08-14"), 3, CORRIDO, 1);
    expect(r.toISOString().slice(0, 10)).toBe("2026-08-17");
  });
});
