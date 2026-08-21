/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  cfg: { usuarios: [] as any[], tokenFila: null as any, claveOk: true },
  reg: {
    create: [] as any[],
    deleteMany: [] as any[],
    updateMany: [] as any[],
    update: [] as any[],
    audit: [] as any[],
    correos: [] as any[],
    cerrarTodas: [] as any[],
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: async () => h.cfg.usuarios,
      update: async (a: any) => {
        h.reg.update.push(a);
      },
    },
    passwordResetToken: {
      deleteMany: async (a: any) => {
        h.reg.deleteMany.push(a);
        return { count: 0 };
      },
      create: async (a: any) => {
        h.reg.create.push(a);
      },
      findUnique: async () => h.cfg.tokenFila,
      updateMany: async (a: any) => {
        h.reg.updateMany.push(a);
      },
    },
    auditLog: {
      create: async (a: any) => {
        h.reg.audit.push(a);
      },
    },
    $transaction: async (arg: any) =>
      Array.isArray(arg) ? Promise.all(arg) : arg({}),
  },
}));

vi.mock("@/lib/claves", () => ({
  validarClaveNueva: () =>
    h.cfg.claveOk ? { ok: true } : { ok: false, error: "Clave debil." },
}));

vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://gcm.test" } }));

vi.mock("@/services/sesion.service", () => ({
  cerrarTodasLasSesiones: async (id: string) => {
    h.reg.cerrarTodas.push(id);
  },
}));

vi.mock("@/services/mailer.service", () => ({
  enviarCorreo: async (a: any) => {
    h.reg.correos.push(a);
  },
  correoRecuperacion: () => ({ asunto: "Recupera tu clave", cuerpo: "..." }),
}));

const {
  solicitarRecuperacion,
  tokenRecuperacionValido,
  restablecerConToken,
} = await import("@/services/recuperacion.service");

const MIN = 60 * 1000;

function usuarioActivo(id: string) {
  return {
    id,
    nombres: "Ana",
    email: "ana@obra.pe",
    estado: "ACTIVO",
    company: { razonSocial: "ACME" },
  };
}

beforeEach(() => {
  h.cfg.usuarios = [];
  h.cfg.tokenFila = null;
  h.cfg.claveOk = true;
  h.reg.create = [];
  h.reg.deleteMany = [];
  h.reg.updateMany = [];
  h.reg.update = [];
  h.reg.audit = [];
  h.reg.correos = [];
  h.reg.cerrarTodas = [];
});

describe("solicitarRecuperacion: no revela quien tiene cuenta", () => {
  it("correo sin cuentas: ni token ni envio", async () => {
    h.cfg.usuarios = [];
    await solicitarRecuperacion("nadie@x.pe");
    expect(h.reg.create).toHaveLength(0);
    expect(h.reg.correos).toHaveLength(0);
  });

  it("cuenta activa: un token nuevo, un correo, y mata los viejos", async () => {
    h.cfg.usuarios = [usuarioActivo("u1")];
    await solicitarRecuperacion("ana@obra.pe");
    expect(h.reg.create).toHaveLength(1);
    expect(h.reg.create[0].data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(h.reg.create[0].data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(h.reg.deleteMany).toHaveLength(1);
    expect(h.reg.correos).toHaveLength(1);
  });

  it("cuenta desactivada: ni token ni envio", async () => {
    h.cfg.usuarios = [{ ...usuarioActivo("u1"), estado: "SUSPENDIDO" }];
    await solicitarRecuperacion("ana@obra.pe");
    expect(h.reg.create).toHaveLength(0);
    expect(h.reg.correos).toHaveLength(0);
  });

  it("mismo correo en dos constructoras: un enlace por cuenta", async () => {
    h.cfg.usuarios = [usuarioActivo("u1"), usuarioActivo("u2")];
    await solicitarRecuperacion("ana@obra.pe");
    expect(h.reg.create).toHaveLength(2);
    expect(h.reg.correos).toHaveLength(2);
  });
});

describe("tokenRecuperacionValido", () => {
  it("vigente y sin usar: true", async () => {
    h.cfg.tokenFila = {
      expiresAt: new Date(Date.now() + 10 * MIN),
      usedAt: null,
      user: { estado: "ACTIVO" },
    };
    expect(await tokenRecuperacionValido("tok")).toBe(true);
  });

  it("ya usado: false", async () => {
    h.cfg.tokenFila = {
      expiresAt: new Date(Date.now() + 10 * MIN),
      usedAt: new Date(),
      user: { estado: "ACTIVO" },
    };
    expect(await tokenRecuperacionValido("tok")).toBe(false);
  });

  it("caducado: false", async () => {
    h.cfg.tokenFila = {
      expiresAt: new Date(Date.now() - MIN),
      usedAt: null,
      user: { estado: "ACTIVO" },
    };
    expect(await tokenRecuperacionValido("tok")).toBe(false);
  });

  it("usuario no activo: false", async () => {
    h.cfg.tokenFila = {
      expiresAt: new Date(Date.now() + 10 * MIN),
      usedAt: null,
      user: { estado: "SUSPENDIDO" },
    };
    expect(await tokenRecuperacionValido("tok")).toBe(false);
  });

  it("no existe: false", async () => {
    h.cfg.tokenFila = null;
    expect(await tokenRecuperacionValido("tok")).toBe(false);
  });
});

describe("restablecerConToken", () => {
  it("clave debil: la rechaza sin tocar nada", async () => {
    h.cfg.claveOk = false;
    const r = await restablecerConToken("tok", "123");
    expect(r.ok).toBe(false);
    expect(h.reg.update).toHaveLength(0);
  });

  it("token invalido: enlace ya no sirve", async () => {
    h.cfg.tokenFila = null;
    const r = await restablecerConToken("tok", "ClaveFuerte123!");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ya no sirve");
  });

  it("usuario no activo: enlace ya no sirve", async () => {
    h.cfg.tokenFila = {
      id: "t1",
      expiresAt: new Date(Date.now() + 10 * MIN),
      usedAt: null,
      user: { id: "u1", companyId: "c1", estado: "SUSPENDIDO" },
    };
    const r = await restablecerConToken("tok", "ClaveFuerte123!");
    expect(r.ok).toBe(false);
  });

  it("camino bueno: marca el token, cambia la clave y cierra sesiones", async () => {
    h.cfg.tokenFila = {
      id: "t1",
      expiresAt: new Date(Date.now() + 10 * MIN),
      usedAt: null,
      user: { id: "u1", companyId: "c1", estado: "ACTIVO" },
    };
    const r = await restablecerConToken("tok", "ClaveFuerte123!");
    expect(r.ok).toBe(true);
    expect(h.reg.updateMany).toHaveLength(1);
    expect(h.reg.update).toHaveLength(1);
    expect(h.reg.audit).toHaveLength(1);
    expect(h.reg.cerrarTodas).toContain("u1");
  });
});
