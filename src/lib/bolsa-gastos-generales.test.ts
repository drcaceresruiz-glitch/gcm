import { describe, expect, it } from "vitest";

import { gastosGeneralesInverosimiles, calcularBolsa } from "@/lib/bolsa";

/**
 * El aviso que faltaba para que una bolsa rota se distinga de una obra que
 * pierde dinero.
 *
 * Sale de un caso real: una meta con S/ 15.478 de costo directo y una bolsa
 * de plazo de -S/ 122.923. La resta era correcta —`gastos generales del
 * contrato menos los de la meta`— pero ninguna de las dos cifras se pintaba
 * en la pantalla, asi que el numero aparecia de la nada y no habia forma de
 * rastrearlo.
 */

describe("gastos generales que no pueden ser", () => {
  it("avisa cuando los gastos generales de la meta superan su costo directo", () => {
    // El caso real: gastos generales ocho veces el costo directo. En obra son
    // una fraccion de el, asi que esto es una fila mal cargada.
    expect(
      gastosGeneralesInverosimiles({
        costoDirectoMeta: "15478.00",
        gastosGeneralesMeta: "125000.00",
      }),
    ).toBe(true);
  });

  it("una proporcion normal no avisa", () => {
    // 12 % sobre el costo directo: lo corriente. Si esto avisara, el aviso
    // saldria siempre y dejaria de leerse.
    expect(
      gastosGeneralesInverosimiles({
        costoDirectoMeta: "15478.00",
        gastosGeneralesMeta: "1857.36",
      }),
    ).toBe(false);
  });

  it("el borde: iguales NO avisa", () => {
    // Se avisa cuando SUPERAN, no cuando empatan. Un empate es rarisimo pero
    // no es imposible, y el aviso dice literalmente «superan».
    expect(
      gastosGeneralesInverosimiles({
        costoDirectoMeta: "10000.00",
        gastosGeneralesMeta: "10000.00",
      }),
    ).toBe(false);
  });

  it("con costo directo cero se calla", () => {
    // Una meta a medio cargar no tiene por que gritar: sin costo directo no
    // hay proporcion que juzgar, y cualquier gasto general la superaria.
    expect(
      gastosGeneralesInverosimiles({
        costoDirectoMeta: "0.00",
        gastosGeneralesMeta: "500.00",
      }),
    ).toBe(false);
  });
});

describe("la bolsa de plazo sigue siendo lo que dice ser", () => {
  it("es la resta de los dos gastos generales, y ahora ambos viajan a la pantalla", () => {
    // La pantalla pinta `gastosGeneralesContractual` y `gastosGeneralesMeta`
    // como filas propias. Esta prueba fija que el calculo los expone: si
    // alguien los quitara del resultado, la pantalla dejaria de cuadrar.
    const b = calcularBolsa({
      modo: "PARTIDA",
      contractual: [{ codigo: "1.1", descripcion: "Concreto", importe: "18509.00" }],
      meta: [{ codigoRef: "1.1", descripcion: "Concreto", importe: "15478.00" }],
      gastosGeneralesContractual: "2076.65",
      gastosGeneralesMeta: "125000.30",
      utilidadContractual: "2221.08",
    });

    expect(b.bolsaProduccion).toBe("3031.00");
    expect(b.gastosGeneralesContractual).toBe("2076.65");
    expect(b.gastosGeneralesMeta).toBe("125000.30");
    expect(b.bolsaPlazo).toBe("-122923.65");

    // Y el aviso salta con esas mismas cifras.
    expect(gastosGeneralesInverosimiles(b)).toBe(true);
  });
});
