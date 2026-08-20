import { describe, it, expect, beforeEach, vi } from "vitest";
import { ROLES, PERMISOS, esInnegociable, permisosDe } from "@/lib/rbac";
import type { SesionActiva } from "@/services/sesion.service";

const h = vi.hoisted(() => ({
  cfg: { permisos: [] as string[], migracion: null as string | null, excepcion: null as any },
  reg: { upsert: [] as any[], borra: [] as any[], audit: [] as any[], findMany: [] as any[] },
}));

// rbac es puro: se conserva entero y solo se controla puede().
vi.mock("@/lib/rbac", async (orig) => {
  const real = await orig<typeof import("@/lib/rbac")>();
  return { ...real, puede: (_s: any, p: any) => h.cfg.permisos.includes(p) };
});

vi.mock("@/services/empresa-migracion.service", () => ({
  motivoSiEmpresaEnMigracion: async () => h.cfg.migracion,
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    companyPermission: {
      findUnique: async () => h.cfg.excepcion,
      delete: async (a: any) => {
        h.reg.borra.push(a);
      },
      upsert: async (a: any) => {
        h.reg.upsert.push(a);
      },
    },
    auditLog: {
      create: async (a: any) => {
        h.reg.audit.push(a);
      },
    },
  };
  return {
    prisma: {
      companyPermission: {
        findMany: async (a: any) => {
          h.reg.findMany.push(a);
          return [];
        },
      },
      $transaction: async (fn: any) => fn(tx),
    },
  };
});

const { obtenerMatriz, guardarCambios } = await import(
  "@/services/permisos.service"
);

const sesion = { companyId: "c1", userId: "u1", role: "ADMIN" } as unknown as SesionActiva;
const ROL = ROLES[0]!;
const EDITABLE = PERMISOS.find((p) => !esInnegociable(p))!;
const INNEG = PERMISOS.find((p) => esInnegociable(p))!;

beforeEach(() => {
  h.cfg.permisos = ["permiso:leer", "permiso:editar"];
  h.cfg.migracion = null;
  h.cfg.excepcion = null;
  h.reg.upsert = [];
  h.reg.borra = [];
  h.reg.audit = [];
  h.reg.findMany = [];
});

describe("obtenerMatriz", () => {
  it("sin permiso:leer, lanza", async () => {
    h.cfg.permisos = [];
    await expect(obtenerMatriz(sesion)).rejects.toThrow();
  });

  it("una fila por permiso; los innegociables salen no editables", async () => {
    const m = await obtenerMatriz(sesion);
    expect(m.roles).toHaveLength(ROLES.length);
    expect(m.filas).toHaveLength(PERMISOS.length);
    const filaInneg = m.filas.find((f) => f.permiso === INNEG);
    expect(filaInneg?.editable).toBe(false);
  });
});

describe("guardarCambios: rechazos, cada uno con su motivo", () => {
  it("sin permiso:editar", async () => {
    h.cfg.permisos = [];
    const r = await guardarCambios(sesion, [
      { role: ROL, permiso: EDITABLE, concedido: true },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("No tienes permiso para editar");
  });

  it("empresa en migracion, con su mensaje", async () => {
    h.cfg.migracion = "La empresa esta en migracion.";
    const r = await guardarCambios(sesion, [
      { role: ROL, permiso: EDITABLE, concedido: true },
    ]);
    expect(r).toEqual({ ok: false, error: "La empresa esta en migracion." });
  });

  it("sin cambios", async () => {
    const r = await guardarCambios(sesion, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ningun cambio");
  });

  it("rol inexistente", async () => {
    const r = await guardarCambios(sesion, [
      { role: "ROL_FALSO" as any, permiso: EDITABLE, concedido: true },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no existe");
  });

  it("permiso inexistente", async () => {
    const r = await guardarCambios(sesion, [
      { role: ROL, permiso: "permiso:inventado", concedido: true },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no existe");
  });

  it("permiso innegociable", async () => {
    const r = await guardarCambios(sesion, [
      { role: ROL, permiso: INNEG, concedido: true },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no es configurable");
  });

  it("cuando nada cambia de valor", async () => {
    const plantilla = permisosDe(ROL).includes(EDITABLE);
    const r = await guardarCambios(sesion, [
      { role: ROL, permiso: EDITABLE, concedido: plantilla },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Ningun permiso cambio");
  });
});

describe("guardarCambios: caminos buenos", () => {
  it("apartar de la plantilla: upsert mas auditoria", async () => {
    const plantilla = permisosDe(ROL).includes(EDITABLE);
    const r = await guardarCambios(sesion, [
      { role: ROL, permiso: EDITABLE, concedido: !plantilla },
    ]);
    expect(r).toEqual({ ok: true, aplicados: 1 });
    expect(h.reg.upsert).toHaveLength(1);
    expect(h.reg.audit).toHaveLength(1);
  });

  it("volver a la plantilla retira la excepcion: delete, no upsert", async () => {
    const plantilla = permisosDe(ROL).includes(EDITABLE);
    h.cfg.excepcion = { concedido: !plantilla };
    const r = await guardarCambios(sesion, [
      { role: ROL, permiso: EDITABLE, concedido: plantilla },
    ]);
    expect(r).toEqual({ ok: true, aplicados: 1 });
    expect(h.reg.borra).toHaveLength(1);
    expect(h.reg.upsert).toHaveLength(0);
  });
});
