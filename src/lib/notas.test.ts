import { describe, expect, it } from "vitest";

import { esVencida } from "./notas";

describe("esVencida", () => {
  it("sin fecha de recordatorio nunca esta vencida", () => {
    expect(esVencida({ atendida: false, fechaRecordatorio: null }, new Date())).toBe(
      false,
    );
  });

  it("con fecha futura no esta vencida", () => {
    const ahora = new Date("2026-08-21T12:00:00Z");
    const futura = new Date("2026-08-22T00:00:00Z");
    expect(esVencida({ atendida: false, fechaRecordatorio: futura }, ahora)).toBe(
      false,
    );
  });

  it("con fecha pasada y pendiente, esta vencida", () => {
    const ahora = new Date("2026-08-21T12:00:00Z");
    const pasada = new Date("2026-08-20T00:00:00Z");
    expect(esVencida({ atendida: false, fechaRecordatorio: pasada }, ahora)).toBe(
      true,
    );
  });

  // ESTA es la que da sentido a que "vencida" se derive y nunca se guarde:
  // atender una nota la saca de vencidas al instante, sin tocar su fecha.
  it("atendida y con fecha pasada NO esta vencida", () => {
    const ahora = new Date("2026-08-21T12:00:00Z");
    const pasada = new Date("2026-08-20T00:00:00Z");
    expect(esVencida({ atendida: true, fechaRecordatorio: pasada }, ahora)).toBe(
      false,
    );
  });

  it("justo en el limite, el mismo instante no cuenta como vencida", () => {
    const instante = new Date("2026-08-21T12:00:00.000Z");
    expect(
      esVencida({ atendida: false, fechaRecordatorio: instante }, instante),
    ).toBe(false);
  });

  it("un milisegundo despues del limite ya esta vencida", () => {
    const fecha = new Date("2026-08-21T12:00:00.000Z");
    const unMilisegundoDespues = new Date("2026-08-21T12:00:00.001Z");
    expect(
      esVencida({ atendida: false, fechaRecordatorio: fecha }, unMilisegundoDespues),
    ).toBe(true);
  });
});
