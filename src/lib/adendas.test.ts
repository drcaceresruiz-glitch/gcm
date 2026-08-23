import { describe, expect, it } from "vitest";

import {
  importeDeValorizacion,
  importeSobre,
  montoVigente,
  resumenAdendas,
  type AdendaContada,
} from "@/lib/adendas";

const ad = (importe: string, estado: AdendaContada["estado"] = "APROBADA") =>
  ({ importe, estado }) satisfies AdendaContada;

describe("lo que vale el contrato hoy", () => {
  it("un adicional lo sube", () => {
    expect(montoVigente("50000.00", [ad("8000.00")])).toBe("58000.00");
  });

  it("un deductivo lo baja: el importe lleva signo", () => {
    // Alcance que al final no ejecuta -el cliente lo quita, se le da a otro o
    // se hace con personal propio-. Es el caso que antes se resolvia editando
    // el monto a mano, que es el agujero que esto tapa.
    expect(montoVigente("50000.00", [ad("-12000.00")])).toBe("38000.00");
  });

  it("varias se acumulan, en cualquier orden", () => {
    const monto = montoVigente("50000.00", [ad("8000.00"), ad("-12000.00")]);
    expect(monto).toBe("46000.00");
  });

  it("sin adendas es lo firmado, ni un centimo mas", () => {
    expect(montoVigente("50000.00", [])).toBe("50000.00");
  });
});

describe("una adenda PENDIENTE no es dinero comprometido", () => {
  it("no entra en el monto vigente", () => {
    /*
     * Es una peticion del contratista, no un compromiso: gerencia todavia
     * puede rechazarla. Contarla inflaria el comprometido de la obra con
     * plata que quiza no se pague, y ese numero se usa para decidir.
     */
    const soloAprobadas = [ad("8000.00")];
    expect(montoVigente("50000.00", soloAprobadas)).toBe("58000.00");

    const r = resumenAdendas([ad("8000.00"), ad("30000.00", "PENDIENTE")]);
    expect(r.neto).toBe("8000.00");
    expect(r.pendientes).toBe(1);
    // Pero SI se dice cuanto suman: «hay una pendiente» no mueve a nadie,
    // «hay 30.000 esperando tu firma» si.
    expect(r.importePendiente).toBe("30000.00");
  });

  it("una RECHAZADA no cuenta ni como pendiente", () => {
    const r = resumenAdendas([ad("8000.00", "RECHAZADA")]);

    expect(r.neto).toBe("0.00");
    expect(r.pendientes).toBe(0);
    expect(r.importePendiente).toBe("0.00");
  });
});

describe("el desglose que se enseña", () => {
  it("separa adicionales de deductivos, y los deductivos en positivo", () => {
    // Un deductivo se lee «se le quitaron 12.000», no «-12.000».
    const r = resumenAdendas([ad("8000.00"), ad("-12000.00"), ad("2000.00")]);

    expect(r.adicionales).toBe("10000.00");
    expect(r.deductivos).toBe("12000.00");
    expect(r.neto).toBe("-2000.00");
  });

  it("sin adendas, todo a cero y sin inventar signos", () => {
    const r = resumenAdendas([]);

    expect(r.neto).toBe("0.00");
    expect(r.adicionales).toBe("0.00");
    expect(r.deductivos).toBe("0.00");
  });
});

describe("una valorizacion no se revalua hacia atras", () => {
  /*
   * EL FALLO QUE ESTO ARREGLA. Con el contrato inmutable no se notaba: el
   * importe se recalculaba siempre contra el monto de hoy y el monto de hoy
   * era el de siempre. En cuanto el contrato puede cambiar, el pasado se
   * mueve solo.
   */
  it("vale lo que valia el dia del corte, aunque el contrato baje", () => {
    const corte = { porcentaje: "60.000", importe: "30000.00" };

    // El contrato baja a 38.000 por un deductivo. La valorizacion NO se mueve.
    expect(importeDeValorizacion(corte, "50000.00")).toBe("30000.00");
    expect(importeSobre("38000.00", "60.000")).toBe("22800.00");
  });

  it("tampoco sube cuando entra un adicional", () => {
    // El otro lado del mismo fallo, y el mas facil de pasar por alto: un
    // adicional le subiria retroactivamente lo ya valorizado.
    const corte = { porcentaje: "60.000", importe: "30000.00" };
    expect(importeDeValorizacion(corte, "58000.00")).toBe("30000.00");
  });

  it("una valorizacion vieja, sin importe, cae al calculo de siempre", () => {
    // Las anteriores a la columna. Se calculan contra el CONTRATADO y no
    // contra el vigente: son de antes de que hubiera ninguna adenda, asi que
    // el contratado es el vigente que tenian.
    const vieja = { porcentaje: "60.000", importe: null };
    expect(importeDeValorizacion(vieja, "50000.00")).toBe("30000.00");
  });
});

describe("aritmetica de dinero", () => {
  it("no arrastra el ruido de la coma flotante", () => {
    expect(montoVigente("0.10", [ad("0.20")])).toBe("0.30");
  });

  it("un porcentaje con decimales sale a centimos exactos", () => {
    expect(importeSobre("50000.00", "33.333")).toBe("16666.50");
  });
});
