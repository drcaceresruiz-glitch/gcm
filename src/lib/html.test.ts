import { describe, expect, it } from "vitest";
import { escaparHtml } from "./html";

describe("escaparHtml", () => {
  it("deja el texto normal como esta, tildes incluidas", () => {
    expect(escaparHtml("Cimentación de zapatas")).toBe("Cimentación de zapatas");
  });

  it("desactiva un enlace metido en el nombre de una tarea", () => {
    // El caso real: el nombre sale de un XML que sube el usuario y el correo
    // va al cliente con el membrete de la empresa.
    expect(escaparHtml('<a href="http://malo">Pincha</a>')).toBe(
      "&lt;a href=&quot;http://malo&quot;&gt;Pincha&lt;/a&gt;",
    );
  });

  it("escapa el ampersand ANTES que lo demas, sin doble escape", () => {
    // Al reves, "&lt;" saldria "&amp;lt;" y el correo ensenaria la etiqueta.
    expect(escaparHtml("Acero & encofrado")).toBe("Acero &amp; encofrado");
    expect(escaparHtml("<")).toBe("&lt;");
  });

  it("escapa las comillas, por si el texto cae dentro de un atributo", () => {
    expect(escaparHtml(`Muro de 8" o'clock`)).toBe("Muro de 8&quot; o&#39;clock");
  });

  it("el vacio se queda vacio", () => {
    expect(escaparHtml("")).toBe("");
  });
});
