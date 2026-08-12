import { describe, it, expect } from "vitest";
import {
  demoraPorFlujo,
  ventanaRecomendada,
  type RestriccionLiberada,
} from "./liberacion";
import type { TipoRestriccion } from "@/generated/prisma/enums";

const d = (iso: string) => new Date(iso + "T00:00:00.000Z");

function r(
  tipo: TipoRestriccion,
  desde: string,
  hasta: string,
): RestriccionLiberada {
  return { tipo, createdAt: d(desde), resueltaAt: d(hasta) };
}

describe("demoraPorFlujo", () => {
  it("sin nada resuelto no dice nada", () => {
    expect(demoraPorFlujo([])).toEqual([]);
  });

  it("promedia los dias de cada flujo", () => {
    const salida = demoraPorFlujo([
      r("MATERIALES", "2026-08-01", "2026-08-11"),
      r("MATERIALES", "2026-08-01", "2026-08-09"),
    ]);
    expect(salida).toHaveLength(1);
    expect(salida[0]?.dias).toBe(9);
    expect(salida[0]?.casos).toBe(2);
  });

  it("un flujo sin casos NO sale con cero: no hay con que responder", () => {
    // Un cero se leeria como "se libera al instante", que es lo contrario de
    // la verdad.
    const tipos = demoraPorFlujo([r("ESPACIO", "2026-08-01", "2026-08-03")]).map(
      (x) => x.tipo,
    );
    expect(tipos).toEqual(["ESPACIO"]);
    expect(tipos).not.toContain("MATERIALES");
  });

  it("ordena de mayor a menor: arriba lo que mas frena", () => {
    const salida = demoraPorFlujo([
      r("ESPACIO", "2026-08-01", "2026-08-03"),
      r("MATERIALES", "2026-08-01", "2026-08-11"),
      r("INFORMACION", "2026-08-01", "2026-08-07"),
    ]);
    expect(salida.map((x) => x.tipo)).toEqual([
      "MATERIALES",
      "INFORMACION",
      "ESPACIO",
    ]);
  });

  it("la mediana delata al caso raro que arrastra la media", () => {
    // Tres inmediatas y una de cien dias: la media dice 25, la mediana dice 0.
    const salida = demoraPorFlujo([
      r("EQUIPOS", "2026-08-01", "2026-08-01"),
      r("EQUIPOS", "2026-08-01", "2026-08-01"),
      r("EQUIPOS", "2026-08-01", "2026-08-01"),
      r("EQUIPOS", "2026-08-01", "2026-11-09"),
    ]);
    expect(salida[0]?.dias).toBe(25);
    expect(salida[0]?.mediana).toBe(0);
  });

  it("una resuelta antes de crearse cuenta como cero, no como negativo", () => {
    const salida = demoraPorFlujo([r("SEGURIDAD", "2026-08-10", "2026-08-01")]);
    expect(salida[0]?.dias).toBe(0);
  });
});

describe("ventanaRecomendada", () => {
  const muchas = (tipo: TipoRestriccion, dias: number) =>
    Array.from({ length: 4 }, () =>
      r(tipo, "2026-08-01", d(new Date(d("2026-08-01").getTime() + dias * 86400000).toISOString().slice(0, 10)).toISOString().slice(0, 10)),
    );

  it("cubre el flujo mas lento, redondeando hacia arriba", () => {
    // 9,4 dias de materiales no caben en una semana: pide dos.
    expect(ventanaRecomendada(demoraPorFlujo(muchas("MATERIALES", 9)))).toBe(2);
  });

  it("con pocos casos no recomienda nada", () => {
    // Cambiar una costumbre por otra disfrazada de medicion seria peor.
    expect(
      ventanaRecomendada(demoraPorFlujo([r("MATERIALES", "2026-08-01", "2026-08-20")])),
    ).toBeNull();
  });

  it("sin datos, null", () => {
    expect(ventanaRecomendada([])).toBeNull();
  });

  it("no pasa del maximo que admite el Lookahead", () => {
    expect(ventanaRecomendada(demoraPorFlujo(muchas("MATERIALES", 200)))).toBe(12);
  });
});
