import { describe, expect, it } from "vitest";

import {
  diasEntre,
  ejecucionTrasAvance,
  type EjecucionConocida,
} from "./ejecucion-real";

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const vacia: EjecucionConocida = {
  inicioReal: null,
  finReal: null,
  origenInicio: null,
  origenFin: null,
};

describe("deducir el inicio real", () => {
  it("el primer reporte con avance marca el arranque", () => {
    const c = ejecucionTrasAvance(vacia, { fecha: dia("2026-08-10"), porcentaje: 30 });

    expect(c.inicioReal).toEqual(dia("2026-08-10"));
    expect(c.origenInicio).toBe("DERIVADA");
  });

  it("reportar 0 % no es empezar", () => {
    const c = ejecucionTrasAvance(vacia, { fecha: dia("2026-08-10"), porcentaje: 0 });

    expect(c.inicioReal).toBeUndefined();
  });

  it("se queda con el reporte MAS ANTIGUO, no con el primero que llega", () => {
    // El lunes se reporta lo del jueves anterior. Sin esto, ese retraso
    // administrativo pasaria a ser el arranque de la tarea.
    const conocida = {
      ...vacia,
      inicioReal: dia("2026-08-17"),
      origenInicio: "DERIVADA" as const,
    };

    const c = ejecucionTrasAvance(conocida, { fecha: dia("2026-08-13"), porcentaje: 20 });

    expect(c.inicioReal).toEqual(dia("2026-08-13"));
  });

  it("un reporte posterior no mueve el arranque hacia delante", () => {
    const conocida = {
      ...vacia,
      inicioReal: dia("2026-08-10"),
      origenInicio: "DERIVADA" as const,
    };

    const c = ejecucionTrasAvance(conocida, { fecha: dia("2026-08-20"), porcentaje: 60 });

    expect(c.inicioReal).toBeUndefined();
  });

  it("una fecha DECLARADA por una persona no se pisa nunca", () => {
    const conocida = {
      ...vacia,
      inicioReal: dia("2026-08-12"),
      origenInicio: "DECLARADA" as const,
    };

    const c = ejecucionTrasAvance(conocida, { fecha: dia("2026-08-01"), porcentaje: 40 });

    expect(c.inicioReal).toBeUndefined();
  });
});

describe("deducir el fin real", () => {
  it("llegar al cien pone la fecha de termino", () => {
    const c = ejecucionTrasAvance(vacia, { fecha: dia("2026-08-25"), porcentaje: 100 });

    expect(c.finReal).toEqual(dia("2026-08-25"));
    expect(c.origenFin).toBe("DERIVADA");
  });

  it("y tambien cuenta como arranque si no habia ninguno", () => {
    // Reportar 0 -> 100 de golpe es habitual en tareas de un dia.
    const c = ejecucionTrasAvance(vacia, { fecha: dia("2026-08-25"), porcentaje: 100 });

    expect(c.inicioReal).toEqual(dia("2026-08-25"));
  });

  it("BAJAR del cien quita la fecha de termino", () => {
    // Una tarea que se dio por terminada y luego se corrige a 90 % NO termino.
    // Dejarle la fecha puesta daria una duracion real mas corta que la real.
    const conocida = {
      ...vacia,
      inicioReal: dia("2026-08-10"),
      finReal: dia("2026-08-25"),
      origenInicio: "DERIVADA" as const,
      origenFin: "DERIVADA" as const,
    };

    const c = ejecucionTrasAvance(conocida, { fecha: dia("2026-08-27"), porcentaje: 90 });

    expect(c.finReal).toBeNull();
  });

  it("un fin DECLARADO aguanta una correccion del avance", () => {
    const conocida = {
      ...vacia,
      finReal: dia("2026-08-25"),
      origenFin: "DECLARADA" as const,
    };

    const c = ejecucionTrasAvance(conocida, { fecha: dia("2026-08-27"), porcentaje: 90 });

    expect(c.finReal).toBeUndefined();
  });
});

describe("dias entre fechas", () => {
  it("cuenta dias de calendario", () => {
    expect(diasEntre(dia("2026-08-10"), dia("2026-08-17"))).toBe(7);
  });

  it("negativo cuando se termino antes de lo comprometido", () => {
    expect(diasEntre(dia("2026-08-17"), dia("2026-08-10"))).toBe(-7);
  });

  it("cero el mismo dia", () => {
    expect(diasEntre(dia("2026-08-10"), dia("2026-08-10"))).toBe(0);
  });

  it("no se come un dia al cruzar un cambio de hora", () => {
    // Restar dos medianoches a traves de un cambio de hora da 0,958 dias y
    // redondea mal. Se compara a mediodia, que no cae nunca en el salto.
    expect(diasEntre(dia("2026-03-28"), dia("2026-03-29"))).toBe(1);
    expect(diasEntre(dia("2026-10-24"), dia("2026-10-25"))).toBe(1);
  });
});
