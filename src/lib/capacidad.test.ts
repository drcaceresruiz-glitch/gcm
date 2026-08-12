import { describe, it, expect } from "vitest";
import {
  ambicionDelPlan,
  SEMANAS_MINIMAS,
  VENTANA_SEMANAS,
  type SemanaCerrada,
} from "./capacidad";

/** N semanas donde se cumplieron `cumplidos` de `comprometidos`. */
function semanas(
  n: number,
  cumplidos: number,
  comprometidos = cumplidos,
): SemanaCerrada[] {
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    comprometidos,
    cumplidos,
  }));
}

describe("ambicionDelPlan", () => {
  it("con historial suficiente compara contra lo que la obra suele cumplir", () => {
    // Cumple 4 por semana; promete 4. Cabe.
    const a = ambicionDelPlan(semanas(4, 4), 4);
    expect(a?.rendimiento).toBe(4);
    expect(a?.indice).toBe(1);
    expect(a?.nivel).toBe("cabe");
  });

  it("prometer algo mas es ambicioso, no sobrecarga", () => {
    // 5 sobre una media de 4: un 25% mas. Se avisa sin dramatizar.
    expect(ambicionDelPlan(semanas(4, 4), 5)?.nivel).toBe("ambicioso");
  });

  it("prometer el doble de lo que se cumple es sobrecarga", () => {
    const a = ambicionDelPlan(semanas(4, 4), 8);
    expect(a?.indice).toBe(2);
    expect(a?.nivel).toBe("sobrecarga");
  });

  it("el numero de semanas viaja con la media, para saber de cuanto fiarse", () => {
    expect(ambicionDelPlan(semanas(3, 4), 4)?.semanas).toBe(3);
    expect(ambicionDelPlan(semanas(10, 4), 4)?.semanas).toBe(VENTANA_SEMANAS);
  });

  it("solo promedia las mas recientes", () => {
    // Seis semanas flojas y antes muchas buenas: manda lo reciente, porque
    // mas atras el equipo y el frente ya eran otros.
    const viejas = semanas(6, 10).map((s, i) => ({ ...s, numero: i + 1 }));
    const recientes = semanas(6, 2).map((s, i) => ({ ...s, numero: i + 7 }));
    const a = ambicionDelPlan([...viejas, ...recientes], 4);
    expect(a?.rendimiento).toBe(2);
    expect(a?.nivel).toBe("sobrecarga");
  });

  it("no depende del orden en que lleguen las semanas", () => {
    const orden = semanas(6, 3).map((s, i) => ({ ...s, numero: i + 1 }));
    const alReves = [...orden].reverse();
    expect(ambicionDelPlan(orden, 3)).toEqual(ambicionDelPlan(alReves, 3));
  });

  describe("cuando NO hay con que responder, calla", () => {
    it("con menos semanas que el minimo", () => {
      expect(ambicionDelPlan(semanas(SEMANAS_MINIMAS - 1, 4), 4)).toBeNull();
    });

    it("sin nada comprometido todavia", () => {
      expect(ambicionDelPlan(semanas(6, 4), 0)).toBeNull();
    });

    it("si la obra no ha cumplido ni un compromiso en la ventana", () => {
      // Dividir por cero daria «infinitamente ambicioso», que suena a
      // hallazgo y es solo una division imposible. De eso ya avisa el PPC.
      expect(ambicionDelPlan(semanas(6, 0, 5), 4)).toBeNull();
    });

    it("sin historial ninguno", () => {
      expect(ambicionDelPlan([], 4)).toBeNull();
    });
  });

  it("la media se redondea a un decimal, no se muestra cruda", () => {
    // 4+3+3 = 10 en tres semanas: 3,333...
    const irregular: SemanaCerrada[] = [
      { numero: 1, comprometidos: 5, cumplidos: 4 },
      { numero: 2, comprometidos: 5, cumplidos: 3 },
      { numero: 3, comprometidos: 5, cumplidos: 3 },
    ];
    expect(ambicionDelPlan(irregular, 4)?.rendimiento).toBe(3.3);
  });
});
