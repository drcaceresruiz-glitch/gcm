import { describe, expect, it } from "vitest";
import { contarPaginas, normalizarPagina, saltar } from "@/lib/paginacion";

describe("contarPaginas", () => {
  it("reparte las filas en paginas de 20", () => {
    expect(contarPaginas(0)).toBe(1);
    expect(contarPaginas(1)).toBe(1);
    expect(contarPaginas(20)).toBe(1);
    expect(contarPaginas(21)).toBe(2);
    expect(contarPaginas(314)).toBe(16);
  });

  /** Una lista vacia se muestra en la pagina 1, no en la 0. */
  it("nunca devuelve cero paginas", () => {
    expect(contarPaginas(0)).toBe(1);
    expect(contarPaginas(0, 50)).toBe(1);
  });
});

describe("normalizarPagina", () => {
  it("acepta una pagina que existe", () => {
    expect(normalizarPagina("3", 5)).toBe(3);
    expect(normalizarPagina("1", 1)).toBe(1);
  });

  /**
   * Lo que llega por la URL no lo escribe la aplicacion. Ninguno de estos
   * puede acabar en una lista vacia: la pantalla diria «no hay nada» cuando
   * lo que hay es una pagina mal pedida.
   */
  it("acota lo que no es una pagina", () => {
    expect(normalizarPagina(undefined, 5)).toBe(1);
    expect(normalizarPagina("", 5)).toBe(1);
    expect(normalizarPagina(" ", 5)).toBe(1);
    expect(normalizarPagina("abc", 5)).toBe(1);
    expect(normalizarPagina("0", 5)).toBe(1);
    expect(normalizarPagina("-3", 5)).toBe(1);
    expect(normalizarPagina("1.5", 5)).toBe(1);
  });

  /** Un enlace viejo a una pagina que ya no existe cae en la ultima. */
  it("recorta por arriba", () => {
    expect(normalizarPagina("999", 5)).toBe(5);
    expect(normalizarPagina("6", 5)).toBe(5);
  });

  it("sobre una lista vacia devuelve la pagina 1", () => {
    expect(normalizarPagina("4", 0)).toBe(1);
  });
});

describe("saltar", () => {
  it("la primera pagina no salta nada", () => {
    expect(saltar(1)).toBe(0);
  });

  it("las siguientes saltan las anteriores completas", () => {
    expect(saltar(2)).toBe(20);
    expect(saltar(3)).toBe(40);
    expect(saltar(3, 50)).toBe(100);
  });
});
