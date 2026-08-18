import { describe, expect, it } from "vitest";

import { calcularBolsa } from "@/lib/bolsa";

/**
 * El criterio de la obra sobre los gastos generales.
 *
 * En la practica del usuario, los gastos generales (y la utilidad) NO son del
 * presupuesto que gestiona la obra: solo se tocan si el gerente general
 * autoriza pasar dinero de ahi para cubrir un comprometido cuando la bolsa ya
 * se agoto. Pero eso cambia de un contrato a otro, asi que lo decide cada
 * obra.
 *
 * Lo que hay que sostener aqui es que el criterio cambia la BOLSA sin tocar
 * los DATOS: los gastos generales se devuelven igual en los dos casos, porque
 * se cargaron y se guardaron, y la pantalla los sigue enseñando.
 */

const BASE = {
  modo: "PARTIDA" as const,
  contractual: [{ codigo: "1.1", descripcion: "Concreto", importe: "100000.00" }],
  meta: [{ codigoRef: "1.1", descripcion: "Concreto", importe: "79000.00" }],
  gastosGeneralesContractual: "12000.00",
  gastosGeneralesMeta: "9000.00",
  utilidadContractual: "8000.00",
};

describe("los gastos generales entran en la bolsa", () => {
  it("con el criterio ENCENDIDO, la bolsa suma produccion y plazo", () => {
    const b = calcularBolsa({ ...BASE, incluyeGastosGenerales: true });

    expect(b.bolsaProduccion).toBe("21000.00");
    expect(b.bolsaPlazo).toBe("3000.00");
    expect(b.bolsaTotal).toBe("24000.00");
    expect(b.incluyeGastosGenerales).toBe(true);
  });

  it("con el criterio APAGADO, la bolsa es solo la de produccion", () => {
    const b = calcularBolsa({ ...BASE, incluyeGastosGenerales: false });

    expect(b.bolsaProduccion).toBe("21000.00");
    expect(b.bolsaPlazo).toBe("0.00");
    expect(b.bolsaTotal).toBe("21000.00");
    expect(b.incluyeGastosGenerales).toBe(false);
  });

  it("apagado NO borra los gastos generales: solo los saca del calculo", () => {
    // Es la diferencia entre un criterio de presentacion y uno de datos. Si
    // los borrara, el aviso de sobrecosto por atraso —que sale de ellos— se
    // quedaria sin con que medir, y ese aviso sigue siendo cierto.
    const b = calcularBolsa({ ...BASE, incluyeGastosGenerales: false });

    expect(b.gastosGeneralesContractual).toBe("12000.00");
    expect(b.gastosGeneralesMeta).toBe("9000.00");
  });

  it("sin criterio se calcula como siempre: nadie cambia de cifra por omision", () => {
    // Quien no pase el dato —una obra sin decidir todavia— tiene que ver
    // exactamente lo mismo que antes de que este ajuste existiera.
    const sinDecir = calcularBolsa(BASE);
    const encendido = calcularBolsa({ ...BASE, incluyeGastosGenerales: true });

    expect(sinDecir.bolsaTotal).toBe(encendido.bolsaTotal);
    expect(sinDecir.incluyeGastosGenerales).toBe(true);
  });

  it("la utilidad no depende del criterio: nunca fue bolsa", () => {
    // La utilidad se enseña aparte y no es gastable, con criterio o sin el.
    const apagado = calcularBolsa({ ...BASE, incluyeGastosGenerales: false });

    expect(apagado.utilidadContractual).toBe("8000.00");
    expect(apagado.margenEsperado).toBe("29000.00");
  });
});
