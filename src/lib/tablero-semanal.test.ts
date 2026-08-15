import { describe, expect, it } from "vitest";

import {
  construirTablero,
  diasDeLaSemana,
  SIN_CONTRATISTA,
  type CompromisoEnTablero,
} from "@/lib/tablero-semanal";

/// Viernes 14 de agosto de 2026 (ISO 5). La semana va del sabado 8 al viernes 14.
const CORTE = new Date("2026-08-14T00:00:00Z");

/// Lunes a viernes, como casi cualquier obra.
const LABORABLES = new Set([1, 2, 3, 4, 5]);

function c(
  id: string,
  extra: Partial<CompromisoEnTablero> = {},
): CompromisoEnTablero {
  return {
    id,
    descripcion: `Compromiso ${id}`,
    proveedorId: null,
    proveedorNombre: null,
    zona: null,
    color: null,
    cantidadPlan: null,
    unidad: null,
    cumplido: null,
    diaInicio: null,
    diaFin: null,
    ...extra,
  };
}

describe("las columnas de la semana", () => {
  it("son los siete dias que terminan en el corte, en orden", () => {
    const dias = diasDeLaSemana(CORTE, LABORABLES);

    expect(dias).toHaveLength(7);
    expect(dias[0]!.iso).toBe(6); // sabado 8
    expect(dias[6]!.iso).toBe(5); // viernes 14, el corte
    expect(dias[6]!.fecha.toISOString().slice(0, 10)).toBe("2026-08-14");
  });

  it("los siete valores ISO aparecen exactamente una vez", () => {
    // De esto depende que cualquier dia 1-7 caiga en una columna y solo una.
    const isos = diasDeLaSemana(CORTE, LABORABLES).map((d) => d.iso).sort();

    expect(isos).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("sin calendario cargado, todos cuentan como laborables", () => {
    // Enseñar de mas es preferible a esconder un dia con trabajo dentro.
    const dias = diasDeLaSemana(CORTE, new Set());

    expect(dias.every((d) => d.laborable)).toBe(true);
  });
});

describe("lo que no se puede colocar se enseña, no se esconde", () => {
  it("un compromiso sin dia va a su banda y se cuenta", () => {
    const t = construirTablero(CORTE, LABORABLES, [
      c("1", { proveedorId: "p1", proveedorNombre: "Estructuras SAC" }),
    ]);

    expect(t.sinDia).toBe(1);
    expect(t.colocadas).toBe(0);
    expect(t.filas[0]!.sinDia.map((x) => x.id)).toEqual(["1"]);
  });

  it("un compromiso sin contratista tiene su propia fila, la ultima", () => {
    // Trabajo sin dueño es el hallazgo mas util de la reunion. Meterlo dentro
    // de otra fila lo perderia.
    const t = construirTablero(CORTE, LABORABLES, [
      c("1", { diaInicio: 1 }),
      c("2", { proveedorId: "p1", proveedorNombre: "Zzz SAC", diaInicio: 1 }),
      c("3", { proveedorId: "p2", proveedorNombre: "Aaa SAC", diaInicio: 1 }),
    ]);

    expect(t.filas.map((f) => f.nombre)).toEqual([
      "Aaa SAC",
      "Zzz SAC",
      SIN_CONTRATISTA,
    ]);
  });

  it("un dia fuera de 1-7 se trata como sin dia, no se descarta", () => {
    const t = construirTablero(CORTE, LABORABLES, [c("1", { diaInicio: 9 })]);

    expect(t.sinDia).toBe(1);
    expect(t.colocadas).toBe(0);
  });
});

describe("las tarjetas se colocan y se estiran", () => {
  it("un compromiso de un solo dia ocupa una columna", () => {
    const t = construirTablero(CORTE, LABORABLES, [
      c("1", { diaInicio: 1, diaFin: 1 }),
    ]);
    const tarjeta = t.filas[0]!.tarjetas[0]!;

    // Lunes es el indice 2: sabado(0), domingo(1), lunes(2).
    expect(tarjeta.desde).toBe(2);
    expect(tarjeta.hasta).toBe(2);
  });

  it("uno de tres dias se estira por sus tres columnas", () => {
    // Es la razon de que sean dos campos y no uno: en obra un compromiso de
    // tres dias es lo normal, y meterlo en una columna haria que el tablero
    // mintiera sobre cuando ocupa el frente.
    const t = construirTablero(CORTE, LABORABLES, [
      c("1", { diaInicio: 1, diaFin: 3 }),
    ]);
    const tarjeta = t.filas[0]!.tarjetas[0]!;

    expect(tarjeta.desde).toBe(2);
    expect(tarjeta.hasta).toBe(4);
  });

  it("sin dia de fin, ocupa solo el de inicio", () => {
    const t = construirTablero(CORTE, LABORABLES, [c("1", { diaInicio: 3 })]);
    const tarjeta = t.filas[0]!.tarjetas[0]!;

    expect(tarjeta.desde).toBe(tarjeta.hasta);
  });

  it("un fin ANTERIOR al inicio no se le da la vuelta", () => {
    // Darle la vuelta inventaria un tramo que nadie pacto. Se queda en un
    // solo dia, que es lo minimo defendible.
    const t = construirTablero(CORTE, LABORABLES, [
      c("1", { diaInicio: 4, diaFin: 2 }),
    ]);
    const tarjeta = t.filas[0]!.tarjetas[0]!;

    expect(tarjeta.desde).toBe(tarjeta.hasta);
  });
});

describe("los dias no laborables", () => {
  it("se ocultan si estan vacios", () => {
    const t = construirTablero(CORTE, LABORABLES, [c("1", { diaInicio: 1 })]);
    const finDeSemana = t.dias.filter((d) => d.iso === 6 || d.iso === 7);

    expect(finDeSemana.every((d) => d.visible)).toBe(false);
  });

  it("pero se enseñan si alguien puso trabajo ahi", () => {
    // Que alguien haya comprometido algo un domingo es EXACTAMENTE lo que hay
    // que ver en la reunion. Esconder la columna lo perderia.
    const t = construirTablero(CORTE, LABORABLES, [c("1", { diaInicio: 7 })]);
    const domingo = t.dias.find((d) => d.iso === 7)!;

    expect(domingo.laborable).toBe(false);
    expect(domingo.visible).toBe(true);
  });

  it("y tambien cuando solo los cruza una tarjeta estirada", () => {
    // Viernes a lunes pasa por el fin de semana sin empezar ni acabar en el.
    const t = construirTablero(CORTE, new Set([1, 2, 3, 4, 5]), [
      c("1", { diaInicio: 6, diaFin: 1 }),
    ]);

    // El sabado es la columna 0 y el lunes la 2, asi que cruza el domingo.
    const domingo = t.dias.find((d) => d.iso === 7)!;
    expect(domingo.visible).toBe(true);
  });

  it("un tablero vacio no revienta", () => {
    const t = construirTablero(CORTE, LABORABLES, []);

    expect(t.filas).toEqual([]);
    expect(t.colocadas).toBe(0);
    expect(t.sinDia).toBe(0);
    expect(t.dias).toHaveLength(7);
  });
});

describe("el contraste del texto sobre el post-it", () => {
  it("el amarillo pide letra oscura", async () => {
    const { textoSobre, PALETA_TABLERO } = await import("@/lib/tablero-semanal");
    const amarillo = PALETA_TABLERO.find((c) => c.hex === "#eab308")!;

    // Con letra blanca este color queda ilegible en la pantalla de la sala,
    // que es justo donde hay que leerlo de lejos.
    expect(textoSobre(amarillo.hex)).toBe("oscuro");
  });

  it("el azul y el rojo piden letra clara", async () => {
    const { textoSobre } = await import("@/lib/tablero-semanal");

    expect(textoSobre("#2563eb")).toBe("claro");
    expect(textoSobre("#dc2626")).toBe("claro");
  });

  it("sin color, o con basura, se cae a letra oscura", async () => {
    const { textoSobre } = await import("@/lib/tablero-semanal");

    expect(textoSobre(null)).toBe("oscuro");
    expect(textoSobre("azul")).toBe("oscuro");
    expect(textoSobre("#zzz")).toBe("oscuro");
  });
});
