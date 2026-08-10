import { describe, it, expect } from "vitest";
import {
  normalizarCelular,
  normalizarEmail,
  reconocerContacto,
  validarAltaPase,
  nombreDePase,
  type DatosAltaPase,
} from "./pase";

function alta(cambios: Partial<DatosAltaPase> = {}): DatosAltaPase {
  return {
    nombres: "Juan",
    apellidos: "Perez Quispe",
    cargo: "",
    empresa: "",
    celular: "987654321",
    email: "",
    ...cambios,
  };
}

describe("normalizarCelular", () => {
  it("acepta un movil peruano tal cual", () => {
    expect(normalizarCelular("987654321")).toBe("987654321");
  });

  it("acepta como lo escribe la gente de verdad", () => {
    // Si esto se rompe, la persona teclea su numero un martes de otra forma
    // y el sistema le dice que no esta registrada.
    expect(normalizarCelular("987 654 321")).toBe("987654321");
    expect(normalizarCelular("987-654-321")).toBe("987654321");
    expect(normalizarCelular(" (987) 654321 ")).toBe("987654321");
    expect(normalizarCelular("+51 987 654 321")).toBe("987654321");
    expect(normalizarCelular("51987654321")).toBe("987654321");
  });

  it("rechaza lo que no es un movil peruano", () => {
    expect(normalizarCelular("12345678")).toBeNull();
    expect(normalizarCelular("1234567890")).toBeNull();
    expect(normalizarCelular("887654321")).toBeNull();
    expect(normalizarCelular("")).toBeNull();
    expect(normalizarCelular("no soy un numero")).toBeNull();
  });

  it("un fijo de Lima con 51 delante no se confunde con un movil", () => {
    // 51 + 8 cifras son 10, no 11: no se le quita el prefijo y no empieza
    // por 9, asi que cae. Es lo correcto: no es un celular.
    expect(normalizarCelular("5114567890")).toBeNull();
  });
});

describe("normalizarEmail", () => {
  it("baja a minusculas y recorta", () => {
    expect(normalizarEmail("  Juan.Perez@Obra.PE ")).toBe("juan.perez@obra.pe");
  });

  it("rechaza lo que ni siquiera parece un correo", () => {
    expect(normalizarEmail("juan")).toBeNull();
    expect(normalizarEmail("juan@")).toBeNull();
    expect(normalizarEmail("juan@obra")).toBeNull();
    expect(normalizarEmail("")).toBeNull();
  });
});

describe("reconocerContacto", () => {
  it("decide por la arroba, sin preguntarle a nadie", () => {
    expect(reconocerContacto("juan@obra.pe")).toEqual({
      tipo: "email",
      valor: "juan@obra.pe",
    });
    expect(reconocerContacto("+51 987 654 321")).toEqual({
      tipo: "celular",
      valor: "987654321",
    });
  });

  it("devuelve null si no es ni una cosa ni la otra", () => {
    expect(reconocerContacto("")).toBeNull();
    expect(reconocerContacto("   ")).toBeNull();
    expect(reconocerContacto("12345")).toBeNull();
    expect(reconocerContacto("@obra.pe")).toBeNull();
  });

  it("lo que reconoce sale ya en forma canonica", () => {
    // Dos formas de escribir lo mismo tienen que llegar al mismo valor, o la
    // busqueda del pase fallaria.
    const a = reconocerContacto("987-654-321");
    const b = reconocerContacto("+51987654321");
    expect(a).toEqual(b);
  });
});

describe("validarAltaPase", () => {
  it("exige nombres y apellidos", () => {
    expect(validarAltaPase(alta({ nombres: "  " }))).toEqual({
      ok: false,
      error: "Escribe los nombres.",
    });
    expect(validarAltaPase(alta({ apellidos: "" }))).toEqual({
      ok: false,
      error: "Escribe los apellidos.",
    });
  });

  it("exige AL MENOS un contacto", () => {
    // Un pase sin correo ni celular no podria recibir un codigo nunca: seria
    // una fila muerta que ademas aparentaria dar acceso.
    const r = validarAltaPase(alta({ celular: "", email: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("al menos un celular o un correo");
  });

  it("basta con el correo", () => {
    const r = validarAltaPase(alta({ celular: "", email: "juan@obra.pe" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.email).toBe("juan@obra.pe");
      expect(r.datos.celular).toBeNull();
    }
  });

  it("sanea y normaliza lo que entra", () => {
    const r = validarAltaPase(
      alta({
        nombres: "  juan   carlos ",
        apellidos: " Perez  Quispe ",
        cargo: " Maestro de obra ",
        empresa: "  ",
        celular: "+51 987 654 321",
        email: " JUAN@OBRA.PE ",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.nombres).toBe("juan carlos");
      expect(r.datos.apellidos).toBe("Perez Quispe");
      expect(r.datos.cargo).toBe("Maestro de obra");
      expect(r.datos.empresa).toBeNull();
      expect(r.datos.celular).toBe("987654321");
      expect(r.datos.email).toBe("juan@obra.pe");
    }
  });

  it("avisa cuando el contacto esta mal escrito, en vez de guardarlo roto", () => {
    const c = validarAltaPase(alta({ celular: "12345" }));
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error).toContain("nueve cifras");

    const e = validarAltaPase(alta({ celular: "", email: "juan@" }));
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.error).toContain("correo");
  });
});

describe("nombreDePase", () => {
  it("arma el nombre que quedara firmando cada foto", () => {
    expect(nombreDePase({ nombres: "Juan", apellidos: "Perez" })).toBe(
      "Juan Perez",
    );
  });

  it("no desborda el campo de la base (150)", () => {
    const largo = nombreDePase({
      nombres: "A".repeat(100),
      apellidos: "B".repeat(100),
    });
    expect(largo.length).toBe(150);
  });
});
