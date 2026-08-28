import { describe, expect, it } from "vitest";

import { hhi, lro, tcac, trc } from "./aprendizaje";

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("TRC — tasa de recurrencia de causa", () => {
  it("la causa desaparece tras la accion: 0 %", () => {
    // 6 fallos en 3 semanas antes; ninguno en 5 semanas despues.
    expect(trc(6, 3, 0, 5)).toBe(0);
  });

  it("se repite igual de a menudo: 100 %", () => {
    expect(trc(6, 3, 10, 5)).toBe(100);
  });

  it("se reduce a la mitad: 50 %", () => {
    expect(trc(6, 3, 5, 5)).toBe(50);
  });

  it("COMPARA RITMOS, no totales: ventanas distintas no falsean el resultado", () => {
    // 6 fallos en 3 semanas (2/semana) y 8 en 4 semanas (2/semana). En total
    // hubo MAS fallos despues, y aun asi el ritmo es identico: 100 %.
    expect(trc(6, 3, 8, 4)).toBe(100);
  });

  it("sin semanas a un lado no hay comparacion posible", () => {
    expect(trc(6, 0, 2, 5)).toBeNull();
    expect(trc(6, 3, 2, 0)).toBeNull();
  });

  it("sin fallos antes no hay recurrencia que medir", () => {
    // Un cero aqui seria un exito inventado: no se mejoro nada, es que no
    // habia patron dentro de la ventana.
    expect(trc(0, 3, 2, 5)).toBeNull();
  });
});

describe("LRO — latencia de reaccion organizacional", () => {
  it("semanas entre el primer fallo del patron y la apertura del analisis", () => {
    expect(lro(2, 7)).toBe(5);
  });

  it("cero cuando se reacciona en la misma semana", () => {
    expect(lro(4, 4)).toBe(0);
  });

  it("vacio si falta cualquiera de las dos semanas", () => {
    expect(lro(null, 7)).toBeNull();
    expect(lro(2, null)).toBeNull();
  });
});

describe("TCAC — tasa de cierre de acciones correctivas", () => {
  const acciones = [
    { fechaCompromiso: dia("2026-06-10"), cerradoAt: dia("2026-06-08") },
    { fechaCompromiso: dia("2026-06-12"), cerradoAt: dia("2026-06-20") },
    { fechaCompromiso: dia("2026-06-15"), cerradoAt: null },
    // Sin fecha comprometida: no entra en el denominador.
    { fechaCompromiso: null, cerradoAt: dia("2026-06-30") },
  ];

  it("cerradas sobre comprometidas", () => {
    const r = tcac(acciones);

    expect(r.comprometidas).toBe(3);
    expect(r.cerradas).toBe(2);
    expect(r.general).toBeCloseTo(66.667, 2);
  });

  it("la version exigente cuenta solo las cerradas a tiempo", () => {
    const r = tcac(acciones);

    // Solo una se cerro dentro de su fecha: 1 de 3.
    expect(r.cerradasATiempo).toBe(1);
    expect(r.oportuno).toBeCloseTo(33.333, 2);
  });

  it("una accion sin fecha comprometida no castiga al equipo", () => {
    // Nadie fijo cuando tenia que estar, asi que no se puede juzgar su
    // cumplimiento: fuera del denominador.
    const r = tcac([{ fechaCompromiso: null, cerradoAt: null }]);

    expect(r.comprometidas).toBe(0);
    expect(r.general).toBeNull();
  });
});

describe("HHI — concentracion de causas", () => {
  it("todos los fallos por una sola causa: 1,0", () => {
    expect(hhi([8, 0, 0, 0])).toBe(1);
  });

  it("repartidos por igual entre cuatro causas: 0,25", () => {
    expect(hhi([3, 3, 3, 3])).toBeCloseTo(0.25, 10);
  });

  it("repartidos entre las nueve categorias: 1/9", () => {
    expect(hhi(Array.from({ length: 9 }, () => 2))).toBeCloseTo(1 / 9, 10);
  });

  it("un caso intermedio, calculado a mano", () => {
    // 6 y 2 sobre 8: (0,75)^2 + (0,25)^2 = 0,5625 + 0,0625 = 0,625.
    expect(hhi([6, 2])).toBeCloseTo(0.625, 10);
  });

  it("una semana sin fallos no tiene concentracion que medir", () => {
    // Cero la pondria en el mismo sitio que la peor semana posible.
    expect(hhi([0, 0, 0])).toBeNull();
    expect(hhi([])).toBeNull();
  });
});
