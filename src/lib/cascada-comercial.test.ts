import { describe, it, expect } from "vitest";
import {
  calcularCascadaComercial,
  calcularCascada,
} from "./presupuesto";

/** 10.000 de costo directo, 10% de GG y 10% de utilidad. */
const BASE = {
  costoDirecto: "10000.00",
  porcentajeGastosGenerales: "0.10",
  porcentajeUtilidad: "0.10",
};

describe("la cascada comercial", () => {
  it("calcula GG y utilidad sobre el COSTO DIRECTO", () => {
    const c = calcularCascadaComercial({ ...BASE, porcentajeIgv: "0" });

    expect(c.gastosGenerales).toBe("1000.00");
    expect(c.utilidad).toBe("1000.00");
    expect(c.subtotal).toBe("12000.00");
    expect(c.valorVenta).toBe("12000.00");
  });

  it("el descuento NO rebaja los gastos generales ni la utilidad", () => {
    const c = calcularCascadaComercial({
      ...BASE,
      porcentajeDescuento: "0.05",
      porcentajeIgv: "0",
    });

    // 5% de 12.000 = 600, y GG y utilidad siguen siendo 1.000 cada uno.
    expect(c.gastosGenerales).toBe("1000.00");
    expect(c.utilidad).toBe("1000.00");
    expect(c.descuento).toBe("-600.00");
    expect(c.valorVenta).toBe("11400.00");
  });

  it("es lo que la separa de la cascada vieja, que sigue intacta", () => {
    /**
     * En la v1 el descuento entraba ANTES y arrastraba a GG y utilidad.
     * Esta prueba fija que la vieja NO cambio: los contratos ya firmados se
     * calcularon con ella y guardan su total.
     */
    const vieja = calcularCascada({
      costoDirecto: "10000.00",
      descuentos: "-600.00",
      porcentajeGastosGenerales: "0.10",
      porcentajeUtilidad: "0.10",
      porcentajeIgv: "0",
    });

    // Sobre 9.400, no sobre 10.000.
    expect(vieja.gastosGenerales).toBe("940.00");
    expect(vieja.utilidad).toBe("940.00");
  });

  it("desglosa el IGV sobre el valor de venta", () => {
    const c = calcularCascadaComercial({ ...BASE, porcentajeIgv: "0.18" });

    expect(c.valorVenta).toBe("12000.00");
    expect(c.igv).toBe("2160.00");
    expect(c.precioVenta).toBe("14160.00");
  });

  it("sin IGV, el precio es el valor de venta", () => {
    const c = calcularCascadaComercial({ ...BASE, porcentajeIgv: "0" });

    expect(c.igv).toBe("0.00");
    expect(c.precioVenta).toBe("12000.00");
  });
});

describe("la retencion de renta del 8%", () => {
  const SIN_IGV = { ...BASE, porcentajeIgv: "0" };

  it("NINGUNA: ni aparece", () => {
    const c = calcularCascadaComercial(SIN_IGV);

    expect(c.retencionRenta).toBe("0.00");
    expect(c.netoARecibir).toBe("12000.00");
  });

  it("DESCONTADA: el precio no cambia, y abajo se lee lo que queda limpio", () => {
    const c = calcularCascadaComercial({
      ...SIN_IGV,
      retencion: { modo: "DESCONTADA", porcentaje: "0.08" },
    });

    expect(c.precioVenta).toBe("12000.00");
    expect(c.retencionRenta).toBe("960.00");
    expect(c.netoARecibir).toBe("11040.00");
  });

  it("SUMADA: el precio sube para que quede limpio lo pactado", () => {
    const c = calcularCascadaComercial({
      ...SIN_IGV,
      retencion: { modo: "SUMADA", porcentaje: "0.08" },
    });

    // 12.000 / 0,92 = 13.043,48
    expect(c.precioVenta).toBe("13043.48");

    /**
     * LA INVARIANTE que justifica el modo: despues de retener queda
     * exactamente lo que se queria cobrar. Si esto se rompe, el gross-up no
     * sirve para nada y el emisor cobra de menos sin enterarse.
     */
    expect(c.netoARecibir).toBe("12000.00");
  });

  it("una tasa imposible no inventa un precio", () => {
    // Retener el 100% dejaria una division entre cero: se cae a no inflar.
    const c = calcularCascadaComercial({
      ...SIN_IGV,
      retencion: { modo: "SUMADA", porcentaje: "1" },
    });

    expect(c.precioVenta).toBe("12000.00");
  });

  it("la retencion se calcula sobre el precio final, con IGV incluido", () => {
    const c = calcularCascadaComercial({
      ...BASE,
      porcentajeIgv: "0.18",
      retencion: { modo: "DESCONTADA", porcentaje: "0.08" },
    });

    expect(c.precioVenta).toBe("14160.00");
    expect(c.retencionRenta).toBe("1132.80");
  });
});

/**
 * Que una revision VIEJA se pueda imprimir sin que cambie de cifra.
 *
 * Las revisiones anteriores al 20/08 se guardaron con `calcularCascada` (v1)
 * y llevan `versionCascada: 1`. La propuesta imprimible las pasa por la
 * cascada comercial, que es la unica que sabe de descuento y de retencion.
 *
 * Eso solo vale si, con descuento cero y sin retencion, las dos dan lo mismo
 * hasta el centimo. Hoy coinciden porque las dos calculan GG y utilidad sobre
 * el costo directo NETO -el que ya lleva restadas las partidas negativas-.
 * Si algun dia una de las dos cambia de base, el papel que se le entrega al
 * cliente diria una cifra y la pantalla de revisiones otra, las dos sin dar
 * ningun error. De ahi esta prueba.
 */
describe("la cascada vieja y la comercial coinciden", () => {
  // Con decimales sucios a proposito: si alguna redondea en un paso
  // intermedio distinto, la diferencia aparece justo aqui.
  const COSTO = "850000.55";
  const DESCUENTOS = "-12345.67";
  const NETO = "837654.88";

  const vieja = calcularCascada({
    costoDirecto: COSTO,
    descuentos: DESCUENTOS,
    porcentajeGastosGenerales: "0.1000",
    porcentajeUtilidad: "0.0800",
    porcentajeIgv: "0.1800",
  });

  const nueva = calcularCascadaComercial({
    costoDirecto: NETO,
    porcentajeGastosGenerales: "0.1000",
    porcentajeUtilidad: "0.0800",
    porcentajeDescuento: "0",
    porcentajeIgv: "0.1800",
  });

  it("parte del mismo costo directo neto", () => {
    expect(vieja.subtotal).toBe(NETO);
    expect(nueva.costoDirecto).toBe(NETO);
  });

  it("da los mismos gastos generales y la misma utilidad", () => {
    expect(nueva.gastosGenerales).toBe(vieja.gastosGenerales);
    expect(nueva.utilidad).toBe(vieja.utilidad);
  });

  it("da el mismo presupuesto sin IGV", () => {
    // Es la cifra de control: la que se guarda en `montoTotal`.
    expect(nueva.valorVenta).toBe(vieja.presupuesto);
  });

  it("da el mismo IGV y el mismo total", () => {
    expect(nueva.igv).toBe(vieja.igv);
    expect(nueva.precioVenta).toBe(vieja.totalGeneral);
  });

  it("sin retencion, el neto a recibir es el total", () => {
    expect(nueva.netoARecibir).toBe(vieja.totalGeneral);
    expect(nueva.retencionRenta).toBe("0.00");
  });
});
