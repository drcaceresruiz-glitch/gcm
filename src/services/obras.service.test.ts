import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SesionActiva } from "@/services/sesion.service";
import type { Permiso } from "@/lib/rbac";

/**
 * El aislamiento entre empresas, que es la frontera que sostiene el producto.
 *
 * El README declara que `src/services/` es «donde se verifican permisos y se
 * filtra por empresa», y la regla 4 dice que ese filtro «es lo que impide que
 * un cliente vea obras de otro». No habia ninguna prueba que lo defendiera:
 * no porque fallara, sino porque nada avisaria el dia que fallara.
 *
 * Aqui NO hay base de datos. Se sustituye Prisma por un doble que apunta con
 * que argumentos se le llama, y se comprueba la propiedad que importa:
 *
 *   toda consulta lleva el `companyId` DE LA SESION, nunca uno de la peticion.
 *
 * Es una prueba de contrato, no de integracion: no dice que la base devuelva
 * lo correcto —eso lo garantiza el motor—, dice que nunca se le pide de mas.
 */

interface Llamada {
  modelo: string;
  metodo: string;
  args: { where?: Record<string, unknown> } | undefined;
}

const llamadas: Llamada[] = [];

vi.mock("@/lib/prisma", () => {
  const metodoFalso = (modelo: string, metodo: string) => (args?: unknown) => {
    llamadas.push({ modelo, metodo, args: args as Llamada["args"] });
    // Vale para `count` (0) y para `findMany` ([]): ninguno de los dos
    // rompe a quien lo llama, que es todo lo que este doble necesita.
    return Promise.resolve(metodo === "count" ? 0 : []);
  };

  const prisma = new Proxy(
    {},
    {
      get: (_objetivo, modelo: string) =>
        new Proxy(
          {},
          { get: (_o, metodo: string) => metodoFalso(modelo, metodo) },
        ),
    },
  );

  return { prisma };
});

const { listarObras, SinPermisoError } = await import(
  "@/services/obras.service"
);

function sesion(companyId: string, permisos: Permiso[]): SesionActiva {
  return {
    sesionId: "s1",
    userId: "u1",
    companyId,
    role: "RESIDENTE",
    permisos,
    nombres: "Ana",
    apellidos: "Perez",
    email: "ana@ejemplo.pe",
    mustChangePassword: false,
    esOperador: false,
  };
}

/** Todos los `where` que se le pidieron a un modelo. */
const wheres = (modelo: string) =>
  llamadas.filter((l) => l.modelo === modelo).map((l) => l.args?.where ?? {});

describe("aislamiento entre empresas", () => {
  beforeEach(() => {
    llamadas.length = 0;
  });

  it("sin permiso no llega a consultar nada", async () => {
    await expect(listarObras(sesion("A", []))).rejects.toBeInstanceOf(
      SinPermisoError,
    );
    // Lo importante no es solo que falle: es que falle ANTES de tocar la base.
    expect(llamadas).toHaveLength(0);
  });

  it("toda consulta lleva el companyId de la sesion", async () => {
    await listarObras(sesion("EMPRESA-A", ["obra:leer"]));

    const consultados = wheres("project");
    expect(consultados.length).toBeGreaterThan(0);
    for (const w of consultados) {
      expect(w.companyId).toBe("EMPRESA-A");
    }
  });

  it("dos empresas distintas no comparten filtro", async () => {
    await listarObras(sesion("EMPRESA-A", ["obra:leer"]));
    const deA = wheres("project");
    llamadas.length = 0;

    await listarObras(sesion("EMPRESA-B", ["obra:leer"]));
    const deB = wheres("project");

    expect(deA.every((w) => w.companyId === "EMPRESA-A")).toBe(true);
    expect(deB.every((w) => w.companyId === "EMPRESA-B")).toBe(true);
  });

  it("un filtro de la peticion no puede cambiar de empresa", async () => {
    // El texto libre entra sin sanear a proposito: lo que se comprueba es que
    // por muy raro que venga, el companyId sigue saliendo de la sesion.
    await listarObras(sesion("EMPRESA-A", ["obra:leer"]), {
      q: "'; companyId: 'EMPRESA-B",
    });

    for (const w of wheres("project")) {
      expect(w.companyId).toBe("EMPRESA-A");
    }
  });
});
