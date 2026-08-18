import { describe, expect, it } from "vitest";

import {
  MAX_WHATSAPP,
  TAMANO_MAXIMO_ADJUNTO,
  textoSmsAlContratista,
  textoWhatsAppAlContratista,
  validarAdjuntos,
  type AdjuntoPropuesto,
} from "./mensaje-contratista";
import { MAX_SMS } from "./texto-sms";

const PDF = "application/pdf";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function adjunto(parcial: Partial<AdjuntoPropuesto> = {}): AdjuntoPropuesto {
  return { nombre: "plano.pdf", tipo: PDF, tamano: 1024, ...parcial };
}

describe("validarAdjuntos", () => {
  it("acepta lo que un jefe de obra manda de verdad: planos y hojas de calculo", () => {
    expect(
      validarAdjuntos([
        adjunto(),
        adjunto({ nombre: "metrados.xlsx", tipo: XLSX }),
        adjunto({ nombre: "foto.jpg", tipo: "image/jpeg" }),
      ]),
    ).toEqual({ ok: true });
  });

  it("no deja pasar un ejecutable, que es de lo que protege la lista cerrada", () => {
    const r = validarAdjuntos([
      adjunto({ nombre: "instalador.exe", tipo: "application/x-msdownload" }),
    ]);

    expect(r.ok).toBe(false);
    // Nombrar el archivo importa: con cinco seleccionados, "hay uno malo"
    // obliga a probar de uno en uno.
    if (!r.ok) expect(r.error).toContain("instalador.exe");
  });

  it("mira el MIME y no la extension: un .exe no deja de serlo por llamarse .pdf", () => {
    const r = validarAdjuntos([
      adjunto({ nombre: "plano.pdf", tipo: "application/x-msdownload" }),
    ]);

    expect(r.ok).toBe(false);
  });

  it("rechaza un archivo vacio antes de mandar un correo con nada dentro", () => {
    const r = validarAdjuntos([adjunto({ tamano: 0 })]);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("vacío");
  });

  it("corta por archivo, diciendo cuanto pesa y cuanto cabe", () => {
    const r = validarAdjuntos([adjunto({ tamano: TAMANO_MAXIMO_ADJUNTO + 1 })]);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("plano.pdf");
  });

  it("y corta tambien por la SUMA, aunque ninguno pase por si solo", () => {
    // Tres de 4 MB: ninguno llega al tope por archivo (5 MB), pero juntos se
    // pasan del total (10 MB). Sin esta comprobacion, el correo sale y lo
    // rebota el buzon del contratista, que es peor: parece enviado.
    const cuatroMegas = 4 * 1024 * 1024;
    const r = validarAdjuntos([
      adjunto({ nombre: "a.pdf", tamano: cuatroMegas }),
      adjunto({ nombre: "b.pdf", tamano: cuatroMegas }),
      adjunto({ nombre: "c.pdf", tamano: cuatroMegas }),
    ]);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Entre todos");
  });

  it("sin adjuntos tambien vale: un mensaje puede ser solo texto", () => {
    expect(validarAdjuntos([])).toEqual({ ok: true });
  });
});

describe("textoSmsAlContratista", () => {
  const firma = { empresa: "Constructora Andina", obra: "Ampliación de planta" };

  it("transcribe las tildes: si no, el limite cae de 160 a 70", () => {
    const sms = textoSmsAlContratista(firma, "Mañana no hay agua en la obra");

    // Si esto falla, el mensaje pasa a UCS-2 y se parte en dos tramos.
    expect(/^[\x20-\x7E]*$/.test(sms)).toBe(true);
    expect(sms).not.toContain("ñ");
    expect(sms).not.toContain("ó");
  });

  it("firma el mensaje, porque al contratista le llega de un numero que no tiene agendado", () => {
    const sms = textoSmsAlContratista(firma, "Traer los certificados");

    expect(sms.startsWith("Ampliacion de planta: ")).toBe(true);
  });

  it("firma con la empresa cuando el mensaje no sale de una obra", () => {
    const sms = textoSmsAlContratista(
      { empresa: "Constructora Andina", obra: null },
      "Actualiza tu cuenta bancaria",
    );

    expect(sms.startsWith("Constructora Andina: ")).toBe(true);
  });

  it("nunca se pasa de 160, por larga que sea la parrafada", () => {
    const sms = textoSmsAlContratista(firma, "palabra ".repeat(200));

    expect(sms.length).toBeLessThanOrEqual(MAX_SMS);
  });

  it("LA INVARIANTE: cuando no cabe se recorta el texto, nunca la firma", () => {
    const sms = textoSmsAlContratista(firma, "detalle ".repeat(100));

    // La firma sigue entera y el que sobra es el cuerpo.
    expect(sms.startsWith("Ampliacion de planta: ")).toBe(true);
    expect(sms.endsWith("...")).toBe(true);
    expect(sms.length).toBeLessThanOrEqual(MAX_SMS);
  });

  it("aguanta un nombre de obra absurdo sin quedarse sin sitio para el mensaje", () => {
    // El nombre sale de un XML del usuario: puede ser cualquier cosa.
    const sms = textoSmsAlContratista(
      { empresa: "X", obra: "Obra ".repeat(60) },
      "Trae la valorizacion",
    );

    expect(sms.length).toBeLessThanOrEqual(MAX_SMS);
    // Y queda sitio de verdad para el mensaje, no dos letras.
    expect(sms.split(": ").slice(1).join(": ").length).toBeGreaterThan(15);
  });

  it("aplasta los saltos de linea, que en un SMS gastan y no aportan", () => {
    const sms = textoSmsAlContratista(firma, "Primero esto\n\nY luego lo otro");

    expect(sms).not.toContain("\n");
    expect(sms).toContain("Primero esto Y luego lo otro");
  });

  it("no cuela enlaces: las operadoras marcan como spam el SMS con URL", () => {
    // El cuerpo lo escribe una persona, asi que puede meter uno; lo que se
    // comprueba aqui es que GCM no lo anade por su cuenta.
    const sms = textoSmsAlContratista(firma, "Revisa el avance");

    expect(sms).not.toMatch(/https?:\/\/|wa\.me/);
  });
});

describe("textoWhatsAppAlContratista", () => {
  const firma = { empresa: "Constructora Andina", obra: "Ampliación de planta" };

  it("SI lleva tildes: aqui quitarlas pareceria descuido, no ahorro", () => {
    const texto = textoWhatsAppAlContratista(firma, "Mañana no hay agua");

    expect(texto).toContain("Mañana");
    expect(texto).toContain("Ampliación de planta");
  });

  it("no se pasa del tope, porque viaja dentro de una URL", () => {
    const texto = textoWhatsAppAlContratista(firma, "detalle ".repeat(400));

    expect(texto.length).toBeLessThanOrEqual(MAX_WHATSAPP);
  });

  it("tampoco lleva enlace, pero por otro motivo: detras de la sesion no hay nada que ensenarle", () => {
    const texto = textoWhatsAppAlContratista(firma, "Revisa el avance");

    expect(texto).not.toMatch(/https?:\/\//);
  });
});
