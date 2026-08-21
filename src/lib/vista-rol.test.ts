import { describe, expect, it } from "vitest";

import { vistaEfectiva, type SesionReal } from "./vista-rol";

/**
 * La regla de oro de la vista previa: los permisos y las obras de la
 * simulacion son la INTERSECCION contra los reales, nunca una sustitucion.
 * Estas pruebas existen para demostrar que ninguna combinacion de rol
 * simulado y cuenta real puede ENSANCHAR lo que la cuenta ya alcanzaba.
 */

const TODO_ADMIN = ["a", "b", "c"] as const;
const PERMISOS_DE_GERENTE = ["a", "b"] as const;
const PERMISOS_DE_ALMACENERO = ["a"] as const;

function permisosDe(rol: string): readonly string[] {
  if (rol === "ADMIN") return TODO_ADMIN;
  if (rol === "GERENTE") return PERMISOS_DE_GERENTE;
  if (rol === "ALMACENERO") return PERMISOS_DE_ALMACENERO;
  return [];
}

function veTodas(rol: string): boolean {
  return rol === "ADMIN" || rol === "GERENTE";
}

const ADMIN_REAL: SesionReal = {
  rol: "ADMIN" as never,
  permisos: TODO_ADMIN as never,
  obrasAsignadas: null,
};

describe("vistaEfectiva: sin simulacion", () => {
  it("sin rolSimulado, devuelve la sesion real tal cual", () => {
    const v = vistaEfectiva(ADMIN_REAL, null, permisosDe as never, veTodas, []);
    expect(v).toEqual({ rol: "ADMIN", permisos: TODO_ADMIN, obrasAsignadas: null });
  });

  it("rolSimulado igual al real no es una simulacion: pasa igual", () => {
    const v = vistaEfectiva(
      ADMIN_REAL,
      "ADMIN" as never,
      permisosDe as never,
      veTodas,
      [],
    );
    expect(v.permisos).toEqual(TODO_ADMIN);
  });

  it("no comparte referencia con la lista real (copia, no alias)", () => {
    const v = vistaEfectiva(ADMIN_REAL, null, permisosDe as never, veTodas, []);
    expect(v.permisos).not.toBe(ADMIN_REAL.permisos);
  });
});

describe("vistaEfectiva: la interseccion recorta de verdad", () => {
  it("ADMIN previsualizando GERENTE ve exactamente los permisos de GERENTE", () => {
    // Caso central: ADMIN tiene TODO, asi que intersectar con GERENTE da
    // justo lo que un GERENTE real tendria. Es la propiedad que hace segura
    // la vista previa: para ADMIN, "simular" y "ser de verdad" coinciden.
    const v = vistaEfectiva(
      ADMIN_REAL,
      "GERENTE" as never,
      permisosDe as never,
      veTodas,
      [],
    );
    expect(v.rol).toBe("GERENTE");
    expect(v.permisos).toEqual(PERMISOS_DE_GERENTE);
  });

  it("nunca gana un permiso que el rol simulado no tiene", () => {
    const v = vistaEfectiva(
      ADMIN_REAL,
      "ALMACENERO" as never,
      permisosDe as never,
      veTodas,
      [],
    );
    expect(v.permisos).toEqual(PERMISOS_DE_ALMACENERO);
    expect(v.permisos).not.toContain("b");
  });

  // ESTA es la prueba que demuestra que no hay escalada de privilegio ni
  // manipulando la cookie a mano: una cuenta REAL mas estrecha "simulando"
  // un rol mas amplio no gana nada, solo recupera lo suyo.
  it("una cuenta real estrecha 'simulando' un rol mas amplio no gana nada", () => {
    const almaceneroReal: SesionReal = {
      rol: "ALMACENERO" as never,
      permisos: PERMISOS_DE_ALMACENERO as never,
      obrasAsignadas: ["p1"],
    };
    const v = vistaEfectiva(
      almaceneroReal,
      "ADMIN" as never,
      permisosDe as never,
      veTodas,
      ["p1"],
    );
    // "ADMIN" tiene a,b,c; el real solo tenia "a". La interseccion es "a".
    expect(v.permisos).toEqual(["a"]);
  });
});

describe("vistaEfectiva: las obras nunca se ensanchan", () => {
  it("real ve todas (null) + simulado con lista: manda la lista simulada", () => {
    const v = vistaEfectiva(
      ADMIN_REAL,
      "ALMACENERO" as never,
      permisosDe as never,
      veTodas,
      ["p1", "p2"],
    );
    expect(v.obrasAsignadas).toEqual(["p1", "p2"]);
  });

  it("real con lista + simulado que ve todas: NO se ensancha a null", () => {
    const residenteReal: SesionReal = {
      rol: "RESIDENTE" as never,
      permisos: [] as never,
      obrasAsignadas: ["p1", "p2"],
    };
    const v = vistaEfectiva(
      residenteReal,
      "GERENTE" as never,
      permisosDe as never,
      veTodas,
      ["p1", "p2"],
    );
    expect(v.obrasAsignadas).toEqual(["p1", "p2"]);
    expect(v.obrasAsignadas).not.toBeNull();
  });

  it("real con lista + simulado con OTRA lista: interseccion real de las dos", () => {
    // El real solo alcanzaba p1 y p2; sus propias obras (lo que veria un
    // ALMACENERO real con esta cuenta) incluyen p3, que el real no tenia.
    const residenteReal: SesionReal = {
      rol: "RESIDENTE" as never,
      permisos: [] as never,
      obrasAsignadas: ["p1", "p2"],
    };
    const v = vistaEfectiva(
      residenteReal,
      "ALMACENERO" as never,
      permisosDe as never,
      veTodas,
      ["p1", "p3"],
    );
    expect(v.obrasAsignadas).toEqual(["p1"]);
  });

  it("real sin ninguna obra: la simulacion tampoco le da ninguna", () => {
    const sinObras: SesionReal = {
      rol: "RESIDENTE" as never,
      permisos: [] as never,
      obrasAsignadas: [],
    };
    const v = vistaEfectiva(
      sinObras,
      "ALMACENERO" as never,
      permisosDe as never,
      veTodas,
      ["p1"],
    );
    expect(v.obrasAsignadas).toEqual([]);
  });
});
