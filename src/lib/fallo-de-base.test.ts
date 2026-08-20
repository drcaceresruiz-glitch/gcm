import { describe, expect, it } from "vitest";
import { codigoDeFallo, motivoSiFalla } from "@/lib/fallo-de-base";

/**
 * La pieza compartida entre los dos sitios que ya se comieron el mismo hueco:
 * el importador de presupuesto y el alta de usuarios.
 *
 * Lo que se fija es la PROPIEDAD que importa: `motivoSiFalla` no vuelve a
 * lanzar nunca. Si lo hiciera, el error subiria hasta Next y saldria la
 * pantalla generica de error, que es justo lo que esto vino a sustituir.
 */
describe("codigoDeFallo", () => {
  it("saca el codigo de un error de Prisma", () => {
    expect(codigoDeFallo(Object.assign(new Error("x"), { code: "P2002" }))).toBe(
      "P2002",
    );
  });

  it("y tambien de un objeto pelado, que es como llega envuelto a veces", () => {
    expect(codigoDeFallo({ code: "P2000" })).toBe("P2000");
  });

  it("null cuando no hay codigo que mirar", () => {
    for (const e of [null, undefined, "texto", 42, {}, new Error("sin codigo")]) {
      expect(codigoDeFallo(e)).toBeNull();
    }
  });

  /**
   * Se mira POR FORMA y no con `instanceof`: con el adaptador de MariaDB el
   * error puede venir envuelto en otra clase, y un `instanceof` que falla no
   * da error, elige la rama equivocada.
   */
  it("no depende de la clase del error", () => {
    class OtroError {}
    expect(codigoDeFallo(Object.assign(new OtroError(), { code: "P2028" }))).toBe(
      "P2028",
    );
  });
});

describe("motivoSiFalla", () => {
  it("null cuando la escritura fue bien", async () => {
    expect(await motivoSiFalla(Promise.resolve("hecho"), () => "no")).toBeNull();
  });

  it("devuelve el motivo en vez de lanzar", async () => {
    const r = await motivoSiFalla(Promise.reject(new Error("boom")), () => "roto");
    expect(r).toBe("roto");
  });

  /** La propiedad entera de este modulo, dicha sin rodeos. */
  it("NUNCA vuelve a lanzar, pase lo que pase", async () => {
    for (const e of [new Error("x"), "cadena", null, undefined, { code: "P2002" }]) {
      await expect(
        motivoSiFalla(Promise.reject(e), () => "motivo"),
      ).resolves.toBe("motivo");
    }
  });

  it("al traductor le llega el error entero, no solo su codigo", async () => {
    let visto: unknown = "nada";
    await motivoSiFalla(Promise.reject({ code: "P2002", meta: "algo" }), (e) => {
      visto = e;
      return "";
    });
    expect(visto).toEqual({ code: "P2002", meta: "algo" });
  });
});
