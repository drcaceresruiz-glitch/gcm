import { describe, it, expect } from "vitest";
import { sumar } from "@/lib/decimal";
import {
  ajustarImporte,
  cascadaDelContratista,
  esNeutro,
  factorDe,
  recalcularBloque,
  repartir,
  SIN_AJUSTE,
} from "./cascada-contratista";

const ELECTRICAS = {
  descuento: "5",
  gastosGenerales: "8",
  utilidad: "10",
};

describe("la cascada de un contratista", () => {
  it("el ejemplo de la cotizacion, paso a paso", () => {
    const c = cascadaDelContratista("20000.00", ELECTRICAS);

    expect(c.cotizado).toBe("20000.00");
    expect(c.descuento).toBe("-1000.00");
    expect(c.baseDeMargenes).toBe("19000.00");
    expect(c.gastosGenerales).toBe("1520.00");
    expect(c.utilidad).toBe("1900.00");
    expect(c.aPagar).toBe("22420.00");
  });

  it("los dos margenes van sobre el importe DESCONTADO, no uno sobre el otro", () => {
    /*
     * Encadenarlos -utilidad sobre el importe que ya lleva los gastos
     * generales- daria 22.572 en vez de 22.420. Ciento cincuenta y dos soles
     * en veinte mil: no da error, da una cifra creible y equivocada, y en un
     * presupuesto de ochocientos mil se convierte en miles.
     */
    const c = cascadaDelContratista("20000.00", ELECTRICAS);

    expect(c.aPagar).toBe("22420.00");
    expect(c.aPagar).not.toBe("22572.00");
  });

  it("sin ajuste, el costo es lo cotizado y el factor es uno", () => {
    const c = cascadaDelContratista("20000.00", SIN_AJUSTE);

    expect(c.aPagar).toBe("20000.00");
    expect(Number(c.factor)).toBe(1);
    expect(esNeutro(SIN_AJUSTE)).toBe(true);
  });

  it("los tres a cero es lo mismo que no poner nada", () => {
    expect(esNeutro({ descuento: "0", gastosGenerales: "0", utilidad: "0" })).toBe(true);
    expect(esNeutro({ descuento: "5", gastosGenerales: null, utilidad: null })).toBe(false);
  });

  it("solo descuento: el contratista rebaja y no carga margen", () => {
    const c = cascadaDelContratista("10000.00", {
      descuento: "12.5",
      gastosGenerales: null,
      utilidad: null,
    });

    expect(c.aPagar).toBe("8750.00");
  });

  it("solo margenes: hay contratistas que no descuentan", () => {
    const c = cascadaDelContratista("10000.00", {
      descuento: null,
      gastosGenerales: "10",
      utilidad: "10",
    });

    expect(c.aPagar).toBe("12000.00");
  });
});

describe("repartir el ajuste entre las partidas", () => {
  it("cada partida sube su parte y el total es el que se paga", () => {
    const r = repartir(["10000.00", "6000.00", "4000.00"], ELECTRICAS);

    expect(r).toEqual(["11210.00", "6726.00", "4484.00"]);
    expect(sumar(r as string[])).toBe("22420.00");
  });

  it("las partidas sin importe se quedan sin importe", () => {
    // Son lineas de alcance: su dinero vive en la partida de arriba.
    const r = repartir(["10000.00", null, "6000.00"], ELECTRICAS);

    expect(r[1]).toBeNull();
    expect(sumar([r[0]!, r[2]!])).toBe("17936.00");
  });

  it("EL TOTAL CUADRA AL CENTIMO aunque el redondeo no acompane", () => {
    /*
     * Multiplicar cada partida por el factor y redondear a dos decimales deja
     * una diferencia contra el total. Con un presupuesto de 400 lineas son
     * soles, y un presupuesto que no cuadra con la cotizacion que lo origino
     * hay que explicarlo en cada reunion. La ultima partida absorbe el resto.
     */
    const importes = Array.from({ length: 37 }, (_, i) => `${100 + i * 7}.33`);
    const ajuste = { descuento: "7.3", gastosGenerales: "9.7", utilidad: "11.3" };

    const r = repartir(importes, ajuste);
    const objetivo = cascadaDelContratista(sumar(importes), ajuste).aPagar;

    expect(sumar(r as string[])).toBe(objetivo);
  });

  it("sin ajuste no toca ni un importe", () => {
    const importes = ["10000.00", null, "6000.00"];

    expect(repartir(importes, SIN_AJUSTE)).toEqual(importes);
  });

  it("un bloque con una sola partida cuadra igual", () => {
    const r = repartir(["20000.00"], ELECTRICAS);

    expect(r).toEqual(["22420.00"]);
  });

  it("los descuentos negativos del propio presupuesto tambien se ajustan", () => {
    /*
     * En un presupuesto real conviven las partidas del contratista con lineas
     * negativas propias. Si el bloque lleva ajuste, se aplica a todas: el
     * contratista descuenta sobre el neto de su cotizacion, no sobre lo que a
     * nosotros nos guste.
     */
    const r = repartir(["10000.00", "-2000.00"], {
      descuento: "10",
      gastosGenerales: null,
      utilidad: null,
    });

    expect(sumar(r as string[])).toBe("7200.00");
  });
});

describe("el factor", () => {
  it("es el que multiplica una partida suelta", () => {
    const f = factorDe(ELECTRICAS);

    // 0,95 x 1,18 = 1,121
    expect(Number(f)).toBeCloseTo(1.121, 6);
    expect(ajustarImporte("10000.00", f)).toBe("11210.00");
  });

  it("lleva ocho decimales, que hacen falta con muchas partidas", () => {
    const f = factorDe({ descuento: "3.7", gastosGenerales: "6.3", utilidad: "11.9" });

    expect(f.split(".")[1]?.length).toBe(8);
  });
});

describe("volver a repartir un bloque con otros porcentajes", () => {
  const bloque = [
    { codigo: "8.01", parcial: "11210.00", parcialCotizado: "10000.00" },
    { codigo: "8.02", parcial: "6726.00", parcialCotizado: "6000.00" },
    { codigo: "8.03", parcial: "4484.00", parcialCotizado: "4000.00" },
  ];

  it("SE PARTE DEL PRECIO COTIZADO, no del importe que se ensena", () => {
    /*
     * Si el nuevo factor se aplicara sobre el importe ya ajustado, los dos se
     * encadenarian y el presupuesto se alejaria de la cotizacion un poco mas
     * en cada correccion. Cambiar el descuento del 5 al 10 tiene que dar lo
     * mismo que haberlo puesto al 10 desde el principio.
     */
    const r = recalcularBloque(bloque, {
      descuento: "10",
      gastosGenerales: "8",
      utilidad: "10",
    });

    // 10.000 x 0,90 x 1,18 = 10.620
    expect(r[0]!.parcial).toBe("10620.00");
    expect(r[0]!.parcialCotizado).toBe("10000.00");
    expect(sumar(r.map((l) => l.parcial!))).toBe("21240.00");
  });

  it("quitar los porcentajes devuelve las partidas a la cotizacion", () => {
    const r = recalcularBloque(bloque, SIN_AJUSTE);

    expect(r.map((l) => l.parcial)).toEqual(["10000.00", "6000.00", "4000.00"]);
    // Y se retira el precio guardado: sin ajuste no hay nada que deshacer.
    expect(r.every((l) => l.parcialCotizado === null)).toBe(true);
  });

  it("la primera vez, el precio de hoy ES el cotizado", () => {
    const sinAjustar = [
      { codigo: "8.01", parcial: "10000.00", parcialCotizado: null },
      { codigo: "8.02", parcial: "6000.00", parcialCotizado: null },
      { codigo: "8.03", parcial: "4000.00", parcialCotizado: null },
    ];

    const r = recalcularBloque(sinAjustar, ELECTRICAS);

    expect(r.map((l) => l.parcial)).toEqual(["11210.00", "6726.00", "4484.00"]);
    expect(r.map((l) => l.parcialCotizado)).toEqual(["10000.00", "6000.00", "4000.00"]);
  });

  it("cambiar dos veces no acumula", () => {
    const unaVez = recalcularBloque(bloque, { descuento: "10", gastosGenerales: null, utilidad: null });
    const otraVez = recalcularBloque(
      unaVez.map((l) => ({ codigo: l.codigo, parcial: l.parcial, parcialCotizado: l.parcialCotizado })),
      { descuento: "10", gastosGenerales: null, utilidad: null },
    );

    expect(otraVez.map((l) => l.parcial)).toEqual(unaVez.map((l) => l.parcial));
  });
});
