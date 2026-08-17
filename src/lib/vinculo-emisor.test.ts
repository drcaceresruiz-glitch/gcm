import { describe, expect, it } from "vitest";

import { mensajeDeVinculo, pasosDeVinculo } from "./vinculo-emisor";
import { enlaceWhatsApp } from "./whatsapp";

const datos = {
  token: "Do1_RonGL2udZKsk6bxYpr3-Hp1Ad9_X-ooUY3bbNAY",
  direccionCola: "https://gcm.drcaceresruiz.com/api/sms/cola",
  urlInstalador: "https://github.com/x/gcm/releases/latest/download/emisor-sms.apk",
};

describe("pasosDeVinculo", () => {
  it("lleva las tres cosas que no se pueden adivinar", () => {
    const todo = pasosDeVinculo(datos).join("\n");

    expect(todo).toContain(datos.urlInstalador);
    expect(todo).toContain(datos.direccionCola);
    expect(todo).toContain(datos.token);
  });

  // Es LA causa de casi todos los telefonos que aparecen dormidos. Si deja de
  // ser un paso y se convierte en una nota al pie, no lo lee nadie.
  it("el ahorro de batería es un paso, no una nota al pie", () => {
    expect(pasosDeVinculo(datos).some((p) => p.includes("ahorro de batería"))).toBe(
      true,
    );
  });
});

describe("mensajeDeVinculo", () => {
  it("numera los pasos para poder seguirlos por teléfono", () => {
    const mensaje = mensajeDeVinculo(datos);

    expect(mensaje).toContain("1. Descarga el instalador");
    expect(mensaje).toContain("5. Pega este token");
  });

  // El token abre la cola por la que viajan los codigos de segundo factor EN
  // CLARO. Queda en el historial de dos telefonos, asi que el mensaje tiene
  // que pedir que se borre.
  it("pide que se borre el mensaje al terminar", () => {
    expect(mensajeDeVinculo(datos)).toContain("borra este mensaje");
  });

  it("no se pierde ningún paso por el camino", () => {
    const mensaje = mensajeDeVinculo(datos);

    for (const paso of pasosDeVinculo(datos)) expect(mensaje).toContain(paso);
  });
});

describe("enlaceWhatsApp con destinatario", () => {
  it("antepone el código de país al celular de nueve cifras", () => {
    expect(enlaceWhatsApp("hola", "998107700")).toBe(
      "https://wa.me/51998107700?text=hola",
    );
  });

  it("sin número deja elegir el chat", () => {
    expect(enlaceWhatsApp("hola")).toBe("https://wa.me/?text=hola");
  });

  it("codifica el mensaje entero", () => {
    const url = enlaceWhatsApp(mensajeDeVinculo(datos), "998107700");

    expect(url).not.toContain("\n");
    expect(decodeURIComponent(url.split("text=")[1]!)).toContain(datos.token);
  });
});
