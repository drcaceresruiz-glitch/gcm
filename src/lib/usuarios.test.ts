import { describe, expect, it } from "vitest";
import {
  correoValido,
  rolValido,
  validarAltaUsuario,
  mensajeCorreoEnUso,
  type DatosAltaUsuario,
} from "@/lib/usuarios";

function alta(cambios: Partial<DatosAltaUsuario> = {}): DatosAltaUsuario {
  return {
    nombres: "Ana",
    apellidos: "Torres",
    email: "ana@empresa.com",
    tipoDoc: "DNI",
    numDoc: "12345678",
    cargo: "Residente",
    celular: "999888777",
    role: "RESIDENTE",
    ...cambios,
  };
}

describe("correoValido", () => {
  it("acepta correos con forma algo@algo.algo", () => {
    expect(correoValido("ana@empresa.com")).toBe(true);
    expect(correoValido("a.b+c@sub.dominio.pe")).toBe(true);
  });

  it("rechaza lo que no lo es", () => {
    expect(correoValido("ana@empresa")).toBe(false);
    expect(correoValido("ana empresa.com")).toBe(false);
    expect(correoValido("@empresa.com")).toBe(false);
    expect(correoValido("")).toBe(false);
  });
});

describe("rolValido", () => {
  it("acepta los roles del sistema", () => {
    expect(rolValido("ADMIN")).toBe(true);
    expect(rolValido("CONSULTOR")).toBe(true);
  });

  it("rechaza cualquier otro", () => {
    expect(rolValido("SUPREMO")).toBe(false);
    expect(rolValido(null)).toBe(false);
  });
});

describe("validarAltaUsuario", () => {
  it("normaliza y acepta un alta correcta", () => {
    const r = validarAltaUsuario(
      alta({ nombres: "  Ana  Maria ", email: "ANA@EMPRESA.COM" }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.nombres).toBe("Ana Maria");
      // El correo se guarda en minusculas: es el identificador de acceso.
      expect(r.datos.email).toBe("ana@empresa.com");
      expect(r.datos.role).toBe("RESIDENTE");
    }
  });

  it("exige nombres y apellidos", () => {
    expect(validarAltaUsuario(alta({ nombres: "" })).ok).toBe(false);
    expect(validarAltaUsuario(alta({ apellidos: "  " })).ok).toBe(false);
  });

  it("valida el correo y el documento", () => {
    expect(validarAltaUsuario(alta({ email: "malo" })).ok).toBe(false);
    expect(validarAltaUsuario(alta({ tipoDoc: "DNI", numDoc: "123" })).ok).toBe(false);
  });

  it("rechaza un rol inexistente", () => {
    expect(validarAltaUsuario(alta({ role: "SUPREMO" })).ok).toBe(false);
  });

  it("cargo y celular vacios quedan en null", () => {
    const r = validarAltaUsuario(alta({ cargo: "", celular: "" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.cargo).toBeNull();
      expect(r.datos.celular).toBeNull();
    }
  });
});

/**
 * El choque de correos.
 *
 * Por la manana esto tenia DOS ramas â€”una para la gente de casa y otra, muda,
 * para la de otra constructoraâ€” porque el correo era unico en toda la
 * instalacion. Por la tarde paso a ser unico POR EMPRESA y la segunda dejo de
 * existir: un choque solo puede ser con alguien de casa, y de los de casa
 * siempre se puede decir el nombre.
 */
describe("mensajeCorreoEnUso", () => {
  it("dice de quien es el correo", () => {
    expect(mensajeCorreoEnUso({ nombres: "Rosa", apellidos: "Diaz" })).toBe(
      "Ese correo ya es de Rosa Diaz.",
    );
  });

  it("un nombre con espacios de sobra no deja el punto suelto", () => {
    expect(mensajeCorreoEnUso({ nombres: "Rosa", apellidos: "" })).toBe(
      "Ese correo ya es de Rosa.",
    );
  });
});
