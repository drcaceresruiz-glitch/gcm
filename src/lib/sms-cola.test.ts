import { describe, expect, it } from "vitest";
import {
  GRACIA_PRESTAMO_SEGUNDOS,
  MAXIMO_ENTREGAS,
  caducidadDeMensaje,
  sePuedeOfrecer,
  tokenDeCabecera,
  tokenValido,
} from "./sms-cola";

describe("tokenDeCabecera", () => {
  it("saca el token de una cabecera Bearer", () => {
    expect(tokenDeCabecera("Bearer abc123")).toBe("abc123");
  });

  it("acepta el esquema en cualquier caja", () => {
    // Los clientes lo escriben de las dos formas; rechazar por la mayuscula
    // seria un fallo imposible de diagnosticar desde un movil.
    expect(tokenDeCabecera("bearer abc123")).toBe("abc123");
    expect(tokenDeCabecera("BEARER abc123")).toBe("abc123");
  });

  it("rechaza lo que no es Bearer, o lo que viene vacio", () => {
    expect(tokenDeCabecera(null)).toBeNull();
    expect(tokenDeCabecera("")).toBeNull();
    expect(tokenDeCabecera("Basic abc123")).toBeNull();
    expect(tokenDeCabecera("Bearer")).toBeNull();
    expect(tokenDeCabecera("Bearer   ")).toBeNull();
  });
});

describe("tokenValido", () => {
  it("acepta el token correcto", () => {
    expect(tokenValido("secreto-largo", "secreto-largo")).toBe(true);
  });

  it("rechaza uno distinto", () => {
    expect(tokenValido("secreto-largo", "secreto-corto")).toBe(false);
  });

  it("no revienta cuando miden distinto", () => {
    // Es el motivo de comparar los hashes y no los textos: `timingSafeEqual`
    // lanza si las longitudes diferen, y rechazar antes por longitud ya
    // delataria cuanto mide el secreto.
    expect(tokenValido("a", "un-secreto-mucho-mas-largo")).toBe(false);
    expect(tokenValido("un-secreto-mucho-mas-largo", "a")).toBe(false);
    expect(tokenValido("", "algo")).toBe(false);
  });
});

describe("sePuedeOfrecer", () => {
  const ahora = new Date("2026-08-11T10:00:00Z");
  const enPie = {
    tomadoAt: null,
    enviadoAt: null,
    expiraAt: new Date("2026-08-11T10:09:00Z"),
    entregas: 0,
  };

  it("ofrece el que nadie ha tocado", () => {
    expect(sePuedeOfrecer(enPie, ahora)).toBe(true);
  });

  it("no ofrece el que ya salio", () => {
    expect(
      sePuedeOfrecer({ ...enPie, enviadoAt: new Date("2026-08-11T09:59:00Z") }, ahora),
    ).toBe(false);
  });

  it("no ofrece el caducado", () => {
    expect(
      sePuedeOfrecer({ ...enPie, expiraAt: new Date("2026-08-11T09:59:00Z") }, ahora),
    ).toBe(false);
  });

  it("respeta el prestamo mientras dura", () => {
    const reciente = new Date(ahora.getTime() - 10_000);
    expect(sePuedeOfrecer({ ...enPie, tomadoAt: reciente }, ahora)).toBe(false);
  });

  it("vuelve a ofrecer cuando el prestamo caduco", () => {
    // El caso de verdad: el telefono recogio el mensaje y se apago. Si no se
    // volviera a ofrecer, el codigo no saldria nunca y nadie sabria por que.
    const viejo = new Date(
      ahora.getTime() - (GRACIA_PRESTAMO_SEGUNDOS + 1) * 1000,
    );
    expect(sePuedeOfrecer({ ...enPie, tomadoAt: viejo }, ahora)).toBe(true);
  });

  it("se rinde tras demasiadas entregas sin confirmar", () => {
    const viejo = new Date(
      ahora.getTime() - (GRACIA_PRESTAMO_SEGUNDOS + 1) * 1000,
    );
    expect(
      sePuedeOfrecer(
        { ...enPie, tomadoAt: viejo, entregas: MAXIMO_ENTREGAS },
        ahora,
      ),
    ).toBe(false);
  });
});

describe("caducidadDeMensaje", () => {
  it("da diez minutos, como el codigo que suele llevar dentro", () => {
    const ahora = new Date("2026-08-11T10:00:00Z");
    expect(caducidadDeMensaje(ahora).toISOString()).toBe(
      "2026-08-11T10:10:00.000Z",
    );
  });
});
