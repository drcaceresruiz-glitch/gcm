import { describe, expect, it } from "vitest";

import { hayDeficitDeEstructura, salidasDelDeficit } from "@/lib/bolsa";

/**
 * El deficit de estructura: los gastos generales cuestan mas de lo que el
 * contrato reconoce.
 *
 * Regla de negocio del usuario (19/08): una obra NO puede perder dinero, NO
 * puede tocar su utilidad, y un presupuesto ya firmado NO se vuelve a
 * presupuestar de cara al cliente. De ahi que solo existan tres salidas, y que
 * el sistema tenga que cuantificarlas en vez de limitarse a avisar: sin
 * numeros, «recorta gastos generales» no es una instruccion.
 */

describe("hay deficit de estructura", () => {
  it("negativo es deficit: la empresa pone la diferencia", () => {
    expect(
      hayDeficitDeEstructura({ resultadoGastosGenerales: "-37169.33" }),
    ).toBe(true);
  });

  it("positivo no lo es: sobra de lo contratado", () => {
    expect(hayDeficitDeEstructura({ resultadoGastosGenerales: "3000.00" })).toBe(
      false,
    );
  });

  it("cero tampoco: cuadra exacto", () => {
    expect(hayDeficitDeEstructura({ resultadoGastosGenerales: "0.00" })).toBe(
      false,
    );
  });
});

describe("las tres salidas, con su numero", () => {
  it("dice cuanto falta, en positivo", () => {
    // El aviso escribe «Faltan X»: con el signo puesto se leeria «faltan -X».
    const s = salidasDelDeficit({
      resultadoGastosGenerales: "-37169.33",
      bolsaProduccion: "719777.61",
      costoDirectoContractual: "735255.61",
      gastosGeneralesContractual: "88530.67",
    });

    expect(s.falta).toBe("37169.33");
  });

  it("avisa cuando la bolsa de produccion SI da para cubrirlo", () => {
    const s = salidasDelDeficit({
      resultadoGastosGenerales: "-37169.33",
      bolsaProduccion: "719777.61",
      costoDirectoContractual: "735255.61",
      gastosGeneralesContractual: "88530.67",
    });

    expect(s.laCubreLaProduccion).toBe(true);
    expect(s.bolsaDespues).toBe("682608.28");
  });

  it("y cuando NO da, que es el caso grave", () => {
    // Aqui la obra pierde dinero haga lo que haga con la bolsa: es cuando de
    // verdad hay que recortar o pedir adicional.
    const s = salidasDelDeficit({
      resultadoGastosGenerales: "-41309.00",
      bolsaProduccion: "3031.00",
      costoDirectoContractual: "18509.00",
      gastosGeneralesContractual: "2776.35",
    });

    expect(s.laCubreLaProduccion).toBe(false);
    expect(s.bolsaDespues).toBe("-38278.00");
  });

  it("calcula de cuanto tendria que ser el adicional al contrato", () => {
    // El contrato reconoce los gastos generales como un % del costo directo,
    // asi que para subirlos en X hay que ampliar el contrato en X/%. Con un %
    // bajo la cifra se dispara, y verlo es lo que dice si esa via es realista.
    const s = salidasDelDeficit({
      resultadoGastosGenerales: "-37169.33",
      bolsaProduccion: "719777.61",
      costoDirectoContractual: "735255.61",
      gastosGeneralesContractual: "88530.67",
    });

    // 37.169,33 x (735.255,61 / 88.530,67) = 308.694,82
    expect(s.adicionalNecesario).toBe("308694.82");
  });

  it("sin gastos generales contractuales no se inventa un adicional", () => {
    // Sin porcentaje del que tirar, la cuenta no existe. Devolver un numero
    // cualquiera seria peor que no dar ninguno.
    const s = salidasDelDeficit({
      resultadoGastosGenerales: "-1000.00",
      bolsaProduccion: "0.00",
      costoDirectoContractual: "50000.00",
      gastosGeneralesContractual: "0.00",
    });

    expect(s.adicionalNecesario).toBeNull();
  });
});
