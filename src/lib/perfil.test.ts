import { describe, expect, it } from "vitest";
import {
  validarDocumento,
  validarPropuesta,
  tipoDocValido,
  type PerfilActual,
  type PropuestaPerfil,
} from "@/lib/perfil";

const ACTUAL: PerfilActual = {
  nombres: "Ana Maria",
  apellidos: "Torres",
  cargo: "Residente",
  tipoDoc: "DNI",
  numDoc: "12345678",
};

/** Parte de lo actual y cambia solo lo que se le indique. */
function propuesta(cambios: Partial<PropuestaPerfil> = {}): PropuestaPerfil {
  return {
    nombres: ACTUAL.nombres,
    apellidos: ACTUAL.apellidos,
    cargo: ACTUAL.cargo ?? "",
    tipoDoc: ACTUAL.tipoDoc,
    numDoc: ACTUAL.numDoc,
    ...cambios,
  };
}

describe("tipoDocValido", () => {
  it("acepta los tipos declarados", () => {
    expect(tipoDocValido("DNI")).toBe(true);
    expect(tipoDocValido("CE")).toBe(true);
    expect(tipoDocValido("PASAPORTE")).toBe(true);
  });

  it("rechaza cualquier otra cosa", () => {
    expect(tipoDocValido("RUC")).toBe(false);
    expect(tipoDocValido(null)).toBe(false);
    expect(tipoDocValido("")).toBe(false);
  });
});

describe("validarDocumento", () => {
  it("el DNI debe tener 8 digitos exactos", () => {
    expect(validarDocumento("DNI", "12345678").ok).toBe(true);
    expect(validarDocumento("DNI", "1234567").ok).toBe(false);
    expect(validarDocumento("DNI", "123456789").ok).toBe(false);
    expect(validarDocumento("DNI", "1234567a").ok).toBe(false);
  });

  it("CE y pasaporte admiten alfanumericos hasta 12", () => {
    expect(validarDocumento("CE", "001234567").ok).toBe(true);
    expect(validarDocumento("PASAPORTE", "X1234567").ok).toBe(true);
    expect(validarDocumento("CE", "0123456789012").ok).toBe(false); // 13
    expect(validarDocumento("CE", "con-guion").ok).toBe(false);
  });

  it("rechaza tipo desconocido y numero vacio", () => {
    expect(validarDocumento("RUC", "20123456789").ok).toBe(false);
    expect(validarDocumento("DNI", "   ").ok).toBe(false);
  });
});

describe("validarPropuesta", () => {
  it("sin cambios no hay solicitud", () => {
    const r = validarPropuesta(ACTUAL, propuesta());
    expect(r.ok).toBe(false);
  });

  it("los espacios de sobra no cuentan como cambio", () => {
    const r = validarPropuesta(
      ACTUAL,
      propuesta({ nombres: "  Ana   Maria " }),
    );
    expect(r.ok).toBe(false);
  });

  it("devuelve solo los campos que de verdad cambian", () => {
    const r = validarPropuesta(ACTUAL, propuesta({ cargo: "Administrador de obra" }));
    expect(r).toEqual({ ok: true, cambios: { cargo: "Administrador de obra" } });
  });

  it("el cargo vacio se interpreta como borrarlo", () => {
    const r = validarPropuesta(ACTUAL, propuesta({ cargo: "" }));
    expect(r).toEqual({ ok: true, cambios: { cargo: null } });
  });

  it("nombres o apellidos vacios son error, no borrado", () => {
    expect(validarPropuesta(ACTUAL, propuesta({ nombres: "" })).ok).toBe(false);
    expect(validarPropuesta(ACTUAL, propuesta({ apellidos: "  " })).ok).toBe(false);
  });

  it("cambiar el numero valida el documento", () => {
    expect(validarPropuesta(ACTUAL, propuesta({ numDoc: "999" })).ok).toBe(false);
    const r = validarPropuesta(ACTUAL, propuesta({ numDoc: "87654321" }));
    expect(r).toEqual({ ok: true, cambios: { numDoc: "87654321" } });
  });

  it("cambiar a CE valida el par tipo+numero completo", () => {
    // Con DNI de 8 digitos pero tipo CE: el numero sigue siendo valido para CE
    // (alfanumerico hasta 12), asi que ambos cambios entran.
    const r = validarPropuesta(
      ACTUAL,
      propuesta({ tipoDoc: "CE", numDoc: "001234567" }),
    );
    expect(r).toEqual({
      ok: true,
      cambios: { tipoDoc: "CE", numDoc: "001234567" },
    });
  });

  it("cambiar solo el tipo a DNI revalida contra el numero actual", () => {
    // numDoc actual "12345678" es DNI valido; si el actual fuera CE con letras
    // el cambio a DNI fallaria. Aqui el par queda valido.
    const conCE: PerfilActual = { ...ACTUAL, tipoDoc: "CE", numDoc: "12345678" };
    const r = validarPropuesta(conCE, propuesta({ tipoDoc: "DNI", numDoc: "12345678" }));
    expect(r).toEqual({ ok: true, cambios: { tipoDoc: "DNI" } });
  });

  it("acumula varios cambios a la vez", () => {
    const r = validarPropuesta(
      ACTUAL,
      propuesta({ nombres: "Ana Lucia", apellidos: "Torres Rios" }),
    );
    expect(r).toEqual({
      ok: true,
      cambios: { nombres: "Ana Lucia", apellidos: "Torres Rios" },
    });
  });
});
