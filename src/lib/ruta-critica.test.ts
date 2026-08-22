import { describe, it, expect } from "vitest";
import { calcularRutaCritica, type NodoRed, type EnlaceRed } from "./ruta-critica";
import type { DiaLaboral } from "./calendario";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/// Los siete dias laborables: simplifica verificar las fechas a mano, sin
/// mezclar el salto de fin de semana (eso ya lo prueba calendario.test.ts).
const CORRIDO: DiaLaboral[] = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  diaSemana: n,
  laborable: true,
  horas: "8",
}));

function nodo(uid: number, duracionDias: string, extra: Partial<NodoRed> = {}): NodoRed {
  return { uid, duracionDias, esResumen: false, esHito: false, ...extra };
}

function fc(tareaUid: number, predecesoraUid: number, desfaseDias = "0"): EnlaceRed {
  return { tareaUid, predecesoraUid, tipo: "FC", desfaseDias };
}

describe("calcularRutaCritica", () => {
  it("una cadena lineal sin holgura: todas las tareas salen criticas", () => {
    const nodos = [nodo(1, "3.00"), nodo(2, "2.00"), nodo(3, "4.00")];
    const enlaces = [fc(2, 1), fc(3, 2)];

    const r = calcularRutaCritica(nodos, enlaces, utc("2026-08-01"), CORRIDO);

    expect(r.ciclo).toBe(false);
    expect(r.esCritico.get(1)).toBe(true);
    expect(r.esCritico.get(2)).toBe(true);
    expect(r.esCritico.get(3)).toBe(true);
    expect(r.holguraDias.get(1)).toBe("0.00");
    expect(r.holguraDias.get(2)).toBe("0.00");
    expect(r.holguraDias.get(3)).toBe("0.00");
  });

  it("una rama mas corta en paralelo sale con holgura, no critica", () => {
    // A(1) -> B(5) -> D(1): camino largo, 7 dias.
    // A(1) -> C(1) -> D(1): camino corto, 3 dias -> le sobran 4.
    const nodos = [nodo(1, "1.00"), nodo(2, "5.00"), nodo(3, "1.00"), nodo(4, "1.00")];
    const enlaces = [fc(2, 1), fc(3, 1), fc(4, 2), fc(4, 3)];

    const r = calcularRutaCritica(nodos, enlaces, utc("2026-08-01"), CORRIDO);

    expect(r.ciclo).toBe(false);
    // A, B (el camino largo) y D salen criticos.
    expect(r.esCritico.get(1)).toBe(true);
    expect(r.esCritico.get(2)).toBe(true);
    expect(r.esCritico.get(4)).toBe(true);
    // C (el camino corto) no.
    expect(r.esCritico.get(3)).toBe(false);
    expect(r.holguraDias.get(3)).toBe("4.00");
  });

  it("un ciclo no se puede resolver: devuelve ciclo:true sin numeros", () => {
    const nodos = [nodo(1, "2.00"), nodo(2, "2.00")];
    const enlaces = [fc(1, 2), fc(2, 1)];

    const r = calcularRutaCritica(nodos, enlaces, utc("2026-08-01"), CORRIDO);

    expect(r.ciclo).toBe(true);
    expect(r.esCritico.size).toBe(0);
    expect(r.holguraDias.size).toBe(0);
  });

  it("los resumenes no entran a la red", () => {
    const nodos = [
      nodo(1, "3.00", { esResumen: true }),
      nodo(2, "3.00"),
    ];
    const enlaces: EnlaceRed[] = [];

    const r = calcularRutaCritica(nodos, enlaces, utc("2026-08-01"), CORRIDO);

    expect(r.esCritico.has(1)).toBe(false);
    expect(r.esCritico.get(2)).toBe(true);
  });

  it("sin tareas de trabajo, no hay nada que calcular", () => {
    const nodos = [nodo(1, "3.00", { esResumen: true })];
    const r = calcularRutaCritica(nodos, [], utc("2026-08-01"), CORRIDO);
    expect(r.ciclo).toBe(false);
    expect(r.esCritico.size).toBe(0);
  });
});
