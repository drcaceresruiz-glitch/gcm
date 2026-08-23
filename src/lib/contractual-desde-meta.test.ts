import { describe, it, expect } from "vitest";
import { generarContractual, type LineaReal } from "./contractual-desde-meta";
import { restar } from "./decimal";

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
  it("el precio del contrato lleva DOS decimales, no cuatro", () => {
    // El contractual es el papel que se firma: metrado x precio unitario
    // tiene que dar el parcial impreso. Con cuatro decimales en el precio, la
    // cuenta que cualquiera hace con el documento delante no cuadraba.
    const r = generarContractual([
      cap("1.0", "15.000", 0),
      par("1.1", 1, { metrado: "980", pu: "5.10" }),
    ]);
    const l = porCodigo(r).get("1.1");

    // 5.10 x 1.15 = 5.865, que se redondea ANTES de multiplicar por el
    // metrado: 980 x 5.87 = 5752.60, y no los 5747.70 de antes.
    expect(l?.precioUnitario).toBe("5.87");
    expect(l?.parcial).toBe("5752.60");
  });

  it("recarga el PRECIO y recalcula el importe", () => {
    const r = generarContractual([
      cap("1.0", "20.000", 0),
      par("1.1", 1, { metrado: "10", pu: "100" }),
    ]);
    const l = porCodigo(r).get("1.1");

    // El contrato lleva el mismo metrado a otro precio.
    expect(l?.metrado).toBe("10");
    expect(l?.precioUnitario).toBe("120.00");
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

  it("el de la PROPIA partida gana al de su capitulo", () => {
    /*
     * No todas las partidas de un capitulo se margenan igual: una subcontrata
     * ya cerrada no admite el mismo recargo que la mano de obra propia.
     *
     * El motor siempre lo supo -`recargoDe` empieza por el codigo de la
     * propia linea y solo sube si esa no lo trae-, pero hasta el 23 de agosto
     * de 2026 el servicio se negaba a guardarlo y la pantalla no lo ofrecia.
     * Se fija aqui porque ahora la UI depende de ello.
     */
    const r = generarContractual([
      cap("1.0", "20.000", 0),
      { ...par("1.1", 1, { parcial: "100.00" }), porcentajeRecargo: "5.000" },
      par("1.2", 2, { parcial: "100.00" }),
    ]);
    const m = porCodigo(r);

    expect(m.get("1.1")?.parcial).toBe("105.00");
    expect(m.get("1.1")?.codigoDelRecargo).toBe("1.1");

    // Y la de al lado sigue con el del capitulo: no se contagia.
    expect(m.get("1.2")?.parcial).toBe("120.00");
    expect(m.get("1.2")?.codigoDelRecargo).toBe("1.0");
  });

  it("una partida puede llevar CERO aunque su capitulo recargue", () => {
    // Cero no es «hereda»: es «esta entra a precio de costo, y lo se». Es la
    // unica forma de decirlo, y por eso el vacio y el cero tienen que
    // significar cosas distintas hasta el final.
    const r = generarContractual([
      cap("1.0", "20.000", 0),
      { ...par("1.1", 1, { parcial: "100.00" }), porcentajeRecargo: "0.000" },
    ]);

    expect(porCodigo(r).get("1.1")?.parcial).toBe("100.00");
    expect(porCodigo(r).get("1.1")?.codigoDelRecargo).toBe("1.1");
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

describe("lo que la bolsa tiene que cubrir", () => {
  /*
   * EL CASO REAL, visto en pantalla el 23 de agosto de 2026: real 400,
   * contractual 440, «bolsa 40»… con 200 de costos propios sin contar. La
   * obra no ganaba 40, perdia 160.
   *
   * `totalReal` suma SOLO las lineas con codigo, que son las unicas que se
   * recargan. Estas pruebas fijan esa frontera para que quede claro que la
   * bolsa NO se calcula con ella: se calcula contra el costo total de la
   * meta, que ademas incluye los gastos generales.
   */
  const sinCodigo = (descripcion: string, parcial: string): LineaReal => ({
    codigo: null,
    descripcion,
    tipo: "PARTIDA",
    nivel: 1,
    orden: 9,
    unidad: "glb",
    metrado: null,
    precioUnitario: null,
    parcial,
    porcentajeRecargo: null,
    fechaInicio: null,
    fechaFin: null,
  });

  const conPropios = () =>
    generarContractual([
      cap("1.0", "10.000", 0),
      par("1.1", 1, { parcial: "400.00" }),
      sinCodigo("Andamio metálico en alquiler", "150.00"),
      sinCodigo("Encofrado metálico en alquiler", "50.00"),
    ]);

  it("el total REAL deja fuera lo que no se recarga, y por eso no es el costo", () => {
    const r = conPropios();

    expect(r.totalReal).toBe("400.00");
    expect(r.totalContractual).toBe("440.00");
    // Esta es la cifra enganosa si se lee como «lo que gana la obra».
    expect(r.bolsa).toBe("40.00");
  });

  it("y lo que queda fuera se avisa con su importe, para poder restarlo", () => {
    const aviso = conPropios().avisos.find((a) => a.motivo === "SIN_CODIGO");

    expect(aviso?.importe).toBe("200.00");
    // 440 cobrados contra 400 + 200 de costo: la obra pierde 160.
    expect(restar("440.00", "600.00")).toBe("-160.00");
  });

  it("el recargo que SI cubriria ese costo es del 50 %, no del 10 %", () => {
    // Solo se recargan las lineas con codigo, asi que el recargo tiene que
    // sacar de 400 los 600 que cuesta la obra: 600/400 - 1 = 50 %.
    const r = generarContractual([
      cap("1.0", "50.000", 0),
      par("1.1", 1, { parcial: "400.00" }),
      sinCodigo("Andamio metálico en alquiler", "150.00"),
      sinCodigo("Encofrado metálico en alquiler", "50.00"),
    ]);

    expect(r.totalContractual).toBe("600.00");
  });
});
