import { describe, expect, it } from "vitest";
import {
  cabeElPago,
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

describe("no se puede pagar por encima del contrato", () => {
  /*
   * PROBADO POR EL USUARIO el 23 de agosto de 2026: pago 740 sobre un
   * contrato de 735 y GCM lo acepto sin decir nada, llamandolo «pagado por
   * adelantado». Ese rotulo vale para lo que pasa de lo VALORIZADO, no para
   * lo que pasa del CONTRATO.
   */
  it("el caso exacto: 740 sobre un contrato de 735", () => {
    const r = cabeElPago("40.00", { vigente: "735.00", yaPagado: "700.00" });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("5.00 de mas");
      // El mensaje nombra la salida en vez de dejar a nadie buscando.
      expect(r.error).toContain("adenda");
    }
  });

  it("pagar EXACTAMENTE el contrato si cabe", () => {
    // El limite es inclusivo: liquidar un contrato es pagarlo entero.
    expect(cabeElPago("35.00", { vigente: "735.00", yaPagado: "700.00" }).ok).toBe(true);
  });

  it("un ADELANTO sigue permitido: es normal en obra", () => {
    /*
     * Adelantar para materiales antes de que haya avance que valorizar pasa
     * constantemente, y `PagoEncargo` tiene el `valorizacionId` opcional
     * justo por eso. Lo que se bloquea es pasar del CONTRATO, no de lo
     * valorizado.
     */
    expect(cabeElPago("500.00", { vigente: "735.00", yaPagado: "0.00" }).ok).toBe(true);
  });

  it("una adenda aprobada AMPLIA lo que se le puede pagar", () => {
    // Contrato de 700 con un adicional de 35: el vigente es 735 y el pago que
    // antes no cabia, ahora si.
    expect(cabeElPago("735.00", { vigente: "735.00", yaPagado: "0.00" }).ok).toBe(true);
    expect(cabeElPago("735.00", { vigente: "700.00", yaPagado: "0.00" }).ok).toBe(false);
  });

  it("cuenta lo YA pagado, no solo este pago", () => {
    // Tres pagos de 300 sobre un contrato de 735: el tercero es el que sobra.
    expect(cabeElPago("300.00", { vigente: "735.00", yaPagado: "300.00" }).ok).toBe(true);
    expect(cabeElPago("300.00", { vigente: "735.00", yaPagado: "600.00" }).ok).toBe(false);
  });

  it("no arrastra el ruido de la coma flotante", () => {
    expect(cabeElPago("0.10", { vigente: "0.30", yaPagado: "0.20" }).ok).toBe(true);
    expect(cabeElPago("0.11", { vigente: "0.30", yaPagado: "0.20" }).ok).toBe(false);
  });
});
