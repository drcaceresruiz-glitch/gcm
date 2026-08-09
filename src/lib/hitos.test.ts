import { describe, it, expect } from "vitest";
import { filasHitos, type HitoVigente, type HitoBaseFecha } from "./hitos";

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("filasHitos", () => {
  const corte = dia("2026-08-08");

  it("mide el desvio en dias contra la base", () => {
    const vig: HitoVigente[] = [
      { uid: 1, nombre: "Cimentacion", fin: dia("2026-08-20"), avance: 0 },
    ];
    const base: HitoBaseFecha[] = [{ uid: 1, fin: dia("2026-08-15") }];
    const [f] = filasHitos(vig, base, corte);
    expect(f!.desviacionDias).toBe(5); // se corrio 5 dias a mas tarde
    expect(f!.finBase).toEqual(dia("2026-08-15"));
    expect(f!.estado).toBe("en_plazo");
  });

  it("adelantarse da desvio negativo", () => {
    const vig: HitoVigente[] = [{ uid: 1, nombre: "H", fin: dia("2026-08-10"), avance: 0 }];
    const base: HitoBaseFecha[] = [{ uid: 1, fin: dia("2026-08-15") }];
    expect(filasHitos(vig, base, corte)[0]!.desviacionDias).toBe(-5);
  });

  it("un hito al 100% esta cumplido, aunque su fecha ya paso", () => {
    const vig: HitoVigente[] = [{ uid: 1, nombre: "H", fin: dia("2026-08-01"), avance: 100 }];
    const [f] = filasHitos(vig, [], corte);
    expect(f!.cumplido).toBe(true);
    expect(f!.estado).toBe("cumplido");
  });

  it("un hito sin cumplir con fecha pasada esta vencido", () => {
    const vig: HitoVigente[] = [{ uid: 1, nombre: "H", fin: dia("2026-08-01"), avance: 40 }];
    expect(filasHitos(vig, [], corte)[0]!.estado).toBe("vencido");
  });

  it("sin base, el desvio es null", () => {
    const vig: HitoVigente[] = [{ uid: 1, nombre: "H", fin: dia("2026-08-20"), avance: 0 }];
    const [f] = filasHitos(vig, [], corte);
    expect(f!.desviacionDias).toBeNull();
    expect(f!.finBase).toBeNull();
  });

  it("un hito nuevo (no estaba en la base) sale sin desvio", () => {
    const vig: HitoVigente[] = [
      { uid: 1, nombre: "Viejo", fin: dia("2026-08-20"), avance: 0 },
      { uid: 2, nombre: "Nuevo", fin: dia("2026-08-25"), avance: 0 },
    ];
    const base: HitoBaseFecha[] = [{ uid: 1, fin: dia("2026-08-18") }];
    const filas = filasHitos(vig, base, corte);
    expect(filas[0]!.desviacionDias).toBe(2);
    expect(filas[1]!.desviacionDias).toBeNull();
  });

  it("respeta el orden de entrada y no lista hitos que ya no estan", () => {
    const vig: HitoVigente[] = [{ uid: 2, nombre: "B", fin: dia("2026-08-20"), avance: 0 }];
    const base: HitoBaseFecha[] = [
      { uid: 1, fin: dia("2026-08-10") },
      { uid: 2, fin: dia("2026-08-18") },
    ];
    const filas = filasHitos(vig, base, corte);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.uid).toBe(2);
  });
});
