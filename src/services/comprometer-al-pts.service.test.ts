import { describe, it, expect, vi, beforeEach } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Llevar tareas del Lookahead al Plan Semanal: la eleccion del DESTINO.
 *
 * `comprometerAlPts` no tenia ni una prueba, y justo ahi vivia un callejon sin
 * salida: el viernes con la semana cerrada, el desplegable no ofrecia esa
 * semana (solo salian las abiertas) y «crear» apuntaba al corte de HOY, que
 * era el que se acababa de cerrar. El servidor contestaba «esta cerrada, elige
 * otra» sin que hubiera otra.
 *
 * Lo que se sostiene aqui son las cuatro reglas del destino:
 *
 *  - se puede crear la semana de ESTA semana o la de la SIGUIENTE;
 *  - una semana cerrada se puede elegir, pero NO se reabre sola;
 *  - con `reabrir` se reabre, y eso deja su propio apunte;
 *  - una semana que ya no existe se distingue de una cerrada.
 */

const HOY = new Date("2026-08-07T00:00:00Z"); // viernes; corte por defecto = 5

interface Plan {
  id: string;
  numero: number;
  estado: "ABIERTO" | "CERRADO";
  fechaCorte: Date;
}

const estado: {
  planes: Plan[];
  /// El plan creado en esta llamada, si hubo.
  creado: { fechaCorte: Date; numero: number } | null;
  /// Los `update` sobre planes: es donde se ve la reapertura.
  actualizados: { id: string; data: Record<string, unknown> }[];
  compromisos: Record<string, unknown>[];
  apuntes: Record<string, unknown>[];
} = {
  planes: [],
  creado: null,
  actualizados: [],
  compromisos: [],
  apuntes: [],
};

vi.mock("@/utils/fechas", async (real) => ({
  ...(await real<Record<string, unknown>>()),
  hoy: () => HOY,
}));

vi.mock("@/lib/prisma", () => {
  const planSemanal = {
    findFirst: (args: { where: Record<string, unknown> }) => {
      const w = args.where;
      if (typeof w["id"] === "string") {
        return Promise.resolve(
          estado.planes.find((p) => p.id === w["id"]) ?? null,
        );
      }
      // Por fecha de corte: el camino de «crear».
      const corte = w["fechaCorte"] as Date | undefined;
      return Promise.resolve(
        estado.planes.find(
          (p) => corte && p.fechaCorte.getTime() === corte.getTime(),
        ) ?? null,
      );
    },
    findMany: () => Promise.resolve(estado.planes),
    aggregate: () =>
      Promise.resolve({
        _max: { numero: Math.max(0, ...estado.planes.map((p) => p.numero)) },
      }),
    create: (args: { data: { fechaCorte: Date; numero: number } }) => {
      estado.creado = args.data;
      return Promise.resolve({ id: "plan-nuevo" });
    },
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
      estado.actualizados.push({ id: args.where.id, data: args.data });
      return Promise.resolve({});
    },
  };

  const base = {
    planSemanal,
    project: {
      findFirst: () => Promise.resolve({ id: "obra-1", diaCorteSemanal: 5 }),
    },
    cronograma: {
      findFirst: () =>
        Promise.resolve({
          tareas: [
            { uid: 10, codigo: "01.01", nombre: "Vaciado", esResumen: false },
          ],
        }),
    },
    lookaheadTask: {
      findMany: () =>
        Promise.resolve([
          { uid: 10, id: "lk-1", estado: "LISTO", analizadaAt: HOY },
        ]),
    },
    compromisoSemanal: {
      findMany: () => Promise.resolve([]),
      createMany: (args: { data: Record<string, unknown>[] }) => {
        estado.compromisos.push(...args.data);
        return Promise.resolve({ count: args.data.length });
      },
    },
    proveedorPartida: { findMany: () => Promise.resolve([]) },
    wbsItem: { findMany: () => Promise.resolve([]) },
    mapeoTareaPartida: { findMany: () => Promise.resolve([]) },
    auditLog: {
      create: (args: { data: Record<string, unknown> }) => {
        estado.apuntes.push(args.data);
        return Promise.resolve({});
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(base),
  };

  return { prisma: base };
});

vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: () => Promise.resolve(null),
}));

const { comprometerAlPts } = await import("@/services/plan-semanal.service");

const SESION = {
  userId: "u-1",
  companyId: "emp-1",
  role: "ADMIN",
  permisos: ["plan_semanal:gestionar", "plan_semanal:leer"],
  nombres: "Ana",
  apellidos: "Quispe",
} as unknown as SesionActiva;

const UIDS = [10];

function plan(p: Partial<Plan> & { id: string }): Plan {
  return {
    numero: 1,
    estado: "ABIERTO",
    fechaCorte: new Date("2026-08-07T00:00:00Z"),
    ...p,
  };
}

beforeEach(() => {
  estado.planes = [];
  estado.creado = null;
  estado.actualizados = [];
  estado.compromisos = [];
  estado.apuntes = [];
});

describe("cual de las dos semanas se crea", () => {
  it("por defecto, la que cierra en el proximo corte", async () => {
    const r = await comprometerAlPts(SESION, "obra-1", {
      planId: null,
      uids: UIDS,
      confirmado: true,
    });

    expect(r.ok).toBe(true);
    expect(estado.creado?.fechaCorte).toEqual(new Date("2026-08-07T00:00:00Z"));
  });

  /**
   * ESTE es el caso que no tenia salida. Hoy es viernes y el corte de hoy ya
   * esta cerrado: sin esta opcion, la unica creable era esa misma fecha.
   */
  it("y con `siguiente`, la de dentro de siete dias", async () => {
    estado.planes = [
      plan({ id: "p-cerrada", numero: 1, estado: "CERRADO" }),
    ];

    const r = await comprometerAlPts(SESION, "obra-1", {
      planId: null,
      crearEn: "siguiente",
      uids: UIDS,
      confirmado: true,
    });

    expect(r.ok).toBe(true);
    expect(estado.creado?.fechaCorte).toEqual(new Date("2026-08-14T00:00:00Z"));
    // Y la cerrada NI SE TOCA: crear otra no reabre nada.
    expect(estado.actualizados).toEqual([]);
  });
});

describe("una semana cerrada como destino", () => {
  it("no se reabre sola: hay que pedirlo", async () => {
    estado.planes = [plan({ id: "p-1", numero: 3, estado: "CERRADO" })];

    const r = await comprometerAlPts(SESION, "obra-1", {
      planId: "p-1",
      uids: UIDS,
      confirmado: true,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Semana 3");
    expect(estado.actualizados).toEqual([]);
    expect(estado.compromisos).toEqual([]);
  });

  it("con `reabrir` se abre, se compromete, y queda su apunte", async () => {
    estado.planes = [plan({ id: "p-1", numero: 3, estado: "CERRADO" })];

    const r = await comprometerAlPts(SESION, "obra-1", {
      planId: "p-1",
      reabrir: true,
      uids: UIDS,
      confirmado: true,
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.numero).toBe(3);

    expect(estado.actualizados).toHaveLength(1);
    expect(estado.actualizados[0]).toMatchObject({
      id: "p-1",
      data: { estado: "ABIERTO", cerradoPor: null, cerradoAt: null },
    });
    expect(estado.compromisos).toHaveLength(1);

    /**
     * El apunte de REABRIR va aparte del de comprometer. Reabrir tiene
     * consecuencias que comprometer no tiene —al volver a cerrar la semana se
     * reescriben sus avances— y disuelto dentro del otro no se podria buscar.
     */
    const reabrir = estado.apuntes.filter(
      (a) => (a["despues"] as { evento?: string } | null)?.evento === "reabrir",
    );
    expect(reabrir).toHaveLength(1);
    expect(reabrir[0]).toMatchObject({ entidad: "PlanSemanal", entidadId: "p-1" });
  });

  it("y sobre una ABIERTA, pedir reabrir no cambia nada", async () => {
    estado.planes = [plan({ id: "p-1", numero: 2, estado: "ABIERTO" })];

    const r = await comprometerAlPts(SESION, "obra-1", {
      planId: "p-1",
      reabrir: true,
      uids: UIDS,
      confirmado: true,
    });

    expect(r.ok).toBe(true);
    expect(estado.actualizados).toEqual([]);
  });
});

/**
 * Antes las dos cosas daban el mismo mensaje —«ya no esta abierta»— porque el
 * destino se buscaba en la lista de abiertas. Son problemas distintos: una se
 * arregla reabriendo y la otra eligiendo otra.
 */
describe("cerrada y desaparecida no son lo mismo", () => {
  it("una que ya no existe lo dice asi", async () => {
    const r = await comprometerAlPts(SESION, "obra-1", {
      planId: "p-fantasma",
      uids: UIDS,
      confirmado: true,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ya no existe");
  });
});
