import { describe, expect, it } from "vitest";

import {
  estadoDelContrato,
  type EncargoParaSemaforo,
} from "./semaforo-contratista";

const HOY = new Date("2026-08-17T00:00:00Z");

const encargo = (p: Partial<EncargoParaSemaforo> = {}): EncargoParaSemaforo => ({
  estado: "VIGENTE",
  fechaInicio: null,
  fechaFin: null,
  ...p,
});

const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("estadoDelContrato", () => {
  it("sin nada en la obra no inventa un contrato", () => {
    expect(estadoDelContrato([], false, HOY)).toBe("ninguno");
  });

  it("un frente en marcha hoy es vigente", () => {
    const e = encargo({ fechaInicio: fecha("2026-08-01"), fechaFin: fecha("2026-09-30") });

    expect(estadoDelContrato([e], false, HOY)).toBe("vigente");
  });

  // ESTA es la que el plan exige que falle sin la lógica: un encargo que
  // terminó hace tres meses no puede pintarse verde en el catálogo.
  it("un frente que ya terminó NO sigue verde", () => {
    const e = encargo({ fechaInicio: fecha("2026-04-01"), fechaFin: fecha("2026-05-15") });

    expect(estadoDelContrato([e], false, HOY)).toBe("ninguno");
  });

  it("un frente que todavía no empieza es «por empezar»", () => {
    const e = encargo({ fechaInicio: fecha("2026-09-01") });

    expect(estadoDelContrato([e], false, HOY)).toBe("proximo");
  });

  // La decisión discutible, fijada a propósito: hay encargos ya cargados sin
  // fechas, y tratarlos como «sin contrato» borraría del semáforo justo a los
  // que llevan más tiempo en la obra.
  it("un frente sin fechas cuenta como vigente", () => {
    expect(estadoDelContrato([encargo()], false, HOY)).toBe("vigente");
  });

  it("empezar hoy ya es estar vigente hoy", () => {
    const e = encargo({ fechaInicio: fecha("2026-08-17") });

    expect(estadoDelContrato([e], false, HOY)).toBe("vigente");
  });

  it("terminar hoy todavía es estar vigente hoy", () => {
    const e = encargo({ fechaInicio: fecha("2026-08-01"), fechaFin: fecha("2026-08-17") });

    expect(estadoDelContrato([e], false, HOY)).toBe("vigente");
  });
});

describe("los estados anulados y cerrados", () => {
  it("un encargo anulado no cuenta, aunque sus fechas abarquen hoy", () => {
    const e = encargo({
      estado: "ANULADO",
      fechaInicio: fecha("2026-08-01"),
      fechaFin: fecha("2026-09-30"),
    });

    expect(estadoDelContrato([e], false, HOY)).toBe("ninguno");
  });

  // Cerrar un encargo es decir que se acabó. Que las fechas sigan abiertas no
  // lo resucita: por eso el estado se mira ANTES que las fechas.
  it("un encargo cerrado tampoco, aunque le queden días", () => {
    const e = encargo({
      estado: "CERRADO",
      fechaInicio: fecha("2026-08-01"),
      fechaFin: fecha("2026-12-31"),
    });

    expect(estadoDelContrato([e], false, HOY)).toBe("ninguno");
  });
});

describe("las compras nunca se disfrazan de contrato", () => {
  it("comprarle sin contratarle sale como «solo compras»", () => {
    expect(estadoDelContrato([], true, HOY)).toBe("soloCompras");
  });

  it("con un frente vigente manda el contrato, no la compra", () => {
    const e = encargo({ fechaInicio: fecha("2026-08-01") });

    expect(estadoDelContrato([e], true, HOY)).toBe("vigente");
  });

  it("un encargo terminado con compras cae a «solo compras», no a nada", () => {
    const e = encargo({ fechaInicio: fecha("2026-01-01"), fechaFin: fecha("2026-02-01") });

    expect(estadoDelContrato([e], true, HOY)).toBe("soloCompras");
  });
});

describe("cuando hay varios frentes", () => {
  // Quien tiene uno en marcha y otro firmado para el mes que viene ESTÁ
  // trabajando: decir «por empezar» sería enseñar la cita más lejana.
  it("el que está en marcha gana al que va a empezar", () => {
    const enMarcha = encargo({ fechaInicio: fecha("2026-08-01") });
    const futuro = encargo({ fechaInicio: fecha("2026-10-01") });

    expect(estadoDelContrato([futuro, enMarcha], false, HOY)).toBe("vigente");
  });

  it("con uno terminado y otro por empezar, manda el que viene", () => {
    const viejo = encargo({ fechaInicio: fecha("2026-01-01"), fechaFin: fecha("2026-02-01") });
    const futuro = encargo({ fechaInicio: fecha("2026-10-01") });

    expect(estadoDelContrato([viejo, futuro], false, HOY)).toBe("proximo");
  });
});
