import { describe, expect, it } from "vitest";

import { encajar, encajarEnCaja, LADO_MAXIMO_LOGO, medirImagen } from "./imagen";

/// Un PNG de verdad, del tamano que se le pida: firma + IHDR bien formado.
function png(ancho: number, alto: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const escribir32 = (v: number, i: number) => {
    b[i] = (v >>> 24) & 0xff;
    b[i + 1] = (v >>> 16) & 0xff;
    b[i + 2] = (v >>> 8) & 0xff;
    b[i + 3] = v & 0xff;
  };
  escribir32(ancho, 16);
  escribir32(alto, 20);
  return b;
}

/// Un JPEG minimo: SOI, un segmento cualquiera, y el SOF0 con el tamano.
function jpeg(ancho: number, alto: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    // APP0 de 4 bytes de longitud, para obligar a saltarlo
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    // SOF0: longitud 17, precision 8, alto, ancho
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (alto >> 8) & 0xff, alto & 0xff,
    (ancho >> 8) & 0xff, ancho & 0xff,
  ]);
}

describe("medirImagen", () => {
  it("lee el tamano de un PNG", () => {
    expect(medirImagen(png(800, 240))).toEqual({ tipo: "png", ancho: 800, alto: 240 });
  });

  it("lee el tamano de un JPEG, donde alto y ancho van al reves que en PNG", () => {
    // Si se leyeran en el orden del PNG, esto daria 120x400 y pasaria
    // desapercibido porque sigue pareciendo una medida plausible.
    expect(medirImagen(jpeg(400, 120))).toEqual({ tipo: "jpeg", ancho: 400, alto: 120 });
  });

  it("no se cree un .exe que dice llamarse .png", () => {
    // Es la razon de ser del modulo: `archivo.type` lo pone el cliente.
    expect(medirImagen(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });

  it("rechaza un PNG con la firma buena pero sin IHDR", () => {
    const roto = png(10, 10);
    roto[12] = 0x00;
    expect(medirImagen(roto)).toBeNull();
  });

  it("rechaza medidas de cero, que no son una imagen", () => {
    expect(medirImagen(png(0, 100))).toBeNull();
  });

  it("no confunde la tabla Huffman (FFC4) con un marcador de tamano", () => {
    // FFC4 esta en el rango FFCx pero NO lleva el tamano dentro. Si se
    // aceptara, se leerian como alto y ancho dos bytes de la tabla.
    const conHuffman = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xc4, 0x00, 0x06, 0x11, 0x22, 0x33, 0x44,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x01, 0x90,
    ]);
    expect(medirImagen(conHuffman)).toEqual({ tipo: "jpeg", ancho: 400, alto: 100 });
  });
});

describe("encajar", () => {
  it("encoge respetando la proporcion", () => {
    expect(encajar(1024, 256)).toEqual({ ancho: 512, alto: 128 });
  });

  it("no agranda lo que ya cabe: estirarlo solo lo emborrona", () => {
    expect(encajar(120, 40)).toEqual({ ancho: 120, alto: 40 });
  });

  it("nunca deja un lado en cero, por apaisado que sea el logo", () => {
    const r = encajar(4000, 3);
    expect(r.ancho).toBe(LADO_MAXIMO_LOGO);
    expect(r.alto).toBeGreaterThanOrEqual(1);
  });
});

describe("encajarEnCaja", () => {
  it("LA INVARIANTE: mantiene la proporcion, aunque la caja tenga otra", () => {
    // Logo apaisado 4:1 en una caja cuadrada. Si se escalara cada lado por su
    // cuenta saldria 100x100 y el logo quedaria aplastado.
    const r = encajarEnCaja(400, 100, 100, 100);

    expect(r).toEqual({ ancho: 100, alto: 25 });
    expect(r.ancho / r.alto).toBeCloseTo(4, 5);
  });

  it("y no se sale de la caja por ningun lado", () => {
    for (const [a, h] of [
      [1000, 20],
      [20, 1000],
      [640, 480],
      [7, 9],
    ] as const) {
      const r = encajarEnCaja(a, h, 160, 48);
      expect(r.ancho).toBeLessThanOrEqual(160);
      expect(r.alto).toBeLessThanOrEqual(48);
    }
  });

  it("manda el lado que toca ANTES el borde, no siempre el ancho", () => {
    // Un logo vertical en una caja apaisada: lo que limita es el alto.
    expect(encajarEnCaja(100, 400, 200, 100)).toEqual({ ancho: 25, alto: 100 });
  });

  it("tampoco agranda para llenar la caja", () => {
    expect(encajarEnCaja(50, 20, 400, 400)).toEqual({ ancho: 50, alto: 20 });
  });

  it("NO redondea: en el PDF un punto de mas aplasta un logo bajo", () => {
    // Caso real medido: 512x26 en la caja del informe (110x30). El alto
    // exacto es 5,59 pt; redondearlo a 6 deforma un 6,9 %, que en un logo de
    // cliente se nota. El canvas necesita enteros y por eso los redondea
    // `encajar`; el PDF admite fracciones y aqui no se tocan.
    const r = encajarEnCaja(512, 26, 110, 30);

    expect(r.ancho).toBeCloseTo(110, 6);
    expect(r.alto).toBeCloseTo(5.586, 3);
    expect(r.ancho / r.alto).toBeCloseTo(512 / 26, 6);
  });
});
