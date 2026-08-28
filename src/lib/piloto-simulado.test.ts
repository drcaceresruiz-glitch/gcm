import { describe, expect, it } from "vitest";

import {
  corteDeSemana,
  pilotoSimulado,
  SEMANAS_POST,
  SEMANAS_PRE,
} from "./piloto-simulado";

/**
 * La obra de ensayo tiene que traer los casos incomodos.
 *
 * Un piloto con datos perfectos no verifica nada: lo que hay que comprobar
 * antes de la obra real es que el analisis aguanta lo que FALTA. Estas pruebas
 * fijan justamente eso, para que nadie «limpie» la muestra mas adelante
 * creyendo que son descuidos.
 */
describe("la obra de ensayo del estudio", () => {
  const p = pilotoSimulado();

  it("trae veinte semanas, diez por fase", () => {
    expect(p.semanas).toHaveLength(SEMANAS_PRE + SEMANAS_POST);
    expect(p.semanas.filter((s) => s.reconstruida)).toHaveLength(SEMANAS_PRE);
  });

  it("el PPC sube del PRE al POST, que es el efecto que se quiere detectar", () => {
    const ppc = (desde: number, hasta: number) => {
      const t = p.semanas.slice(desde, hasta);
      const c = t.reduce((s, x) => s + x.compromisos, 0);
      const k = t.reduce((s, x) => s + x.cumplidos, 0);
      return (k / c) * 100;
    };

    expect(ppc(0, SEMANAS_PRE)).toBeCloseTo(57.7, 0);
    expect(ppc(SEMANAS_PRE, 20)).toBeCloseTo(80.6, 0);
  });

  it("hay una semana MALA dentro del periodo bueno", () => {
    // Sin ella, la serie seria un escalon perfecto y no permitiria comprobar
    // que el analisis distingue una tendencia del ruido.
    const post = p.semanas.slice(SEMANAS_PRE);
    const tasas = post.map((s) => (s.cumplidos / s.compromisos) * 100);

    expect(Math.min(...tasas)).toBeLessThan(70);
  });

  it("una semana se queda SIN ninguna restriccion", () => {
    const conRestricciones = new Set(p.restricciones.map((r) => r.semana));
    const vacias = p.semanas.filter((s) => !conRestricciones.has(s.indice));

    // Ahi la media y la desviacion tienen que salir vacias, no cero.
    expect(vacias.length).toBeGreaterThanOrEqual(1);
  });

  it("otra se queda con UNA SOLA: media si, desviacion no", () => {
    const cuenta = new Map<number, number>();
    for (const r of p.restricciones) {
      cuenta.set(r.semana, (cuenta.get(r.semana) ?? 0) + 1);
    }

    expect([...cuenta.values()].filter((n) => n === 1).length).toBeGreaterThanOrEqual(1);
  });

  it("hay restricciones sin resolver y tareas sin terminar", () => {
    expect(p.restricciones.some((r) => r.retraso === null)).toBe(true);
    expect(p.tareas.filter((t) => t.desviacion === null)).toHaveLength(3);
  });

  it("los retrasos del PRE son mayores y mas dispersos que los del POST", () => {
    const de = (desde: number, hasta: number) =>
      p.restricciones
        .filter((r) => r.semana >= desde && r.semana < hasta && r.retraso !== null)
        .map((r) => r.retraso!);

    const media = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    const pre = de(0, SEMANAS_PRE);
    const post = de(SEMANAS_PRE, 20);

    expect(media(pre)).toBeGreaterThan(media(post) * 2);
    expect(Math.max(...pre)).toBeGreaterThan(Math.max(...post));
  });

  it("los retrasos tienen ASIMETRIA POSITIVA, como en obra", () => {
    // Muchos valores bajos y una cola larga: es lo que obliga a la prueba de
    // normalidad y a la transformacion antes de calcular capacidad. Con datos
    // normales, ese paso del metodo no se descubriria hasta la obra real.
    const v = p.restricciones
      .filter((r) => r.retraso !== null)
      .map((r) => r.retraso!)
      .sort((a, b) => a - b);

    const mediana = v[Math.floor(v.length / 2)]!;
    const media = v.reduce((s, x) => s + x, 0) / v.length;

    expect(media).toBeGreaterThan(mediana);
  });

  it("los tres desenlaces posibles de un analisis de causa raiz", () => {
    expect(p.analisis).toHaveLength(3);
    // Uno sin cerrar: su tasa de recurrencia no se puede calcular todavia.
    expect(p.analisis.filter((a) => a.semanaCierre === null)).toHaveLength(1);
  });

  it("en el PRE fallan mas causas distintas que en el POST", () => {
    // El HHI tiene que subir: al resolverse lo evitable, lo que queda se
    // concentra en lo externo.
    expect(p.causasPre.length).toBeGreaterThan(new Set(p.causasPost).size);
  });

  it("es determinista: dos llamadas dan lo mismo", () => {
    // Sin esto, un resultado del ensayo no se podria reproducir ni discutir.
    expect(JSON.stringify(pilotoSimulado())).toBe(JSON.stringify(pilotoSimulado()));
  });
});

describe("los cortes semanales", () => {
  it("caen cada siete dias desde el inicio", () => {
    const inicio = new Date("2026-01-09T00:00:00.000Z");

    expect(corteDeSemana(inicio, 0).toISOString().slice(0, 10)).toBe("2026-01-09");
    expect(corteDeSemana(inicio, 3).toISOString().slice(0, 10)).toBe("2026-01-30");
    expect(corteDeSemana(inicio, 19).toISOString().slice(0, 10)).toBe("2026-05-22");
  });
});
