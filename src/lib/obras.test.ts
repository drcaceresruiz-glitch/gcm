import { describe, expect, it } from "vitest";
import {
  estadoDeObra,
  fechaDeObra,
  validarObra,
  formatearCorrelativoObra,
} from "@/lib/obras";

describe("formatearCorrelativoObra", () => {
  it("rellena con ceros a seis digitos", () => {
    expect(formatearCorrelativoObra(1)).toBe("OB-000001");
    expect(formatearCorrelativoObra(42)).toBe("OB-000042");
    expect(formatearCorrelativoObra(123456)).toBe("OB-123456");
  });

  /** El padding es justo para esto: ordenar como texto = ordenar como numero. */
  it("OB-000009 va antes que OB-000010 al ordenar", () => {
    const nueve = formatearCorrelativoObra(9);
    const diez = formatearCorrelativoObra(10);
    expect([diez, nueve].sort()).toEqual([nueve, diez]);
  });
});

describe("estadoDeObra", () => {
  it("acepta los estados del esquema", () => {
    expect(estadoDeObra("EN_EJECUCION")).toBe("EN_EJECUCION");
    expect(estadoDeObra("CERRADA")).toBe("CERRADA");
  });

  /** Viene de un desplegable: manipular la peticion no debe romper el alta. */
  it("cae en planificacion ante cualquier otra cosa", () => {
    expect(estadoDeObra(undefined)).toBe("PLANIFICACION");
    expect(estadoDeObra("")).toBe("PLANIFICACION");
    expect(estadoDeObra("BORRADO")).toBe("PLANIFICACION");
  });
});

describe("fechaDeObra", () => {
  it("lee lo que manda un input de tipo date", () => {
    expect(fechaDeObra("2026-08-01")?.toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("rechaza lo que no es una fecha", () => {
    expect(fechaDeObra(undefined)).toBeNull();
    expect(fechaDeObra("")).toBeNull();
    expect(fechaDeObra("01/08/2026")).toBeNull();
    expect(fechaDeObra("2026-8-1")).toBeNull();
  });

  /**
   * `new Date("2026-02-31")` no falla: rueda al 3 de marzo. Sin comprobarlo,
   * una obra podria quedar con una fecha de inicio que nadie escribio.
   */
  it("rechaza los dias que no existen en vez de rodarlos", () => {
    expect(fechaDeObra("2026-02-31")).toBeNull();
    expect(fechaDeObra("2026-13-01")).toBeNull();
  });

  it("acepta el 29 de febrero de un bisiesto", () => {
    expect(fechaDeObra("2028-02-29")).not.toBeNull();
    expect(fechaDeObra("2026-02-29")).toBeNull();
  });
});

describe("validarObra", () => {
  const base = {
    nombreObra: "CRIOCORD",
    fechaInicio: "2026-08-01",
    fechaFinProgramada: "2026-10-22",
  };

  it("acepta una obra con nombre y plazo coherente", () => {
    const r = validarObra(base);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plazo.inicio.toISOString().slice(0, 10)).toBe("2026-08-01");
      expect(r.plazo.fin.toISOString().slice(0, 10)).toBe("2026-10-22");
    }
  });

  it("exige el nombre", () => {
    const r = validarObra({ ...base, nombreObra: "   " });
    expect(r).toEqual({ ok: false, error: "Indica el nombre de la obra." });
  });

  it("exige las dos fechas", () => {
    expect(validarObra({ ...base, fechaInicio: "" }).ok).toBe(false);
    expect(validarObra({ ...base, fechaFinProgramada: "manana" }).ok).toBe(false);
  });

  /** Un plazo hacia atras da avances de calendario negativos o del 100 %. */
  it("rechaza que el fin sea anterior al inicio", () => {
    const r = validarObra({
      ...base,
      fechaInicio: "2026-10-22",
      fechaFinProgramada: "2026-08-01",
    });

    expect(r).toEqual({
      ok: false,
      error: "La fecha de fin no puede ser anterior a la de inicio.",
    });
  });

  it("admite una obra de un solo dia", () => {
    expect(
      validarObra({
        ...base,
        fechaInicio: "2026-08-01",
        fechaFinProgramada: "2026-08-01",
      }).ok,
    ).toBe(true);
  });
});
