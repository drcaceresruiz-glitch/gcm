import { describe, it, expect } from "vitest";
import { parsearOperadores, esCorreoOperador } from "./operador";

describe("parsearOperadores", () => {
  it("sin variable no hay ningun operador", () => {
    // El caso que mas importa: un despliegue que olvide la variable se queda
    // SIN area de operador, no con el area abierta.
    expect(parsearOperadores(undefined)).toEqual([]);
    expect(parsearOperadores(null)).toEqual([]);
    expect(parsearOperadores("")).toEqual([]);
    expect(parsearOperadores("   ")).toEqual([]);
  });

  it("separa por comas y normaliza", () => {
    expect(parsearOperadores("A@X.PE, b@x.pe")).toEqual(["a@x.pe", "b@x.pe"]);
  });

  it("aguanta comas de mas y espacios sobrantes", () => {
    expect(parsearOperadores(" a@x.pe ,, , b@x.pe,")).toEqual([
      "a@x.pe",
      "b@x.pe",
    ]);
  });

  it("no repite", () => {
    expect(parsearOperadores("a@x.pe,A@X.PE")).toEqual(["a@x.pe"]);
  });
});

describe("esCorreoOperador", () => {
  const lista = parsearOperadores("jefe@gcm.pe, socio@gcm.pe");

  it("reconoce al de la lista aunque venga con mayusculas o espacios", () => {
    expect(esCorreoOperador("jefe@gcm.pe", lista)).toBe(true);
    expect(esCorreoOperador("  JEFE@GCM.PE  ", lista)).toBe(true);
  });

  it("con la lista vacia nadie lo es", () => {
    expect(esCorreoOperador("jefe@gcm.pe", [])).toBe(false);
  });

  it("no acepta parecidos: la comparacion es exacta, no por subcadena", () => {
    // Con `includes` estos tres pasarian, y quien registrara ese correo se
    // volveria operador.
    expect(esCorreoOperador("majefe@gcm.pe", lista)).toBe(false);
    expect(esCorreoOperador("jefe@gcm.pe.dominio-falso.com", lista)).toBe(false);
    expect(esCorreoOperador("jefe@gcm.p", lista)).toBe(false);
  });

  it("sin correo es que no", () => {
    expect(esCorreoOperador(undefined, lista)).toBe(false);
    expect(esCorreoOperador(null, lista)).toBe(false);
    expect(esCorreoOperador("", lista)).toBe(false);
    expect(esCorreoOperador("   ", lista)).toBe(false);
  });
});
