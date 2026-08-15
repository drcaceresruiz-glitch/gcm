import { describe, expect, it } from "vitest";
import {
  auditarTerceros,
  LICENCIAS,
  problemasDeLicencia,
  requiereCita,
  TERCEROS,
  tercerosACitar,
  tercerosPorEstado,
  type Tercero,
} from "@/lib/terceros";

/** Base para inventar entradas en las pruebas sin repetir los ocho campos. */
function tercero(cambios: Partial<Tercero> = {}): Tercero {
  return {
    id: "ejemplo",
    nombre: "Ejemplo",
    autor: "Copyright (c) 2026 Alguien",
    url: "https://example.com",
    licencia: "MIT",
    estado: "en-uso",
    uso: "adaptado",
    queUsamos: "Algo",
    ubicaciones: ["src/lib/algo.ts"],
    avisoCopyright: "Copyright (c) 2026 Alguien",
    ...cambios,
  };
}

/**
 * La prueba que de verdad protege el producto.
 *
 * Si alguien anade al registro algo AGPL marcado como copiado, o adapta un
 * archivo sin poner el aviso de copyright, esto se pone en rojo con el motivo
 * escrito. Es el unico control automatico que tenemos sobre las licencias.
 */
describe("el registro real", () => {
  it("no tiene ningun problema de licencia", () => {
    expect(auditarTerceros()).toEqual([]);
  });

  it("no repite identificadores", () => {
    const ids = TERCEROS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * Hoy no hay codigo ajeno dentro de GCM. El dia que lo haya, esta prueba
   * fallara y habra que actualizarla a proposito: es un recordatorio, no un
   * dogma.
   */
  it("todavia no incluye codigo de nadie", () => {
    expect(tercerosPorEstado("en-uso")).toEqual([]);
    expect(tercerosACitar()).toEqual([]);
  });
});

describe("requiereCita", () => {
  it("cita lo que esta dentro y no reescribimos", () => {
    expect(requiereCita(tercero({ uso: "adaptado" }))).toBe(true);
    expect(requiereCita(tercero({ uso: "copiado" }))).toBe(true);
  });

  /** Leer y reescribir no arrastra licencia: no se cita. */
  it("no cita lo que solo leimos", () => {
    expect(requiereCita(tercero({ uso: "referencia", ubicaciones: [] }))).toBe(
      false,
    );
  });

  /** Un candidato todavia no esta en el producto, aunque lo vayamos a usar. */
  it("no cita lo que aun no esta dentro", () => {
    expect(requiereCita(tercero({ estado: "candidato" }))).toBe(false);
    expect(requiereCita(tercero({ estado: "solo-lectura" }))).toBe(false);
    expect(requiereCita(tercero({ estado: "descartado" }))).toBe(false);
  });
});

describe("problemasDeLicencia", () => {
  it("da por bueno lo permisivo, acreditado y localizado", () => {
    expect(problemasDeLicencia(tercero())).toEqual([]);
  });

  /** El caso que hunde el negocio: servir AGPL obliga a entregar el fuente. */
  it("frena el copyleft en cuanto se copia codigo", () => {
    const problemas = problemasDeLicencia(
      tercero({ licencia: "AGPL-3.0", uso: "adaptado" }),
    );
    expect(problemas.some((p) => p.includes("copyleft"))).toBe(true);
  });

  it("frena lo que prohibe el uso comercial", () => {
    const problemas = problemasDeLicencia(
      tercero({ licencia: "CC-BY-NC-SA-4.0", uso: "copiado" }),
    );
    expect(problemas.some((p) => p.includes("NO permite uso comercial"))).toBe(
      true,
    );
  });

  it("exige el aviso de copyright literal", () => {
    const problemas = problemasDeLicencia(tercero({ avisoCopyright: null }));
    expect(problemas.some((p) => p.includes("aviso de copyright"))).toBe(true);
  });

  /**
   * Sin saber que archivos nuestros lo llevan no se puede ni auditar ni
   * retirar el dia que el autor cambie de licencia.
   */
  it("exige decir donde vive dentro de GCM", () => {
    const problemas = problemasDeLicencia(tercero({ ubicaciones: [] }));
    expect(problemas.some((p) => p.includes("en que"))).toBe(true);
  });

  /** Declararse referencia y a la vez senalar codigo nuestro es incoherente. */
  it("detecta la referencia que en realidad se copio", () => {
    const problemas = problemasDeLicencia(
      tercero({ uso: "referencia", ubicaciones: ["src/lib/algo.ts"] }),
    );
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain("solo referencia");
  });
});

describe("LICENCIAS", () => {
  /**
   * Las dos entradas que no son licencias reales, sino agujeros: una licencia
   * anunciada sin texto ni titular, y la ausencia total de licencia. Ninguna
   * de las dos habilita a copiar nada.
   */
  it("trata los agujeros como no comerciales", () => {
    expect(LICENCIAS["declarada-sin-texto"].permiteUsoComercial).toBe(false);
    expect(LICENCIAS["sin-licencia"].permiteUsoComercial).toBe(false);
  });

  it("marca como copyleft toda la familia GPL", () => {
    expect(LICENCIAS["GPL-2.0"].contagia).toBe(true);
    expect(LICENCIAS["GPL-3.0"].contagia).toBe(true);
    expect(LICENCIAS["AGPL-3.0"].contagia).toBe(true);
  });

  it("deja pasar limpias MIT y Apache", () => {
    expect(LICENCIAS.MIT.contagia).toBe(false);
    expect(LICENCIAS.MIT.permiteUsoComercial).toBe(true);
    expect(LICENCIAS["Apache-2.0"].contagia).toBe(false);
    expect(LICENCIAS["Apache-2.0"].exigeDeclararCambios).toBe(true);
  });
});
