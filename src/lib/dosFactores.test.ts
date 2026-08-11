import { describe, it, expect } from "vitest";
import {
  normalizarCodigo,
  codigoBienFormado,
  canalEfectivo,
  enmascararDestino,
  LONGITUD_CODIGO,
} from "./dosFactores";

describe("canalEfectivo", () => {
  const verificado = new Date("2026-08-11T10:00:00Z");

  it("manda por SMS cuando lo eligio y su celular esta verificado", () => {
    expect(
      canalEfectivo({
        canal2FA: "SMS",
        celular: "987654321",
        celularVerificadoAt: verificado,
      }),
    ).toBe("SMS");
  });

  it("cae al correo si el celular no esta verificado", () => {
    // El caso que de verdad importa: se guardo un numero pero nadie comprobo
    // que exista. Mandarle el codigo ahi seria dejarlo fuera de su cuenta.
    expect(
      canalEfectivo({
        canal2FA: "SMS",
        celular: "987654321",
        celularVerificadoAt: null,
      }),
    ).toBe("CORREO");
  });

  it("cae al correo si borro el celular sin cambiar el canal", () => {
    expect(
      canalEfectivo({
        canal2FA: "SMS",
        celular: null,
        celularVerificadoAt: verificado,
      }),
    ).toBe("CORREO");
  });

  it("respeta el correo aunque tenga el celular verificado", () => {
    expect(
      canalEfectivo({
        canal2FA: "CORREO",
        celular: "987654321",
        celularVerificadoAt: verificado,
      }),
    ).toBe("CORREO");
  });
});

describe("enmascararDestino", () => {
  it("del celular deja las tres ultimas cifras", () => {
    expect(enmascararDestino("SMS", "987654321")).toBe("•••321");
  });

  it("tapa el celular aunque venga con separadores", () => {
    expect(enmascararDestino("SMS", "+51 987 654 321")).toBe(
      "•••321",
    );
  });

  it("del correo deja la inicial y el dominio", () => {
    expect(enmascararDestino("CORREO", "juan@obra.pe")).toBe(
      "j•••@obra.pe",
    );
  });

  it("no revienta con lo que no tiene forma esperada", () => {
    // Un desafio de antes de que existiera el SMS no guarda destino, y la
    // pantalla tiene que pintarse igual.
    expect(enmascararDestino("CORREO", "")).toBe("");
    expect(enmascararDestino("CORREO", "@obra.pe")).toBe("@obra.pe");
    expect(enmascararDestino("SMS", "12")).toBe("12");
  });
});

describe("normalizarCodigo", () => {
  it("quita espacios de sobra al pegar desde el correo", () => {
    expect(normalizarCodigo("  123456  ")).toBe("123456");
  });

  it("junta el codigo que el cliente de correo partio en dos", () => {
    expect(normalizarCodigo("123 456")).toBe("123456");
  });

  it("descarta guiones y cualquier otro adorno", () => {
    expect(normalizarCodigo("123-456")).toBe("123456");
  });

  it("deja vacio lo que no tiene cifras", () => {
    expect(normalizarCodigo("abcdef")).toBe("");
  });
});

describe("codigoBienFormado", () => {
  it("acepta las seis cifras justas", () => {
    expect(codigoBienFormado("123456")).toBe(true);
  });

  it("acepta seis cifras aunque vengan sucias", () => {
    expect(codigoBienFormado(" 123 456 ")).toBe(true);
  });

  it("rechaza de menos", () => {
    expect(codigoBienFormado("12345")).toBe(false);
  });

  it("rechaza de mas", () => {
    expect(codigoBienFormado("1234567")).toBe(false);
  });

  it("mantiene la longitud declarada", () => {
    expect(codigoBienFormado("9".repeat(LONGITUD_CODIGO))).toBe(true);
  });
});
