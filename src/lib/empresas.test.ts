import { describe, it, expect } from "vitest";
import {
  validarAltaEmpresa,
  CORREO_NO_DISPONIBLE,
  type DatosAltaEmpresa,
} from "./empresas";

const base: DatosAltaEmpresa = {
  razonSocial: "CONSTRUCTORA DEL SUR SAC",
  ruc: "20601689988",
  direccion: "",
  telefono: "",
  email: "",
};

describe("validarAltaEmpresa", () => {
  it("acepta lo minimo y normaliza los espacios", () => {
    const r = validarAltaEmpresa({
      ...base,
      razonSocial: "  CONSTRUCTORA   DEL SUR SAC  ",
      ruc: " 20601689988 ",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.razonSocial).toBe("CONSTRUCTORA DEL SUR SAC");
    expect(r.datos.ruc).toBe("20601689988");
  });

  it("exige razon social", () => {
    expect(validarAltaEmpresa({ ...base, razonSocial: "   " }).ok).toBe(false);
  });

  it("topa la razon social en el limite de la columna", () => {
    expect(validarAltaEmpresa({ ...base, razonSocial: "A".repeat(200) }).ok).toBe(true);
    expect(validarAltaEmpresa({ ...base, razonSocial: "A".repeat(201) }).ok).toBe(false);
  });

  it("el RUC son 11 digitos exactos", () => {
    expect(validarAltaEmpresa({ ...base, ruc: "2060168998" }).ok).toBe(false);
    expect(validarAltaEmpresa({ ...base, ruc: "206016899881" }).ok).toBe(false);
    expect(validarAltaEmpresa({ ...base, ruc: "" }).ok).toBe(false);
  });

  it("rechaza el RUC con letras o separadores en vez de limpiarlo", () => {
    // Un RUC con guiones suele venir copiado de otro sitio: mejor que la
    // persona lo mire a que se guarde algo distinto de lo que creia.
    expect(validarAltaEmpresa({ ...base, ruc: "2060168998A" }).ok).toBe(false);
    expect(validarAltaEmpresa({ ...base, ruc: "20-60168-9988" }).ok).toBe(false);
    expect(validarAltaEmpresa({ ...base, ruc: "20601 689988" }).ok).toBe(false);
  });

  it("los opcionales vacios quedan en null, no en cadena vacia", () => {
    const r = validarAltaEmpresa({ ...base, direccion: "  ", telefono: "", email: " " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.direccion).toBeNull();
    expect(r.datos.telefono).toBeNull();
    expect(r.datos.email).toBeNull();
  });
});

describe("mensaje de correo no disponible", () => {
  it("no delata que el correo pertenece a otro cliente", () => {
    // El correo es unico en TODO GCM. Decir "ya existe" confirmaria que esa
    // persona es cliente, y permitiria sondear correos hasta acertar.
    const texto = CORREO_NO_DISPONIBLE.toLowerCase();
    for (const delator of ["existe", "registrad", "en uso", "otra empresa", "ya "]) {
      expect(texto).not.toContain(delator);
    }
  });
});
