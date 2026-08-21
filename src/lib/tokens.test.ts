import { describe, it, expect } from "vitest";
import {
  generateToken,
  hashToken,
  generateTemporaryPassword,
  generateNumericCode,
} from "./tokens";

// El alfabeto real del generador de claves temporales (no se exporta).
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

describe("generateToken", () => {
  it("da 32 bytes en base64url: 43 caracteres, sin relleno", () => {
    const t = generateToken();
    expect(t).toHaveLength(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(t, "base64url")).toHaveLength(32);
  });

  it("no repite entre 200 llamadas", () => {
    const vistos = new Set(Array.from({ length: 200 }, () => generateToken()));
    expect(vistos.size).toBe(200);
  });
});

describe("hashToken", () => {
  it("es SHA-256 en hex: 64 caracteres y determinista", () => {
    const h = hashToken("hola");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("hola")).toBe(h);
  });

  it("coincide con el vector conocido de SHA-256 de abc", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("entradas distintas dan hashes distintos", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});

describe("generateTemporaryPassword", () => {
  const AMBIGUOS = ["O", "0", "I", "l", "1"];

  it("longitud 12 por defecto", () => {
    expect(generateTemporaryPassword()).toHaveLength(12);
  });

  it("respeta la longitud pedida", () => {
    expect(generateTemporaryPassword(20)).toHaveLength(20);
  });

  it("solo usa caracteres del alfabeto permitido, en 300", () => {
    for (const c of generateTemporaryPassword(300)) {
      expect(ALFABETO).toContain(c);
    }
  });

  it("nunca usa los ambiguos O 0 I l 1, en 500 intentos", () => {
    const muestra = Array.from({ length: 500 }, () =>
      generateTemporaryPassword(),
    ).join("");
    for (const c of AMBIGUOS) expect(muestra).not.toContain(c);
  });
});

describe("generateNumericCode", () => {
  it("longitud 6 por defecto y solo digitos", () => {
    const c = generateNumericCode();
    expect(c).toHaveLength(6);
    expect(c).toMatch(/^[0-9]{6}$/);
  });

  it("mantiene la longitud aunque empiece por cero, en 300", () => {
    for (let i = 0; i < 300; i++) {
      expect(generateNumericCode(4)).toHaveLength(4);
    }
  });
});
