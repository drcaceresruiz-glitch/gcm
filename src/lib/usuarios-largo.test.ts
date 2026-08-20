import { describe, expect, it } from "vitest";
import {
  MAX_APELLIDOS,
  MAX_EMAIL,
  MAX_NOMBRES,
  demasiadoLargo,
  validarAltaUsuario,
  type DatosAltaUsuario,
} from "@/lib/usuarios";

/**
 * LOS TOPES DE LAS COLUMNAS, que hasta el 20/08/2026 no se miraban.
 *
 * `cargo` y `celular` se recortaban desde el principio; `nombres`, `apellidos`
 * y `email` viajaban enteros contra sus `VarChar`, y un nombre pegado de mas
 * era un «Data too long» que subia sin capturar hasta la pantalla de error.
 * Es exactamente el mismo hueco que tenia el importador con la unidad.
 *
 * Aqui se RECHAZA en vez de recortar: un cargo acortado sigue describiendo el
 * puesto, pero el nombre de una persona y su correo son su identidad —y el
 * correo es ademas con lo que entra—, asi que guardarlos a medias en silencio
 * es peor que pedir que se corrijan.
 */

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

describe("demasiadoLargo", () => {
  it("deja pasar lo que cabe justo", () => {
    expect(
      demasiadoLargo({
        nombres: "a".repeat(MAX_NOMBRES),
        apellidos: "b".repeat(MAX_APELLIDOS),
        email: `${"c".repeat(MAX_EMAIL - 10)}@x.com`,
      }),
    ).toBeNull();
  });

  it("nombra el campo y su limite, para poder corregirlo", () => {
    const m = demasiadoLargo({
      nombres: "a".repeat(MAX_NOMBRES + 1),
      apellidos: "b",
      email: "c@x.com",
    });
    expect(m).toContain("nombres");
    expect(m).toContain(String(MAX_NOMBRES));
  });

  it("y lo hace con cada uno de los tres", () => {
    expect(
      demasiadoLargo({ nombres: "a", apellidos: "b".repeat(101), email: "c@x.com" }),
    ).toContain("apellidos");

    expect(
      demasiadoLargo({ nombres: "a", apellidos: "b", email: `${"c".repeat(150)}@x.com` }),
    ).toContain("correo");
  });
});

describe("validarAltaUsuario con textos largos", () => {
  it("rechaza el alta antes de que la base tenga que decir que no", () => {
    const r = validarAltaUsuario(alta({ nombres: "A".repeat(120) }));

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("100");
  });

  it("un correo larguisimo tampoco pasa", () => {
    const r = validarAltaUsuario(alta({ email: `${"a".repeat(200)}@x.com` }));

    expect(r.ok).toBe(false);
  });

  /**
   * El tope se mide DESPUES de normalizar. Los espacios de sobra no cuentan:
   * rechazar por algo que el propio sistema iba a quitar seria absurdo.
   */
  it("los espacios que se van al normalizar no gastan cupo", () => {
    const r = validarAltaUsuario(alta({ nombres: `  ${"a".repeat(100)}  ` }));

    expect(r.ok).toBe(true);
  });

  it("lo normal sigue pasando", () => {
    expect(validarAltaUsuario(alta()).ok).toBe(true);
  });
});
