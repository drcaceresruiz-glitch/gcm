import { describe, it, expect } from "vitest";
import { CAPITULOS, capituloPorSlug } from "./capitulos";

/**
 * El indice del manual.
 *
 * Poca cosa que probar en un texto, pero lo que hay importa: un slug
 * repetido taparia un capitulo en silencio —`capituloPorSlug` devolveria
 * siempre el primero— y el enlace del indice llevaria a otro texto sin que
 * nada fallara.
 */
describe("el indice del manual", () => {
  it("no hay dos capitulos con el mismo slug", () => {
    const slugs = CAPITULOS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("cada capitulo dice su pregunta y para quien es", () => {
    for (const c of CAPITULOS) {
      expect(c.pregunta.length, c.slug).toBeGreaterThan(0);
      expect(c.paraQuien.length, c.slug).toBeGreaterThan(0);
      expect(c.resumen.length, c.slug).toBeGreaterThan(0);
    }
  });

  it("capituloPorSlug encuentra los que hay y calla con los que no", () => {
    expect(capituloPorSlug("dinero")?.titulo).toContain("encargos");
    expect(capituloPorSlug("no-existe")).toBeNull();
  });
});
