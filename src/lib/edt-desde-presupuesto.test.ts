import { describe, it, expect } from "vitest";

import {
  edtDesdePresupuesto,
  subirFechas,
  type FilaPresupuesto,
} from "./edt-desde-presupuesto";

/**
 * El presupuesto ES la EDT.
 *
 *   CAPITULO IV                rama
 *     4.1 Concreto en zapatas  PAQUETE DE TRABAJO
 *         4.1.1 Encofrado      tarea
 *
 * Lo que se protege aqui son dos invariantes: que la jerarquia del presupuesto
 * llegue intacta al cronograma —donde la marcan `nivel` y el ORDEN, no un
 * parentId— y que las fechas suban de las hojas sin inventarse ninguna.
 */

function fila(
  id: string,
  codigoPartida: string,
  descripcion: string,
  parentId: string | null,
  orden: number,
): FilaPresupuesto {
  return { id, codigoPartida, descripcion, parentId, orden };
}

const PRESUPUESTO = [
  fila("c4", "4.0", "CAPITULO IV", null, 1),
  fila("p1", "4.1", "Concreto en zapatas", "c4", 2),
  fila("t1", "4.1.1", "Encofrado", "p1", 3),
  fila("t2", "4.1.2", "Acero", "p1", 4),
  fila("t3", "4.1.3", "Vaciado", "p1", 5),
  fila("p2", "4.2", "Solado", "c4", 6),
];

describe("edtDesdePresupuesto", () => {
  it("convierte capitulo, partida y subpartidas en la jerarquia de la EDT", () => {
    const edt = edtDesdePresupuesto(PRESUPUESTO);

    expect(edt.map((f) => [f.codigo, f.nivel])).toEqual([
      ["4.0", 1],
      ["4.1", 2],
      ["4.1.1", 3],
      ["4.1.2", 3],
      ["4.1.3", 3],
      ["4.2", 2],
    ]);
  });

  it("marca como resumen a quien agrupa, y solo a quien agrupa", () => {
    const edt = edtDesdePresupuesto(PRESUPUESTO);
    const resumen = edt.filter((f) => f.esResumen).map((f) => f.codigo);

    // El capitulo y el paquete con tareas. La 4.2, que no tiene subpartidas,
    // es a la vez paquete y su unica tarea: una sola fila y NO es resumen.
    expect(resumen).toEqual(["4.0", "4.1"]);
  });

  /**
   * El orden del documento es lo que dice quien cuelga de quien, asi que las
   * tareas de un paquete tienen que salir SEGUIDAS y detras de el.
   */
  it("saca cada rama seguida, en profundidad", () => {
    const edt = edtDesdePresupuesto(PRESUPUESTO);

    expect(edt.map((f) => f.codigo)).toEqual([
      "4.0", "4.1", "4.1.1", "4.1.2", "4.1.3", "4.2",
    ]);
    expect(edt.map((f) => f.fila)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("no se cuelga si los datos traen un ciclo", () => {
    const ciclo = [
      fila("a", "1", "A", "b", 1),
      fila("b", "2", "B", "a", 2),
    ];

    expect(() => edtDesdePresupuesto(ciclo)).not.toThrow();
  });
});

describe("subirFechas", () => {
  function programada(edt: ReturnType<typeof edtDesdePresupuesto>, fechas: Record<string, [string, string]>) {
    return edt.map((f) => ({
      ...f,
      inicio: fechas[f.codigo]?.[0] ?? null,
      fin: fechas[f.codigo]?.[1] ?? null,
    }));
  }

  it("el paquete empieza con su primera tarea y acaba con la ultima", () => {
    const filas = programada(edtDesdePresupuesto(PRESUPUESTO), {
      "4.1.1": ["2026-08-10", "2026-08-12"],
      "4.1.2": ["2026-08-13", "2026-08-15"],
      "4.1.3": ["2026-08-16", "2026-08-20"],
      "4.2": ["2026-08-21", "2026-08-22"],
    });

    const subidas = subirFechas(filas);
    const porCodigo = new Map(subidas.map((f) => [f.codigo, f]));

    expect(porCodigo.get("4.1")?.inicio).toBe("2026-08-10");
    expect(porCodigo.get("4.1")?.fin).toBe("2026-08-20");
    // Y el capitulo abarca sus dos paquetes.
    expect(porCodigo.get("4.0")?.inicio).toBe("2026-08-10");
    expect(porCodigo.get("4.0")?.fin).toBe("2026-08-22");
  });

  /**
   * Se compara la FECHA, no la posicion: la ultima tarea de la lista no tiene
   * por que ser la que termina mas tarde.
   */
  it("manda la fecha y no el orden de la lista", () => {
    const filas = programada(edtDesdePresupuesto(PRESUPUESTO), {
      "4.1.1": ["2026-08-10", "2026-09-30"],
      "4.1.2": ["2026-08-13", "2026-08-15"],
      "4.1.3": ["2026-08-16", "2026-08-20"],
    });

    expect(subirFechas(filas).find((f) => f.codigo === "4.1")?.fin).toBe("2026-09-30");
  });

  it("una rama sin programar se queda en nulo, no se inventa un plan", () => {
    const filas = programada(edtDesdePresupuesto(PRESUPUESTO), {});
    const subidas = subirFechas(filas);

    expect(subidas.find((f) => f.codigo === "4.1")?.inicio).toBeNull();
    expect(subidas.find((f) => f.codigo === "4.0")?.fin).toBeNull();
  });

  it("con una sola tarea programada, el paquete toma esa", () => {
    const filas = programada(edtDesdePresupuesto(PRESUPUESTO), {
      "4.1.2": ["2026-08-13", "2026-08-15"],
    });

    const p = subirFechas(filas).find((f) => f.codigo === "4.1");
    expect(p?.inicio).toBe("2026-08-13");
    expect(p?.fin).toBe("2026-08-15");
  });
});
