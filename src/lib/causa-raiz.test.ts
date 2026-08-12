import { describe, it, expect } from "vitest";
import {
  causasQuePidenAnalisis,
  VENTANA_SEMANAS,
  type IncumplimientoConCausa,
} from "./causa-raiz";
import type { CausaNoCumplimiento } from "@/generated/prisma/enums";

/** `n` incumplimientos de una causa en una semana. */
function fallos(
  numeroSemana: number,
  causa: CausaNoCumplimiento,
  n = 1,
): IncumplimientoConCausa[] {
  return Array.from({ length: n }, () => ({ numeroSemana, causa }));
}

const claves = (i: IncumplimientoConCausa[]) =>
  causasQuePidenAnalisis(i).map((c) => c.causa);

describe("causasQuePidenAnalisis", () => {
  it("una causa repetida en varias semanas pide analisis", () => {
    const i = [
      ...fallos(1, "MATERIALES", 2),
      ...fallos(2, "MATERIALES", 2),
    ];
    const salida = causasQuePidenAnalisis(i);
    expect(salida).toHaveLength(1);
    expect(salida[0]).toEqual({ causa: "MATERIALES", veces: 4, semanas: 2 });
  });

  it("tres fallos en UNA sola semana no piden nada: es un mal dia", () => {
    // Pudo ser el mismo camion que no llego. Un patron necesita repetirse.
    expect(claves(fallos(1, "MATERIALES", 3))).toEqual([]);
  });

  it("dos fallos repartidos en dos semanas tampoco: son dos fallos", () => {
    expect(
      claves([...fallos(1, "EQUIPOS"), ...fallos(2, "EQUIPOS")]),
    ).toEqual([]);
  });

  it("a partir de tres, repartidos, si", () => {
    expect(
      claves([...fallos(1, "EQUIPOS", 2), ...fallos(2, "EQUIPOS")]),
    ).toEqual(["EQUIPOS"]);
  });

  it("OTRA no se analiza nunca, por mucho que se repita", () => {
    // No es una causa: es la ausencia de una. Buscarle UNA raiz comun no
    // significa nada. Si domina, lo que falla es el catalogo.
    const i = [
      ...fallos(1, "OTRA", 5),
      ...fallos(2, "OTRA", 5),
      ...fallos(3, "OTRA", 5),
    ];
    expect(claves(i)).toEqual([]);
  });

  it("solo mira las ultimas semanas: lo viejo pudo dejar de existir solo", () => {
    const viejo = [
      ...fallos(1, "CLIMA", 3),
      ...fallos(2, "CLIMA", 3),
    ];
    const reciente = Array.from({ length: VENTANA_SEMANAS }, (_, k) =>
      fallos(10 + k, "MATERIALES", 1),
    ).flat();
    // Las cuatro recientes desplazan a las dos viejas fuera de la ventana.
    expect(claves([...viejo, ...reciente])).toEqual(["MATERIALES"]);
  });

  it("ordena por lo que mas se repite", () => {
    const i = [
      ...fallos(1, "INFORMACION", 1),
      ...fallos(2, "INFORMACION", 2),
      ...fallos(1, "MATERIALES", 3),
      ...fallos(2, "MATERIALES", 3),
    ];
    expect(claves(i)).toEqual(["MATERIALES", "INFORMACION"]);
  });

  it("a igualdad de veces, primero la que toca mas semanas", () => {
    // Cuatro fallos en tres semanas esta mas asentada que cuatro en dos.
    const i = [
      ...fallos(1, "MANO_OBRA", 2),
      ...fallos(2, "MANO_OBRA", 2),
      ...fallos(1, "CLIENTE_TERCEROS", 2),
      ...fallos(2, "CLIENTE_TERCEROS", 1),
      ...fallos(3, "CLIENTE_TERCEROS", 1),
    ];
    expect(claves(i)).toEqual(["CLIENTE_TERCEROS", "MANO_OBRA"]);
  });

  it("sin incumplimientos, no pide nada", () => {
    expect(causasQuePidenAnalisis([])).toEqual([]);
  });
});
