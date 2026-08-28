import { describe, expect, it } from "vitest";

import {
  cuantasCuelgan,
  lineasQuePierdenImporte,
  mover,
  quitar,
  renumerar,
  type LineaDelArbol,
} from "./arbol-meta";

/**
 * Mover lineas de la meta y renumerarlas.
 *
 * El caso que lo motivo es real: en un presupuesto de otra oficina,
 * `7.01.00 PRIMER PISO` agrupaba en la maqueta a `7.02.00 REDES DE DESAGUE`,
 * pero por numeracion eran hermanos. La pantalla dibujaba el arbol de los
 * numeros, no el de la obra.
 */

function arbol(...filas: [string, number][]): LineaDelArbol[] {
  return filas.map(([id, nivel]) => ({
    id,
    nivel,
    tipo: "PARTIDA" as const,
    codigo: null,
  }));
}

const codigos = (l: readonly LineaDelArbol[]) => l.map((x) => x.codigo);
const ids = (l: readonly LineaDelArbol[]) => l.map((x) => x.id);
const niveles = (l: readonly LineaDelArbol[]) => l.map((x) => x.nivel);

describe("que cuelga de que", () => {
  it("cuenta las de dentro y para al volver a la misma altura", () => {
    const a = arbol(["cap", 0], ["p1", 1], ["p2", 1], ["otro", 0]);

    expect(cuantasCuelgan(a, 0)).toBe(2);
    expect(cuantasCuelgan(a, 1)).toBe(0);
    expect(cuantasCuelgan(a, 3)).toBe(0);
  });

  it("cuenta tambien a los nietos", () => {
    const a = arbol(["cap", 0], ["sub", 1], ["hoja", 2], ["otro", 0]);

    expect(cuantasCuelgan(a, 0)).toBe(2);
  });
});

describe("sangrar", () => {
  it("mete la linea dentro de la de arriba", () => {
    const a = arbol(["primer-piso", 0], ["redes", 0], ["corte", 1]);

    const r = mover(a, "redes", "sangrar");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // La rama entera baja un escalon: la partida sigue colgando de su bloque.
    expect(niveles(r.lineas)).toEqual([0, 1, 2]);
  });

  it("la primera de un bloque no se puede sangrar, y lo dice", () => {
    const a = arbol(["cap", 0], ["primera", 1], ["segunda", 1]);

    const r = mover(a, "primera", "sangrar");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("No hay ninguna línea encima");
  });
});

describe("quitar sangria", () => {
  it("saca la linea un nivel, con lo que cuelgue de ella", () => {
    const a = arbol(["cap", 0], ["sub", 1], ["hoja", 2]);

    const r = mover(a, "sub", "quitar-sangria");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(niveles(r.lineas)).toEqual([0, 0, 1]);
  });

  it("en el nivel mas alto no hay adonde salir", () => {
    const r = mover(arbol(["cap", 0]), "cap", "quitar-sangria");

    expect(r.ok).toBe(false);
  });
});

describe("subir y bajar", () => {
  it("subir se lleva la rama entera por delante de su hermana", () => {
    const a = arbol(["a", 0], ["a1", 1], ["b", 0], ["b1", 1]);

    const r = mover(a, "b", "subir");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ids(r.lineas)).toEqual(["b", "b1", "a", "a1"]);
  });

  it("bajar salta la rama entera de la hermana siguiente", () => {
    const a = arbol(["a", 0], ["b", 0], ["b1", 1], ["b2", 1]);

    const r = mover(a, "a", "bajar");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // No se mete entre b y sus hijas: eso la haria hija de b sin pedirlo.
    expect(ids(r.lineas)).toEqual(["b", "b1", "b2", "a"]);
  });

  it("una hija solo se mueve entre sus hermanas, no se sale del capitulo", () => {
    const a = arbol(["cap", 0], ["h1", 1], ["h2", 1], ["otro", 0]);

    const r = mover(a, "h2", "bajar");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("última de su bloque");
  });

  it("la primera de todas no sube", () => {
    expect(mover(arbol(["a", 0], ["b", 0]), "a", "subir").ok).toBe(false);
  });
});

describe("renumerar", () => {
  it("reparte los codigos segun la forma del arbol", () => {
    const a = arbol(
      ["c1", 0],
      ["p1", 1],
      ["p2", 1],
      ["sub", 2],
      ["c2", 0],
    );

    expect(codigos(renumerar(a))).toEqual([
      "1",
      "1.01",
      "1.02",
      "1.02.01",
      "2",
    ]);
  });

  it("dos cifras a partir del segundo nivel, para que ordenen bien", () => {
    const a = arbol(["c", 0], ...Array.from({ length: 10 }, (_, i) => [`p${i}`, 1] as [string, number]));

    const r = renumerar(a);

    expect(r[1]?.codigo).toBe("1.01");
    expect(r[10]?.codigo).toBe("1.10");
    // Con una sola cifra, "1.10" se colaria entre "1.1" y "1.2" al ordenar
    // como texto, que es como se ordena media aplicacion.
    expect(r[1]!.codigo! < r[10]!.codigo!).toBe(true);
  });

  it("al volver a subir, lo de dentro empieza otra vez por uno", () => {
    const a = arbol(["c1", 0], ["p1", 1], ["c2", 0], ["p2", 1]);

    expect(codigos(renumerar(a))).toEqual(["1", "1.01", "2", "2.01"]);
  });

  it("es capitulo lo que tiene hijas, y solo eso", () => {
    const a = arbol(["c", 0], ["p", 1], ["suelta", 0]);

    const r = renumerar(a);

    expect(r[0]?.tipo).toBe("CAPITULO");
    expect(r[1]?.tipo).toBe("PARTIDA");
    // Una linea de nivel 0 SIN hijas es una partida suelta, no un capitulo
    // vacio: un capitulo sin nada dentro no suma nada y no es un titulo de
    // nada.
    expect(r[2]?.tipo).toBe("PARTIDA");
  });

  it("el caso real: PRIMER PISO pasa a agrupar de verdad", () => {
    // Como llega el presupuesto: hermanos por numeracion.
    const a = arbol(
      ["capitulo-7", 0],
      ["primer-piso", 1],
      ["redes-desague", 1],
      ["corte", 2],
      ["resane", 2],
    );

    // Se sangra el bloque de redes para meterlo dentro de PRIMER PISO.
    const movido = mover(a, "redes-desague", "sangrar");
    expect(movido.ok).toBe(true);
    if (!movido.ok) return;

    const r = renumerar(movido.lineas);

    expect(codigos(r)).toEqual(["1", "1.01", "1.01.01", "1.01.01.01", "1.01.01.02"]);
    expect(r.find((l) => l.id === "primer-piso")?.tipo).toBe("CAPITULO");
    expect(r.find((l) => l.id === "corte")?.tipo).toBe("PARTIDA");
  });
});

describe("el dinero que se pierde al convertir una partida en capitulo", () => {
  it("lo dice antes de guardar", () => {
    const antes = arbol(["paquete", 0], ["otra", 0]);
    const movida = mover(antes, "otra", "sangrar");
    expect(movida.ok).toBe(true);
    if (!movida.ok) return;
    const despues = renumerar(movida.lineas);

    const pierden = lineasQuePierdenImporte(
      antes,
      despues,
      new Set(["paquete"]),
    );

    expect(pierden).toEqual(["paquete"]);
  });

  it("no avisa de lo que no llevaba importe", () => {
    const antes = arbol(["titulo", 0], ["otra", 0]);
    const movida = mover(antes, "otra", "sangrar");
    if (!movida.ok) return;

    expect(
      lineasQuePierdenImporte(antes, renumerar(movida.lineas), new Set()),
    ).toEqual([]);
  });
});

describe("quitar una linea", () => {
  it("saca un escalon lo que colgaba de ella, sin borrarlo", () => {
    const a = arbol(["cap", 0], ["sub", 1], ["hoja", 2], ["otra", 1], ["fuera", 0]);

    const r = quitar(a, "sub");

    expect(ids(r)).toEqual(["cap", "hoja", "otra", "fuera"]);
    // `hoja` era nieta y pasa a ser hija; `otra` no colgaba de `sub`.
    expect(niveles(r)).toEqual([0, 1, 1, 0]);
  });

  it("borrar un capitulo raiz deja sus partidas como raices", () => {
    const a = arbol(["cap", 0], ["p1", 1], ["p2", 1]);

    const r = renumerar(quitar(a, "cap"));

    expect(codigos(r)).toEqual(["1", "2"]);
    expect(r.every((l) => l.tipo === "PARTIDA")).toBe(true);
  });

  it("una hoja se va sola y no toca a nadie", () => {
    const a = arbol(["cap", 0], ["p1", 1], ["p2", 1]);

    expect(niveles(quitar(a, "p1"))).toEqual([0, 1]);
  });

  it("lo de mas abajo, que no era suyo, se queda donde estaba", () => {
    const a = arbol(["c1", 0], ["p", 1], ["c2", 0], ["q", 1]);

    const r = quitar(a, "c1");

    expect(ids(r)).toEqual(["p", "c2", "q"]);
    expect(niveles(r)).toEqual([0, 0, 1]);
  });
});
