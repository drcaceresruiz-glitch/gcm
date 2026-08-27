import { describe, expect, it } from "vitest";

import { repetidosDeLaMeta, type LineaRepetible } from "./repetidos-de-la-meta";

/**
 * El aviso de importes repetidos, sobre la meta ya guardada.
 *
 * El caso que lo motivo es real: un presupuesto de obra donde cinco partidas
 * seguidas de equipamiento mostraban 4.200 cada una por una formula arrastrada
 * en el Excel -una de ellas, 24 unidades a 4.200, con subtotal de 4.200-.
 */

function linea(
  orden: number,
  descripcion: string,
  parcial: string | null,
  precioUnitario: string | null = null,
  codigoRef: string | null = null,
): LineaRepetible {
  return { orden, descripcion, parcial, precioUnitario, codigoRef };
}

describe("importes repetidos en la meta guardada", () => {
  it("no dice nada cuando cada partida cuesta lo suyo", () => {
    const r = repetidosDeLaMeta([
      linea(0, "Trazo y replanteo", "2100.00"),
      linea(1, "Movilizacion", "1575.00"),
      linea(2, "Cerramientos", "525.00"),
    ]);

    expect(r.grupos).toHaveLength(0);
    expect(r.deMasTotal).toBe("0.00");
    expect(r.lineasImplicadas).toBe(0);
  });

  it("caza la racha y dice cuanto sobra si fuera una formula arrastrada", () => {
    const r = repetidosDeLaMeta([
      linea(0, "Señales de seguridad", "4200.00", "4200.00", "11.14.10"),
      linea(1, "Señales fotoluminiscentes", "4200.00", "4200.00", "11.14.11"),
      linea(2, "Extintores de agua", "4200.00", "4200.00", "11.14.12"),
      linea(3, "Cortina para cambiadores", "800.00", "200.00", "11.14.16"),
    ]);

    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0]?.importe).toBe("4200.00");
    // La primera es legitima: alguna cuesta eso de verdad. Sobran las otras dos.
    expect(r.grupos[0]?.deMas).toBe("8400.00");
    expect(r.deMasTotal).toBe("8400.00");
    expect(r.lineasImplicadas).toBe(3);
    expect(r.grupos[0]?.descripciones).toEqual([
      "Señales de seguridad",
      "Señales fotoluminiscentes",
      "Extintores de agua",
    ]);
    expect(r.grupos[0]?.codigos).toEqual(["11.14.10", "11.14.11", "11.14.12"]);
  });

  it("dos partidas iguales pero SEPARADAS no son una racha", () => {
    const r = repetidosDeLaMeta([
      linea(0, "Puerta contraplacada", "1200.00", "1200.00"),
      linea(1, "Tarrajeo de muros", "3400.00", "17.00"),
      linea(2, "Puerta contraplacada", "1200.00", "1200.00"),
    ]);

    // Dos puertas iguales en sitios distintos del presupuesto son normales.
    expect(r.grupos).toHaveLength(0);
  });

  it("suma los grupos cuando hay varios", () => {
    const r = repetidosDeLaMeta([
      linea(0, "Tramo A", "500.00", "500.00"),
      linea(1, "Tramo B", "500.00", "500.00"),
      linea(2, "Otra cosa", "90.00", "90.00"),
      linea(3, "Panel 1", "1000.00", "1000.00"),
      linea(4, "Panel 2", "1000.00", "1000.00"),
      linea(5, "Panel 3", "1000.00", "1000.00"),
    ]);

    expect(r.grupos).toHaveLength(2);
    expect(r.deMasTotal).toBe("2500.00");
    expect(r.lineasImplicadas).toBe(5);
  });

  it("los capitulos no entran: no llevan importe propio", () => {
    const r = repetidosDeLaMeta([
      linea(0, "CAPITULO I", null),
      linea(1, "CAPITULO II", null),
      linea(2, "CAPITULO III", null),
    ]);

    expect(r.grupos).toHaveLength(0);
  });

  it("una linea propia de la meta, sin codigo, tambien cuenta", () => {
    const r = repetidosDeLaMeta([
      linea(0, "Alquiler de andamio", "1500.00", "1500.00", null),
      linea(1, "Alquiler de encofrado", "1500.00", "1500.00", null),
    ]);

    expect(r.grupos).toHaveLength(1);
    // Sin codigo del contrato: la lista de codigos sale vacia, no con huecos.
    expect(r.grupos[0]?.codigos).toEqual([]);
    expect(r.grupos[0]?.deMas).toBe("1500.00");
  });
});
