import { describe, it, expect, vi, beforeEach } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Crear una semana del Plan Semanal desde `/plan-semanal`.
 *
 * Es la OTRA via de crear semanas —la del Lookahead solo ofrece dos cortes
 * fijos— y la unica donde la fecha se teclea libre. De ahi sus dos reglas
 * propias:
 *
 *  - **No dos semanas con el mismo corte.** El indice unico lo impediria
 *    igual, pero con un error de base en vez de una frase.
 *  - **El aviso de numeracion a contramano.** El numero es `max+1` y no mira
 *    la fecha, asi que una semana con corte anterior a otra ya existente queda
 *    numerada al reves. Se avisa ANTES de crearla, que es cuando todavia se
 *    puede cambiar la fecha, y **se avisa: no se impide**.
 */

interface Semana {
  numero: number;
  fechaCorte: Date;
}

const estado: {
  obra: { id: string } | null;
  cerrada: string | null;
  semanas: Semana[];
  /// Si ya hay una con el corte pedido.
  choca: boolean;
  creado: Record<string, unknown> | null;
  apuntes: Record<string, unknown>[];
} = {
  obra: { id: "obra-1" },
  cerrada: null,
  semanas: [],
  choca: false,
  creado: null,
  apuntes: [],
};

vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: () => Promise.resolve(estado.cerrada),
}));

vi.mock("@/lib/prisma", () => {
  const auditLog = {
    create: (args: { data: Record<string, unknown> }) => {
      estado.apuntes.push(args.data);
      return Promise.resolve({});
    },
  };
  const tx = {
    planSemanal: {
      aggregate: () =>
        Promise.resolve({
          _max: { numero: Math.max(0, ...estado.semanas.map((s) => s.numero)) },
        }),
      create: (args: { data: Record<string, unknown> }) => {
        estado.creado = args.data;
        return Promise.resolve({ id: "plan-nuevo" });
      },
    },
    auditLog,
  };

  return {
    prisma: {
      project: { findFirst: () => Promise.resolve(estado.obra) },
      planSemanal: {
        findFirst: () => Promise.resolve(estado.choca ? { id: "ya" } : null),
        findMany: () => Promise.resolve(estado.semanas),
      },
      auditLog,
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    },
  };
});

const { crearPlanSemanal } = await import("@/services/plan-semanal.service");

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
    nombres: "Ana",
    apellidos: "Quispe",
  } as unknown as SesionActiva;
}

const GESTOR = sesion(["plan_semanal:gestionar"]);
const MIRON = sesion(["plan_semanal:leer"]);

beforeEach(() => {
  estado.obra = { id: "obra-1" };
  estado.cerrada = null;
  estado.semanas = [];
  estado.choca = false;
  estado.creado = null;
  estado.apuntes = [];
});

describe("las puertas", () => {
  it("quien solo mira no crea semanas", async () => {
    const r = await crearPlanSemanal(MIRON, "obra-1", {
      fechaCorte: "2026-08-21",
    });

    expect(r.ok).toBe(false);
    expect("error" in r && r.error).toContain("permiso");
    expect(estado.creado).toBeNull();
  });

  it("con la obra cerrada tampoco", async () => {
    estado.cerrada = "La obra esta cerrada.";
    const r = await crearPlanSemanal(GESTOR, "obra-1", {
      fechaCorte: "2026-08-21",
    });

    expect(r).toEqual({ ok: false, error: "La obra esta cerrada." });
    expect(estado.creado).toBeNull();
  });

  it("una fecha con otra forma no pasa", async () => {
    const r = await crearPlanSemanal(GESTOR, "obra-1", {
      fechaCorte: "21/08/2026",
    });

    expect(r.ok).toBe(false);
    // `"error" in r` y no `!r.ok`: el rechazo tiene DOS formas —un error y un
    // aviso a confirmar— y solo una lleva `error`. Es lo que `tsc` obliga a
    // distinguir, y esta bien que obligue: son dos respuestas distintas.
    expect("error" in r && r.error).toContain("fecha");
    expect(estado.creado).toBeNull();
  });

  it("una obra de otra empresa no se encuentra", async () => {
    estado.obra = null;
    const r = await crearPlanSemanal(GESTOR, "ajena", {
      fechaCorte: "2026-08-21",
    });

    expect(r).toEqual({ ok: false, error: "Obra no encontrada." });
  });

  /// El indice unico lo impediria igual, pero con un error de base. Aqui se
  /// dice con una frase, que es lo que el formulario puede ensenar.
  it("no se repite el corte de una semana que ya existe", async () => {
    estado.choca = true;
    const r = await crearPlanSemanal(GESTOR, "obra-1", {
      fechaCorte: "2026-08-21",
    });

    expect(r).toEqual({ ok: false, error: "Ya hay un plan para esa semana." });
    expect(estado.creado).toBeNull();
  });
});

describe("el aviso de numeracion a contramano", () => {
  /**
   * El caso real de la primera obra: el numero es `max+1` y no mira la fecha,
   * asi que crear una semana con corte ANTERIOR a otra ya existente la deja
   * numerada al reves.
   */
  it("avisa, y no crea, cuando la fecha deja el correlativo cruzado", async () => {
    estado.semanas = [
      { numero: 1, fechaCorte: new Date("2026-08-07T00:00:00Z") },
      { numero: 2, fechaCorte: new Date("2026-08-22T00:00:00Z") },
    ];

    const r = await crearPlanSemanal(GESTOR, "obra-1", {
      fechaCorte: "2026-08-14",
    });

    expect(r.ok).toBe(false);
    expect("requiereConfirmacion" in r && r.requiereConfirmacion).toBe(true);
    expect("aviso" in r && r.aviso).toBeTruthy();
    expect(estado.creado).toBeNull();
  });

  /// Se AVISA, no se impide: la fecha puede ser la correcta y el correlativo
  /// una molestia menor. Sin esta segunda mitad, un servicio que rechazara
  /// siempre quedaria en verde.
  it("y con `confirmado` la crea igual", async () => {
    estado.semanas = [
      { numero: 1, fechaCorte: new Date("2026-08-07T00:00:00Z") },
      { numero: 2, fechaCorte: new Date("2026-08-22T00:00:00Z") },
    ];

    const r = await crearPlanSemanal(GESTOR, "obra-1", {
      fechaCorte: "2026-08-14",
      confirmado: true,
    });

    expect(r.ok).toBe(true);
    expect(estado.creado).toMatchObject({ numero: 3 });
  });
});

describe("el camino bueno", () => {
  it("crea la semana con el siguiente numero y deja constancia", async () => {
    estado.semanas = [{ numero: 4, fechaCorte: new Date("2026-08-07T00:00:00Z") }];

    const r = await crearPlanSemanal(GESTOR, "obra-1", {
      fechaCorte: "2026-08-28",
    });

    expect(r).toEqual({ ok: true, id: "plan-nuevo" });
    expect(estado.creado).toMatchObject({
      projectId: "obra-1",
      numero: 5,
      creadoPor: "Ana Quispe",
    });
    // La fecha se ancla a medianoche UTC, que es lo que espera un `@db.Date`.
    expect((estado.creado?.["fechaCorte"] as Date).toISOString()).toBe(
      "2026-08-28T00:00:00.000Z",
    );
    expect(estado.apuntes[0]).toMatchObject({
      entidad: "PlanSemanal",
      accion: "CREATE",
    });
  });

  it("y la primera de la obra es la numero 1", async () => {
    const r = await crearPlanSemanal(GESTOR, "obra-1", {
      fechaCorte: "2026-08-21",
    });

    expect(r.ok).toBe(true);
    expect(estado.creado).toMatchObject({ numero: 1 });
  });
});
