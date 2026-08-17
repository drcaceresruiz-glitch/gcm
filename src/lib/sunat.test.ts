import { describe, expect, it } from "vitest";

import { cuerpoUtil, leerRazonSocial, leerTexto } from "./sunat";

/** Como contesta json.pe: envuelto en `data`, y con su propio nombre. */
const DE_JSONPE = {
  success: true,
  message: "exito",
  data: {
    ruc: "20552103816",
    nombre_o_razon_social: "AGROLIGHT PERU S.A.C.",
    estado: "SUSPENSION TEMPORAL",
    condicion: "HABIDO",
    direccion: "PJ. JORGE BASADRE NRO. 158 URB. POP LA UNIVERSAL 2DA ET.",
  },
};

/** Como contesta decolecta: los campos sueltos. */
const DE_DECOLECTA = {
  razon_social: "AGROLIGHT PERU S.A.C.",
  estado: "ACTIVO",
  direccion: "PJ. JORGE BASADRE NRO. 158",
};

describe("leerRazonSocial", () => {
  it("entiende a json.pe", () => {
    expect(leerRazonSocial(DE_JSONPE)).toBe("AGROLIGHT PERU S.A.C.");
  });

  it("sigue entendiendo a decolecta", () => {
    expect(leerRazonSocial(DE_DECOLECTA)).toBe("AGROLIGHT PERU S.A.C.");
  });

  it("acepta los nombres de las versiones anteriores", () => {
    expect(leerRazonSocial({ razonSocial: "ACME S.A." })).toBe("ACME S.A.");
    expect(leerRazonSocial({ nombre: "ACME S.A." })).toBe("ACME S.A.");
  });

  it("no se cree un nombre vacío ni un espacio", () => {
    expect(leerRazonSocial({ razon_social: "   " })).toBeNull();
    expect(leerRazonSocial({ razon_social: 42 })).toBeNull();
    expect(leerRazonSocial(null)).toBeNull();
  });
});

describe("cuerpoUtil", () => {
  // Un 200 que dice `success: false`. Darlo por bueno convierte un rechazo del
  // servicio en una razon social vacia dentro del formulario.
  it("rechaza la respuesta cuando el propio servicio dice que no", () => {
    expect(cuerpoUtil({ success: false, message: "no encontrado" })).toBeNull();
    expect(
      leerRazonSocial({ success: false, data: { nombre_o_razon_social: "X" } }),
    ).toBeNull();
  });

  it("deja pasar los campos sueltos de quien no envuelve nada", () => {
    expect(cuerpoUtil(DE_DECOLECTA)).toEqual(DE_DECOLECTA);
  });
});

describe("leerTexto", () => {
  it("saca la dirección de dentro del envoltorio", () => {
    expect(leerTexto(DE_JSONPE, "direccion")).toContain("JORGE BASADRE");
    expect(leerTexto(DE_JSONPE, "estado")).toBe("SUSPENSION TEMPORAL");
  });

  it("y también sin envoltorio", () => {
    expect(leerTexto(DE_DECOLECTA, "estado")).toBe("ACTIVO");
  });

  it("devuelve undefined cuando el campo no viene", () => {
    expect(leerTexto(DE_JSONPE, "telefono")).toBeUndefined();
  });
});
