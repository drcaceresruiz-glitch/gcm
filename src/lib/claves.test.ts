import { describe, it, expect } from "vitest";
import { validarClaveNueva, LONGITUD_MINIMA_CLAVE } from "./claves";

describe("validarClaveNueva", () => {
  it("rechaza por debajo del minimo", () => {
    const corta = "a".repeat(LONGITUD_MINIMA_CLAVE - 1);
    const r = validarClaveNueva(corta);
    expect(r.ok).toBe(false);
  });

  it("acepta justo en el minimo", () => {
    const justa = "a".repeat(LONGITUD_MINIMA_CLAVE);
    expect(validarClaveNueva(justa)).toEqual({ ok: true });
  });

  it("acepta una frase larga sin simbolos ni mayusculas", () => {
    expect(validarClaveNueva("el gato duerme en la obra")).toEqual({ ok: true });
  });

  it("rechaza repetir la anterior cuando se conoce", () => {
    const r = validarClaveNueva("misma clave larga", "misma clave larga");
    expect(r.ok).toBe(false);
  });

  it("no compara con la anterior si no se pasa", () => {
    // La recuperacion por correo no conoce la clave vieja: solo tiene el
    // hash. Sin este caso, exigirlo obligaria a inventarse una comparacion.
    expect(validarClaveNueva("una clave larga")).toEqual({ ok: true });
  });
});
