import { describe, it, expect } from "vitest";
import {
  calcularCascada,
  compararRevisiones,
  fraccionAPorcentaje,
  porcentajeAFraccion,
} from "./presupuesto";

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

  it("no invierte 'encarece' cuando la cifra nueva es negativa", async () => {
    // Antes se restaba con `sumar([anterior, `-${actual}`])`. Con un `actual`
    // negativo eso produce "--26821.60", que `sumar` DESCARTA en silencio y
    // devuelve el minuendo intacto: la diferencia salia 1000 en vez de
    // 27821,60 y, peor, `encarece` se calculaba sobre esa cifra falsa. Como
    // alimenta un booleano, el cuadro decia lo contrario de lo que pasaba.
    const r = compararRevisiones("1000.00", "-26821.60");

    expect(r.diferenciaSoles).toBe("27821.60");
    expect(r.encarece).toBe(false);
  });

  it("no da por encarecimiento una diferencia de cero", async () => {
    // `diferencia.startsWith("-")` daba true para "-0.00", que no es ningun
    // encarecimiento. Ahora se pregunta por el signo del numero, no del texto.
    const r = compararRevisiones("500.00", "500.00");

    expect(r.encarece).toBe(false);
  });
});

describe("porcentajeAFraccion", () => {
  it("convierte los porcentajes de CRIOCORD", () => {
    expect(porcentajeAFraccion("12")).toBe("0.1200");
    expect(porcentajeAFraccion("13")).toBe("0.1300");
    expect(porcentajeAFraccion("18")).toBe("0.1800");
  });

  it("no arrastra el ruido de la coma flotante", () => {
    // 12.1 / 100 en coma flotante da 0.12100000000000001.
    expect(porcentajeAFraccion("12.1")).toBe("0.1210");
    expect(porcentajeAFraccion("7.35")).toBe("0.0735");
  });

  it("acepta lo que se escribe en un formulario", () => {
    expect(porcentajeAFraccion(" 12 ")).toBe("0.1200");
    expect(porcentajeAFraccion("12,5")).toBe("0.1250");
    expect(porcentajeAFraccion("0")).toBe("0.0000");
  });

  it("rechaza lo que no es un numero", () => {
    expect(porcentajeAFraccion("")).toBeNull();
    expect(porcentajeAFraccion("doce")).toBeNull();
    expect(porcentajeAFraccion("12%")).toBeNull();
  });

  it("da la vuelta sin perder el valor", () => {
    for (const p of ["12", "13", "18", "12.5", "0", "7.35"]) {
      expect(fraccionAPorcentaje(porcentajeAFraccion(p)!)).toBe(p);
    }
  });
});

describe("fraccionAPorcentaje", () => {
  it("recorta los ceros de relleno", () => {
    expect(fraccionAPorcentaje("0.1200")).toBe("12");
    expect(fraccionAPorcentaje("0.1250")).toBe("12.5");
    expect(fraccionAPorcentaje("0.0000")).toBe("0");
  });
});
