import { describe, it, expect } from "vitest";
import { validarProveedorIa, type DatosProveedorIa } from "./proveedor-ia";

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
