import { describe, it, expect } from "vitest";
import { calcularCascada, compararRevisiones } from "./presupuesto";

describe("calcularCascada", () => {
  it("reproduce el resumen final del presupuesto de CRIOCORD", () => {
    const c = calcularCascada({
      costoDirecto: "762077.15",
      descuentos: "-26821.60",
      porcentajeGastosGenerales: "0.12",
      porcentajeUtilidad: "0.13",
      porcentajeIgv: "0.18",
    });

    expect(c.subtotal).toBe("735255.55");
    expect(c.gastosGenerales).toBe("88230.67");
    expect(c.utilidad).toBe("95583.22");

    // El Excel muestra 919,069.43. La diferencia de un centimo viene de que
    // alli los importes arrastran mas decimales de los que se ven y solo se
    // redondean al mostrarlos.
    expect(c.presupuesto).toBe("919069.44");
  });

  it("un descuento resta aunque se escriba sin signo", () => {
    const conSigno = calcularCascada({
      costoDirecto: "1000.00",
      descuentos: "-100.00",
    });
    const sinSigno = calcularCascada({
      costoDirecto: "1000.00",
      descuentos: "100.00",
    });

    expect(conSigno.subtotal).toBe("900.00");
    expect(sinSigno.subtotal).toBe("900.00");
  });

  it("sin porcentajes, el presupuesto es el costo directo", () => {
    const c = calcularCascada({ costoDirecto: "500000.00" });

    expect(c.presupuesto).toBe("500000.00");
    expect(c.gastosGenerales).toBe("0.00");
    expect(c.igv).toBe("0.00");
  });

  it("no redondea en cada paso, solo al final", () => {
    // 1000.005 x 0.12 = 120.0006 y x 0.13 = 130.00065. Redondeando cada
    // paso a centimos daria 1250.01; encadenando la precision da 1250.00.
    const c = calcularCascada({
      costoDirecto: "1000.005",
      porcentajeGastosGenerales: "0.12",
      porcentajeUtilidad: "0.13",
    });

    expect(c.presupuesto).toBe("1250.01");
  });

  it("calcula el IGV sobre el presupuesto, no sobre el costo directo", () => {
    const c = calcularCascada({
      costoDirecto: "100000.00",
      porcentajeGastosGenerales: "0.10",
      porcentajeUtilidad: "0.10",
      porcentajeIgv: "0.18",
    });

    expect(c.presupuesto).toBe("120000.00");
    expect(c.igv).toBe("21600.00");
    expect(c.totalGeneral).toBe("141600.00");
  });
});

describe("compararRevisiones", () => {
  it("reproduce la diferencia entre las dos revisiones de CRIOCORD", () => {
    const r = compararRevisiones("952596.43", "919069.43", "3.46");

    expect(r.diferenciaSoles).toBe("33527.00");
    expect(r.diferenciaDolares).toBe("9689.88");
    expect(r.encarece).toBe(false);
  });

  it("detecta cuando la revision nueva encarece", () => {
    const r = compararRevisiones("100000.00", "120000.00");

    expect(r.diferenciaSoles).toBe("-20000.00");
    expect(r.encarece).toBe(true);
    expect(r.diferenciaDolares).toBeNull();
  });

  it("omite la columna en dolares si no hay tipo de cambio", () => {
    expect(compararRevisiones("100.00", "50.00").diferenciaDolares).toBeNull();
    expect(compararRevisiones("100.00", "50.00", "0").diferenciaDolares).toBeNull();
  });
});
