import { describe, expect, it } from "vitest";
import { filtrarPartidas, normalizar } from "@/lib/partidas-filtro";

/**
 * Un trozo de la jerarquia real de CRIOCORD, con sus tres convenciones de
 * codigo conviviendo: `11.0` capitulo, `11.02.00` cabecera de grupo y
 * `11.02.01` su hija, ambas con tres segmentos y a la misma profundidad.
 */
const filas = [
  { id: "c11", nivel: 0, codigoPartida: "11.0", descripcion: "CARPINTERIA DE ALUMINIO Y MAMPARAS" },
  { id: "g01", nivel: 1, codigoPartida: "11.01.00", descripcion: "PUERTAS" },
  { id: "p011", nivel: 2, codigoPartida: "11.01.01", descripcion: "Puerta contraplacada" },
  { id: "g02", nivel: 1, codigoPartida: "11.02.00", descripcion: "TABIQUERIA VIDRIADA" },
  { id: "p021", nivel: 2, codigoPartida: "11.02.01", descripcion: "Mampara de vidrio templado" },
  { id: "p022", nivel: 2, codigoPartida: "11.02.04", descripcion: "Ventana proyectante" },
  { id: "c12", nivel: 0, codigoPartida: "12.0", descripcion: "PINTURA" },
  { id: "p121", nivel: 1, codigoPartida: "12.01.01", descripcion: "Pintura latex en muros" },
];

describe("normalizar", () => {
  it("quita tildes y mayusculas", () => {
    expect(normalizar("TABIQUERIA")).toBe("tabiqueria");
    expect(normalizar("  Pintura Latex  ")).toBe("pintura latex");
  });
});

describe("filtrarPartidas", () => {
  it("sin consulta no filtra", () => {
    expect(filtrarPartidas(filas, "")).toBeNull();
    expect(filtrarPartidas(filas, "   ")).toBeNull();
  });

  /**
   * Lo que importa de todo esto: una partida suelta no dice de que capitulo
   * cuelga. `11.02.04` tiene que salir con `11.02.00` y con `11.0`.
   */
  it("arrastra a los ancestros de cada coincidencia", () => {
    const r = filtrarPartidas(filas, "11.02.04")!;

    expect([...r.coincidencias]).toEqual(["p022"]);
    expect([...r.visibles].sort()).toEqual(["c11", "g02", "p022"]);
  });

  it("busca tambien en la descripcion, y sin tildes", () => {
    const r = filtrarPartidas(filas, "tabiqueria")!;

    expect(r.coincidencias.has("g02")).toBe(true);
    expect(r.visibles.has("c11")).toBe(true);
  });

  /**
   * Si un capitulo que coincide arrastrase a sus hijas, buscar «mampara»
   * volcaria las seis filas del capitulo 11 encima de la unica que se
   * buscaba: el capitulo se llama «...Y MAMPARAS».
   */
  it("un capitulo que coincide no arrastra a sus hijas", () => {
    const r = filtrarPartidas(filas, "mampara")!;

    expect([...r.coincidencias].sort()).toEqual(["c11", "p021"]);
    expect(r.visibles.has("p022")).toBe(false);
    expect(r.visibles.has("g01")).toBe(false);
  });

  it("distingue no encontrar nada de no estar filtrando", () => {
    const r = filtrarPartidas(filas, "ascensor")!;

    expect(r).not.toBeNull();
    expect(r.visibles.size).toBe(0);
  });

  /** La cadena de ancestros se reinicia al cambiar de capitulo: una
   *  coincidencia en el 12 no puede arrastrar al 11. */
  it("no mezcla ramas", () => {
    const r = filtrarPartidas(filas, "latex")!;

    expect([...r.visibles].sort()).toEqual(["c12", "p121"]);
  });
});
