import { describe, expect, it } from "vitest";

import { codigoPadre, siguienteCodigoHijo } from "@/lib/jerarquia-partidas";

/**
 * Proponer el codigo de una partida nueva es invertir `codigoPadre`, y esa
 * funcion admite tres convenciones que no se comportan igual. Si la inversa
 * falla, la partida nace con el `parentId` apuntando a un capitulo y el codigo
 * a otro: los subtotales se calculan por `parentId` y el total de la obra por
 * el codigo, asi que el presupuesto descuadra sin dar un solo error.
 *
 * La propiedad que se fija en todos los casos es la misma: el codigo propuesto
 * tiene que volver, por `codigoPadre`, al capitulo del que se pidio colgar.
 */

function conjunto(...codigos: string[]): Set<string> {
  return new Set(codigos);
}

function vuelveAlCapitulo(capitulo: string, existentes: Set<string>): string {
  const hijo = siguienteCodigoHijo(capitulo, existentes);
  expect(hijo).not.toBeNull();
  expect(codigoPadre(hijo!, new Set([...existentes, hijo!]))).toBe(capitulo);
  return hijo!;
}

describe("siguienteCodigoHijo", () => {
  it("la convencion corriente: 4.0 tiene hijas 4.1", () => {
    expect(vuelveAlCapitulo("4.0", conjunto("4.0"))).toBe("4.1");
  });

  it("sigue por donde iba: con 4.1 y 4.2 propone 4.3", () => {
    expect(vuelveAlCapitulo("4.0", conjunto("4.0", "4.1", "4.2"))).toBe("4.3");
  });

  it("rellena el hueco que quedo al borrar", () => {
    expect(vuelveAlCapitulo("4.0", conjunto("4.0", "4.2", "4.3"))).toBe("4.1");
  });

  /**
   * La convencion que rompe la intuicion: "7.02.00" y "7.02.01" tienen el
   * mismo numero de segmentos y parecen hermanas, pero la terminacion en
   * ceros marca que la primera encabeza al resto.
   */
  it("la cabecera de grupo: 7.02.00 tiene hijas 7.02.01, no 7.02.00.1", () => {
    expect(vuelveAlCapitulo("7.02.00", conjunto("7.02.00"))).toBe("7.02.01");
  });

  it("respeta el ancho de los ceros de la cabecera", () => {
    expect(vuelveAlCapitulo("7.02.00", conjunto("7.02.00", "7.02.01"))).toBe("7.02.02");
  });

  it("el subcapitulo S10: 01.02 tiene hijas 01.02.01", () => {
    expect(vuelveAlCapitulo("01.02", conjunto("01.02"))).toBe("01.02.01");
  });

  it("un capitulo de un solo segmento tiene hijas 5.1", () => {
    expect(vuelveAlCapitulo("5", conjunto("5"))).toBe("5.1");
  });
});
