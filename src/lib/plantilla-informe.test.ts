import { describe, expect, it } from "vitest";
import {
  ELECCION_POR_DEFECTO,
  SECCIONES_INFORME,
  escribirApagadas,
  leerEleccion,
  seccionesDelInforme,
  type EleccionInforme,
} from "./plantilla-informe";

const eleccion = (parcial: Partial<EleccionInforme> = {}): EleccionInforme => ({
  ...ELECCION_POR_DEFECTO,
  ...parcial,
});

describe("que secciones lleva el informe", () => {
  it("por defecto, la completa: todas", () => {
    const r = seccionesDelInforme(ELECCION_POR_DEFECTO, null);

    expect(r.plantilla).toBe("COMPLETA");
    expect(r.incluidas).toEqual([...SECCIONES_INFORME]);
    expect(r.apagadas).toEqual([]);
    expect(r.origen).toBe("empresa");
  });

  it("la ejecutiva deja fuera el cronograma y las fotos", () => {
    const r = seccionesDelInforme(eleccion({ plantilla: "EJECUTIVA" }), null);

    expect(r.incluidas).toEqual(["control", "tablas"]);
    expect(r.apagadas).toEqual(["cronograma", "bitacora"]);
  });

  it("un interruptor apaga una seccion encima de la plantilla", () => {
    const r = seccionesDelInforme(
      eleccion({ plantilla: "COMPLETA", apagadas: ["bitacora"] }),
      null,
    );

    expect(r.incluidas).not.toContain("bitacora");
    expect(r.apagadas).toEqual(["bitacora"]);
  });

  it("`apagadas` cuenta TODO lo que no sale, venga de donde venga", () => {
    // El pie del informe lo dice en numero: un informe recortado que no
    // confiesa serlo es indistinguible de uno completo para quien lo recibe.
    const r = seccionesDelInforme(
      eleccion({ plantilla: "EJECUTIVA", apagadas: ["tablas"] }),
      null,
    );

    expect(r.incluidas).toEqual(["control"]);
    expect(r.apagadas).toEqual(["cronograma", "tablas", "bitacora"]);
  });

  it("el resumen NUNCA esta entre lo apagable", () => {
    // Lleva el avance y las alertas de atraso. Un informe del que se puede
    // quitar el atraso no es un informe.
    expect(SECCIONES_INFORME).not.toContain("resumen");
  });
});

describe("la obra pisa a la empresa", () => {
  it("si la obra eligio, manda la obra", () => {
    const r = seccionesDelInforme(
      eleccion({ plantilla: "COMPLETA" }),
      eleccion({ plantilla: "OBRA" }),
    );

    expect(r.plantilla).toBe("OBRA");
    expect(r.origen).toBe("obra");
  });

  it("y manda ENTERA: no se mezclan las apagadas de las dos", () => {
    // Mezclarlas daria combinaciones que nadie eligio -la plantilla de la
    // empresa con los interruptores de la obra- y que no se pueden explicar.
    const r = seccionesDelInforme(
      eleccion({ plantilla: "COMPLETA", apagadas: ["bitacora"] }),
      eleccion({ plantilla: "COMPLETA", apagadas: ["tablas"] }),
    );

    expect(r.incluidas).toContain("bitacora");
    expect(r.incluidas).not.toContain("tablas");
  });

  it("sin eleccion de obra, manda la empresa", () => {
    const r = seccionesDelInforme(eleccion({ plantilla: "EJECUTIVA" }), null);
    expect(r.origen).toBe("empresa");
  });
});

describe("lo guardado se lee tolerando basura", () => {
  it("una plantilla que no existe cae a la completa", () => {
    // Un valor viejo o mal escrito no puede impedir que el informe salga.
    expect(leerEleccion("INVENTADA", "").plantilla).toBe("COMPLETA");
    expect(leerEleccion(null, null).plantilla).toBe("COMPLETA");
  });

  it("una clave de seccion desconocida se descarta", () => {
    const r = leerEleccion("COMPLETA", "bitacora,seccion_retirada, tablas ");
    expect(r.apagadas).toEqual(["bitacora", "tablas"]);
  });

  it("lo que se escribe se puede volver a leer igual", () => {
    const texto = escribirApagadas(["tablas", "bitacora"]);
    expect(leerEleccion("COMPLETA", texto).apagadas).toEqual([
      "tablas",
      "bitacora",
    ]);
  });

  it("al escribir se ordena y no se repite: el texto es el dato", () => {
    expect(escribirApagadas(["bitacora", "bitacora", "cronograma"])).toBe(
      "cronograma,bitacora",
    );
  });
});
