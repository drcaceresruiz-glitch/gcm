import { describe, it, expect } from "vitest";
import {
  rangoGantt,
  geometriaBarra,
  marcasCalendario,
  filasVisibles,
  resumenesPlegables,
  flechasDeDependencia,
  barraLineaBase,
  type DependenciaGantt,
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

/**
 * Dos tareas encadenadas: la 1 del 1 al 5 de agosto, la 2 del 6 al 10.
 * Es el caso comun (FC hacia adelante) y la base de casi todo lo de abajo.
 */
const A = tarea({ uid: 1, fila: 1, inicio: d("2026-08-01"), fin: d("2026-08-05") });
const B = tarea({ uid: 2, fila: 2, inicio: d("2026-08-06"), fin: d("2026-08-10") });
const RANGO = rangoGantt([A, B])!;

function enlace(p: Partial<DependenciaGantt> = {}): DependenciaGantt {
  return { tareaUid: 2, predecesoraUid: 1, tipo: "FC", desfaseDias: "0", ...p };
}

/** Cada tramo cambia SOLO en x o SOLO en y. Es lo que hace ortogonal a una ruta. */
function esOrtogonal(puntos: { x: number; y: number }[]): boolean {
  return puntos.every((p, i) => {
    if (i === 0) return true;
    const q = puntos[i - 1]!;
    return (p.x === q.x) !== (p.y === q.y);
  });
}

describe("flechasDeDependencia", () => {
  it("un FC sale del FIN de la predecesora y entra en el INICIO de la tarea", () => {
    const [f] = flechasDeDependencia([enlace()], [A, B], RANGO);

    // A acaba el dia 4 del eje (1 ago = 0); B empieza el dia 5.
    expect(f!.puntos[0]).toEqual({ x: 4, y: 0.5 });
    expect(f!.puntos.at(-1)).toEqual({ x: 5, y: 1.5 });
  });

  it("un CC ata los dos INICIOS, y un FF los dos FINES", () => {
    const [cc] = flechasDeDependencia([enlace({ tipo: "CC" })], [A, B], RANGO);
    expect(cc!.puntos[0]!.x).toBe(0); // inicio de A
    expect(cc!.puntos.at(-1)!.x).toBe(5); // inicio de B

    const [ff] = flechasDeDependencia([enlace({ tipo: "FF" })], [A, B], RANGO);
    expect(ff!.puntos[0]!.x).toBe(4); // fin de A
    expect(ff!.puntos.at(-1)!.x).toBe(9); // fin de B
  });

  it("un CF entra por el FIN de la tarea, que es lo que lo distingue", () => {
    const [cf] = flechasDeDependencia([enlace({ tipo: "CF" })], [A, B], RANGO);
    expect(cf!.puntos[0]!.x).toBe(0); // inicio de A
    expect(cf!.puntos.at(-1)!.x).toBe(9); // fin de B
  });

  it("el desfase corre el punto de salida, no el de llegada", () => {
    const [f] = flechasDeDependencia([enlace({ desfaseDias: "3" })], [A, B], RANGO);
    expect(f!.puntos[0]).toEqual({ x: 7, y: 0.5 }); // 4 + 3
    expect(f!.puntos.at(-1)!.x).toBe(5); // la llegada no se mueve
  });

  it("descarta el tipo que no reconoce en vez de dibujarlo mal", () => {
    expect(flechasDeDependencia([enlace({ tipo: "XX" })], [A, B], RANGO)).toEqual([]);
  });
});

describe("la ruta es ortogonal y no atraviesa barras hacia atras", () => {
  it("cada tramo cambia solo en x o solo en y", () => {
    const [f] = flechasDeDependencia([enlace()], [A, B], RANGO);
    expect(esOrtogonal(f!.puntos)).toBe(true);
  });

  /**
   * El caso que obliga al rodeo: el destino queda DETRAS del origen. Ir en
   * linea recta significaria volver hacia atras por encima de la propia barra.
   */
  it("con el destino a la izquierda, rodea por el pasillo entre filas", () => {
    const tarde = tarea({
      uid: 1,
      fila: 1,
      inicio: d("2026-08-20"),
      fin: d("2026-08-25"),
    });
    const pronto = tarea({
      uid: 2,
      fila: 2,
      inicio: d("2026-08-01"),
      fin: d("2026-08-05"),
    });
    const rango = rangoGantt([tarde, pronto])!;
    const [f] = flechasDeDependencia([enlace()], [tarde, pronto], rango);

    expect(esOrtogonal(f!.puntos)).toBe(true);
    // Rodeo: mas puntos que el camino directo, y pasa por la altura de en
    // medio de las dos filas.
    expect(f!.puntos.length).toBeGreaterThan(4);
    expect(f!.puntos.some((p) => p.y === 1)).toBe(true);
  });

  it("entre dos tareas de la MISMA fila baja al pasillo en vez de cruzarla", () => {
    const uno = tarea({ uid: 1, fila: 1 });
    const dos = tarea({ uid: 2, fila: 1, inicio: d("2026-08-06"), fin: d("2026-08-10") });
    const rango = rangoGantt([uno, dos])!;
    const [f] = flechasDeDependencia([enlace()], [uno, dos], rango);

    expect(esOrtogonal(f!.puntos)).toBe(true);
    expect(f!.puntos.some((p) => p.y > 0.5)).toBe(true);
  });

  /**
   * El caso MAS COMUN de todos, y el que se escapo al escribirlo: dos tareas
   * pegadas (una acaba el 7, la siguiente empieza el 8). Los dos codos de 0,6
   * dias suman mas que el hueco de 1 dia y se cruzaban, asi que el trazo
   * salia con un zigzag de seis puntos donde tocaba un escalon de cuatro.
   */
  it("entre tareas pegadas dibuja un escalon limpio, no un zigzag", () => {
    const [f] = flechasDeDependencia([enlace()], [A, B], RANGO);

    expect(f!.puntos).toHaveLength(4);
    expect(esOrtogonal(f!.puntos)).toBe(true);
    // La vertical baja entre el fin de A (4) y el inicio de B (5).
    expect(f!.puntos[1]!.x).toBeGreaterThan(4);
    expect(f!.puntos[1]!.x).toBeLessThan(5);
  });

  it("con hueco de sobra, la vertical se pega al destino", () => {
    const lejos = tarea({
      uid: 2,
      fila: 2,
      inicio: d("2026-08-20"),
      fin: d("2026-08-25"),
    });
    const rango = rangoGantt([A, lejos])!;
    const [f] = flechasDeDependencia([enlace()], [A, lejos], rango);

    expect(f!.puntos).toHaveLength(4);
    // Codo justo antes del inicio del destino (dia 19 del eje), no en medio.
    expect(f!.puntos[1]!.x).toBeCloseTo(18.4);
  });

  it("no deja tramos de longitud cero", () => {
    const [f] = flechasDeDependencia([enlace()], [A, B], RANGO);
    const repetido = f!.puntos.some(
      (p, i) => i > 0 && p.x === f!.puntos[i - 1]!.x && p.y === f!.puntos[i - 1]!.y,
    );
    expect(repetido).toBe(false);
  });
});

describe("lo que esta plegado no se dibuja", () => {
  it("si un extremo no esta visible, el enlace desaparece", () => {
    // Solo A esta a la vista: B cuelga de un capitulo plegado.
    expect(flechasDeDependencia([enlace()], [A], RANGO)).toEqual([]);
    expect(flechasDeDependencia([enlace()], [B], RANGO)).toEqual([]);
  });

  it("y vuelve al desplegar", () => {
    expect(flechasDeDependencia([enlace()], [A, B], RANGO)).toHaveLength(1);
  });
});

describe("critica solo cuando lo son los DOS extremos", () => {
  const critA = { ...A, esCritico: true };
  const critB = { ...B, esCritico: true };

  it("las dos criticas", () => {
    expect(flechasDeDependencia([enlace()], [critA, critB], RANGO)[0]!.critica).toBe(true);
  });

  it("una sola no basta: la cadena se corta ahi", () => {
    expect(flechasDeDependencia([enlace()], [critA, B], RANGO)[0]!.critica).toBe(false);
    expect(flechasDeDependencia([enlace()], [A, critB], RANGO)[0]!.critica).toBe(false);
  });
});

describe("barraLineaBase", () => {
  it("dice donde estaba la tarea en el plan congelado", () => {
    const b = barraLineaBase(
      { uid: 1, inicio: d("2026-08-03"), fin: d("2026-08-06") },
      RANGO,
    );
    expect(b).toEqual({ x: 2, ancho: 3 });
  });

  /**
   * Una tarea que nacio DESPUES de fijar la base no tiene con que compararse.
   * Pintarle una barra gris diria que se movio desde el dia uno.
   */
  it("sin contraparte en la base no pinta nada, en vez de fingir un cero", () => {
    expect(barraLineaBase(undefined, RANGO)).toBeNull();
  });
});
