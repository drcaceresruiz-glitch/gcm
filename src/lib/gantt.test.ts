import { describe, it, expect } from "vitest";
import {
  rangoGantt,
  geometriaBarra,
  marcasCalendario,
  filasVisibles,
  resumenesPlegables,
  type TareaGantt,
} from "./gantt";

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function tarea(p: Partial<TareaGantt> & { uid: number; fila: number }): TareaGantt {
  return {
    codigo: null,
    nombre: `T${p.uid}`,
    nivel: 1,
    esResumen: false,
    esHito: false,
    esCritico: false,
    inicio: d("2026-08-01"),
    fin: d("2026-08-05"),
    duracionDias: "4.00",
    porcentajePlaneado: "0.00",
    porcentajeReal: "0.00",
    ...p,
  };
}

describe("rangoGantt", () => {
  it("va de la que antes empieza a la que mas tarde acaba", () => {
    const r = rangoGantt([
      tarea({ uid: 1, fila: 1, inicio: d("2026-08-01"), fin: d("2026-08-10") }),
      tarea({ uid: 2, fila: 2, inicio: d("2026-08-05"), fin: d("2026-08-20") }),
    ]);
    expect(r?.inicio).toEqual(d("2026-08-01"));
    expect(r?.fin).toEqual(d("2026-08-20"));
    expect(r?.totalDias).toBe(19);
  });

  it("ignora los resumenes cuando hay tareas con duracion", () => {
    // El resumen abarca 01..30 pero sus hijas solo 05..10: manda la hija.
    const r = rangoGantt([
      tarea({ uid: 1, fila: 1, esResumen: true, inicio: d("2026-08-01"), fin: d("2026-08-30") }),
      tarea({ uid: 2, fila: 2, inicio: d("2026-08-05"), fin: d("2026-08-10") }),
    ]);
    expect(r?.inicio).toEqual(d("2026-08-05"));
    expect(r?.fin).toEqual(d("2026-08-10"));
  });

  it("null sin tareas", () => {
    expect(rangoGantt([])).toBeNull();
  });
});

describe("geometriaBarra", () => {
  it("coloca la barra por su inicio y la mide por su duracion", () => {
    const rango = rangoGantt([
      tarea({ uid: 1, fila: 1, inicio: d("2026-08-01"), fin: d("2026-08-20") }),
    ])!;
    const b = geometriaBarra(
      tarea({ uid: 2, fila: 2, inicio: d("2026-08-06"), fin: d("2026-08-11"), porcentajeReal: "40.00" }),
      rango,
    );
    expect(b.x).toBe(5); // 5 dias desde el 01
    expect(b.ancho).toBe(5); // 06..11
    expect(b.relleno).toBeCloseTo(2); // 40% de 5
  });

  it("una tarea de un dia mide al menos 1", () => {
    const rango = rangoGantt([tarea({ uid: 1, fila: 1 })])!;
    const b = geometriaBarra(
      tarea({ uid: 2, fila: 2, inicio: d("2026-08-03"), fin: d("2026-08-03") }),
      rango,
    );
    expect(b.ancho).toBe(1);
  });
});

describe("filasVisibles", () => {
  // Capitulo(1) > partida(2) > subpartida(3), y otro capitulo(4).
  const arbol = [
    tarea({ uid: 1, fila: 1, nivel: 1, esResumen: true }),
    tarea({ uid: 2, fila: 2, nivel: 2, esResumen: true }),
    tarea({ uid: 3, fila: 3, nivel: 3 }),
    tarea({ uid: 4, fila: 4, nivel: 1, esResumen: true }),
    tarea({ uid: 5, fila: 5, nivel: 2 }),
  ];

  it("sin colapsar se ven todas", () => {
    expect(filasVisibles(arbol, new Set()).map((t) => t.uid)).toEqual([1, 2, 3, 4, 5]);
  });

  it("colapsar un capitulo esconde TODA su rama, a cualquier profundidad", () => {
    // Colapsar el 1 esconde 2 y 3 (su nieta), pero no el 4 ni el 5.
    expect(filasVisibles(arbol, new Set([1])).map((t) => t.uid)).toEqual([1, 4, 5]);
  });

  it("colapsar una subrama esconde solo lo suyo", () => {
    expect(filasVisibles(arbol, new Set([2])).map((t) => t.uid)).toEqual([1, 2, 4, 5]);
  });
});

describe("resumenesPlegables", () => {
  it("solo los resumenes que tienen algo debajo", () => {
    const p = resumenesPlegables([
      tarea({ uid: 1, fila: 1, nivel: 1, esResumen: true }),
      tarea({ uid: 2, fila: 2, nivel: 2 }),
      tarea({ uid: 3, fila: 3, nivel: 1, esResumen: true }), // resumen sin hijas
      tarea({ uid: 4, fila: 4, nivel: 1 }),
    ]);
    expect(p.has(1)).toBe(true);
    expect(p.has(3)).toBe(false);
  });
});

describe("marcasCalendario", () => {
  it("marca por semanas en un plazo corto", () => {
    const rango = rangoGantt([
      tarea({ uid: 1, fila: 1, inicio: d("2026-08-01"), fin: d("2026-08-31") }),
    ])!;
    const m = marcasCalendario(rango);
    // Un mes: varias marcas semanales, ninguna mensual.
    expect(m.length).toBeGreaterThan(2);
    expect(m.every((x) => x.x >= 0)).toBe(true);
  });

  it("marca por meses en un plazo largo", () => {
    const rango = rangoGantt([
      tarea({ uid: 1, fila: 1, inicio: d("2026-01-01"), fin: d("2026-12-31") }),
    ])!;
    const m = marcasCalendario(rango);
    // Un ano: alrededor de 12 marcas mensuales, no ~52 semanales.
    expect(m.length).toBeLessThanOrEqual(13);
    expect(m.every((x) => x.inicioDeMes)).toBe(true);
  });
});
