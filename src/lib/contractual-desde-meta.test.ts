import { describe, it, expect } from "vitest";
import { generarContractual, type LineaReal } from "./contractual-desde-meta";

function cap(codigo: string, recargo: string | null, orden: number): LineaReal {
  return {
    codigo, descripcion: `Capitulo ${codigo}`, tipo: "CAPITULO",
    nivel: 0, orden, unidad: null, metrado: null, precioUnitario: null,
    parcial: null, porcentajeRecargo: recargo,
    fechaInicio: null, fechaFin: null,
  };
}

function par(
  codigo: string, orden: number,
  d: { metrado?: string; pu?: string; parcial?: string },
): LineaReal {
  return {
    codigo, descripcion: `Partida ${codigo}`, tipo: "PARTIDA",
    nivel: 1, orden, unidad: "m2",
    metrado: d.metrado ?? null,
    precioUnitario: d.pu ?? null,
    parcial: d.parcial ?? null,
    porcentajeRecargo: null,
    fechaInicio: null, fechaFin: null,
  };
}

const porCodigo = (r: ReturnType<typeof generarContractual>) =>
  new Map(r.lineas.map((l) => [l.codigo, l]));

describe("el contractual que sale del real", () => {
  it("recarga el PRECIO y recalcula el importe", () => {
    const r = generarContractual([
      cap("1.0", "20.000", 0),
      par("1.1", 1, { metrado: "10", pu: "100" }),
    ]);
    const l = porCodigo(r).get("1.1");

    // El contrato lleva el mismo metrado a otro precio.
    expect(l?.metrado).toBe("10");
    expect(l?.precioUnitario).toBe("120.0000");
    expect(l?.parcial).toBe("1200.00");
    expect(l?.porcentajeAplicado).toBe("20.000");
    expect(l?.codigoDelRecargo).toBe("1.0");
    expect(l?.parcialReal).toBe(null);
  });

  it("recarga el importe cerrado de una suma alzada", () => {
    const r = generarContractual([
      cap("1.0", "20.000", 0),
      par("1.1", 1, { parcial: "500.00" }),
    ]);
    const l = porCodigo(r).get("1.1");

    expect(l?.parcial).toBe("600.00");
    expect(l?.precioUnitario).toBe(null);
  });

  it("un capitulo no lleva cifra: su importe es lo que cuelga de el", () => {
    const r = generarContractual([
      cap("1.0", "20.000", 0),
      par("1.1", 1, { metrado: "10", pu: "100" }),
    ]);

    expect(porCodigo(r).get("1.0")?.parcial).toBe(null);
    // Si el capitulo llevara cifra propia, el total seria 2400 y no 1200.
    expect(r.totalContractual).toBe("1200.00");
  });

  it("la bolsa es exactamente el recargo", () => {
    const r = generarContractual([
      cap("1.0", "20.000", 0),
      par("1.1", 1, { metrado: "10", pu: "100", parcial: "1000.00" }),
      par("1.2", 2, { parcial: "500.00" }),
    ]);

    expect(r.totalReal).toBe("1500.00");
    expect(r.totalContractual).toBe("1800.00");
    expect(r.bolsa).toBe("300.00");
  });
});

describe("de que capitulo sale el recargo", () => {
  it("hereda el del ancestro MAS CERCANO", () => {
    const r = generarContractual([
      cap("3.0", "10.000", 0),
      { ...cap("3.1", "50.000", 1), nivel: 1 },
      par("3.1.1", 2, { parcial: "100.00" }),
      par("3.2", 3, { parcial: "100.00" }),
    ]);
    const m = porCodigo(r);

    // 3.1.1 cuelga de 3.1, que tiene el suyo: gana el mas especifico.
    expect(m.get("3.1.1")?.parcial).toBe("150.00");
    expect(m.get("3.1.1")?.codigoDelRecargo).toBe("3.1");

    // 3.2 cuelga directo del capitulo: usa el general.
    expect(m.get("3.2")?.parcial).toBe("110.00");
    expect(m.get("3.2")?.codigoDelRecargo).toBe("3.0");
  });
});

describe("lo que NO se puede recargar se avisa, no se inventa", () => {
  it("una partida sin recargo entra a precio de costo, y se dice cuanto es", () => {
    const r = generarContractual([
      cap("1.0", "20.000", 0),
      par("1.1", 1, { parcial: "1000.00" }),
      cap("2.0", null, 2),
      par("2.1", 3, { parcial: "700.00" }),
    ]);
    const m = porCodigo(r);

    expect(m.get("2.1")?.parcial).toBe("700.00");
    expect(m.get("2.1")?.porcentajeAplicado).toBe(null);

    const aviso = r.avisos.find((a) => a.motivo === "SIN_RECARGO");
    expect(aviso?.codigos).toEqual(["2.1"]);
    expect(aviso?.importe).toBe("700.00");

    // Y el total no miente: 1200 recargados + 700 al costo.
    expect(r.totalContractual).toBe("1900.00");
    expect(r.bolsa).toBe("200.00");
  });

  it("una linea sin codigo queda fuera, con su importe a la vista", () => {
    const sinCodigo: LineaReal = {
      codigo: null, descripcion: "Sobrestante de obra", tipo: "PARTIDA",
      nivel: 0, orden: 9, unidad: null, metrado: null, precioUnitario: null,
      parcial: "800.00", porcentajeRecargo: null,
      fechaInicio: null, fechaFin: null,
    };
    const r = generarContractual([
      cap("1.0", "20.000", 0),
      par("1.1", 1, { parcial: "1000.00" }),
      sinCodigo,
    ]);

    expect(r.lineas.map((l) => l.codigo)).toEqual(["1.0", "1.1"]);

    const aviso = r.avisos.find((a) => a.motivo === "SIN_CODIGO");
    expect(aviso?.importe).toBe("800.00");
    expect(aviso?.codigos).toEqual(["Sobrestante de obra"]);

    // Ese costo NO entra al contrato: hay que cubrirlo con el recargo.
    expect(r.totalContractual).toBe("1200.00");
  });

  it("un codigo que cuelga de si mismo no cuelga el calculo", () => {
    const r = generarContractual([par("1.0.0", 0, { parcial: "50.00" })]);

    expect(r.totalContractual).toBe("50.00");
  });
});
