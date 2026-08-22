import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `totalDeEmpresa`: el `estado` que acota la suma, ahora acepta uno o varios.
 *
 * Nace del 22 de agosto de 2026, al unificar "obra viva" entre
 * `gerencia.service.ts`, `avisos-reloj.ts` y el panel: el panel dejo de mirar
 * solo `EN_EJECUCION` para las cifras de dinero y paso a mirar
 * `ESTADOS_OBRA_CON_EXPOSICION` (en ejecucion + paralizada), que es un
 * arreglo. Lo que se prueba aqui es el `where` que se arma, no el agregado
 * de partidas —eso ya lo prueba `jerarquia-partidas.test.ts`—.
 */

const estado: {
  obras: { id: string }[];
  wbsItems: { projectId: string; codigoPartida: string; tipo: string; parcial: string | null }[];
  ultimoWhere: Record<string, unknown> | null;
} = {
  obras: [],
  wbsItems: [],
  ultimoWhere: null,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findMany: (args: { where: Record<string, unknown> }) => {
        estado.ultimoWhere = args.where;
        return Promise.resolve(estado.obras);
      },
    },
    wbsItem: {
      findMany: () => Promise.resolve(estado.wbsItems),
    },
  },
}));

const { totalDeEmpresa } = await import("@/services/presupuesto-obra");

beforeEach(() => {
  estado.obras = [{ id: "obra-1" }];
  estado.wbsItems = [];
  estado.ultimoWhere = null;
});

const SUJETO = { companyId: "empresa-1", obrasAsignadas: null };

describe("totalDeEmpresa: el filtro de estado", () => {
  it("sin estado, no filtra por estado", async () => {
    await totalDeEmpresa(SUJETO);
    expect(estado.ultimoWhere).not.toHaveProperty("estado");
  });

  it("con un solo estado, filtra por ese estado exacto", async () => {
    await totalDeEmpresa(SUJETO, "EN_EJECUCION");
    expect(estado.ultimoWhere).toMatchObject({
      estado: { in: ["EN_EJECUCION"] },
    });
  });

  it("con varios estados, filtra por el conjunto", async () => {
    // El caso nuevo: ESTADOS_OBRA_CON_EXPOSICION es EN_EJECUCION + PARALIZADA.
    await totalDeEmpresa(SUJETO, ["EN_EJECUCION", "PARALIZADA"]);
    expect(estado.ultimoWhere).toMatchObject({
      estado: { in: ["EN_EJECUCION", "PARALIZADA"] },
    });
  });

  it("suma el costo directo de todas las obras encontradas", async () => {
    estado.obras = [{ id: "obra-1" }, { id: "obra-2" }];
    estado.wbsItems = [
      { projectId: "obra-1", codigoPartida: "01", tipo: "PARTIDA", parcial: "1000.00" },
      { projectId: "obra-2", codigoPartida: "01", tipo: "PARTIDA", parcial: "500.00" },
    ];

    const total = await totalDeEmpresa(SUJETO, ["EN_EJECUCION", "PARALIZADA"]);
    expect(total).toBe("1500.00");
  });
});
