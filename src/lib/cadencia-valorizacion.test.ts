import { describe, expect, it } from "vitest";
import {
  diaIso,
  estadoDeCadencia,
  siguienteDiaDeCorte,
  type DatosCadencia,
} from "@/lib/cadencia-valorizacion";

/**
 * La cadencia de valorizacion.
 *
 * Lo que se prueba es la HERENCIA —fechas pactadas > cadencia del contratista
 * > corte de la obra— y los dos casos que convierten un aviso util en ruido
 * permanente: el dia del corte contado como vencido, y una cadencia de cero
 * dias.
 */

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/// Viernes 21/08/2026. El `diaCorteSemanal` de la obra de ejemplo es viernes.
const VIERNES = dia("2026-08-21");

function datos(parcial: Partial<DatosCadencia> = {}): DatosCadencia {
  return {
    diaCorteObra: 5, // viernes
    cadenciaDias: null,
    fechas: [],
    ultimaValorizacion: null,
    inicioEncargo: dia("2026-08-03"),
    ...parcial,
  };
}

describe("diaIso", () => {
  it("cuenta lunes=1 y domingo=7, no domingo=0", () => {
    expect(diaIso(dia("2026-08-17"))).toBe(1); // lunes
    expect(diaIso(VIERNES)).toBe(5);
    expect(diaIso(dia("2026-08-23"))).toBe(7); // domingo
  });
});

describe("siguienteDiaDeCorte", () => {
  it("da el corte de esta semana cuando aun no llego", () => {
    expect(siguienteDiaDeCorte(dia("2026-08-17"), 5)).toEqual(VIERNES);
  });

  /**
   * El caso que se lleva por delante la funcion entera: partiendo DEL dia de
   * corte, el siguiente es dentro de una semana. Con un `% 7` a secas sale
   * cero, la proxima fecha es hoy mismo, y el contratista queda «pendiente»
   * eternamente porque la cuenta nunca avanza.
   */
  it("desde el propio dia de corte salta una semana entera", () => {
    expect(siguienteDiaDeCorte(VIERNES, 5)).toEqual(dia("2026-08-28"));
  });
});

describe("herencia: la obra manda cuando el encargo no dice nada", () => {
  it("cuenta desde la ultima valorizacion hasta el siguiente corte", () => {
    const r = estadoDeCadencia(
      datos({ ultimaValorizacion: dia("2026-08-14") }),
      VIERNES,
    );
    expect(r).toEqual({
      proxima: VIERNES,
      vencida: false,
      diasDeRetraso: 0,
      origen: "obra",
    });
  });

  it("sin ninguna valorizacion cuenta desde que arranco el encargo", () => {
    // Encargo del 03/08 (lunes): su primer corte fue el viernes 07/08.
    const r = estadoDeCadencia(datos(), VIERNES);
    expect(r.proxima).toEqual(dia("2026-08-07"));
    expect(r.vencida).toBe(true);
    expect(r.diasDeRetraso).toBe(14);
    expect(r.origen).toBe("obra");
  });
});

describe("el contratista con cadencia propia", () => {
  it("manda sobre la de la obra", () => {
    const r = estadoDeCadencia(
      datos({ cadenciaDias: 15, ultimaValorizacion: dia("2026-08-10") }),
      VIERNES,
    );
    expect(r).toEqual({
      proxima: dia("2026-08-25"),
      vencida: false,
      diasDeRetraso: 0,
      origen: "encargo",
    });
  });

  it("marca vencida y cuenta los dias de retraso", () => {
    const r = estadoDeCadencia(
      datos({ cadenciaDias: 7, ultimaValorizacion: dia("2026-08-01") }),
      VIERNES,
    );
    expect(r.proxima).toEqual(dia("2026-08-08"));
    expect(r.vencida).toBe(true);
    expect(r.diasDeRetraso).toBe(13);
  });

  /**
   * Un cero guardado por error daria un periodo de cero dias: vencida
   * siempre, desde el mismo dia en que se valoriza. Se trata como «sin
   * override» y se hereda la obra, que es lo unico que no miente.
   */
  it("una cadencia de cero dias no convierte el panel en rojo perpetuo", () => {
    const r = estadoDeCadencia(
      datos({ cadenciaDias: 0, ultimaValorizacion: dia("2026-08-14") }),
      VIERNES,
    );
    expect(r.origen).toBe("obra");
    expect(r.vencida).toBe(false);
  });
});

describe("las fechas pactadas mandan sobre todo", () => {
  it("ignora la cadencia periodica si hay hitos", () => {
    const r = estadoDeCadencia(
      datos({
        cadenciaDias: 7,
        fechas: [dia("2026-09-15"), dia("2026-08-31")],
      }),
      VIERNES,
    );
    // Ordena aunque lleguen desordenadas.
    expect(r.proxima).toEqual(dia("2026-08-31"));
    expect(r.origen).toBe("fechas");
    expect(r.vencida).toBe(false);
  });

  it("reclama la mas antigua sin cubrir", () => {
    const r = estadoDeCadencia(
      datos({ fechas: [dia("2026-08-10"), dia("2026-08-17")] }),
      VIERNES,
    );
    expect(r.proxima).toEqual(dia("2026-08-10"));
    expect(r.vencida).toBe(true);
    expect(r.diasDeRetraso).toBe(11);
  });

  /**
   * La valorizacion es ACUMULADA: un corte del 18 ya dice a cuanto se llego,
   * asi que deja contestada la fecha del 10 que nadie registro a tiempo.
   * Sin esto, un hito olvidado quedaria reclamandose para siempre aunque el
   * contratista ya hubiera valorizado despues.
   */
  it("una valorizacion posterior cubre los hitos anteriores", () => {
    const r = estadoDeCadencia(
      datos({
        fechas: [dia("2026-08-10"), dia("2026-08-31")],
        ultimaValorizacion: dia("2026-08-18"),
      }),
      VIERNES,
    );
    expect(r.proxima).toEqual(dia("2026-08-31"));
    expect(r.vencida).toBe(false);
  });

  it("sin fechas por delante no queda nada que reclamar", () => {
    const r = estadoDeCadencia(
      datos({
        fechas: [dia("2026-08-10")],
        ultimaValorizacion: dia("2026-08-18"),
      }),
      VIERNES,
    );
    expect(r.proxima).toBeNull();
    expect(r.vencida).toBe(false);
  });
});
