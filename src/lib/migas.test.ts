import { describe, expect, it } from "vitest";

import { migasDeRuta } from "@/lib/migas";

describe("la cadena de migas", () => {
  it("arma los cuatro niveles del tablero de una semana", () => {
    const m = migasDeRuta("/obras/abc/plan-semanal/xyz/tablero", {
      obra: "CRIOCORD",
      plan: "Semana 3",
    });

    expect(m.map((x) => x.texto)).toEqual([
      "Obras",
      "CRIOCORD",
      "Plan semanal",
      "Semana 3",
      "Tablero",
    ]);
  });

  /**
   * Hay DOS tableros y se llaman igual: el de supervision de la obra y el
   * semanal del Last Planner. Al añadir el primero, el patron corto podia
   * comerse al largo; se fijan los dos juntos para que no se pueda romper uno
   * sin que se note.
   */
  it("distingue el tablero de la obra del tablero de una semana", () => {
    const obra = migasDeRuta("/obras/abc/tablero", { obra: "CRIOCORD" });
    expect(obra.map((x) => x.texto)).toEqual(["Obras", "CRIOCORD", "Tablero"]);

    const semana = migasDeRuta("/obras/abc/plan-semanal/xyz/tablero", {
      obra: "CRIOCORD",
      plan: "Semana 3",
    });
    expect(semana.map((x) => x.texto)).toEqual([
      "Obras",
      "CRIOCORD",
      "Plan semanal",
      "Semana 3",
      "Tablero",
    ]);
  });

  /**
   * El Kanban es la TERCERA pantalla del mismo territorio, y la unica que no
   * se llama «Tablero». Se fija aqui junto a las otras dos para que nadie la
   * renombre por parecer mas coherente: el nombre distinto es justo lo que
   * impide volver a confundirlas.
   */
  it("el Kanban no se confunde con ninguno de los dos tableros", () => {
    const kanban = migasDeRuta("/obras/abc/kanban", { obra: "CRIOCORD" });
    expect(kanban.map((x) => x.texto)).toEqual(["Obras", "CRIOCORD", "Kanban"]);

    const obra = migasDeRuta("/obras/abc/tablero", { obra: "CRIOCORD" });
    expect(obra.map((x) => x.texto)).toEqual(["Obras", "CRIOCORD", "Tablero"]);
  });

  it("la ultima nunca lleva enlace: es donde estas", () => {
    const m = migasDeRuta("/obras/abc/cronograma/gantt", { obra: "CRIOCORD" });

    expect(m[m.length - 1]).toEqual({ texto: "Diagrama de Gantt", href: null });
    expect(m[0]!.href).toBe("/obras");
  });

  it("sin etiqueta, el id no se pinta en crudo", () => {
    // Una miga que dijera «cmsu8thog» orienta menos que una que dice «Obra».
    const m = migasDeRuta("/obras/cmsu8thog000476ecjhkl6802/meta");

    expect(m.map((x) => x.texto)).toEqual(["Obras", "Obra", "Presupuesto meta"]);
  });

  it("un tramo sin pantalla se pinta como texto, no como enlace roto", () => {
    const m = migasDeRuta("/empresa/usuarios");

    expect(m[0]).toEqual({ texto: "Empresa", href: null });
    expect(m[1]!.texto).toBe("Usuarios");
  });

  it("los prefijos sin entrada se saltan en vez de inventarse", () => {
    // `.../ordenes/:orden` no tiene pantalla propia: se salta y la cadena
    // sigue con «Imprimir».
    const m = migasDeRuta("/obras/abc/ordenes/o1/imprimir", { obra: "CRIOCORD" });

    expect(m.map((x) => x.texto)).toEqual([
      "Obras",
      "CRIOCORD",
      "Órdenes",
      "Imprimir",
    ]);
  });

  it("una ruta desconocida no revienta ni inventa", () => {
    expect(migasDeRuta("/no/existe/esto")).toEqual([]);
    expect(migasDeRuta("/")).toEqual([]);
  });
});
