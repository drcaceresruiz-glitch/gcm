import { describe, expect, it } from "vitest";
import {
  SILENCIO_SOSPECHOSO_SEGUNDOS,
  estadoDelEmisor,
  validarEtiquetaEmisor,
} from "./emisor-sms";

describe("estadoDelEmisor", () => {
  const ahora = new Date("2026-08-12T10:00:00Z");

  it("esta vivo si acaba de preguntar", () => {
    const haceNada = new Date(ahora.getTime() - 5_000);
    expect(estadoDelEmisor(haceNada, ahora)).toBe("vivo");
  });

  it("aguanta que se pierda alguna consulta sin dar la alarma", () => {
    // Cobertura mala no es un telefono dormido. Avisar al primer fallo seria
    // una alarma que casi siempre miente, y a las tres se deja de mirar.
    const unLatidoPerdido = new Date(ahora.getTime() - 25_000);
    expect(estadoDelEmisor(unLatidoPerdido, ahora)).toBe("vivo");
  });

  it("lo da por dormido tras dos minutos de silencio", () => {
    // El fallo de verdad: Android duerme la app al apagar la pantalla si no
    // se quito el ahorro de bateria, y los codigos dejan de salir sin aviso.
    const mudo = new Date(
      ahora.getTime() - (SILENCIO_SOSPECHOSO_SEGUNDOS + 1) * 1000,
    );
    expect(estadoDelEmisor(mudo, ahora)).toBe("dormido");
  });

  it("justo en el limite todavia cuenta como vivo", () => {
    const limite = new Date(
      ahora.getTime() - SILENCIO_SOSPECHOSO_SEGUNDOS * 1000,
    );
    expect(estadoDelEmisor(limite, ahora)).toBe("vivo");
  });

  it("distingue el que nunca pregunto del que se durmio", () => {
    // No es lo mismo y el consejo tampoco: uno esta a medio configurar, el
    // otro estaba funcionando y dejo de hacerlo.
    expect(estadoDelEmisor(null, ahora)).toBe("nunca");
  });
});

describe("validarEtiquetaEmisor", () => {
  it("acepta un nombre normal y lo deja limpio", () => {
    expect(validarEtiquetaEmisor("  el de la   caseta ")).toEqual({
      ok: true,
      etiqueta: "el de la caseta",
    });
  });

  it("exige nombre: con dos telefonos y ninguno con nombre, revocar es adivinar", () => {
    expect(validarEtiquetaEmisor("")).toEqual({
      ok: false,
      error: "Ponle un nombre al teléfono, para saber cuál es cuando haya dos.",
    });
    expect(validarEtiquetaEmisor("   ")).toMatchObject({ ok: false });
  });

  it("recorta lo que no cabe en la columna", () => {
    const largo = validarEtiquetaEmisor("x".repeat(200));
    expect(largo).toMatchObject({ ok: true });
    if (largo.ok) expect(largo.etiqueta).toHaveLength(80);
  });
});
