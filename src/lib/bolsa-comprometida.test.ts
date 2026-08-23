import { describe, expect, it } from "vitest";

import {
  bolsaComprometida,
  type FrenteContratado,
} from "@/lib/bolsa-comprometida";

const frente = (
  montoVigente: string,
  previstoEnLaMeta: string,
  numero = 1,
): FrenteContratado => ({
  encargoId: `e${numero}`,
  numero,
  descripcion: `Frente ${numero}`,
  proveedor: "Estructuras SAC",
  montoVigente,
  previstoEnLaMeta,
});

describe("un adicional del contratista se come la bolsa", () => {
  /*
   * ES LA PREGUNTA QUE ORIGINO TODO ESTO: «el contratista se percata de
   * alcances que no estaban en su orden y me genera un adicional; como lo
   * registro para que reste de la bolsa operativa».
   */
  it("la prevista NO se mueve, la comprometida SI", () => {
    // El plan decia que ese frente costaba 40.000 y se firmo en 40.000.
    // Entra un adicional de 8.000 -> el vigente es 48.000.
    const b = bolsaComprometida("100000.00", [frente("48000.00", "40000.00")]);

    // La prevista es intocable: si bajara, la desviacion desapareceria y
    // siempre pareceria que la obra va justa.
    expect(b.prevista).toBe("100000.00");

    expect(b.desviacionTotal).toBe("8000.00");
    expect(b.comprometida).toBe("92000.00");
  });

  it("un frente cerrado POR DEBAJO devuelve margen, no se esconde", () => {
    // Esconder los ahorros daria una cifra pesimista que nadie usaria: quien
    // mira esto para decidir si aprieta necesita el numero real.
    const b = bolsaComprometida("100000.00", [frente("35000.00", "40000.00")]);

    expect(b.desviacionTotal).toBe("-5000.00");
    expect(b.comprometida).toBe("105000.00");
  });

  it("los frentes se compensan entre si", () => {
    const b = bolsaComprometida("100000.00", [
      frente("48000.00", "40000.00", 1),
      frente("18000.00", "20000.00", 2),
    ]);

    expect(b.desviacionTotal).toBe("6000.00");
    expect(b.comprometida).toBe("94000.00");
  });

  it("sin contratos firmados, comprometida y prevista son la misma", () => {
    const b = bolsaComprometida("100000.00", []);

    expect(b.desviacionTotal).toBe("0.00");
    expect(b.comprometida).toBe("100000.00");
  });

  it("puede dejar la bolsa en NEGATIVO, y se ve", () => {
    // El caso que hay que poder ver antes de que llegue la liquidacion.
    const b = bolsaComprometida("10000.00", [frente("55000.00", "40000.00")]);

    expect(b.comprometida).toBe("-5000.00");
  });
});

describe("una adenda pendiente de firma se avisa, no se descuenta", () => {
  it("no toca la comprometida, pero viaja al lado", () => {
    /*
     * Descontarla seria contar como gasto algo que gerencia todavia puede
     * rechazar. Callarla seria peor: la decision de firmar se toma mirando
     * cuanto queda, y «hay 30.000 esperando tu firma» es justo el dato que
     * falta para tomarla.
     */
    const b = bolsaComprometida(
      "100000.00",
      [frente("48000.00", "40000.00")],
      "30000.00",
    );

    expect(b.comprometida).toBe("92000.00");
    expect(b.pendienteDeFirma).toBe("30000.00");
  });
});

describe("el desglose señala al culpable", () => {
  it("cada frente lleva su desviacion, para poder ordenarlos", () => {
    // «La bolsa bajo 8.000» no mueve a nadie; «el frente E-1 de Estructuras
    // SAC se llevo 8.000» si.
    const b = bolsaComprometida("100000.00", [
      frente("48000.00", "40000.00", 1),
      frente("20000.00", "20000.00", 2),
    ]);

    expect(b.frentes[0]!.desviacion).toBe("8000.00");
    expect(b.frentes[1]!.desviacion).toBe("0.00");
    expect(b.frentes[0]!.proveedor).toBe("Estructuras SAC");
  });
});

describe("aritmetica de dinero", () => {
  it("no arrastra el ruido de la coma flotante", () => {
    const b = bolsaComprometida("0.30", [frente("0.20", "0.10")]);

    expect(b.desviacionTotal).toBe("0.10");
    expect(b.comprometida).toBe("0.20");
  });
});
