import { describe, it, expect } from "vitest";

import {
  anclaDeHito,
  avisosDeHitos,
  diasHasta,
  textoDeHito,
  type HitoParaAviso,
} from "./avisos-hitos";

/**
 * Lo que decide a quien se molesta y cuanto SMS se gasta. Por eso vive en
 * `lib/` y por eso se prueba: un aviso de mas todos los dias es la forma mas
 * rapida de que alguien apague los avisos de la obra entera, y a partir de ahi
 * no se entera de nada.
 */

function hito(p: Partial<HitoParaAviso> = {}): HitoParaAviso {
  return {
    uid: -1,
    nombre: "Fin de estructuras",
    fecha: "2026-10-15",
    diasAviso: 7,
    cumplido: false,
    responsableClave: "u:ana",
    ...p,
  };
}

describe("diasHasta", () => {
  it("cuenta dias enteros de calendario", () => {
    expect(diasHasta("2026-10-08", "2026-10-15")).toBe(7);
    expect(diasHasta("2026-10-15", "2026-10-15")).toBe(0);
    expect(diasHasta("2026-10-20", "2026-10-15")).toBe(-5);
  });

  it("cruza el cambio de mes y de año sin despeinarse", () => {
    expect(diasHasta("2026-12-28", "2027-01-04")).toBe(7);
  });
});

describe("cuando avisar de un hito", () => {
  it("callado mientras esta lejos", () => {
    // Faltan 20 dias y la ventana es de 7.
    expect(avisosDeHitos([hito()], "2026-09-25", 3)).toEqual([]);
  });

  it("suena al entrar en la ventana de antelacion", () => {
    const r = avisosDeHitos([hito()], "2026-10-08", 3);
    expect(r).toHaveLength(1);
    expect(r[0]!.evento).toBe("HITO_CERCA");
    expect(r[0]!.diasParaLaFecha).toBe(7);
  });

  it("el dia que vence tambien avisa, y como «cerca», no como vencido", () => {
    const r = avisosDeHitos([hito()], "2026-10-15", 3);
    expect(r[0]!.evento).toBe("HITO_CERCA");
    expect(r[0]!.diasParaLaFecha).toBe(0);
  });

  /**
   * Un hito cumplido no avisa NUNCA, ni siquiera vencido. Recordarle a alguien
   * algo que ya hizo es la forma mas segura de que deje de leer los avisos.
   */
  it("un hito cumplido no avisa, aunque su fecha ya pasara", () => {
    expect(avisosDeHitos([hito({ cumplido: true })], "2026-11-01", 3)).toEqual([]);
    expect(avisosDeHitos([hito({ cumplido: true })], "2026-10-14", 3)).toEqual([]);
  });

  it("vencido insiste cada N dias, no todos los dias", () => {
    const suena = (hoy: string) =>
      avisosDeHitos([hito()], hoy, 3).map((a) => a.evento);

    expect(suena("2026-10-16")).toEqual([]); // 1 dia vencido
    expect(suena("2026-10-17")).toEqual([]); // 2
    expect(suena("2026-10-18")).toEqual(["HITO_VENCIDO"]); // 3
    expect(suena("2026-10-19")).toEqual([]); // 4
    expect(suena("2026-10-21")).toEqual(["HITO_VENCIDO"]); // 6
  });

  it("con antelacion cero, solo avisa el mismo dia", () => {
    const h = hito({ diasAviso: 0 });
    expect(avisosDeHitos([h], "2026-10-14", 3)).toEqual([]);
    expect(avisosDeHitos([h], "2026-10-15", 3)).toHaveLength(1);
  });

  /**
   * Sin responsable NO se descarta: sale igual y lo recoge la suscripcion por
   * flujo. El fallo seguro de esta casa es «te llega», no «no te llega».
   */
  it("un hito sin responsable avisa igual", () => {
    const r = avisosDeHitos([hito({ responsableClave: null })], "2026-10-12", 3);
    expect(r).toHaveLength(1);
    expect(r[0]!.responsableClave).toBeNull();
  });

  it("cada hito se decide por su cuenta", () => {
    const r = avisosDeHitos(
      [
        hito({ uid: -1, fecha: "2026-10-15" }),
        hito({ uid: -2, fecha: "2026-12-01" }),
        hito({ uid: -3, fecha: "2026-10-09", cumplido: true }),
      ],
      "2026-10-12",
      3,
    );
    expect(r.map((a) => a.uid)).toEqual([-1]);
  });
});

describe("el ancla de la clave", () => {
  /**
   * La clave anti-repeticion NO puede llevar la fecha ni los dias que faltan.
   * Con la fecha, correr el hito un dia haria sonar «se acerca» otra vez; con
   * los dias, sonaria cada dia de la ventana.
   */
  it("no cambia aunque cambie la fecha ni los dias que faltan", () => {
    expect(anclaDeHito(-7, "HITO_CERCA")).toBe(anclaDeHito(-7, "HITO_CERCA"));
    expect(anclaDeHito(-7, "HITO_CERCA")).not.toContain("2026");
  });

  it("distingue los dos eventos y los dos hitos", () => {
    expect(anclaDeHito(-7, "HITO_CERCA")).not.toBe(anclaDeHito(-7, "HITO_VENCIDO"));
    expect(anclaDeHito(-7, "HITO_CERCA")).not.toBe(anclaDeHito(-8, "HITO_CERCA"));
  });
});

describe("los textos", () => {
  it("dicen que se rompe, no solo el hecho", () => {
    const cerca = textoDeHito({
      uid: -1, nombre: "Fin de estructuras", fecha: "2026-10-15",
      evento: "HITO_CERCA", diasParaLaFecha: 3, responsableClave: null,
    });
    expect(cerca.titulo).toContain("Fin de estructuras");
    expect(cerca.cuerpo).toContain("3 días");
    expect(cerca.cuerpo).toMatch(/se corre|no está cumplido/);
  });

  it("«hoy» y «mañana» se dicen con palabras, no con numeros", () => {
    const base = {
      uid: -1, nombre: "Entrega", fecha: "2026-10-15",
      evento: "HITO_CERCA" as const, responsableClave: null,
    };
    expect(textoDeHito({ ...base, diasParaLaFecha: 0 }).cuerpo).toContain("HOY");
    expect(textoDeHito({ ...base, diasParaLaFecha: 1 }).cuerpo).toContain("mañana");
  });

  it("el vencido dice cuanto lleva y que arrastra", () => {
    const v = textoDeHito({
      uid: -1, nombre: "Entrega", fecha: "2026-10-15",
      evento: "HITO_VENCIDO", diasParaLaFecha: -6, responsableClave: null,
    });
    expect(v.titulo).toContain("vencido");
    expect(v.cuerpo).toContain("6 día(s)");
    expect(v.cuerpo).toContain("dependía");
  });
});
