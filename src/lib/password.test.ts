import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword", () => {
  it("da el formato scrypt-N-r-p-salt-hash con los parametros de coste", async () => {
    const h = await hashPassword("secreta");
    const partes = h.split("$");
    expect(partes).toHaveLength(6);
    expect(partes[0]).toBe("scrypt");
    expect(partes[1]).toBe("16384");
    expect(partes[2]).toBe("8");
    expect(partes[3]).toBe("1");
    expect(partes[4]).toBeTruthy();
    expect(partes[5]).toBeTruthy();
  });

  it("usa una sal distinta cada vez: dos hashes de la misma clave difieren", async () => {
    const a = await hashPassword("misma");
    const b = await hashPassword("misma");
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("acepta la clave correcta (camino bueno)", async () => {
    const h = await hashPassword("correcta");
    expect(await verifyPassword("correcta", h)).toBe(true);
  });

  it("rechaza una clave equivocada", async () => {
    const h = await hashPassword("correcta");
    expect(await verifyPassword("incorrecta", h)).toBe(false);
  });

  it("normaliza en NFKC: dos formas unicode de la e-acento verifican igual", async () => {
    // NFD (e + acute combinante 0x301) frente a NFC (e-acute precompuesta 0x00E9).
    const nfd = "e" + String.fromCharCode(0x301);
    const nfc = String.fromCharCode(0x00e9);
    expect(nfd).not.toBe(nfc);
    expect(nfd.normalize("NFC")).toBe(nfc);
    const h = await hashPassword(nfd);
    expect(await verifyPassword(nfc, h)).toBe(true);
  });

  describe("rechaza cualquier hash malformado, cada uno por su motivo", () => {
    it("numero de partes distinto de 6", async () => {
      expect(await verifyPassword("x", "scrypt$16384$8$1$soloCinco")).toBe(false);
    });

    it("prefijo que no es scrypt", async () => {
      const h = await hashPassword("x");
      const otro = "bcrypt" + h.slice("scrypt".length);
      expect(await verifyPassword("x", otro)).toBe(false);
    });

    it("parametros de coste no numericos", async () => {
      expect(await verifyPassword("x", "scrypt$N$r$p$AAAA$BBBB")).toBe(false);
    });

    it("sal vacia", async () => {
      expect(await verifyPassword("x", "scrypt$16384$8$1$$BBBB")).toBe(false);
    });

    it("hash esperado vacio", async () => {
      expect(await verifyPassword("x", "scrypt$16384$8$1$AAAA$")).toBe(false);
    });
  });
});
