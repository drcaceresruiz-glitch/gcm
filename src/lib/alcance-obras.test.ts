import { describe, expect, it } from "vitest";
import {
  alcanzaObra,
  filtroDeObras,
  filtroDeProjectId,
  veTodasLasObras,
} from "@/lib/alcance-obras";
import { ROLES } from "@/lib/rbac";

/**
 * El alcance por obra.
 *
 * Lo que se prueba aqui no es quien ve que —eso es una decision de producto
 * que puede cambiar— sino la distincion de la que depende todo: que `null`
 * signifique TODAS y la lista vacia signifique NINGUNA. Confundirlas en
 * cualquiera de los dos sentidos es o el agujero que esto viene a cerrar, o
 * dejar a la empresa entera sin poder abrir una obra.
 */

describe("veTodasLasObras", () => {
  it("ADMIN y GERENTE ven la cartera completa", () => {
    expect(veTodasLasObras("ADMIN")).toBe(true);
    expect(veTodasLasObras("GERENTE")).toBe(true);
  });

  /**
   * Denegar por defecto, y que se note al anadir un rol: si manana entra un
   * rol nuevo en el enum, esta prueba falla y obliga a decidir su alcance en
   * vez de heredarlo sin querer. GERENTE se sumo aqui el 21 de agosto de
   * 2026 a proposito -ve el negocio entero, no una obra a la vez-, y por
   * eso esta en la lista y no es un caso que la prueba deba rechazar.
   */
  it("solo ADMIN y GERENTE la ven, hoy por hoy", () => {
    const conTodas = ROLES.filter((r) => veTodasLasObras(r));
    expect(conTodas.sort()).toEqual(["ADMIN", "GERENTE"]);
  });
});

describe("alcanzaObra", () => {
  it("sin restriccion alcanza cualquier obra", () => {
    expect(alcanzaObra({ obrasAsignadas: null }, "obra-1")).toBe(true);
  });

  it("alcanza las asignadas y solo esas", () => {
    const sujeto = { obrasAsignadas: ["obra-1", "obra-2"] };
    expect(alcanzaObra(sujeto, "obra-1")).toBe(true);
    expect(alcanzaObra(sujeto, "obra-2")).toBe(true);
    expect(alcanzaObra(sujeto, "obra-3")).toBe(false);
  });

  /**
   * El caso que de verdad importa: sin asignaciones no se alcanza NADA.
   *
   * Si la lista vacia se tratara como «sin restriccion» —que es el error
   * facil al escribirlo con un `if (!lista.length)`— el agujero seguiria
   * abierto exactamente para los usuarios recien creados.
   */
  it("sin ninguna asignacion no alcanza ninguna obra", () => {
    expect(alcanzaObra({ obrasAsignadas: [] }, "obra-1")).toBe(false);
  });
});

describe("filtroDeObras", () => {
  it("sin restriccion no anade filtro, y componerlo es inocuo", () => {
    const where = { companyId: "emp-1", ...filtroDeObras({ obrasAsignadas: null }) };
    expect(where).toEqual({ companyId: "emp-1" });
  });

  it("acota a las asignadas sin pisar el filtro de empresa", () => {
    const where = {
      companyId: "emp-1",
      ...filtroDeObras({ obrasAsignadas: ["obra-1"] }),
    };
    expect(where).toEqual({ companyId: "emp-1", id: { in: ["obra-1"] } });
  });

  it("sin asignaciones filtra por lista vacia, que no trae nada", () => {
    expect(filtroDeObras({ obrasAsignadas: [] })).toEqual({ id: { in: [] } });
  });
});

describe("filtroDeProjectId", () => {
  it("acota por projectId cuando hay restriccion", () => {
    expect(filtroDeProjectId({ obrasAsignadas: ["obra-1"] })).toEqual({
      projectId: { in: ["obra-1"] },
    });
  });

  it("no anade nada sin restriccion", () => {
    expect(filtroDeProjectId({ obrasAsignadas: null })).toEqual({});
  });
});
