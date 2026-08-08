import { describe, it, expect } from "vitest";
import {
  aportantes,
  codigoPadre,
  sumarHojas,
  type NodoImporte,
} from "./jerarquia-partidas";

/**
 * Pruebas de caracterizacion.
 *
 * Este modulo decide que partida cuenta y cual no, y de el depende que el
 * presupuesto de una obra sean 735 mil o 1,8 millones. Hasta ahora solo se
 * ejercitaba de rebote desde el importador. Estas pruebas fijan su
 * comportamiento ANTES de que los movimientos presupuestales se apoyen en el.
 */

const codigos = (nodos: NodoImporte[]) => aportantes(nodos).map((n) => n.codigo);

describe("codigoPadre", () => {
  const existentes = (...c: string[]) => new Set(c);

  it("sube un segmento cuando el padre existe", () => {
    expect(codigoPadre("4.1", existentes("4.0", "4.1"))).toBe("4.0");
    expect(codigoPadre("01.02.01", existentes("01.02", "01.02.01"))).toBe("01.02");
  });

  it("reconoce la cabecera de grupo como padre de sus hermanas", () => {
    // "7.02.00" y "7.02.01" tienen la misma profundidad, pero la primera
    // encabeza a la segunda por terminar en ceros.
    const set = existentes("7.02.00", "7.02.01");
    expect(codigoPadre("7.02.01", set)).toBe("7.02.00");
  });

  it("una cabecera de grupo no cuelga de si misma", () => {
    const set = existentes("7.00", "7.02.00", "7.02.01");
    expect(codigoPadre("7.02.00", set)).not.toBe("7.02.00");
  });

  it("sube hasta encontrar un ancestro real cuando faltan niveles", () => {
    // En CRIOCORD existen 11.11.02 .. 11.11.19 pero no la cabecera 11.11.
    const set = existentes("11", "11.11.02");
    expect(codigoPadre("11.11.02", set)).toBe("11");
  });

  it("devuelve null en la raiz", () => {
    expect(codigoPadre("1", existentes("1"))).toBeNull();
  });
});

describe("sumarHojas y aportantes", () => {
  it("suma hojas sueltas", () => {
    const nodos: NodoImporte[] = [
      { codigo: "1.01", parcial: "100.00" },
      { codigo: "1.02", parcial: "50.50" },
    ];
    expect(sumarHojas(nodos)).toBe("150.50");
    expect(codigos(nodos)).toEqual(["1.01", "1.02"]);
  });

  it("una hija con importe positivo cubre a su padre", () => {
    // El caso que inflaba CRIOCORD de 754 mil a 1,8 millones: contar el
    // importe del grupo Y el de sus hijas es contar el mismo dinero dos veces.
    const nodos: NodoImporte[] = [
      { codigo: "3.0", parcial: "1000.00" },
      { codigo: "3.1", parcial: "600.00" },
      { codigo: "3.2", parcial: "400.00" },
    ];
    expect(sumarHojas(nodos)).toBe("1000.00");
    expect(codigos(nodos)).toEqual(["3.1", "3.2"]);
  });

  it("un descuento NO cubre a su padre", () => {
    // 7.09.00 GASTOS VARIOS lleva 779,10 a suma alzada y su unica hija con
    // cifra es un descuento comercial. Si el descuento cubriera al padre,
    // los 779,10 desapareceran del presupuesto.
    const nodos: NodoImporte[] = [
      { codigo: "7.09.00", parcial: "779.10" },
      { codigo: "7.09.01", parcial: "-100.00" },
    ];
    expect(sumarHojas(nodos)).toBe("679.10");
    expect(codigos(nodos)).toEqual(["7.09.00", "7.09.01"]);
  });

  it("la cabecera de grupo queda cubierta por sus hermanas costeadas", () => {
    const nodos: NodoImporte[] = [
      { codigo: "7.02.00", parcial: "5000.00" },
      { codigo: "7.02.01", parcial: "2000.00" },
      { codigo: "7.02.02", parcial: "3000.00" },
    ];
    expect(sumarHojas(nodos)).toBe("5000.00");
    expect(codigos(nodos)).toEqual(["7.02.01", "7.02.02"]);
  });

  it("los nodos sin importe no cuentan ni cubren", () => {
    const nodos: NodoImporte[] = [
      { codigo: "2.0", parcial: null },
      { codigo: "2.1", parcial: "300.00" },
    ];
    expect(sumarHojas(nodos)).toBe("300.00");
    expect(codigos(nodos)).toEqual(["2.1"]);
  });

  it("un importe en cero cuenta como aportante, aunque no sume", () => {
    // El filtro final es `parcial !== null`, no `esPositivo`. Importa para
    // los movimientos: una partida en cero sigue siendo destino valido.
    const nodos: NodoImporte[] = [{ codigo: "5.01", parcial: "0.00" }];
    expect(sumarHojas(nodos)).toBe("0.00");
    expect(codigos(nodos)).toEqual(["5.01"]);
  });

  it("cubre a todos los ancestros, no solo al padre directo", () => {
    const nodos: NodoImporte[] = [
      { codigo: "4", parcial: "900.00" },
      { codigo: "4.1", parcial: "900.00" },
      { codigo: "4.1.1", parcial: "900.00" },
    ];
    expect(sumarHojas(nodos)).toBe("900.00");
    expect(codigos(nodos)).toEqual(["4.1.1"]);
  });

  it("aportantes y sumarHojas nunca se contradicen", () => {
    const nodos: NodoImporte[] = [
      { codigo: "1", parcial: "50.00" },
      { codigo: "1.01", parcial: "30.00" },
      { codigo: "1.02", parcial: "-5.00" },
      { codigo: "2", parcial: null },
      { codigo: "2.01", parcial: "12.34" },
    ];
    // Los aportantes son exactamente las filas que sumarHojas sumo, y su
    // suma es el mismo total. Es el invariante del que dependen los
    // movimientos: la columna BASE de cada partida tiene que cuadrar con el
    // costo directo de la linea base.
    expect(codigos(nodos)).toEqual(["1.01", "1.02", "2.01"]);
    expect(sumarHojas(nodos)).toBe("37.34");
    expect(sumarHojas(aportantes(nodos))).toBe("37.34");
  });
});
