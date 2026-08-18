import { describe, expect, it } from "vitest";
import {
  MIMES_COMPROBANTE,
  TAMANO_MAXIMO_COMPROBANTE,
  validarPago,
} from "@/lib/pagos";

const HOY = new Date("2026-08-18T15:00:00.000Z");

describe("validarPago", () => {
  it("acepta un pago normal y normaliza el monto", () => {
    const r = validarPago({ monto: "1,250.5", fecha: "2026-08-17" }, HOY);
    expect(r).toEqual({
      ok: true,
      monto: "1250.50",
      fecha: new Date("2026-08-17T00:00:00.000Z"),
      nota: null,
    });
  });

  it("acepta el pago de HOY: no es futuro", () => {
    // El corte es el DIA, no el instante: son las 15:00 y un pago fechado hoy
    // a medianoche seguiria siendo de hoy.
    const r = validarPago({ monto: "100", fecha: "2026-08-18" }, HOY);
    expect(r.ok).toBe(true);
  });

  /**
   * Es append-only: una fecha futura tecleada por error no se puede corregir
   * despues, y es la que ordena el historial y cuadra con el banco.
   */
  it("rechaza la fecha futura", () => {
    const r = validarPago({ monto: "100", fecha: "2026-08-19" }, HOY);
    expect(r).toEqual({
      ok: false,
      error: "La fecha del pago no puede ser futura.",
    });
  });

  it("rechaza el cero y los negativos", () => {
    expect(validarPago({ monto: "0", fecha: "2026-08-17" }, HOY).ok).toBe(false);
    expect(validarPago({ monto: "-50", fecha: "2026-08-17" }, HOY).ok).toBe(
      false,
    );
  });

  it("rechaza lo que no es un numero", () => {
    expect(validarPago({ monto: "mil soles", fecha: "2026-08-17" }, HOY).ok).toBe(
      false,
    );
  });

  it("rechaza un monto que no cabe en la columna", () => {
    const r = validarPago(
      { monto: "1234567890123", fecha: "2026-08-17" },
      HOY,
    );
    expect(r).toEqual({
      ok: false,
      error: "El monto es demasiado grande para el campo.",
    });
  });

  it("exige la fecha", () => {
    expect(validarPago({ monto: "100", fecha: "" }, HOY).ok).toBe(false);
    expect(validarPago({ monto: "100", fecha: "17/08/2026" }, HOY).ok).toBe(
      false,
    );
  });

  it("limpia la nota y la deja en null si viene vacia", () => {
    const conNota = validarPago(
      { monto: "100", fecha: "2026-08-17", nota: "  adelanto  " },
      HOY,
    );
    expect(conNota).toMatchObject({ ok: true, nota: "adelanto" });

    const sinNota = validarPago(
      { monto: "100", fecha: "2026-08-17", nota: "   " },
      HOY,
    );
    expect(sinNota).toMatchObject({ ok: true, nota: null });
  });
});

describe("el comprobante", () => {
  /**
   * La razon de existir de este camino: el banco entrega la constancia en
   * PDF. Si se cuela por el de las fotos, se rechaza.
   */
  it("acepta PDF, que es lo que manda un banco", () => {
    expect(MIMES_COMPROBANTE.get("application/pdf")).toBe(".pdf");
  });

  it("acepta tambien las fotos de siempre", () => {
    expect(MIMES_COMPROBANTE.get("image/jpeg")).toBe(".jpg");
    expect(MIMES_COMPROBANTE.get("image/png")).toBe(".png");
    expect(MIMES_COMPROBANTE.get("image/webp")).toBe(".webp");
  });

  it("no acepta cualquier cosa", () => {
    expect(MIMES_COMPROBANTE.get("application/zip")).toBeUndefined();
    expect(MIMES_COMPROBANTE.get("text/html")).toBeUndefined();
  });

  /// Mas alto que los 5 MB de la evidencia de obra: aquella llega comprimida
  /// por el navegador y un PDF escaneado no se puede encoger antes de subirlo.
  it("da mas margen que la evidencia de obra", () => {
    expect(TAMANO_MAXIMO_COMPROBANTE).toBeGreaterThan(5 * 1024 * 1024);
  });
});
