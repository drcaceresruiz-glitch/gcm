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
