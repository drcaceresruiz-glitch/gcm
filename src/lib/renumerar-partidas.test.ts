import { describe, it, expect } from "vitest";

import { calcularRenumeracion, type NodoRenumerable } from "./renumerar-partidas";
import { sumarHojas, codigoPadre } from "./jerarquia-partidas";

/**
 * Renumerar es una operacion de PRESENTACION: cierra huecos y no puede mover
 * un sol. La jerarquia sale del TEXTO del codigo, asi que cambiarlo cambia
 * quien cubre a quien en el reparto del costo directo; por eso cada prueba que
 * toca dinero compara la suma antes y despues.
 */

function nodo(
  id: string,
  codigo: string,
  parentId: string | null,
  orden: number,
): NodoRenumerable {
  return { id, codigo, parentId, orden };
}

describe("calcularRenumeracion", () => {
  it("cierra el hueco que deja borrar el primer capitulo", () => {
    const nodos = [
      nodo("c2", "2.0", null, 10),
      nodo("p21", "2.1", "c2", 11),
      nodo("p22", "2.2", "c2", 12),
      nodo("c3", "3.0", null, 20),
      nodo("p31", "3.1", "c3", 21),
    ];

    const { cambios, problema } = calcularRenumeracion(nodos);

    expect(problema).toBeNull();
    expect(cambios.get("c2")).toBe("1.0");
    expect(cambios.get("p21")).toBe("1.1");
    expect(cambios.get("p22")).toBe("1.2");
    expect(cambios.get("c3")).toBe("2.0");
    expect(cambios.get("p31")).toBe("2.1");
  });

  it("no propone nada cuando ya no hay huecos", () => {
    const nodos = [
      nodo("c1", "1.0", null, 0),
      nodo("p11", "1.1", "c1", 1),
      nodo("c2", "2.0", null, 2),
    ];

    expect(calcularRenumeracion(nodos).cambios.size).toBe(0);
  });

  /**
   * La forma se conserva. Un presupuesto S10 numera "01.02" y sus hijas
   * "01.02.01": si al renumerar se perdiera el cero de relleno, "1.2" tendria
   * otra jerarquia y el dinero cambiaria de rama.
   */
  it("conserva la anchura con ceros a la izquierda", () => {
    const nodos = [
      nodo("c2", "02", null, 10),
      nodo("p1", "02.03", "c2", 11),
      nodo("p2", "02.07", "c2", 12),
    ];

    const { cambios } = calcularRenumeracion(nodos);

    expect(cambios.get("c2")).toBe("01");
    expect(cambios.get("p1")).toBe("01.01");
    expect(cambios.get("p2")).toBe("01.02");
  });

  /**
   * La convencion que rompe la intuicion: "7.02.00" es cabecera de grupo y sus
   * hijas viven a su MISMA profundidad, en "7.02.01".
   */
  it("conserva el sufijo de las cabeceras de grupo", () => {
    const nodos = [
      nodo("c7", "7", null, 0),
      nodo("g2", "7.02.00", "c7", 1),
      nodo("h1", "7.02.05", "g2", 2),
      nodo("h2", "7.02.09", "g2", 3),
    ];

    const { cambios, problema } = calcularRenumeracion(nodos);

    expect(problema).toBeNull();
    expect(cambios.get("c7")).toBe("1");
    expect(cambios.get("g2")).toBe("1.01.00");
    expect(cambios.get("h1")).toBe("1.01.01");
    expect(cambios.get("h2")).toBe("1.01.02");
  });

  it("respeta el orden en que se ven, no el alfabetico del codigo", () => {
    const nodos = [
      nodo("c1", "1.0", null, 0),
      // La 1.10 va ANTES que la 1.9 por `orden`, aunque el texto diga otra cosa.
      nodo("a", "1.10", "c1", 1),
      nodo("b", "1.9", "c1", 2),
    ];

    const { cambios } = calcularRenumeracion(nodos);

    expect(cambios.get("a")).toBe("1.1");
    expect(cambios.get("b")).toBe("1.2");
  });

  /**
   * Hermanas con anchuras distintas se unifican, no chocan.
   *
   * Un presupuesto tecleado a ratos acaba con "1.01" y "1.1" mezcladas. Manda
   * la mas ancha de las que llevan cero a la izquierda, porque quitarselo
   * cambiaria la jerarquia de las que ya lo tenian.
   */
  it("unifica la anchura de las hermanas mezcladas", () => {
    const nodos = [
      nodo("c1", "1", null, 0),
      nodo("a", "1.01", "c1", 1),
      nodo("b", "1.1", "c1", 2),
    ];

    const { cambios, problema } = calcularRenumeracion(nodos);

    expect(problema).toBeNull();
    expect(cambios.get("a")).toBeUndefined(); // ya era "1.01"
    expect(cambios.get("b")).toBe("1.02");
  });

  /**
   * Renumerar ACORTA: cierra huecos hacia numeros mas bajos. La comprobacion
   * del largo es una red por si un dia se renumera de otra forma, no un caso
   * que se pueda provocar cerrando huecos.
   */
  it("acorta en vez de alargar, incluso partiendo de codigos larguisimos", () => {
    const largo = "01.01.01.01.01.01.01.01.01.01.9"; // 31 caracteres
    const nodos = [nodo("p", largo, null, 0), nodo("h", `${largo}.9`, "p", 1)];

    const { cambios, problema } = calcularRenumeracion(nodos);

    expect(problema).toBeNull();
    expect(cambios.get("p")).toBe("1");
    expect(cambios.get("h")).toBe("1.1");
  });

  it("se niega si alguna partida cuelga de algo que no esta", () => {
    const nodos = [nodo("a", "1.0", null, 0), nodo("h", "1.1", "fantasma", 1)];

    expect(calcularRenumeracion(nodos).problema).toContain("no cuelgan");
  });
});

/**
 * La prueba que de verdad protege: renumerar NO puede mover dinero.
 *
 * `sumarHojas` decide que partida cuenta y cual queda cubierta por una
 * descendiente costeada. Si la renumeracion alterara esa relacion, el total de
 * la obra cambiaria sin que nada diera error.
 */
describe("renumerar no mueve un sol", () => {
  function total(
    nodos: readonly NodoRenumerable[],
    importes: Record<string, string | null>,
    cambios: Map<string, string>,
  ) {
    return sumarHojas(
      nodos.map((n) => ({
        codigo: cambios.get(n.id) ?? n.codigo,
        parcial: importes[n.id] ?? null,
      })),
    );
  }

  it("mantiene el total con capitulos, subcapitulos y cabeceras", () => {
    const nodos = [
      nodo("c2", "2", null, 10),
      nodo("g1", "2.03.00", "c2", 11),
      nodo("h1", "2.03.04", "g1", 12),
      nodo("h2", "2.03.07", "g1", 13),
      nodo("c5", "5", null, 20),
      nodo("p5", "5.02", "c5", 21),
    ];
    const importes = {
      c2: null,
      g1: null,
      h1: "1000.00",
      h2: "250.50",
      c5: null,
      p5: "3000.00",
    };

    const { cambios, problema } = calcularRenumeracion(nodos);
    expect(problema).toBeNull();

    expect(total(nodos, importes, cambios)).toBe(
      total(nodos, importes, new Map()),
    );
    expect(total(nodos, importes, cambios)).toBe("4250.50");
  });

  /**
   * El caso peligroso: una cabecera con importe propio a suma alzada CUBRE a
   * sus hijas. Si al renumerar dejara de ser cabecera, el dinero se contaria
   * dos veces.
   */
  it("mantiene quien cubre a quien", () => {
    const nodos = [
      nodo("c7", "7", null, 0),
      nodo("g9", "7.09.00", "c7", 1),
      nodo("d", "7.09.01", "g9", 2),
    ];
    const importes = { c7: null, g9: "779.10", d: "-50.00" };

    const { cambios } = calcularRenumeracion(nodos);

    // El descuento NO sustituye a la cabecera: la ajusta. Antes y despues.
    expect(total(nodos, importes, new Map())).toBe("729.10");
    expect(total(nodos, importes, cambios)).toBe("729.10");
  });

  it("el codigo nuevo sigue colgando de quien colgaba", () => {
    const nodos = [
      nodo("c4", "4.0", null, 30),
      nodo("p1", "4.3", "c4", 31),
      nodo("p2", "4.8", "c4", 32),
    ];

    const { cambios } = calcularRenumeracion(nodos);
    const finales = new Set(
      nodos.map((n) => cambios.get(n.id) ?? n.codigo),
    );

    expect(codigoPadre(cambios.get("p1")!, finales)).toBe(cambios.get("c4"));
    expect(codigoPadre(cambios.get("p2")!, finales)).toBe(cambios.get("c4"));
  });
});
