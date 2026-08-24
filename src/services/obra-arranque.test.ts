import { describe, it, expect, beforeEach, vi } from "vitest";
// Estatico y no `await import(...)` dentro del test: `vi.mock` se iza igual, y
// cargar este servicio bajo demanda tarda mas de los 5 s del timeout cuando
// corre la bateria entera.
import { cambiarEstadoObra } from "@/services/obras.service";

/**
 * Arrancar una obra: que se bloquea, que se avisa y que se firma.
 *
 * Hasta hoy el servicio pasaba `tieneCronograma: true` y `tieneLineaBase:
 * true` a mano, con el comentario de que «la pantalla ya los avisa antes de
 * llegar» —y la pantalla no los avisaba—. Se podia poner en ejecucion una
 * obra sin cronograma y sin linea base sin que nada lo dijera en ningun
 * momento.
 *
 * Con Prisma doblado, sin base.
 */

interface Estado {
  estadoObra: string;
  partidas: number;
  /// Hay presupuesto meta, aunque siga en borrador.
  hayMeta: boolean;
  /// La linea base del PRESUPUESTO contractual.
  hayPresupuestoCongelado: boolean;
  hayCronograma: boolean;
  /// La linea base del CRONOGRAMA. Son dos cosas distintas.
  hayLineaBase: boolean;
  guardado: Record<string, unknown> | null;
}

const estado: Estado = {
  estadoObra: "PLANIFICACION",
  partidas: 1,
  hayMeta: true,
  hayPresupuestoCongelado: true,
  hayCronograma: true,
  hayLineaBase: true,
  guardado: null,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: async () => ({
        estado: estado.estadoObra,
        nombreObra: "LABORATORIO CRIOCORD",
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        estado.guardado = data;
        return { id: "obra-1" };
      },
    },
    wbsItem: { count: async () => estado.partidas },
    presupuestoMeta: {
      findFirst: async () => (estado.hayMeta ? { id: "m1" } : null),
    },
    baseline: {
      findFirst: async () =>
        estado.hayPresupuestoCongelado ? { id: "b1" } : null,
    },
    cronograma: {
      findFirst: async ({ where }: { where: { lineaBaseAt?: unknown } }) => {
        if (where.lineaBaseAt) return estado.hayLineaBase ? { id: "c1" } : null;
        return estado.hayCronograma ? { id: "c1" } : null;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      typeof fn === "function"
        ? fn({
            project: {
              update: async ({ data }: { data: Record<string, unknown> }) => {
                estado.guardado = data;
                return { id: "obra-1" };
              },
            },
            auditLog: { create: async () => ({}) },
          })
        : fn,
  },
}));

const sesion = {
  userId: "u1",
  companyId: "c1",
  role: "ADMIN",
  permisos: ["obra:editar", "obra:leer"],
  nombres: "A",
  apellidos: "B",
  email: "a@b.c",
} as never;

const arrancar = async (confirmar?: boolean) =>
  cambiarEstadoObra(
    sesion,
    "obra-1",
    "EN_EJECUCION",
    undefined,
    undefined,
    confirmar,
  );

beforeEach(() => {
  estado.estadoObra = "PLANIFICACION";
  estado.partidas = 1;
  estado.hayCronograma = true;
  estado.hayLineaBase = true;
  estado.guardado = null;
});

describe("arrancar una obra", () => {
  it("con todo listo arranca sin preguntar nada", async () => {
    const r = await arrancar();
    expect(r.ok).toBe(true);
    expect(estado.guardado).not.toBeNull();
  });

  it("sin partidas NO arranca, y no hay confirmacion que valga", async () => {
    // Es el unico bloqueante: sin presupuesto el control economico entero se
    // queda sin suelo, y no es algo que se pueda "aceptar".
    estado.partidas = 0;
    const r = await arrancar(true);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("partida");
    expect(estado.guardado).toBeNull();
  });

  it("sin cronograma avisa y NO arranca hasta que se confirme", async () => {
    estado.hayCronograma = false;
    const r = await arrancar();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("cronograma");
    expect(r.error).toContain("confirmarlo");
    expect(estado.guardado).toBeNull();
  });

  it("y con la confirmacion arranca igual: la decision es del usuario", async () => {
    // No se bloquea a proposito: en obra real a veces se arranca antes que el
    // papeleo, y un muro solo consigue que se trabaje fuera del sistema.
    estado.hayCronograma = false;
    const r = await arrancar(true);
    expect(r.ok).toBe(true);
    expect(estado.guardado).not.toBeNull();
  });

  it("con cronograma pero sin linea base, tambien se firma", async () => {
    estado.hayLineaBase = false;
    const r = await arrancar();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("linea base");
  });

  it("reanudar una obra paralizada no vuelve a pedir nada", async () => {
    // Esa obra ya paso por aqui; volver a exigirselo bloquearia una obra en
    // marcha por un requisito que cumplio hace meses.
    estado.estadoObra = "PARALIZADA";
    estado.hayCronograma = false;
    estado.hayLineaBase = false;
    const r = await arrancar();
    expect(r.ok).toBe(true);
  });
});
