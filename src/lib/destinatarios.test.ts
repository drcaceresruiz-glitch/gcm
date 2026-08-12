import { describe, expect, it } from "vitest";
import { analizarDestinatarios } from "./destinatarios";

describe("analizarDestinatarios", () => {
  it("lee una lista separada como salga: comas, punto y coma o espacios", () => {
    const r = analizarDestinatarios("a@obra.pe, b@obra.pe; c@obra.pe d@obra.pe");
    expect(r).toEqual({
      ok: true,
      lista: ["a@obra.pe", "b@obra.pe", "c@obra.pe", "d@obra.pe"],
    });
  });

  it("aguanta el salto de linea de una lista pegada de otro sitio", () => {
    const r = analizarDestinatarios("a@obra.pe\nb@obra.pe\n");
    expect(r).toEqual({ ok: true, lista: ["a@obra.pe", "b@obra.pe"] });
  });

  it("un campo vacio no es un envio a nadie: es un error", () => {
    expect(analizarDestinatarios("   ")).toEqual({
      ok: false,
      error: "Escribe al menos un correo de destino.",
    });
  });

  it("dice CUAL direccion esta mal, no solo que hay una mal", () => {
    const r = analizarDestinatarios("a@obra.pe, residente");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("residente");
  });

  it("quita repetidos aunque cambie la caja, y conserva el primero tal cual", () => {
    // Es el mismo buzon: enviarlo dos veces es un correo duplicado para quien
    // lo recibe y dos lineas en el registro para quien lo revisa.
    const r = analizarDestinatarios("Cliente@Empresa.pe, cliente@empresa.pe");
    expect(r).toEqual({ ok: true, lista: ["Cliente@Empresa.pe"] });
  });

  it("corta por encima del maximo y dice cuantos hay", () => {
    const muchos = Array.from({ length: 11 }, (_, i) => `p${i}@obra.pe`).join(",");
    const r = analizarDestinatarios(muchos);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("11");
  });

  it("los repetidos NO cuentan para el maximo", () => {
    // Pegar la misma direccion dos veces no debe agotar el cupo: lo que se
    // limita es a cuanta gente distinta se manda.
    const lista = Array.from({ length: 10 }, (_, i) => `p${i}@obra.pe`);
    const r = analizarDestinatarios([...lista, "P0@obra.pe"].join(","));
    expect(r.ok).toBe(true);
  });
});
