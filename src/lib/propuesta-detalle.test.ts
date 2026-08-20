import { describe, it, expect } from "vitest";
import {
  aplicarDetalle,
  convertirLineas,
  costoDirectoDeLineas,
  type LineaPropuesta,
  type NivelDetalle,
} from "./propuesta-detalle";
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

// Suma alzada con hijas DESCRIPTIVAS: el importe esta en el padre y las hijas
// solo explican que incluye. Es la forma que hizo perder 9.711,05 de la
// columna en el presupuesto real, y la que la regla vieja no sabia tratar.
const CON_ALZADA: LineaPropuesta[] = [
  ...PRESUPUESTO,
  fila("4", "CAPITULO IV: INSTALACIONES", null, true),
  fila("4.01", "Sistema contra incendios (suma alzada)", "9711.05"),
  fila("4.01.01", "Incluye: rociadores y gabinetes", null),
  fila("4.01.02", "Incluye: pruebas hidrostaticas", null),
];

const TOTAL = "12175.00";
const TOTAL_CON_ALZADA = "21886.05";

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

/**
 * Emitir en dolares.
 *
 * Se convierten las LINEAS y el costo directo sale de sumarlas, no al reves.
 * Con este tipo de cambio se ve por que: 12.175,00 / 3,80 da 3.203,95, pero la
 * suma de las seis lineas ya convertidas da 3.203,94. Un centimo. En el papel
 * que firma el cliente, la columna tiene que sumar la cifra que hay debajo.
 */
describe("la propuesta en dolares", () => {
  const TC = "3.80";
  const EN_DOLARES = convertirLineas(PRESUPUESTO, TC);

  it("convierte cada linea, no el total", () => {
    const residente = EN_DOLARES.find((l) => l.codigo === "1.01")!;
    expect(residente.parcial).toBe("2026.32");
  });

  it("el costo directo es lo que suma la columna", () => {
    expect(costoDirectoDeLineas(EN_DOLARES)).toBe("3203.94");
  });

  it.each(["capitulos", "partidas", "todo"] as const)(
    "con detalle %s el total en dolares tampoco cambia",
    (nivel) => {
      const importes = aplicarDetalle(EN_DOLARES, nivel)
        .map((l) => l.importe)
        .filter((i): i is string => i !== null);

      expect(sumar(importes, 2)).toBe("3203.94");
    },
  );

  it("no toca el metrado: lo que cambia es el dinero", () => {
    const residente = EN_DOLARES.find((l) => l.codigo === "1.01")!;
    const original = PRESUPUESTO.find((l) => l.codigo === "1.01")!;

    expect(residente.metrado).toBe(original.metrado);
    expect(residente.unidad).toBe(original.unidad);
  });
});

/**
 * El dinero de una partida a suma alzada con hijas que no cuestan.
 *
 * El importe vive en el padre; las hijas solo describen que incluye. La regla
 * vieja -"lleva cifra el que no tenga ninguna visible debajo"- dejaba al padre
 * sin cifra porque sus hijas se veian, y las hijas no tenian nada que enseñar:
 * ese dinero se caia de la columna sin dar ningun error. Lo destapo un
 * presupuesto real de 347 partidas, no esta bateria.
 */
describe("una partida a suma alzada con hijas descriptivas", () => {
  it.each(["capitulos", "partidas", "todo"] as const)(
    "con detalle %s su dinero sigue en la columna",
    (nivel) => {
      const importes = aplicarDetalle(CON_ALZADA, nivel)
        .map((l) => l.importe)
        .filter((i): i is string => i !== null);

      expect(sumar(importes, 2)).toBe(TOTAL_CON_ALZADA);
    },
  );

  it("con todo el detalle, la cifra la lleva el padre", () => {
    const filas = aplicarDetalle(CON_ALZADA, "todo");

    expect(filas.find((f) => f.codigo === "4.01")!.importe).toBe("9711.05");
    expect(filas.find((f) => f.codigo === "4.01.01")!.importe).toBeNull();
  });

  it("y no es un subtotal: es su propio importe", () => {
    // Por eso conserva su unidad y su precio unitario.
    const alzada = aplicarDetalle(CON_ALZADA, "todo").find(
      (f) => f.codigo === "4.01",
    )!;

    expect(alzada.esSubtotal).toBe(false);
    expect(alzada.unidad).toBe("glb");
  });
});
