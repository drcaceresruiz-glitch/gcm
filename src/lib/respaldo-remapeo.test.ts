import { describe, it, expect } from "vitest";

import {
  MapaDeIds,
  ordenarPorPadres,
  remapearFila,
  reservarIds,
  type ReferenciasDeEmpresa,
} from "./respaldo-remapeo";
import { tablaDelRespaldo } from "./respaldo-esquema";

/**
 * El remapeo de una obra restaurada.
 *
 * Lo que se protege aqui es una sola cosa: que ninguna fila acabe apuntando a
 * la nada. Una clave ajena sin resolver que se convierte en `undefined` es como
 * se consigue una obra restaurada con huecos que nadie ve hasta que una
 * pantalla revienta meses despues.
 */

const SIN_EMPRESA: ReferenciasDeEmpresa = {
  usuario: () => null,
  proveedor: () => null,
};

describe("MapaDeIds", () => {
  it("da un identificador nuevo y estable para cada fila", () => {
    const mapa = new MapaDeIds();

    const a = mapa.registrar("wbs_items", "viejo-1");
    const b = mapa.registrar("wbs_items", "viejo-1");
    const c = mapa.registrar("wbs_items", "viejo-2");

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe("viejo-1");
  });

  it("no confunde el mismo identificador en dos tablas", () => {
    const mapa = new MapaDeIds();

    expect(mapa.registrar("wbs_items", "x")).not.toBe(
      mapa.registrar("baselines", "x"),
    );
  });

  /**
   * La regla que evita las filas colgando: si el respaldo apunta a algo que no
   * trae, se para todo. Devolver `undefined` seria lo comodo y es justo lo que
   * escribe una fila apuntando a la nada.
   */
  it("LANZA cuando el respaldo apunta a algo que no trae", () => {
    const mapa = new MapaDeIds();

    expect(() => mapa.resolver("wbs_items", "no-existe")).toThrowError(
      /no viene en el archivo/,
    );
  });
});

describe("remapearFila", () => {
  const wbs = tablaDelRespaldo("wbs_items")!;

  it("traduce el id y las referencias internas", () => {
    const mapa = new MapaDeIds();
    const filas = [
      { id: "p1", projectId: "o1", parentId: null, codigoPartida: "1.0" },
      { id: "p2", projectId: "o1", parentId: "p1", codigoPartida: "1.1" },
    ];

    mapa.registrar("projects", "o1");
    reservarIds(filas, "wbs_items", mapa);

    const hija = remapearFila(filas[1]!, wbs, mapa, SIN_EMPRESA).fila!;

    expect(hija["id"]).toBe(mapa.resolver("wbs_items", "p2"));
    expect(hija["parentId"]).toBe(mapa.resolver("wbs_items", "p1"));
    expect(hija["projectId"]).toBe(mapa.resolver("projects", "o1"));
  });

  /**
   * El padre puede venir DESPUES que la hija en el archivo. Por eso los
   * identificadores se reservan de golpe antes de remapear nada.
   */
  it("resuelve una autorreferencia aunque el padre venga despues", () => {
    const mapa = new MapaDeIds();
    const filas = [
      { id: "hija", projectId: "o1", parentId: "padre" },
      { id: "padre", projectId: "o1", parentId: null },
    ];

    mapa.registrar("projects", "o1");
    reservarIds(filas, "wbs_items", mapa);

    const hija = remapearFila(filas[0]!, wbs, mapa, SIN_EMPRESA).fila!;

    expect(hija["parentId"]).toBe(mapa.resolver("wbs_items", "padre"));
  });

  it("deja en nulo lo que ya era nulo", () => {
    const mapa = new MapaDeIds();
    const filas = [{ id: "p1", projectId: "o1", parentId: null }];

    mapa.registrar("projects", "o1");
    reservarIds(filas, "wbs_items", mapa);

    expect(remapearFila(filas[0]!, wbs, mapa, SIN_EMPRESA).fila!["parentId"]).toBeNull();
  });

  /**
   * `codigoPartida` y `uid` son claves NATURALES, no identificadores.
   * Remapearlas dejaria al avance sin encontrar su tarea y al mapeo sin su
   * partida, que es exactamente lo que esos campos existen para evitar.
   */
  it("no toca las claves naturales", () => {
    const mapa = new MapaDeIds();
    const filas = [{ id: "p1", projectId: "o1", parentId: null, codigoPartida: "4.1" }];

    mapa.registrar("projects", "o1");
    reservarIds(filas, "wbs_items", mapa);

    expect(remapearFila(filas[0]!, wbs, mapa, SIN_EMPRESA).fila!["codigoPartida"]).toBe("4.1");
  });

  it("para en seco si una referencia interna no viene en el archivo", () => {
    const mapa = new MapaDeIds();
    const filas = [{ id: "p2", projectId: "o1", parentId: "el-que-falta" }];

    mapa.registrar("projects", "o1");
    reservarIds(filas, "wbs_items", mapa);

    expect(() => remapearFila(filas[0]!, wbs, mapa, SIN_EMPRESA)).toThrowError(
      /no viene en el archivo/,
    );
  });
});

describe("lo que vive fuera de la obra", () => {
  /**
   * Una membresia sin usuario no es una membresia. Y recrear el usuario seria
   * peor que perderla: un `User` lleva su hash de contrasena y su rol, asi que
   * recrearlo fabrica un acceso para alguien que quiza esta dado de baja.
   */
  it("descarta la fila cuando el usuario ya no existe", () => {
    const membresias = tablaDelRespaldo("project_memberships");
    if (!membresias) return;

    const conUsuario = membresias.externas?.find((e) => e.a === "usuario");
    if (!conUsuario || conUsuario.siFalta !== "descartar") return;

    const mapa = new MapaDeIds();
    const fila = { id: "m1", projectId: "o1", [conUsuario.campo]: "u-borrado" };

    mapa.registrar("projects", "o1");
    reservarIds([fila], "project_memberships", mapa);

    const r = remapearFila(fila, membresias, mapa, SIN_EMPRESA);

    expect(r.fila).toBeNull();
    expect(r.motivo).toContain("usuario");
  });

  it("re-enlaza al usuario que si existe", () => {
    const membresias = tablaDelRespaldo("project_memberships");
    if (!membresias) return;

    const conUsuario = membresias.externas?.find((e) => e.a === "usuario");
    if (!conUsuario) return;

    const mapa = new MapaDeIds();
    const fila = { id: "m1", projectId: "o1", [conUsuario.campo]: "u-viejo" };

    mapa.registrar("projects", "o1");
    reservarIds([fila], "project_memberships", mapa);

    const r = remapearFila(fila, membresias, mapa, {
      usuario: () => "u-nuevo",
      proveedor: () => null,
    });

    expect(r.fila?.[conUsuario.campo]).toBe("u-nuevo");
  });
});

/**
 * EL ORDEN DE INSERCION DE UNA TABLA QUE SE APUNTA A SI MISMA.
 *
 * `wbs_items.parentId` es autorreferente y Restrict. Si una partida hija entra
 * antes que su capitulo, la base la rechaza con un P2003 y la carga muere a
 * mitad. Hasta el 19/08/2026 esto funcionaba por suerte: el respaldo salia en
 * el orden en que la base tenia las filas —un `findMany` sin `ORDER BY`— y
 * ademas se inserta en trozos de 500, asi que un padre en el segundo trozo y
 * su hija en el primero rompian igual.
 */
describe("ordenarPorPadres", () => {
  const WBS = tablaDelRespaldo("wbs_items")!;

  function fila(id: string, parentId: string | null) {
    return { id, parentId, codigoPartida: id };
  }

  /** Comprueba que ningun hijo aparece antes que su padre. */
  function padreAntes(filas: Record<string, unknown>[]): boolean {
    const vistos = new Set<string>();
    for (const f of filas) {
      const p = f["parentId"];
      if (typeof p === "string" && !vistos.has(p)) {
        // Solo cuenta si el padre viene en la lista: uno de fuera no se espera.
        if (filas.some((o) => o["id"] === p)) return false;
      }
      vistos.add(f["id"] as string);
    }
    return true;
  }

  it("pone el padre antes que la hija aunque lleguen al reves", () => {
    const desordenadas = [
      fila("nieta", "hija"),
      fila("hija", "raiz"),
      fila("raiz", null),
    ];

    const ordenadas = ordenarPorPadres(desordenadas, WBS);

    expect(ordenadas).toHaveLength(3);
    expect(padreAntes(ordenadas)).toBe(true);
    expect(ordenadas[0]!["id"]).toBe("raiz");
  });

  it("no pierde ni duplica ninguna fila", () => {
    const filas = [
      fila("c", "b"),
      fila("b", "a"),
      fila("a", null),
      fila("d", "a"),
      fila("e", null),
    ];

    const ordenadas = ordenarPorPadres(filas, WBS);

    expect(ordenadas.map((f) => f["id"]).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  /**
   * Un padre que NO viene en el archivo no se puede esperar. La fila pasa, y
   * el remapeo la cazara con su propio mensaje: si aqui se quedara colgada, el
   * error diria «hay un ciclo», que es mentira y manda a buscar donde no es.
   */
  it("deja pasar la fila cuyo padre no viene en el archivo", () => {
    const ordenadas = ordenarPorPadres([fila("huerfana", "de-otra-obra")], WBS);
    expect(ordenadas).toHaveLength(1);
  });

  it("una tabla sin autorreferencia se queda como estaba", () => {
    const ordenes = tablaDelRespaldo("orden_lineas")!;
    const filas = [{ id: "2" }, { id: "1" }, { id: "3" }];

    expect(ordenarPorPadres(filas, ordenes).map((f) => f["id"])).toEqual([
      "2",
      "1",
      "3",
    ]);
  });

  /**
   * Dos filas que se apuntan la una a la otra no se pueden ordenar. Se avisa
   * aqui, con el nombre de la tabla, en vez de dejar que la base lo rechace a
   * mitad de la carga sin decir que el problema era un ciclo.
   */
  it("un ciclo se denuncia, no se deja pasar", () => {
    expect(() =>
      ordenarPorPadres([fila("a", "b"), fila("b", "a")], WBS),
    ).toThrow(/circulo/i);
  });
});
