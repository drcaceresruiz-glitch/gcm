import { describe, expect, it } from "vitest";
import { agruparFotos, diaLima, etiquetaGrupo } from "@/lib/galeria";

/** Foto minima para agrupar. */
function foto(iso: string) {
  return { id: iso, createdAt: new Date(iso) };
}

describe("diaLima", () => {
  it("convierte el instante UTC al dia de Lima", () => {
    // Las 3 de la madrugada UTC del lunes son las 10 de la noche del
    // DOMINGO en Lima: el dia que cuenta es el domingo.
    expect(diaLima(new Date("2026-08-10T03:00:00Z"))).toBe("2026-08-09");
    expect(diaLima(new Date("2026-08-10T15:00:00Z"))).toBe("2026-08-10");
  });
});

describe("agruparFotos por SEMANA", () => {
  /**
   * El caso que rompe un agrupado ingenuo por UTC: la foto del domingo por
   * la noche en obra caeria en la semana SIGUIENTE si se mirara el reloj
   * UTC, y el gerente diria "esta foto no es de esta semana".
   */
  it("la foto del domingo de noche en obra queda en SU semana", () => {
    const grupos = agruparFotos(
      [foto("2026-08-10T03:00:00Z")], // domingo 9/8 en Lima
      "SEMANA",
    );
    expect(grupos).toHaveLength(1);
    // La semana del lunes 3 de agosto, no la del 10.
    expect(grupos[0]!.clave).toBe("2026-08-03");
  });

  it("separa semanas y las ordena de la mas reciente a la mas antigua", () => {
    const grupos = agruparFotos(
      [
        foto("2026-08-14T15:00:00Z"), // viernes 14 -> semana del 10
        foto("2026-08-05T15:00:00Z"), // miercoles 5 -> semana del 3
        foto("2026-08-12T15:00:00Z"), // miercoles 12 -> semana del 10
      ],
      "SEMANA",
    );
    expect(grupos.map((g) => g.clave)).toEqual(["2026-08-10", "2026-08-03"]);
    expect(grupos[0]!.fotos).toHaveLength(2);
  });

  it("conserva el orden de llegada dentro del grupo", () => {
    const grupos = agruparFotos(
      [foto("2026-08-14T15:00:00Z"), foto("2026-08-12T15:00:00Z")],
      "SEMANA",
    );
    expect(grupos[0]!.fotos.map((f) => f.id)).toEqual([
      "2026-08-14T15:00:00Z",
      "2026-08-12T15:00:00Z",
    ]);
  });

  it("sin fotos, sin grupos", () => {
    expect(agruparFotos([], "SEMANA")).toEqual([]);
  });
});

describe("agruparFotos por MES", () => {
  it("agrupa por mes de Lima, no de UTC", () => {
    const grupos = agruparFotos(
      [
        // 1 de septiembre a la 1 de la madrugada UTC = 31 de agosto en Lima.
        foto("2026-09-01T01:00:00Z"),
        foto("2026-08-05T15:00:00Z"),
      ],
      "MES",
    );
    expect(grupos.map((g) => g.clave)).toEqual(["2026-08"]);
    expect(grupos[0]!.fotos).toHaveLength(2);
  });
});

describe("etiquetaGrupo", () => {
  it("nombra la semana por su lunes", () => {
    expect(etiquetaGrupo(new Date("2026-08-10T00:00:00Z"), "SEMANA")).toBe(
      "Semana del 10 de agosto de 2026",
    );
  });

  it("nombra el mes capitalizado", () => {
    expect(etiquetaGrupo(new Date("2026-08-01T00:00:00Z"), "MES")).toBe(
      "Agosto de 2026",
    );
  });
});
