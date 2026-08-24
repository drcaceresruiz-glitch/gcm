import { describe, expect, it } from "vitest";

import {
  deducidoPorItem,
  importeVigenteDeLinea,
  resumenDeducciones,
  validarDeduccion,
  type DeduccionContada,
  type LineaParaDeducir,
} from "@/lib/deducciones";

/**
 * Deducir un costo propio de la meta congelada.
 *
 * PEDIDO ASI: «que el residente y/o el administrador de la obra pueda
 * solicitar deducir monto de los gastos generales, se le presenta al gerente
 * general y si este lo aprueba perfecto, se hacen todos los ajustes».
 *
 * Lo que se prueba aqui son las tres formas de romper la bolsa que las reglas
 * tapan, no la aritmetica -esa ya esta probada en `lib/decimal`-.
 */

const d = (
  metaItemId: string,
  importe: string,
  estado: DeduccionContada["estado"] = "APROBADA",
) => ({ metaItemId, importe, estado }) satisfies DeduccionContada;

const ALQUILER: LineaParaDeducir = {
  codigoRef: null,
  descripcion: "Alquiler de andamios",
  presupuestado: "40000.00",
  deducido: "0.00",
};

describe("cuanto se ha deducido ya de cada linea", () => {
  it("suma las aprobadas de la misma linea", () => {
    const mapa = deducidoPorItem([d("a", "5000.00"), d("a", "3000.00")]);
    expect(mapa.get("a")).toBe("8000.00");
  });

  /**
   * Una PENDIENTE es una peticion, no una decision. Contarla subiria la bolsa
   * con dinero que gerencia todavia puede negar, y contra esa bolsa se decide
   * si se aprieta o no. Es la misma regla que ya rige las adendas.
   */
  it("una pendiente no cuenta, y una rechazada tampoco", () => {
    const mapa = deducidoPorItem([
      d("a", "5000.00"),
      d("a", "9000.00", "PENDIENTE"),
      d("a", "1000.00", "RECHAZADA"),
    ]);
    expect(mapa.get("a")).toBe("5000.00");
  });

  it("no mezcla lineas distintas", () => {
    const mapa = deducidoPorItem([d("a", "5000.00"), d("b", "2000.00")]);
    expect(mapa.get("a")).toBe("5000.00");
    expect(mapa.get("b")).toBe("2000.00");
  });

  it("una linea sin deducciones no aparece en el mapa", () => {
    // Y no aparece con un cero: «no hay ninguna» y «hay una de cero» no son lo
    // mismo, y quien lee el mapa cae al presupuestado entero.
    expect(deducidoPorItem([]).get("a")).toBeUndefined();
  });
});

describe("el resumen que se enseña", () => {
  it("separa lo firmado de lo que espera firma, con su importe", () => {
    const r = resumenDeducciones([
      d("a", "5000.00"),
      d("b", "7000.00", "PENDIENTE"),
      d("c", "1000.00", "RECHAZADA"),
    ]);

    expect(r.aprobado).toBe("5000.00");
    expect(r.pendientes).toBe(1);
    // «Hay una pendiente» no mueve a nadie; «hay 7.000 esperando tu firma» si.
    expect(r.importePendiente).toBe("7000.00");
  });

  it("sin ninguna, todo a cero y sin inventar nada", () => {
    const r = resumenDeducciones([]);
    expect(r.aprobado).toBe("0.00");
    expect(r.pendientes).toBe(0);
    expect(r.importePendiente).toBe("0.00");
  });
});

describe("lo que la linea vale hoy", () => {
  it("es lo presupuestado menos lo deducido", () => {
    expect(importeVigenteDeLinea("40000.00", "8000.00")).toBe("32000.00");
  });

  it("sin deducir es lo presupuestado, ni un centimo menos", () => {
    expect(importeVigenteDeLinea("40000.00", "0.00")).toBe("40000.00");
  });
});

describe("de que se puede deducir", () => {
  /**
   * SOLO DE UN COSTO PROPIO, y esta es la regla que sostiene el resto.
   *
   * Un costo propio es una decision de la empresa -cuantos meses se alquila el
   * andamio- y por eso se puede decidir gastar menos. El costo de una partida
   * lo dicta la obra: «deducirlo» no seria decidir nada, seria bajar el plan
   * para que cuadre con lo que esta pasando, que es justo lo que la meta
   * congelada existe para impedir.
   */
  it("de una partida NO: eso seria reescribir el plan", () => {
    const partida: LineaParaDeducir = {
      codigoRef: "3.2",
      descripcion: "Concreto f'c=210",
      presupuestado: "90000.00",
      deducido: "0.00",
    };

    const error = validarDeduccion(partida, {
      importe: "5000.00",
      motivo: "creemos que saldra mas barato",
    });

    expect(error).toContain("costo propio");
    expect(error).toContain("reescribir el plan");
  });

  it("de un costo propio si", () => {
    expect(
      validarDeduccion(ALQUILER, {
        importe: "8000.00",
        motivo: "Se devuelve en octubre y no en diciembre.",
      }),
    ).toBeNull();
  });
});

describe("cuanto se puede deducir", () => {
  /**
   * Deducir 50.000 de un alquiler de 40.000 no es ahorrar 50.000: es inventar
   * 10.000 de bolsa. Sin este tope, la deduccion seria una palanca para
   * cuadrar cualquier numero.
   */
  it("no mas de lo que la linea vale", () => {
    const error = validarDeduccion(ALQUILER, {
      importe: "50000.00",
      motivo: "x",
    });
    expect(error).toContain("solo quedan");
  });

  it("justo lo que vale si, hasta el ultimo centimo", () => {
    expect(
      validarDeduccion(ALQUILER, { importe: "40000.00", motivo: "No se alquila." }),
    ).toBeNull();
  });

  /**
   * Y se compara contra lo que QUEDA, no contra lo presupuestado. Sin esto,
   * dos deducciones de 30.000 sobre una linea de 40.000 pasarian las dos por
   * separado y juntas inventarian 20.000.
   */
  it("cuenta lo ya deducido, no solo esta", () => {
    const yaTocada: LineaParaDeducir = { ...ALQUILER, deducido: "30000.00" };

    const error = validarDeduccion(yaTocada, { importe: "30000.00", motivo: "x" });
    expect(error).toContain("solo quedan");
    // Y lo dice: «ya se dedujeron 30.000». Sin eso, quien lo lee no entiende
    // por que de un alquiler de 40.000 no puede deducir 30.000.
    expect(error).toContain("30000.00");

    expect(
      validarDeduccion(yaTocada, { importe: "10000.00", motivo: "El resto." }),
    ).toBeNull();
  });
});

describe("lo que no es una deduccion", () => {
  /**
   * El importe se guarda SIN SIGNO: es «cuanto se deja de gastar». Admitir
   * negativos convertiria esta tabla en una forma de SUBIR un costo propio a
   * espaldas de la meta congelada, que es otra cosa y con otra conversacion.
   */
  it("un negativo no es una deduccion: es subir el costo por la puerta de atras", () => {
    const error = validarDeduccion(ALQUILER, { importe: "-8000.00", motivo: "x" });
    expect(error).toContain("positivo");
    expect(error).toContain("versión nueva");
  });

  it("cero no ajusta nada", () => {
    expect(
      validarDeduccion(ALQUILER, { importe: "0.00", motivo: "x" }),
    ).toContain("positivo");
  });

  it("un importe que no es numero se rechaza antes que nada", () => {
    expect(
      validarDeduccion(ALQUILER, { importe: "ocho mil", motivo: "x" }),
    ).toContain("no es un número");
  });

  /**
   * EL MOTIVO ES LA MITAD DEL CIRCUITO. Una deduccion no es dinero
   * encontrado: es un compromiso de no gastarlo, y alguien tiene que poder
   * comprobar despues que se cumplio. Sin motivo, esto seria una palanca para
   * cuadrar la bolsa cuando se pone fea.
   */
  it("sin motivo no se pide", () => {
    const error = validarDeduccion(ALQUILER, { importe: "8000.00", motivo: "   " });
    expect(error).toContain("Falta el motivo");
    expect(error).toContain("compromiso de no gastarlo");
  });
});

describe("aritmetica de dinero", () => {
  it("no arrastra el ruido de la coma flotante", () => {
    expect(importeVigenteDeLinea("0.30", "0.10")).toBe("0.20");
    expect(deducidoPorItem([d("a", "0.10"), d("a", "0.20")]).get("a")).toBe("0.30");
  });
});
