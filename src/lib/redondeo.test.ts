import { describe, it, expect } from "vitest";
import { redondearA, comparadoCon, conSignoFijo } from "./redondeo";

describe("redondearA", () => {
  it("redondea a los decimales pedidos", () => {
    expect(redondearA(0.99895, 2)).toBe(1);
    expect(redondearA(10.849, 1)).toBe(10.8);
    expect(redondearA(10.85, 1)).toBe(10.9);
  });

  it("nunca devuelve cero negativo", () => {
    // El caso del tablero: -0.04 puntos de desfase salia como "-0.0 pts".
    expect(Object.is(redondearA(-0.04, 1), 0)).toBe(true);
    expect(Object.is(redondearA(-0, 1), 0)).toBe(true);
  });

  it("deja pasar lo que no es numero finito", () => {
    expect(redondearA(NaN, 2)).toBeNaN();
    expect(redondearA(Infinity, 2)).toBe(Infinity);
  });

  it("con cero decimales redondea a entero", () => {
    expect(redondearA(2.6, 0)).toBe(3);
  });
});

describe("comparadoCon", () => {
  it("un SPI que se MUESTRA como 1.00 no esta atrasado", () => {
    // El caso de CRIOCORD: EV 79,775.23 sobre PV 79,859.05.
    const spi = 79775.23 / 79859.05;
    expect(spi).toBeLessThan(1); // de verdad es menor...
    expect(comparadoCon(spi, 1, 2)).toBe(0); // ...pero en pantalla pone 1.00
  });

  it("distingue de verdad cuando la diferencia se ve", () => {
    expect(comparadoCon(0.98, 1, 2)).toBe(-1);
    expect(comparadoCon(1.02, 1, 2)).toBe(1);
  });

  it("el umbral es medio decimal de los que se muestran", () => {
    // Con dos decimales, 0.995 sube a 1.00 y 0.994 baja a 0.99.
    expect(comparadoCon(0.995, 1, 2)).toBe(0);
    expect(comparadoCon(0.994, 1, 2)).toBe(-1);
  });

  it("mas decimales, mas exigente", () => {
    expect(comparadoCon(0.999, 1, 2)).toBe(0);
    expect(comparadoCon(0.999, 1, 3)).toBe(-1);
  });

  it("sirve para puntos de desfase contra cero", () => {
    expect(comparadoCon(-0.04, 0, 1)).toBe(0);
    expect(comparadoCon(-0.4, 0, 1)).toBe(-1);
    expect(comparadoCon(3.2, 0, 1)).toBe(1);
  });
});

describe("conSignoFijo", () => {
  it("pone el signo solo cuando hay diferencia que mostrar", () => {
    expect(conSignoFijo(3.24, 1)).toBe("+3.2");
    expect(conSignoFijo(-3.24, 1)).toBe("-3.2");
  });

  it("cero es cero, sin signo y sin menos", () => {
    expect(conSignoFijo(-0.04, 1)).toBe("0.0");
    expect(conSignoFijo(0, 1)).toBe("0.0");
    expect(conSignoFijo(0.04, 1)).toBe("0.0");
  });

  it("sin numero no inventa un cero", () => {
    expect(conSignoFijo(NaN, 1)).toBe("—");
  });
});
