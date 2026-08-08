import { describe, expect, it } from "vitest";
import {
  calcularCascadaOrden,
  descuadreDelReparto,
  importeDeOrden,
  sumarLineas,
} from "@/lib/ordenes";

/**
 * Las cifras de estas pruebas NO son inventadas: salen de las ordenes reales
 * del cliente que hay en `docs/referencias/`. Si alguna deja de cuadrar, lo
 * que esta mal es el codigo, no la prueba.
 */

describe("lineas agrupadoras", () => {
  /**
   * OC 2026-07-00113, FCM INGENIEROS. Abre con "TOTAL ESTRUCTURAS 34,800.00"
   * y debajo van siete lineas que suman exactamente esa cifra. Sumar la lista
   * entera daria 69,600: el doble, sin ningun error visible.
   */
  const fcm = [
    { esAgrupador: true, importe: "34800.00" },
    { esAgrupador: false, importe: "3600.00" },
    { esAgrupador: false, importe: "8200.00" },
    { esAgrupador: false, importe: "6200.00" },
    { esAgrupador: false, importe: "2300.00" },
    { esAgrupador: false, importe: "6500.00" },
    { esAgrupador: false, importe: "6500.00" },
    { esAgrupador: false, importe: "1500.00" },
  ];

  it("descarta la cabecera que repite la suma de sus hijas", () => {
    expect(sumarLineas(fcm)).toBe("34800.00");
  });

  it("sumar en plano contaria el dinero dos veces", () => {
    const enPlano = fcm.reduce((t, l) => t + Number(l.importe), 0);
    expect(enPlano).toBe(69600);
  });

  it("una orden sin agrupadoras suma todas sus lineas", () => {
    expect(
      sumarLineas([
        { esAgrupador: false, importe: "1208.92" },
        { esAgrupador: false, importe: "7527.36" },
        { esAgrupador: false, importe: "2827.77" },
      ]),
    ).toBe("11564.05");
  });
});

describe("cascada de la orden", () => {
  /**
   * OC 2026-07-00118, CABREJO. Es el caso completo: lleva descuento
   * comercial, y el descuento existe para dejar un neto redondo.
   */
  it("reproduce la orden de CABREJO con su descuento", () => {
    const cascada = calcularCascadaOrden({
      subtotal: "11564.05",
      descuentoComercial: "564.05",
      porcentajeIgv: "0.18",
    });

    expect(cascada.neto).toBe("11000.00");
    expect(cascada.igv).toBe("1980.00");
    expect(cascada.total).toBe("12980.00");
  });

  /** OC 2026-07-00113, FCM: sin descuento. */
  it("reproduce la orden de FCM sin descuento", () => {
    const cascada = calcularCascadaOrden({
      subtotal: "34800.00",
      porcentajeIgv: "0.18",
    });

    expect(cascada.neto).toBe("34800.00");
    expect(cascada.igv).toBe("6264.00");
    expect(cascada.total).toBe("41064.00");
  });

  /** OC 2026-08-00124, SIV AIRE: la grande, con decimales que no son redondos. */
  it("reproduce la orden de SIV AIRE", () => {
    const cascada = calcularCascadaOrden({
      subtotal: "159450.51",
      porcentajeIgv: "0.18",
    });

    expect(cascada.neto).toBe("159450.51");
    expect(cascada.igv).toBe("28701.09");
    expect(cascada.total).toBe("188151.60");
  });

  it("el descuento se recibe en positivo y resta", () => {
    const cascada = calcularCascadaOrden({
      subtotal: "1000.00",
      descuentoComercial: "100.00",
      porcentajeIgv: "0.18",
    });

    expect(cascada.neto).toBe("900.00");
  });
});

describe("el reparto contra el presupuesto", () => {
  it("cuadra cuando las imputaciones suman el neto", () => {
    expect(descuadreDelReparto("11000.00", ["8000.00", "3000.00"])).toBeNull();
  });

  it("avisa cuando se reparte de menos, y de cuanto", () => {
    expect(descuadreDelReparto("11000.00", ["8000.00"])).toBe("-3000.00");
  });

  it("avisa cuando se reparte de mas", () => {
    expect(descuadreDelReparto("11000.00", ["8000.00", "4000.00"])).toBe("1000.00");
  });

  it("un reparto vacio descuadra por el neto entero", () => {
    expect(descuadreDelReparto("11000.00", [])).toBe("-11000.00");
  });

  /**
   * El comprometido se mide SIN IGV. Repartir el total en vez del neto
   * inflaria el costo de la obra con dinero que se recupera, y es un error
   * facil de cometer porque el total es la cifra que sale del banco.
   */
  it("repartir el TOTAL en vez del neto descuadra por el IGV", () => {
    expect(descuadreDelReparto("11000.00", ["12980.00"])).toBe("1980.00");
  });
});

describe("importes que llegan de un formulario", () => {
  it("acepta el formato peruano con separador de miles", () => {
    expect(importeDeOrden("11,564.05")).toBe("11564.05");
  });

  it("rechaza los negativos: una orden no lleva importes en negativo", () => {
    expect(importeDeOrden("-100")).toBeNull();
  });

  it("rechaza lo que no es un numero", () => {
    expect(importeDeOrden("once mil")).toBeNull();
    expect(importeDeOrden("")).toBeNull();
  });
});
