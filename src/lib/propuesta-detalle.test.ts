import { describe, it, expect } from "vitest";
import { aplicarDetalle, type LineaPropuesta, type NivelDetalle } from "./propuesta-detalle";
import { sumar } from "./decimal";

/**
 * Un presupuesto pequeño con las tres formas que aparecen de verdad:
 * capitulo con partidas sueltas, capitulo con una linea NEGATIVA (un descuento
 * de proveedor, que es costo directo en negativo) y capitulo con un grupo que
 * abre subpartidas.
 *
 * Total costeado: 7.700 + 2.750 + 1.575 - 1.000 + 700 + 450 = 12.175,00
 */
function fila(
  codigo: string,
  descripcion: string,
  parcial: string | null,
  esCapitulo = false,
): LineaPropuesta {
  return {
    codigo,
    descripcion,
    unidad: parcial === null ? null : "glb",
    metrado: parcial === null ? null : "1",
    precioUnitario: parcial,
    parcial,
    nivel: codigo.split(".").length - 1,
    esCapitulo,
  };
}

const PRESUPUESTO: LineaPropuesta[] = [
  fila("1", "CAPITULO I: PRELIMINARES", null, true),
  fila("1.01", "Residente de obra", "7700.00"),
  fila("1.02", "Seguros de empresa", "2750.00"),
  fila("2", "CAPITULO II: TRABAJOS", null, true),
  fila("2.01", "Movilizacion", "1575.00"),
  fila("2.02", "DESCUENTO COMERCIAL PROVEEDOR", "-1000.00"),
  fila("3", "CAPITULO III: CIMENTACIONES", null, true),
  fila("3.01", "ZAPATAS", null),
  fila("3.01.01", "Movilizacion de equipos", "700.00"),
  fila("3.01.02", "Corte de losa", "450.00"),
];

const TOTAL = "12175.00";

/// Lo que de verdad se suma en el papel: las filas que llevan cifra.
function totalVisible(nivel: NivelDetalle): string {
  const importes = aplicarDetalle(PRESUPUESTO, nivel)
    .map((l) => l.importe)
    .filter((i): i is string => i !== null);

  return sumar(importes, 2);
}

describe("el detalle de la propuesta", () => {
  /**
   * LA prueba. Cambiar cuanto detalle se enseña es una decision de
   * PRESENTACION: no puede mover ni un centimo del total. Si algun dia una
   * profundidad deja de cuadrar, el cliente recibe dos propuestas del mismo
   * presupuesto con dos precios distintos y ninguna da error.
   */
  it.each(["capitulos", "partidas", "todo"] as const)(
    "con detalle %s el total sigue siendo el mismo",
    (nivel) => {
      expect(totalVisible(nivel)).toBe(TOTAL);
    },
  );

  it("con solo capitulos, cada capitulo lleva su subtotal", () => {
    const filas = aplicarDetalle(PRESUPUESTO, "capitulos");

    expect(filas.map((f) => f.codigo)).toEqual(["1", "2", "3"]);
    expect(filas.map((f) => f.importe)).toEqual([
      "10450.00",
      // El descuento resta dentro de su capitulo, no fuera.
      "575.00",
      "1150.00",
    ]);
    expect(filas.every((f) => f.esSubtotal)).toBe(true);
  });

  it("un subtotal no enseña metrado ni precio unitario", () => {
    // Son de las partidas que quedaron debajo; enseñar los de una sola
    // mentiria, y enseñar el metrado sumado mezclaria unidades distintas.
    const capitulo = aplicarDetalle(PRESUPUESTO, "capitulos")[0]!;

    expect(capitulo.metrado).toBeNull();
    expect(capitulo.precioUnitario).toBeNull();
    expect(capitulo.unidad).toBeNull();
  });

  it("con partidas, el grupo con subpartidas ocultas pasa a subtotal", () => {
    const filas = aplicarDetalle(PRESUPUESTO, "partidas");
    const grupo = filas.find((f) => f.codigo === "3.01")!;

    expect(filas.map((f) => f.codigo)).not.toContain("3.01.01");
    expect(grupo.importe).toBe("1150.00");
    expect(grupo.esSubtotal).toBe(true);
  });

  it("con partidas, el capitulo NO lleva cifra: sus hijas se ven", () => {
    // Es el doble conteo clasico del Excel de presupuesto: si el capitulo
    // llevara importe y sus partidas tambien, sumar la columna da el doble.
    const filas = aplicarDetalle(PRESUPUESTO, "partidas");

    expect(filas.find((f) => f.codigo === "1")!.importe).toBeNull();
    expect(filas.find((f) => f.codigo === "1.01")!.importe).toBe("7700.00");
  });

  it("con todo, se ven las diez filas y solo pagan las hojas", () => {
    const filas = aplicarDetalle(PRESUPUESTO, "todo");

    expect(filas).toHaveLength(10);
    expect(filas.find((f) => f.codigo === "3.01")!.importe).toBeNull();
    expect(filas.find((f) => f.codigo === "3.01.01")!.importe).toBe("700.00");
  });

  it("un capitulo sin nada costeado se queda en blanco, no en 0,00", () => {
    // Un "0.00" en el papel hace pensar que se perdio el importe.
    const vacio = aplicarDetalle(
      [fila("9", "CAPITULO IX: POR DEFINIR", null, true)],
      "capitulos",
    )[0]!;

    expect(vacio.importe).toBeNull();
    expect(vacio.esSubtotal).toBe(false);
  });
});
