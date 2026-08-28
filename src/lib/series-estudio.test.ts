import { describe, expect, it } from "vitest";

import {
  CODIGO_CAUSA,
  faseDeLaSemana,
  indicePorSemana,
  num,
  resumir,
} from "./series-estudio";

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("en que fase cae cada semana", () => {
  const corte = dia("2026-06-01");

  it("antes del punto de interrupcion es PRE", () => {
    expect(faseDeLaSemana(dia("2026-05-25"), corte)).toBe("PRE");
  });

  it("la semana del punto de interrupcion ya es POST", () => {
    // Criterio declarado: es la primera semana gestionada con la herramienta.
    expect(faseDeLaSemana(dia("2026-06-01"), corte)).toBe("POST");
  });

  it("despues es POST", () => {
    expect(faseDeLaSemana(dia("2026-07-13"), corte)).toBe("POST");
  });

  it("sin punto de interrupcion no se inventa una fase", () => {
    // Una obra que no participa en el estudio sale sin clasificar, no como
    // POST por descarte: eso metería obras ajenas en la muestra.
    expect(faseDeLaSemana(dia("2026-07-13"), null)).toBe("SIN_CLASIFICAR");
  });
});

describe("resumen estadistico de una serie", () => {
  it("calcula media, desviacion muestral, extremos y mediana", () => {
    const r = resumir([2, 4, 4, 4, 5, 5, 7, 9]);

    expect(r.n).toBe(8);
    expect(r.media).toBeCloseTo(5, 10);
    // Muestral (n-1): 2,138. Con n seria 2,0 — y ese es el numero que NO
    // coincidiria con Minitab.
    expect(r.desviacion).toBeCloseTo(2.13809, 4);
    expect(r.minimo).toBe(2);
    expect(r.maximo).toBe(9);
    expect(r.mediana).toBe(4.5);
  });

  it("con UNA sola observacion no hay dispersion: null, nunca cero", () => {
    const r = resumir([7]);

    expect(r.n).toBe(1);
    expect(r.media).toBe(7);
    // Un cero aqui pintaria una semana perfecta en el grafico de control
    // cuando lo que hay es una semana sin datos suficientes.
    expect(r.desviacion).toBeNull();
  });

  it("sin observaciones, todo vacio y n en cero", () => {
    const r = resumir([]);

    expect(r.n).toBe(0);
    expect(r.media).toBeNull();
    expect(r.desviacion).toBeNull();
  });

  it("la mediana de un numero par de valores es el promedio de los centrales", () => {
    expect(resumir([1, 2, 3, 4]).mediana).toBe(2.5);
  });

  it("descarta lo que no es un numero finito", () => {
    expect(resumir([1, Number.NaN, 3, Number.POSITIVE_INFINITY]).n).toBe(2);
  });
});

describe("formato de numeros para SPSS y Minitab", () => {
  it("punto decimal y los decimales pedidos", () => {
    expect(num(3.14159, 2)).toBe("3.14");
  });

  it("un valor ausente sale VACIO, no cero", () => {
    // Un cero se analiza; un vacio se trata como perdido. Confundirlos cambia
    // la media de cualquier semana con datos incompletos.
    expect(num(null)).toBe("");
    expect(num(undefined)).toBe("");
  });

  it("nada de infinitos ni NaN en el archivo", () => {
    expect(num(Number.NaN)).toBe("");
    expect(num(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("indice temporal de las semanas", () => {
  it("numera por FECHA, no por orden de llegada", () => {
    // El caso real del estudio: las semanas del pre se cargan despues, asi que
    // su numero de plan es alto y su fecha es antigua.
    const semanas = [
      { fechaCorte: dia("2026-07-06") },
      { fechaCorte: dia("2026-05-04") },
      { fechaCorte: dia("2026-06-01") },
    ];

    const indice = indicePorSemana(semanas);

    expect(indice.get(dia("2026-05-04").getTime())).toBe(1);
    expect(indice.get(dia("2026-06-01").getTime())).toBe(2);
    expect(indice.get(dia("2026-07-06").getTime())).toBe(3);
  });
});

describe("codigos de las causas de no cumplimiento", () => {
  it("las nueve categorias tienen codigo del 1 al 9", () => {
    const codigos = Object.values(CODIGO_CAUSA).sort((a, b) => a - b);

    expect(codigos).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("el orden esta congelado: un estudio que cite «causa 3» tiene que seguir valiendo", () => {
    expect(CODIGO_CAUSA["PRERREQUISITO"]).toBe(1);
    expect(CODIGO_CAUSA["MANO_OBRA"]).toBe(3);
    expect(CODIGO_CAUSA["OTRA"]).toBe(9);
  });
});
