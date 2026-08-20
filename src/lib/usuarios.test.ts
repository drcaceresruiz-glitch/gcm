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
 * El choque de correos, que es lo que se leyo mal el 20/08/2026.
 *
 * Las dos propiedades que importan y que se pueden romper por separado:
 * de la gente de casa se dice el nombre, y de la de fuera NO —pero si se dice
 * que esta fuera, que es justo la frase que faltaba—.
 */
describe("mensajeCorreoEnUso", () => {
  const MIA = "empresa-mia";
  const rosa = { companyId: MIA, nombres: "Rosa", apellidos: "Diaz" };
  const ajena = { companyId: "OTRA", nombres: "Rosa", apellidos: "Diaz" };

  it("de alguien de mi empresa dice de quien es", () => {
    expect(mensajeCorreoEnUso(rosa, MIA)).toBe("Ese correo ya es de Rosa Diaz.");
  });

  it("de otra constructora NO dice de quien es", () => {
    const m = mensajeCorreoEnUso(ajena, MIA);
    expect(m).not.toContain("Rosa");
    expect(m).not.toContain("Diaz");
  });

  /**
   * La frase que evita la hora perdida. Sin ella el administrador lee «ya
   * existe», va a su lista, no lo encuentra y concluye que GCM le esta
   * ensenando los usuarios de otros clientes.
   */
  it("de otra constructora explica por que no aparece en la lista", () => {
    const m = mensajeCorreoEnUso(ajena, MIA);
    expect(m).toContain("otra constructora");
    expect(m).toContain("no aparece en tu lista");
  });

  it("y mantiene el «ya esta en uso» del que dependen otras pruebas", () => {
    expect(mensajeCorreoEnUso(ajena, MIA)).toContain("ya esta en uso");
  });

  it("un nombre con espacios de sobra no deja el punto suelto", () => {
    const conEspacios = { companyId: MIA, nombres: "Rosa", apellidos: "" };
    expect(mensajeCorreoEnUso(conEspacios, MIA)).toBe("Ese correo ya es de Rosa.");
  });
});
