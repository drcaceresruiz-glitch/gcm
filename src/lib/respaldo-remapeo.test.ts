import { describe, it, expect } from "vitest";

import {
  MapaDeIds,
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
