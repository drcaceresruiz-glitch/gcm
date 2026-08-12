import { describe, it, expect } from "vitest";
import { cumplidoPorCantidad, cumplidoAlCerrar } from "./cierre-cantidad";

describe("cumplidoPorCantidad", () => {
  it("llegar a la cantidad comprometida es cumplir", () => {
    expect(cumplidoPorCantidad("120", "120")).toBe(true);
  });

  it("pasarse tambien es cumplir", () => {
    expect(cumplidoPorCantidad("120", "135.5")).toBe(true);
  });

  it("quedarse corto NO es cumplir, aunque sea por poco", () => {
    // Misma dureza que el PPC: una tarea a medias cuenta como no cumplida.
    // Una tolerancia del 95% convertiria el indicador en otra cosa sin avisar.
    expect(cumplidoPorCantidad("120", "119")).toBe(false);
    expect(cumplidoPorCantidad("120", "119.9999")).toBe(false);
  });

  it("compara con la precision del esquema, sin flotantes", () => {
    expect(cumplidoPorCantidad("0.3", "0.3000")).toBe(true);
    expect(cumplidoPorCantidad("0.3", "0.2999")).toBe(false);
  });

  describe("devuelve null cuando no hay con que deducir", () => {
    it("sin cantidad comprometida", () => {
      expect(cumplidoPorCantidad(null, "90")).toBeNull();
      expect(cumplidoPorCantidad(undefined, "90")).toBeNull();
    });

    it("sin cantidad ejecutada", () => {
      expect(cumplidoPorCantidad("120", null)).toBeNull();
    });

    it("con una meta de cero: cualquier cosa la superaria", () => {
      expect(cumplidoPorCantidad("0", "0")).toBeNull();
      expect(cumplidoPorCantidad("-5", "0")).toBeNull();
    });

    it("con un dato ilegible, decide la persona", () => {
      expect(cumplidoPorCantidad("120", "no es un numero")).toBeNull();
    });
  });
});

describe("cumplidoAlCerrar", () => {
  it("la cantidad manda sobre la casilla cuando la hay", () => {
    // El caso que esto existe para impedir: «30 de 120 m2, cumplido».
    expect(
      cumplidoAlCerrar({ marcado: true, cantidadPlan: "120", cantidadEjec: "30" }),
    ).toBe(false);
  });

  it("y tambien al reves: 120 de 120 sin marcar es cumplido", () => {
    expect(
      cumplidoAlCerrar({
        marcado: false,
        cantidadPlan: "120",
        cantidadEjec: "120",
      }),
    ).toBe(true);
  });

  it("sin cantidades, manda la casilla", () => {
    expect(
      cumplidoAlCerrar({ marcado: true, cantidadPlan: null, cantidadEjec: null }),
    ).toBe(true);
    expect(
      cumplidoAlCerrar({ marcado: false, cantidadPlan: null, cantidadEjec: null }),
    ).toBe(false);
  });

  it("comprometido por cantidad pero aun sin ejecutada, manda la casilla", () => {
    // Se cerro sin escribir el numero: no se inventa nada.
    expect(
      cumplidoAlCerrar({ marcado: true, cantidadPlan: "120", cantidadEjec: null }),
    ).toBe(true);
  });
});
