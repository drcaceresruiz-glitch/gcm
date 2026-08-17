import { describe, expect, it } from "vitest";

import { conCodigoDePais, normalizarCelular } from "./contacto";

describe("normalizarCelular", () => {
  it("acepta el celular como lo escribe la gente", () => {
    for (const escrito of [
      "998107700",
      "998 107 700",
      "998-107-700",
      "+51 998107700",
      "51998107700",
      "(998) 107700",
    ]) {
      expect(normalizarCelular(escrito)).toBe("998107700");
    }
  });

  it("rechaza lo que no es un móvil peruano", () => {
    for (const malo of ["12345678", "998107700123", "abc", "", "812345678"]) {
      expect(normalizarCelular(malo)).toBeNull();
    }
  });
});

describe("conCodigoDePais", () => {
  // ESTA es la que faltaba. La pasarela de json.pe documenta el destino «con
  // codigo de pais, sin el simbolo +», y GCM le mandaba las nueve cifras que
  // guarda. Como ese canal esta sin configurar, nadie lo noto: habria fallado
  // el dia que se encendiera, que es justo el dia que hace falta un respaldo.
  it("antepone el 51 al número de nueve cifras", () => {
    expect(conCodigoDePais("998107700")).toBe("51998107700");
  });

  it("lo deja en el formato que piden fuera: sin +, sin espacios", () => {
    expect(conCodigoDePais("998107700")).toMatch(/^\d{11}$/);
  });

  // Ida y vuelta: lo que sale con prefijo tiene que volver a entrar.
  it("se puede deshacer con normalizarCelular", () => {
    expect(normalizarCelular(conCodigoDePais("998107700"))).toBe("998107700");
  });
});
