import { describe, expect, it } from "vitest";
import { BOM, celdaCsv, generarCsv } from "./csv";

describe("celdaCsv", () => {
  it("deja pasar el texto simple sin tocarlo", () => {
    expect(celdaCsv("Cimentación")).toBe("Cimentación");
    expect(celdaCsv(42)).toBe("42");
  });

  it("el vacio y el ausente salen como celda vacia", () => {
    expect(celdaCsv(null)).toBe("");
    expect(celdaCsv(undefined)).toBe("");
    expect(celdaCsv("")).toBe("");
  });

  it("entrecomilla lo que lleva el separador", () => {
    expect(celdaCsv("Concreto; incluye encofrado")).toBe(
      '"Concreto; incluye encofrado"',
    );
  });

  it("duplica las comillas de dentro", () => {
    expect(celdaCsv('Muro de 8"')).toBe('"Muro de 8"""');
  });

  it("entrecomilla los saltos de linea para no partir la fila", () => {
    expect(celdaCsv("Primera\nSegunda")).toBe('"Primera\nSegunda"');
  });

  it("neutraliza lo que Excel ejecutaria como formula", () => {
    // El nombre de la tarea sale de un XML que sube el usuario.
    expect(celdaCsv("=1+1")).toBe("'=1+1");
    expect(celdaCsv("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(celdaCsv("+34 999")).toBe("'+34 999");
  });

  it("NO toca un numero negativo, que empieza igual pero es un dato", () => {
    // Es el desfase de media obra: convertirlo en texto romperia cualquier
    // suma que se haga con la columna.
    expect(celdaCsv("-5.40")).toBe("-5.40");
    expect(celdaCsv(-5.4)).toBe("-5.4");
  });
});

describe("generarCsv", () => {
  it("empieza por el BOM, sin el cual Excel se come las tildes", () => {
    expect(generarCsv([["Cimentación"]]).startsWith(BOM)).toBe(true);
  });

  it("declara el separador para no depender del ordenador que lo abra", () => {
    expect(generarCsv([["a"]])).toBe(`${BOM}sep=;\r\na\r\n`);
  });

  it("separa columnas con punto y coma y filas con CRLF", () => {
    const csv = generarCsv([
      ["Código", "Partida"],
      ["1.1", "Cartel de obra"],
    ]);
    expect(csv).toBe(`${BOM}sep=;\r\nCódigo;Partida\r\n1.1;Cartel de obra\r\n`);
  });

  it("una fila vacia deja una linea en blanco entre bloques", () => {
    expect(generarCsv([["a"], [], ["b"]])).toBe(`${BOM}sep=;\r\na\r\n\r\nb\r\n`);
  });
});
