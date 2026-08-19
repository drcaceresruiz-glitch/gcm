import { describe, it, expect } from "vitest";
import { formatearVersion } from "./version";

/**
 * Como se escribe la version en el pie.
 *
 * Se prueba la parte PURA —el formato— y no la lectura del archivo: lo que
 * se rompio historicamente no fue leer el SHA sino ENSEÑAR un numero que no
 * correspondia a nada. Ver la cabecera de `version.ts`.
 */
describe("la version del pie", () => {
  it("junta la version del producto con el SHA corto del paquete", () => {
    expect(formatearVersion("0.9.0", "d410bb8f2b90b3720649e5fa08da668a8976b017"))
      .toBe("v0.9.0 · d410bb8");
  });

  /**
   * Sin paquete NO se calla el hueco. En local la version de `package.json`
   * es real pero no corresponde a nada desplegado, y un pie que solo dijera
   * «v0.9.0» en un portatil se leeria igual que el de produccion.
   */
  it("dice dev cuando no hay paquete desplegado", () => {
    expect(formatearVersion("0.9.0", null)).toBe("v0.9.0 · dev");
  });

  it("recorta el SHA a siete, como git", () => {
    const salida = formatearVersion("1.2.3", "abcdef0123456789");
    expect(salida).toBe("v1.2.3 · abcdef0");
    expect(salida).not.toContain("abcdef01");
  });
});
