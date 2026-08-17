import { describe, expect, it } from "vitest";

import {
  formaCanonicaDeArchivo,
  formaCanonicaDeGuardado,
  resumenesDelArchivo,
  type DependenciaGuardadaComparable,
  type TareaGuardadaComparable,
} from "@/lib/cronograma-huella";
import type { DependenciaImportada, TareaImportada } from "@/lib/msproject-xml";

/**
 * Las dos caras de la MISMA tarea: la que trae el lector (todo texto) y la
 * que devuelve Prisma (fechas y `Decimal`). Se construyen a la vez a
 * proposito: si una prueba las dejara diverger sin querer, dejaria de probar
 * lo unico que importa aqui, que es que las dos caras coincidan.
 */
function par(over: Partial<TareaImportada> & { uid: number }) {
  const t: TareaImportada = {
    fila: over.uid,
    codigo: "4.4",
    nombre: "Excavacion manual",
    nivel: 3,
    esResumen: false,
    esHito: false,
    esCritico: true,
    inicio: "2026-08-03",
    fin: "2026-08-07",
    duracionDias: "5",
    porcentajePlaneado: "40",
    porcentajeArchivo: "35",
    holguraDias: "0",
    holguraInferida: false,
    ...over,
  };

  // La cara guardada: mismos valores, tipos de la base. Los decimales llegan
  // con los ceros que pone la columna, que es la trampa que `dec()` deshace.
  const g: TareaGuardadaComparable = {
    uid: t.uid,
    fila: t.fila,
    codigo: t.codigo,
    nombre: t.nombre,
    nivel: t.nivel,
    esHito: t.esHito,
    esCritico: t.esCritico,
    inicio: new Date(`${t.inicio}T00:00:00Z`),
    fin: new Date(`${t.fin}T00:00:00Z`),
    duracionDias: `${Number(t.duracionDias).toFixed(2)}`,
    porcentajePlaneado: `${Number(t.porcentajePlaneado).toFixed(2)}`,
    porcentajeArchivo: `${Number(t.porcentajeArchivo).toFixed(2)}`,
    holguraDias: `${Number(t.holguraDias).toFixed(2)}`,
    holguraInferida: t.holguraInferida,
  };

  return { archivo: t, guardado: g };
}

function dependencia(
  tareaUid: number,
  predecesoraUid: number,
): { archivo: DependenciaImportada; guardado: DependenciaGuardadaComparable } {
  return {
    archivo: { tareaUid, predecesoraUid, tipo: "FC", desfaseDias: "0" },
    guardado: { tareaUid, predecesoraUid, tipo: "FC", desfaseDias: "0.00" },
  };
}

/** Compara las dos caras como lo hara el servicio. */
function coinciden(
  pares: ReturnType<typeof par>[],
  enlaces: ReturnType<typeof dependencia>[] = [],
  minutos = 480,
): boolean {
  const tareas = pares.map((p) => p.archivo);
  return (
    formaCanonicaDeArchivo({
      tareas,
      dependencias: enlaces.map((e) => e.archivo),
      minutosPorDia: minutos,
    }) ===
    formaCanonicaDeGuardado(
      pares.map((p) => p.guardado),
      enlaces.map((e) => e.guardado),
      minutos,
      resumenesDelArchivo(tareas),
    )
  );
}

describe("huella del plan", () => {
  it("el mismo plan da la misma huella por los dos lados", () => {
    expect(coinciden([par({ uid: 1 }), par({ uid: 2 })], [dependencia(2, 1)])).toBe(true);
  });

  /**
   * La trampa principal. El lector dice "8.8" y la columna devuelve "8.80";
   * dice "0" y devuelve "0.00". Sin normalizar, esto da distinto SIEMPRE y el
   * guardia dejaria de saltar nunca: cada reimportacion pediria confirmacion.
   */
  it("los ceros de la columna no cuentan como cambio", () => {
    const p = par({ uid: 1, duracionDias: "8.8", holguraDias: "0" });
    expect(p.guardado.duracionDias).toBe("8.80");
    expect(coinciden([p])).toBe(true);
  });

  it("el orden de las filas y de los enlaces no altera la huella", () => {
    const a = par({ uid: 1 });
    const b = par({ uid: 2 });
    const e1 = dependencia(2, 1);
    const e2 = dependencia(3, 1);

    const uno = formaCanonicaDeArchivo({
      tareas: [a.archivo, b.archivo],
      dependencias: [e1.archivo, e2.archivo],
      minutosPorDia: 480,
    });
    const otro = formaCanonicaDeArchivo({
      tareas: [b.archivo, a.archivo],
      dependencias: [e2.archivo, e1.archivo],
      minutosPorDia: 480,
    });

    expect(uno).toBe(otro);
  });

  it("mover la fecha de una hoja SI cuenta como cambio", () => {
    const p = par({ uid: 1 });
    p.guardado.fin = new Date("2026-08-10T00:00:00Z");
    expect(coinciden([p])).toBe(false);
  });

  it("cambiar el tipo de un enlace SI cuenta como cambio", () => {
    const e = dependencia(2, 1);
    e.guardado.tipo = "CC";
    expect(coinciden([par({ uid: 1 }), par({ uid: 2 })], [e])).toBe(false);
  });

  it("cambiar la jornada SI cuenta como cambio", () => {
    const p = par({ uid: 1 });
    const archivo = formaCanonicaDeArchivo({
      tareas: [p.archivo],
      dependencias: [],
      minutosPorDia: 480,
    });
    const guardado = formaCanonicaDeGuardado([p.guardado], [], 600, new Set());
    expect(archivo).not.toBe(guardado);
  });
});

/**
 * Lo que GCM recalcula no es del archivo, y por eso no pesa.
 *
 * `recalcularResumenes` reescribe `esResumen`, `sinProgramar`, `inicio`, `fin`
 * y `duracionDias` de las filas resumen, y lo hace sobre TODAS las filas, sin
 * filtrar por origen. Lo llaman la sincronizacion de la EDT y las operaciones
 * de tarea manual.
 *
 * Si esos campos entraran en la huella, despues de la primera sincronizacion
 * el mismo archivo daria "distinto" y GCM ofreceria un reemplazo que ademas
 * desharia el recalculo hasta volver a sincronizar.
 */
describe("lo que recalcula GCM no cuenta como cambio del archivo", () => {
  it("las fechas de un resumen las pone GCM, asi que no pesan", () => {
    const resumen = par({ uid: 10, esResumen: true, nivel: 2, nombre: "CAPITULO I" });

    // Lo que dejo `recalcularResumenes`: la envoltura de sus hijas, que no es
    // lo que decia el archivo.
    resumen.guardado.inicio = new Date("2026-08-01T00:00:00Z");
    resumen.guardado.fin = new Date("2026-09-15T00:00:00Z");
    resumen.guardado.duracionDias = "34.00";

    expect(coinciden([resumen, par({ uid: 11 })])).toBe(true);
  });

  /**
   * El complemento imprescindible: sin el, la prueba de arriba se leeria como
   * "la huella ignora las fechas", que seria un agujero.
   */
  it("pero las de una hoja si, aunque este dentro de ese resumen", () => {
    const resumen = par({ uid: 10, esResumen: true, nivel: 2 });
    resumen.guardado.fin = new Date("2026-09-15T00:00:00Z");

    const hoja = par({ uid: 11 });
    hoja.guardado.fin = new Date("2026-08-20T00:00:00Z");

    expect(coinciden([resumen, hoja])).toBe(false);
  });

  it("si el archivo convierte una hoja en resumen, eso si se nota", () => {
    const comoHoja = par({ uid: 10, esResumen: false, nivel: 3 });
    const comoResumen = par({ uid: 10, esResumen: true, nivel: 2 });

    const uno = formaCanonicaDeArchivo({
      tareas: [comoHoja.archivo],
      dependencias: [],
      minutosPorDia: 480,
    });
    const otro = formaCanonicaDeArchivo({
      tareas: [comoResumen.archivo],
      dependencias: [],
      minutosPorDia: 480,
    });

    expect(uno).not.toBe(otro);
  });
});
