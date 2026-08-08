import { describe, expect, it } from "vitest";
import {
  calcularCascadaOrden,
  descuadreDelReparto,
  etiquetaImpuesto,
  importeDeOrden,
  importeImputable,
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
    expect(cascada.impuesto).toBe("1980.00");
    expect(cascada.total).toBe("12980.00");
  });

  /** OC 2026-07-00113, FCM: sin descuento. */
  it("reproduce la orden de FCM sin descuento", () => {
    const cascada = calcularCascadaOrden({
      subtotal: "34800.00",
      porcentajeIgv: "0.18",
    });

    expect(cascada.neto).toBe("34800.00");
    expect(cascada.impuesto).toBe("6264.00");
    expect(cascada.total).toBe("41064.00");
  });

  /** OC 2026-08-00124, SIV AIRE: la grande, con decimales que no son redondos. */
  it("reproduce la orden de SIV AIRE", () => {
    const cascada = calcularCascadaOrden({
      subtotal: "159450.51",
      porcentajeIgv: "0.18",
    });

    expect(cascada.neto).toBe("159450.51");
    expect(cascada.impuesto).toBe("28701.09");
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

/**
 * La retencion de renta, que es lo contrario del IGV en lo que importa: no se
 * recupera, asi que ES costo de obra.
 *
 * Las cifras salen de las ordenes reales de PEDRO MENDOZA y RUBEN DARIO.
 */
describe("ordenes con retencion de renta", () => {
  /** OC 2026-07-00115: 2,000 limpios para el proveedor. */
  it("eleva el total para que al proveedor le quede el neto pactado", () => {
    const cascada = calcularCascadaOrden({
      subtotal: "2000.00",
      tipoImpuesto: "RENTA",
      porcentajeIgv: "0.08",
    });

    expect(cascada.neto).toBe("2000.00");
    expect(cascada.impuesto).toBe("173.91");
    expect(cascada.total).toBe("2173.91");
  });

  /** OC 2026-07-00119: con descuento comercial de por medio. */
  it("reproduce la orden de RUBEN DARIO, descuento incluido", () => {
    const cascada = calcularCascadaOrden({
      subtotal: "32000.00",
      descuentoComercial: "3000.00",
      tipoImpuesto: "RENTA",
      porcentajeIgv: "0.08",
    });

    expect(cascada.neto).toBe("29000.00");
    expect(cascada.impuesto).toBe("2521.74");
    expect(cascada.total).toBe("31521.74");
  });

  it("la retencion es el 8% del TOTAL, no del neto", () => {
    // Calcularla como el IGV daria 2,320.00 y al proveedor le faltarian
    // 201.74. Esta es la prueba que impide volver a ese error.
    const comoSiFueraIgv = calcularCascadaOrden({
      subtotal: "29000.00",
      tipoImpuesto: "IGV",
      porcentajeIgv: "0.08",
    });

    expect(comoSiFueraIgv.impuesto).toBe("2320.00");
    expect(comoSiFueraIgv.impuesto).not.toBe("2521.74");
  });

  it("total menos retencion devuelve el neto EXACTO", () => {
    // La retencion se calcula como diferencia justo para esto: que no quede
    // un centimo de desvio entre lo pactado y lo que cobra el proveedor.
    const cascada = calcularCascadaOrden({
      subtotal: "1234.57",
      tipoImpuesto: "RENTA",
      porcentajeIgv: "0.08",
    });

    expect(sumarLineas([
      { esAgrupador: false, importe: cascada.total },
      { esAgrupador: false, importe: `-${cascada.impuesto}` },
    ])).toBe(cascada.neto);
  });

  it("sin impuesto, el total iguala al neto", () => {
    // OC 2026-07-00114: la casilla del IR viene vacia y el total es el
    // subtotal.
    const cascada = calcularCascadaOrden({
      subtotal: "1000.00",
      tipoImpuesto: "NINGUNO",
      porcentajeIgv: "0.08",
    });

    expect(cascada.impuesto).toBe("0.00");
    expect(cascada.total).toBe("1000.00");
  });
});

describe("contra que cifra cuenta cada orden", () => {
  it("con IGV se imputa el neto, porque el impuesto se recupera", () => {
    expect(
      importeImputable({
        tipoImpuesto: "IGV",
        neto: "11000.00",
        total: "12980.00",
      }),
    ).toBe("11000.00");
  });

  it("con retencion se imputa el TOTAL, porque no se recupera", () => {
    // Los 2,521.74 de retencion son costo de obra: salen del banco y no
    // vuelven. Imputar el neto los dejaria fuera.
    expect(
      importeImputable({
        tipoImpuesto: "RENTA",
        neto: "29000.00",
        total: "31521.74",
      }),
    ).toBe("31521.74");
  });

  it("sin impuesto da igual, porque neto y total coinciden", () => {
    expect(
      importeImputable({
        tipoImpuesto: "NINGUNO",
        neto: "1000.00",
        total: "1000.00",
      }),
    ).toBe("1000.00");
  });
});

describe("etiqueta del impuesto en el documento impreso", () => {
  const conIgv = (neto: string, impuesto: string, total: string) =>
    etiquetaImpuesto("IGV", { neto, impuesto, total });

  it("deduce el 18% de las tres ordenes reales con IGV", () => {
    expect(conIgv("11000.00", "1980.00", "12980.00")).toBe("IGV 18%");
    expect(conIgv("159450.51", "28701.09", "188151.60")).toBe("IGV 18%");
    expect(conIgv("34800.00", "6264.00", "41064.00")).toBe("IGV 18%");
  });

  it("deduce el 8% de las de retencion, contra el total", () => {
    // Deducirlo contra el neto daria 8.7% y el papel dice 8%.
    expect(
      etiquetaImpuesto("RENTA", {
        neto: "29000.00",
        impuesto: "2521.74",
        total: "31521.74",
      }),
    ).toBe("IR 8%");
  });

  it("tolera el redondeo del importe del impuesto", () => {
    // El impuesto se guarda a dos decimales, asi que la tasa deducida casi
    // nunca da entera: SIV AIRE sale 17.99994% y este caso, 18.0018%.
    expect(conIgv("33.33", "6.00", "39.33")).toBe("IGV 18%");
  });

  it("omite el porcentaje antes que declarar uno falso", () => {
    // Una tasa que no es reconociblemente entera no se imprime: es un
    // documento que sale a un tercero.
    expect(conIgv("1000.00", "155.00", "1155.00")).toBe("IGV");
  });

  it("no divide entre cero ni imprime tasas imposibles", () => {
    expect(conIgv("0.00", "0.00", "0.00")).toBe("IGV");
    expect(conIgv("1000.00", "0.00", "1000.00")).toBe("IGV");
    expect(conIgv("no es un numero", "180.00", "1180.00")).toBe("IGV");
  });
});
