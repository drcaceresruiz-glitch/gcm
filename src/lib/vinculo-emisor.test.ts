import { describe, expect, it } from "vitest";

import {
  mensajeDeVinculo,
  mensajeDelToken,
  pasosDeVinculo,
} from "./vinculo-emisor";
import { enlaceWhatsApp } from "./whatsapp";

const TOKEN = "Do1_RonGL2udZKsk6bxYpr3-Hp1Ad9_X-ooUY3bbNAY";

const datos = {
  direccionCola: "https://gcm.drcaceresruiz.com/api/sms/cola",
  urlInstalador: "https://github.com/x/gcm/releases/latest/download/emisor-sms.apk",
};

describe("pasosDeVinculo", () => {
  it("lleva las dos direcciones que no se pueden adivinar", () => {
    const todo = pasosDeVinculo(datos).join("\n");

    expect(todo).toContain(datos.urlInstalador);
    expect(todo).toContain(datos.direccionCola);
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
    expect(mensaje).toContain("5. Pega el token");
  });

  // LA razon de que sean dos mensajes: WhatsApp copia el mensaje ENTERO. Con
  // el token aqui dentro, quien lo recibe se lleva las ocho instrucciones al
  // portapapeles y tiene que recortar a mano en el campo de la aplicacion.
  it("NO lleva el token dentro: eso es lo que rompe el copiar y pegar", () => {
    expect(mensajeDeVinculo(datos)).not.toContain(TOKEN);
  });

  // El token abre la cola por la que viajan los codigos de segundo factor EN
  // CLARO. Queda en el historial de dos telefonos, asi que hay que pedir que
  // se borre.
  it("pide que se borre el mensaje del token al terminar", () => {
    expect(mensajeDeVinculo(datos)).toContain("borra el mensaje del token");
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
    expect(decodeURIComponent(url.split("text=")[1]!)).toContain(
      datos.direccionCola,
    );
  });
});

describe("mensajeDelToken", () => {
  // Ni un rotulo, ni comillas, ni un emoji: WhatsApp copia el mensaje entero,
  // y lo que se anada aqui acaba pegado dentro del campo de la aplicacion. Un
  // caracter de mas no da error, solo deja el telefono mudo.
  it("es el token y nada más", () => {
    expect(mensajeDelToken(TOKEN)).toBe(TOKEN);
  });

  it("viaja intacto por la URL", () => {
    const url = enlaceWhatsApp(mensajeDelToken(TOKEN), "998107700");

    expect(decodeURIComponent(url.split("text=")[1]!)).toBe(TOKEN);
  });
});
