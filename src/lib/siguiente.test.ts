import { describe, expect, it } from "vitest";

import {
  conSiguiente,
  rutaActual,
  rutaConSiguiente,
  rutaSiguienteSegura,
} from "./siguiente";

describe("rutaSiguienteSegura", () => {
  it("acepta una ruta interna normal", () => {
    expect(rutaSiguienteSegura("/obras/123/lookahead")).toBe(
      "/obras/123/lookahead",
    );
  });

  it("conserva la cadena de busqueda", () => {
    expect(rutaSiguienteSegura("/obras/123/cronograma?semana=5")).toBe(
      "/obras/123/cronograma?semana=5",
    );
  });

  // ESTA es la prueba que da sentido a la funcion: sin ella, `siguiente` seria
  // una redireccion abierta que cualquiera podria usar para hacer phishing con
  // el dominio de confianza de GCM.
  it("rechaza una URL absoluta a otro host", () => {
    expect(rutaSiguienteSegura("https://otro-sitio.com/robar")).toBeUndefined();
  });

  it("rechaza el protocolo-relativo //host, que el navegador lee como otro host", () => {
    expect(rutaSiguienteSegura("//otro-sitio.com")).toBeUndefined();
  });

  it("rechaza /\\host, la variante con barra invertida", () => {
    expect(rutaSiguienteSegura("/\\otro-sitio.com")).toBeUndefined();
  });

  it("rechaza una ruta que no empieza por barra", () => {
    expect(rutaSiguienteSegura("obras/123")).toBeUndefined();
  });

  it("rechaza vacio, undefined, null y tipos que no son string", () => {
    expect(rutaSiguienteSegura("")).toBeUndefined();
    expect(rutaSiguienteSegura(undefined)).toBeUndefined();
    expect(rutaSiguienteSegura(null)).toBeUndefined();
    expect(rutaSiguienteSegura(42)).toBeUndefined();
  });
});

describe("rutaActual", () => {
  it("junta pathname y search cuando hay busqueda", () => {
    expect(rutaActual("/obras/123", "?semana=5")).toBe("/obras/123?semana=5");
  });

  it("deja solo el pathname cuando no hay busqueda", () => {
    expect(rutaActual("/obras/123", "")).toBe("/obras/123");
  });
});

describe("conSiguiente", () => {
  it("añade el parametro cuando hay ruta de vuelta", () => {
    const url = conSiguiente(
      new URL("https://gcm.example.com/login"),
      "/obras/123/lookahead",
    );
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("siguiente")).toBe("/obras/123/lookahead");
  });

  it("deja la URL intacta cuando no hay ruta de vuelta", () => {
    const url = conSiguiente(new URL("https://gcm.example.com/login"), undefined);
    expect(url.search).toBe("");
  });
});

describe("rutaConSiguiente", () => {
  it("añade el parametro codificado a una ruta de string", () => {
    expect(rutaConSiguiente("/verificar-codigo", "/obras/123?semana=5")).toBe(
      "/verificar-codigo?siguiente=%2Fobras%2F123%3Fsemana%3D5",
    );
  });

  it("deja la ruta intacta cuando no hay adonde volver", () => {
    expect(rutaConSiguiente("/verificar-codigo", undefined)).toBe(
      "/verificar-codigo",
    );
  });

  // Sin esto, "/login?codigo=expirado" mas siguiente daria
  // "/login?codigo=expirado?siguiente=..." — una cadena de busqueda invalida
  // que ningun navegador interpreta como dos parametros.
  it("usa & cuando la ruta ya trae su propia cadena de busqueda", () => {
    expect(
      rutaConSiguiente("/login?codigo=expirado", "/obras/123"),
    ).toBe("/login?codigo=expirado&siguiente=%2Fobras%2F123");
  });
});
