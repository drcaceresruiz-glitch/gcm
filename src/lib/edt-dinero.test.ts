import { describe, it, expect } from "vitest";

import { edtDesdePresupuesto, type FilaPresupuesto } from "./edt-desde-presupuesto";
import { sumarHojas } from "./jerarquia-partidas";
import { sumar } from "./decimal";

/**
 * LA INVARIANTE QUE DE VERDAD IMPORTA.
 *
 * La suma de los importes que el generador ENLAZA tiene que ser exactamente el
 * costo directo del presupuesto. Ni un sol sin tarea que lo cubra —eso es
 * dinero que sale del control de avance—, ni un sol contado dos veces.
 *
 * Estas pruebas nacen de una revision adversaria que tumbo la primera version:
 * decidia quien lleva el dinero mirando la FORMA del arbol —"no tiene
 * subpartidas colgando"— en vez de mirar quien aporta al costo directo. Los
 * dos criterios coinciden en el caso comun y difieren justo donde duele.
 *
 * Y duele de verdad porque `esResumen` excluye a una fila de la valorizacion
 * en nueve sitios del sistema: una partida costeada marcada como resumen es
 * dinero perdido del control SIN ningun error.
 */

function fila(
  id: string,
  codigoPartida: string,
  parentId: string | null,
  orden: number,
  parcial: string | null,
): FilaPresupuesto {
  return { id, codigoPartida, descripcion: codigoPartida, parentId, orden, parcial };
}

/// Lo que el generador enlazaria: las filas que NO son resumen.
function enlazado(filas: readonly FilaPresupuesto[]): string {
  const importe = new Map(filas.map((f) => [f.codigoPartida, f.parcial]));
  const hojas = edtDesdePresupuesto(filas).filter((f) => !f.esResumen);
  return sumar(hojas.map((f) => importe.get(f.codigo) ?? "0"));
}

function costoDirecto(filas: readonly FilaPresupuesto[]): string {
  return sumarHojas(
    filas.map((f) => ({ codigo: f.codigoPartida, parcial: f.parcial })),
  );
}

describe("el dinero que enlaza la EDT", () => {
  it("caso corriente: las subpartidas llevan el importe y la partida es el paquete", () => {
    const p = [
      fila("c4", "4.0", null, 1, null),
      fila("p1", "4.1", "c4", 2, null),
      fila("t1", "4.1.1", "p1", 3, "100.00"),
      fila("t2", "4.1.2", "p1", 4, "200.00"),
      fila("p2", "4.2", "c4", 5, "400.00"),
    ];

    expect(enlazado(p)).toBe(costoDirecto(p));
    expect(costoDirecto(p)).toBe("700.00");
  });

  it("suma alzada: el importe esta en la partida y sus subpartidas son el alcance", () => {
    // Es lo que produce `agruparEnSumaAlzada`: la madre lleva la cifra y las
    // hijas quedan como ALCANCE, sin importe. La version tumbada enlazaba las
    // dos hijas VACIAS y dejaba los 120000 sin ninguna tarea que los cubriera.
    const p = [
      fila("c5", "5.0", null, 1, null),
      fila("p1", "5.1", "c5", 2, "120000.00"),
      fila("a1", "5.1.1", "p1", 3, null),
      fila("a2", "5.1.2", "p1", 4, null),
    ];

    const edt = edtDesdePresupuesto(p);

    expect(enlazado(p)).toBe("120000.00");
    expect(enlazado(p)).toBe(costoDirecto(p));

    // La partida costeada NO puede quedar marcada como resumen: eso la sacaria
    // de la valorizacion, del mapeo y del plan semanal.
    expect(edt.find((f) => f.codigo === "5.1")?.esResumen).toBe(false);

    // Y el alcance no baja a la EDT: describe lo que entra en el precio, no
    // una tarea que ejecutar.
    expect(edt.map((f) => f.codigo)).toEqual(["5.0", "5.1"]);
  });

  it("descuento comercial: el negativo NO cubre a su madre, y las dos aportan", () => {
    // El caso CRIOCORD que documenta `jerarquia-partidas`. La version tumbada
    // dejaba los 779,10 sin enlazar y creaba un unico enlace, al descuento:
    // esa rama habria pesado -100 en vez de +679, y el avance de la obra
    // BAJARIA al ejecutar trabajo.
    const p = [
      fila("c7", "7.0", null, 1, null),
      fila("p1", "7.09.00", "c7", 2, "779.10"),
      fila("d1", "7.09.01", "p1", 3, "-100.00"),
    ];

    const edt = edtDesdePresupuesto(p);

    expect(costoDirecto(p)).toBe("679.10");
    expect(enlazado(p)).toBe("679.10");

    // Las dos aportan, asi que las dos son hoja: el descuento sube a hermana
    // en vez de convertir a su madre en resumen.
    expect(edt.map((f) => [f.codigo, f.nivel, f.esResumen])).toEqual([
      ["7.0", 1, true],
      ["7.09.00", 2, false],
      ["7.09.01", 2, false],
    ]);
  });

  it("una rama entera sin costear no baja a la EDT", () => {
    const p = [
      fila("c1", "1.0", null, 1, null),
      fila("p1", "1.1", "c1", 2, "50.00"),
      fila("c9", "9.0", null, 3, null),
      fila("p9", "9.1", "c9", 4, null),
    ];

    expect(edtDesdePresupuesto(p).map((f) => f.codigo)).toEqual(["1.0", "1.1"]);
    expect(enlazado(p)).toBe(costoDirecto(p));
  });

  it("un presupuesto sin un solo importe no produce EDT", () => {
    const p = [
      fila("c1", "1.0", null, 1, null),
      fila("p1", "1.1", "c1", 2, null),
    ];

    expect(edtDesdePresupuesto(p)).toEqual([]);
  });

  it("las filas de la EDT no dan saltos de nivel", () => {
    const p = [
      fila("c5", "5.0", null, 1, null),
      fila("p1", "5.1", "c5", 2, "100.00"),
      fila("a1", "5.1.1", "p1", 3, null),
      fila("a2", "5.1.1.1", "a1", 4, null),
      fila("p2", "5.2", "c5", 5, null),
      fila("t1", "5.2.1", "p2", 6, "200.00"),
    ];

    const niveles = edtDesdePresupuesto(p).map((f) => f.nivel);
    for (let i = 1; i < niveles.length; i++) {
      expect(niveles[i]!).toBeLessThanOrEqual(niveles[i - 1]! + 1);
    }
    expect(enlazado(p)).toBe(costoDirecto(p));
  });
});
