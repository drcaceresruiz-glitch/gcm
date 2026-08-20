import { describe, expect, it } from "vitest";
import { aWinAnsi, partirEnLineas, repartirColumnas } from "./pdf-texto";

/// Una medida falsa pero predecible: cada caracter mide medio tamano. Sirve
/// para probar el reparto sin cargar una fuente de verdad.
const medir = (texto: string, tamano: number) => texto.length * (tamano / 2);

describe("aWinAnsi", () => {
  it("deja pasar el castellano entero", () => {
    expect(aWinAnsi("Cimentación de zapatas, ¿ampliación? ¡Sí! «obra» — 3ª")).toBe(
      "Cimentación de zapatas, ¿ampliación? ¡Sí! «obra» — 3ª",
    );
  });

  it("sustituye lo que la fuente no sabe pintar, en vez de reventar", () => {
    // Sin esto, pdf-lib LANZA y no hay informe. Un emoji pegado desde
    // WhatsApp en el nombre de una tarea basta.
    expect(aWinAnsi("Losa 🧱 lista")).toBe("Losa ? lista");
  });

  it("traduce los simbolos que de verdad aparecen copiados de Excel", () => {
    expect(aWinAnsi("✓ hecho")).toBe("OK hecho");
    expect(aWinAnsi("avance ≥ 80")).toBe("avance >= 80");
  });

  it("convierte el salto de linea en espacio: parte la tabla si no", () => {
    expect(aWinAnsi("Primera\nSegunda")).toBe("Primera Segunda");
  });

  it("normaliza el espacio duro de Word, que se ve igual pero no lo es", () => {
    expect(aWinAnsi("a b")).toBe("a b");
  });
});

describe("partirEnLineas", () => {
  it("no parte lo que cabe", () => {
    expect(partirEnLineas("Losa aligerada", 100, 10, medir)).toEqual([
      "Losa aligerada",
    ]);
  });

  it("parte por palabras cuando no cabe", () => {
    // 30pt a tamano 10 = 6 caracteres por linea.
    expect(partirEnLineas("uno dos tres", 30, 10, medir)).toEqual([
      "uno",
      "dos",
      "tres",
    ]);
  });

  it("trocea una palabra mas larga que la columna, en vez de desbordarla", () => {
    // Dejarla salir pisaria la columna de al lado y arruinaria la fila.
    expect(partirEnLineas("ABCDEFGHIJ", 30, 10, medir)).toEqual([
      "ABCDEF",
      "GHIJ",
    ]);
  });

  it("un texto vacio ocupa una linea, no cero: la fila tiene que existir", () => {
    expect(partirEnLineas("", 100, 10, medir)).toEqual([""]);
  });
});

describe("repartirColumnas", () => {
  it("reparte todo el ancho disponible, sin dejar hueco ni pasarse", () => {
    const anchos = repartirColumnas(["A", "B"], [["xx", "yyyy"]], 300);
    expect(anchos.reduce((a, b) => a + b, 0)).toBeCloseTo(300);
  });

  it("da mas sitio a la columna con el texto mas largo", () => {
    const anchos = repartirColumnas(
      ["Código", "Partida"],
      [["1.1", "Concreto f'c=210 en zapatas, incluye encofrado y curado"]],
      500,
    );
    expect(anchos[1]).toBeGreaterThan(anchos[0]! * 2);
  });

  it("acota la columna larga: si no, se come la tabla", () => {
    // Una descripcion de 300 caracteres dejaria las de porcentajes en un hilo
    // y "100.00" partido en dos lineas.
    const anchos = repartirColumnas(
      ["Partida", "Real (%)"],
      [["x".repeat(300), "100.00"]],
      500,
    );
    expect(anchos[1]).toBeGreaterThan(40);
  });

  it("una columna vacia conserva un ancho utilizable", () => {
    const anchos = repartirColumnas(["A", "B"], [["", ""]], 200);
    expect(anchos[0]).toBeGreaterThan(0);
    expect(anchos[1]).toBeGreaterThan(0);
  });
});

/**
 * Las unidades de obra.
 *
 * Estaba mal y salia impreso: "m²" se conservaba pero "m³" se convertia en
 * "m3", asi que en la misma columna de un informe convivian dos grafias del
 * mismo tipo de unidad. Los dos caracteres estan en WinAnsi -Helvetica sabe
 * pintarlos- y ninguno hacia falta convertir.
 *
 * Los de UNA sola letra (㎡, ㎥) no estan, y esos si se cambian, pero por su
 * forma normal con superindice, no por "m2".
 */
describe("las unidades de obra", () => {
  it("conserva el cuadrado y el cubo", () => {
    expect(aWinAnsi("Concreto f'c=210 kg/cm²")).toBe("Concreto f'c=210 kg/cm²");
    expect(aWinAnsi("Excavacion 12.50 m³")).toBe("Excavacion 12.50 m³");
  });

  it("los escribe igual: m² y m³, no m² y m3", () => {
    // Es el fallo concreto que se corrigio. Si vuelve, esta prueba lo dice.
    expect(aWinAnsi("m² m³")).toBe("m² m³");
  });

  it("desarma las unidades de un solo caracter", () => {
    expect(aWinAnsi("Area ㎡ y volumen ㎥")).toBe("Area m² y volumen m³");
  });
});
