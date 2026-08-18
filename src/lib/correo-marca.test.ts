import { describe, expect, it } from "vitest";

import {
  MARCA_GCM,
  MARCA_LOGO,
  MARCA_NOMBRE,
  MARCA_PIE,
  rotularCorreo,
} from "./correo-marca";

/// Un HTML como el que compone `plantilla`: cabecera con logo y nombre, y el
/// hueco del pie al final.
const plantilla = `<div>${MARCA_LOGO}${MARCA_NOMBRE}</div><p>cuerpo</p>${MARCA_PIE}`;

describe("rotularCorreo", () => {
  it("LA REGLA: en el correo de una constructora manda ELLA, no GCM", () => {
    const html = rotularCorreo(plantilla, {
      razonSocial: "LARQUITECTURA STUDIO SAC",
      conLogo: true,
    });

    expect(html).toContain("LARQUITECTURA STUDIO SAC");
    // Lo que no puede pasar: que el contratista reciba un correo de su
    // constructora rotulado con la marca del sistema.
    expect(html).not.toContain(MARCA_GCM);
  });

  it("pero GCM queda al pie, que es el sitio de quien pone la herramienta", () => {
    const html = rotularCorreo(plantilla, {
      razonSocial: "LARQUITECTURA STUDIO SAC",
      conLogo: true,
    });

    expect(html).toContain("Con tecnología de GCM");
  });

  it("los correos que NO son de una empresa siguen firmando GCM", () => {
    // El codigo de acceso a GCM lo manda GCM, no una constructora.
    const html = rotularCorreo(plantilla, null);

    expect(html).toContain(MARCA_GCM);
    expect(html).not.toContain("Con tecnología de GCM");
  });

  it("sin logo no queda una imagen rota, solo el nombre", () => {
    const html = rotularCorreo(plantilla, {
      razonSocial: "CONSTRUCTORA SIN LOGO SAC",
      conLogo: false,
    });

    expect(html).not.toContain("<img");
    expect(html).toContain("CONSTRUCTORA SIN LOGO SAC");
  });

  it("no deja ni una costura a la vista, se sustituyan o no", () => {
    for (const marca of [null, { razonSocial: "X SAC", conLogo: true }]) {
      const html = rotularCorreo(plantilla, marca);

      expect(html).not.toContain(MARCA_LOGO);
      expect(html).not.toContain(MARCA_NOMBRE);
      expect(html).not.toContain(MARCA_PIE);
    }
  });

  it("escapa la razon social: la teclea una persona y va en TODOS sus correos", () => {
    const html = rotularCorreo(plantilla, {
      razonSocial: '<a href="http://malo.pe">Constructora</a>',
      conLogo: false,
    });

    // Sin esto, un enlace colado en el alta de la empresa saldria como enlace
    // de verdad en la cabecera de cada correo que manda.
    expect(html).not.toContain('<a href="http://malo.pe">');
    expect(html).toContain("&lt;a href=");
  });
});
