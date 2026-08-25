import { describe, it, expect } from "vitest";
import {
  esCero,
  esNegativo,
  esPositivo,
  multiplicar,
  normalizarDecimal,
  porcentajeDe,
  restar,
  sumar,
} from "./decimal";

describe("normalizarDecimal", () => {
  it("acepta numeros y textos simples", () => {
    expect(normalizarDecimal(4.25, 4)).toBe("4.2500");
    expect(normalizarDecimal("120", 4)).toBe("120.0000");
    expect(normalizarDecimal("8.5", 2)).toBe("8.50");
  });

  it("entiende el separador de miles peruano", () => {
    expect(normalizarDecimal("1,234.56", 2)).toBe("1234.56");
    expect(normalizarDecimal("1,234,567.89", 2)).toBe("1234567.89");
  });

  it("entiende la coma decimal de otras configuraciones regionales", () => {
    expect(normalizarDecimal("1234,56", 2)).toBe("1234.56");
    expect(normalizarDecimal("8,5", 2)).toBe("8.50");
  });

  it("rechaza el caso irresoluble en lugar de adivinar", () => {
    // "12,500" vale 12500 en formato peruano y 12.5 en formato europeo.
    // No hay forma de saberlo: se rechaza y se pide corregir el archivo.
    expect(normalizarDecimal("12,500", 2)).toBeNull();
  });

  it("redondea hacia arriba en el medio exacto", () => {
    expect(normalizarDecimal("0.125", 2)).toBe("0.13");
    expect(normalizarDecimal("2.345", 2)).toBe("2.35");
  });

  it("rechaza lo que no es un numero", () => {
    expect(normalizarDecimal("", 2)).toBeNull();
    expect(normalizarDecimal("abc", 2)).toBeNull();
    expect(normalizarDecimal("12.5.3", 2)).toBeNull();
    expect(normalizarDecimal(null, 2)).toBeNull();
    expect(normalizarDecimal(undefined, 2)).toBeNull();
    expect(normalizarDecimal(Infinity, 2)).toBeNull();
  });

  it("conserva los negativos", () => {
    expect(normalizarDecimal("-15.5", 2)).toBe("-15.50");
  });
});

describe("multiplicar", () => {
  it("resuelve los casos donde la coma flotante falla", () => {
    // 4.25 * 95 en coma flotante da 403.74999999999994
    expect(multiplicar("4.2500", "95.0000", 2)).toBe("403.75");
    // 0.1 * 0.2 da 0.020000000000000004
    expect(multiplicar("0.1", "0.2", 4)).toBe("0.0200");
  });

  it("calcula los parciales de las partidas sembradas", () => {
    expect(multiplicar("120.0000", "8.5000", 2)).toBe("1020.00");
    expect(multiplicar("285.0000", "6.2000", 2)).toBe("1767.00");
    expect(multiplicar("6.8000", "420.0000", 2)).toBe("2856.00");
  });

  it("mantiene la precision con metrados de 4 decimales", () => {
    expect(multiplicar("0.3333", "3.0000", 4)).toBe("0.9999");
  });

  it("devuelve null ante entradas invalidas", () => {
    expect(multiplicar("abc", "2", 2)).toBeNull();
  });
});

describe("sumar", () => {
  it("suma sin arrastrar error", () => {
    // 0.1 + 0.2 + 0.3 en coma flotante no da exactamente 0.6
    expect(sumar(["0.1", "0.2", "0.3"], 2)).toBe("0.60");
  });

  it("reproduce el subtotal del Capitulo IV", () => {
    const parciales = [
      "1020.00",
      "1350.00",
      "1620.00",
      "403.75",
      "456.00",
      "1767.00",
      "2856.00",
      "825.00",
    ];
    expect(sumar(parciales)).toBe("10297.75");
  });

  it("ignora los valores invalidos en lugar de romper", () => {
    expect(sumar(["10.00", "x", "5.00"])).toBe("15.00");
  });

  it("devuelve cero con la lista vacia", () => {
    expect(sumar([])).toBe("0.00");
  });
});

describe("signo", () => {
  it("distingue positivos, negativos y cero", () => {
    expect(esPositivo("0.01")).toBe(true);
    expect(esPositivo("0.00")).toBe(false);
    expect(esNegativo("-0.01")).toBe(true);
    expect(esNegativo("0.00")).toBe(false);
  });
});

describe("esCero", () => {
  it("reconoce el cero en cualquiera de sus escrituras", () => {
    expect(esCero("0")).toBe(true);
    expect(esCero("0.00")).toBe(true);
    expect(esCero("-0.0000")).toBe(true);
  });

  it("distingue el cero de la basura, que es su razon de existir", () => {
    // El idioma ingenuo `!esPositivo && !esNegativo` da true para todos
    // estos. Con el, un importe corrupto contaria como cero y una
    // reconversion descuadrada pasaria la validacion de suma cero.
    for (const basura of ["", "abc", "12,500", "1.2.3", " "]) {
      expect(!esPositivo(basura) && !esNegativo(basura)).toBe(true);
      expect(esCero(basura)).toBe(false);
    }
  });

  it("no confunde el cero con un importe cualquiera", () => {
    expect(esCero("0.01")).toBe(false);
    expect(esCero("-0.01")).toBe(false);
  });
});

describe("restar", () => {
  it("resta con exactitud", () => {
    expect(restar("100.00", "30.50")).toBe("69.50");
    expect(restar("0.30", "0.10")).toBe("0.20");
  });

  it("da negativo cuando el sustraendo es mayor", () => {
    expect(restar("100", "150")).toBe("-50.00");
  });

  /**
   * LA REGRESION QUE MOTIVA ESTA FUNCION.
   *
   * Antes se restaba con `sumar([a, `-${b}`])`. Con una `b` ya negativa eso
   * construye "--26821.60", que `sumar` descarta en silencio y devuelve el
   * minuendo intacto: la resta se convierte en no hacer nada.
   *
   * CRIOCORD tiene una partida de descuento de -26.821,60, asi que restar
   * sobre un valor negativo no es un caso de laboratorio.
   */
  it("resta correctamente un sustraendo NEGATIVO", () => {
    // Restar un negativo suma. La via vieja devolvia el minuendo sin tocar.
    expect(restar("1000.00", "-26821.60")).toBe("27821.60");

    const viaVieja = sumar(["1000.00", `-${"-26821.60"}`]);
    expect(viaVieja).toBe("1000.00");
    expect(viaVieja).not.toBe(restar("1000.00", "-26821.60"));
  });

  it("con los dos operandos negativos", () => {
    expect(restar("-100.00", "-30.00")).toBe("-70.00");
  });

  it("devuelve null si un operando no es numero, en vez de un cero creible", () => {
    expect(restar("100.00", "--50")).toBeNull();
    expect(restar("abc", "10")).toBeNull();
    expect(restar("100", "")).toBeNull();
  });

  it("respeta la precision pedida", () => {
    expect(restar("10.129", "0.004", 2)).toBe("10.13");
    expect(restar("1.00000", "0.00001", 4)).toBe("1.0000");
  });

  it("no pasa por coma flotante", () => {
    // 0.3 - 0.1 da 0.19999999999999998 en aritmetica binaria.
    expect(restar("0.3", "0.1")).toBe("0.20");
  });
});

describe("sumar descarta operandos invalidos", () => {
  /**
   * Se prueba el comportamiento actual A PROPOSITO, para dejarlo como
   * decision consciente y no como sorpresa. Es la razon de que `restar`
   * exista y de que devuelva null donde `sumar` calla.
   */
  it("se salta lo que no puede sumar, sin avisar", () => {
    expect(sumar(["100.00", "--50.00"])).toBe("100.00");
    expect(sumar(["100.00", "abc", "25.00"])).toBe("125.00");
  });
});

describe("porcentajeDe", () => {
  /*
   * ESTABA ESCRITA CINCO VECES, cuatro de ellas en coma flotante. Aqui vive
   * la unica, y estas pruebas son las que impiden que alguien vuelva a
   * resolverla con `Number(a) / Number(b) * 100` en la pantalla que le toque.
   */
  it("calcula la proporcion con la aritmetica de importes", () => {
    expect(porcentajeDe("196400.50", "745553.36")).toBeCloseTo(26.34, 2);
  });

  it("acierta donde la coma flotante se desvia", () => {
    // 0.1 + 0.2 !== 0.3 en binario; con importes, 70 de 700 son 10 exactos.
    expect(porcentajeDe("0.30", "3.00")).toBe(10);
    expect(porcentajeDe("70.00", "700.00")).toBe(10);
  });

  it("no le molestan los ceros del final: es el mismo dinero", () => {
    expect(porcentajeDe("50", "200.0000")).toBe(porcentajeDe("50.00", "200"));
  });

  /**
   * NULL Y NO CERO cuando no se puede calcular.
   *
   * Un cero se lee como «no hay nada comprometido», que es una respuesta.
   * «No tengo presupuesto contra el que medirlo» es la ausencia de respuesta,
   * y quien lo pinte tiene que poder decir cual de las dos es.
   */
  it("devuelve null sin total contra el que medir", () => {
    expect(porcentajeDe("100.00", "0.00")).toBeNull();
    expect(porcentajeDe("100.00", "-5.00")).toBeNull();
  });

  it("devuelve null con un importe ilegible", () => {
    expect(porcentajeDe("no soy un numero", "100.00")).toBeNull();
  });

  it("pasa del 100 % cuando de verdad se ha pasado", () => {
    expect(porcentajeDe("150.00", "100.00")).toBe(150);
  });
});
