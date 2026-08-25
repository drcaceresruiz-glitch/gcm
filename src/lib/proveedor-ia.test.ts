import { describe, it, expect } from "vitest";
import {
  validarProveedorIa,
  situacionDeProveedorIa,
  SERVICIOS_IA_CONOCIDOS,
  TIPOS_PROVEEDOR_IA_CONOCIDOS,
  type DatosProveedorIa,
} from "./proveedor-ia";

const BUENO: DatosProveedorIa = {
  tipo: "claude",
  nombre: "El de producción",
  urlBase: "",
  modelo: "claude-sonnet-5",
  apiKey: "sk-abc123",
};

describe("un proveedor de IA de la empresa", () => {
  it("acepta una configuracion completa", () => {
    const r = validarProveedorIa(BUENO, true);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.urlBase).toBeNull();
      expect(r.datos.tipo).toBe("claude");
    }
  });

  it("exige la clave al crear pero no al editar", () => {
    const sinClave = { ...BUENO, apiKey: "" };
    expect(validarProveedorIa(sinClave, true).ok).toBe(false);
    expect(validarProveedorIa(sinClave, false).ok).toBe(true);
  });

  it("exige un nombre, para distinguir varios del mismo tipo", () => {
    const r = validarProveedorIa({ ...BUENO, nombre: "   " }, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("nombre");
  });

  it("exige un modelo", () => {
    const r = validarProveedorIa({ ...BUENO, modelo: "" }, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("modelo");
  });

  it("una URL base sin https:// se rechaza", () => {
    const r = validarProveedorIa(
      { ...BUENO, urlBase: "api.otroproveedor.com" },
      true,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("https://");
  });

  it("acepta una URL base valida y le quita la barra final", () => {
    const r = validarProveedorIa(
      { ...BUENO, tipo: "openai_compatible", urlBase: "https://api.x.com/v1/" },
      true,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos.urlBase).toBe("https://api.x.com/v1");
  });

  /// A proposito NO se restringe `tipo` a una lista fija: el registro de
  /// adaptadores del servicio es la fuente real de que se puede probar.
  it("no rechaza un tipo desconocido — eso lo dice el servicio al probarlo", () => {
    const r = validarProveedorIa({ ...BUENO, tipo: "algo_nuevo" }, true);
    expect(r.ok).toBe(true);
  });

  it("rechaza un tipo vacio", () => {
    const r = validarProveedorIa({ ...BUENO, tipo: "" }, true);
    expect(r.ok).toBe(false);
  });
});

describe("el catalogo de servicios conocidos", () => {
  it("cada servicio apunta a un tipo que la pantalla sabe pintar", () => {
    const tiposValidos = new Set(TIPOS_PROVEEDOR_IA_CONOCIDOS.map((t) => t.valor));
    for (const s of SERVICIOS_IA_CONOCIDOS) {
      expect(tiposValidos.has(s.tipo)).toBe(true);
    }
  });

  it("cada valor de servicio es unico — el <select> del formulario no puede repetirlos", () => {
    const valores = SERVICIOS_IA_CONOCIDOS.map((s) => s.valor);
    expect(new Set(valores).size).toBe(valores.length);
  });

  it("un servicio openai_compatible con urlBase de fabrica, la deja pasar la validacion tal cual", () => {
    const gemini = SERVICIOS_IA_CONOCIDOS.find((s) => s.valor === "gemini")!;
    const r = validarProveedorIa(
      { ...BUENO, tipo: gemini.tipo, urlBase: gemini.urlBase ?? "" },
      true,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos.urlBase).toBe(gemini.urlBase);
  });
});

describe("lo que se dice del estado de un proveedor", () => {
  const PROBADO = new Date("2026-08-25T16:08:00Z");
  const DESPUES = new Date("2026-08-25T18:30:00Z");
  const ANTES = new Date("2026-08-25T09:00:00Z");

  it("sin probar es sin probar", () => {
    expect(
      situacionDeProveedorIa({ verificadoAt: null, ultimoError: null, ultimoErrorAt: null }),
    ).toEqual({ clase: "sin_probar" });
  });

  it("probado y sin errores funciona", () => {
    expect(
      situacionDeProveedorIa({ verificadoAt: PROBADO, ultimoError: null, ultimoErrorAt: null }),
    ).toEqual({ clase: "funciona", verificadoAt: PROBADO });
  });

  it("un fallo sin prueba buena detras es un fallo a secas", () => {
    expect(
      situacionDeProveedorIa({ verificadoAt: null, ultimoError: "(401) clave", ultimoErrorAt: DESPUES }),
    ).toEqual({ clase: "fallo", error: "(401) clave", ocurridoAt: DESPUES });
  });

  /**
   * El que se comia la pantalla, y el que costo una tarde el 25 de agosto de
   * 2026: alguien lo probo y funcionaba, el modelo se saturo, la conversacion
   * guardo el 503 —sin tocar `verificadoAt`, a proposito— y la pantalla
   * seguia diciendo «probado y funciono». El asistente estaba caido y su
   * pantalla de configuracion no lo delataba.
   */
  it("un fallo POSTERIOR a la prueba buena no se lo come el «funciona»", () => {
    expect(
      situacionDeProveedorIa({
        verificadoAt: PROBADO,
        ultimoError: "(503) The model is experiencing high demand",
        ultimoErrorAt: DESPUES,
      }),
    ).toEqual({
      clase: "fallo_tras_funcionar",
      error: "(503) The model is experiencing high demand",
      ocurridoAt: DESPUES,
      verificadoAt: PROBADO,
    });
  });

  it("un fallo ANTERIOR a la ultima prueba buena ya no describe al proveedor", () => {
    expect(
      situacionDeProveedorIa({
        verificadoAt: PROBADO,
        ultimoError: "(503) saturado",
        ultimoErrorAt: ANTES,
      }),
    ).toEqual({ clase: "funciona", verificadoAt: PROBADO });
  });

  it("un fallo sin fecha se cuenta como posterior, no se calla", () => {
    const r = situacionDeProveedorIa({
      verificadoAt: PROBADO,
      ultimoError: "(503) saturado",
      ultimoErrorAt: null,
    });
    expect(r.clase).toBe("fallo_tras_funcionar");
    if (r.clase === "fallo_tras_funcionar") expect(r.ocurridoAt).toBeNull();
  });
});
