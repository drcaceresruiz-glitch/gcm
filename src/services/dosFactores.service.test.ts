/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { hashToken } from "@/lib/tokens";
import {
  MAX_INTENTOS_CODIGO,
  MAX_CODIGOS_POR_VENTANA,
  normalizarCodigo,
} from "@/lib/dosFactores";

const h = vi.hoisted(() => ({
  cfg: { fila: null as any, count: 0, smsEnviado: true },
  cookie: { valor: undefined as string | undefined },
  reg: {
    create: [] as any[],
    update: [] as any[],
    updateMany: [] as any[],
    deleteMany: [] as any[],
    delete: [] as any[],
    sms: [] as any[],
    correos: [] as any[],
    cookieSet: [] as any[],
    cookieDelete: 0,
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      h.cookie.valor === undefined ? undefined : { value: h.cookie.valor },
    set: (name: string, value: string, opts: any) => {
      h.cookie.valor = value;
      h.reg.cookieSet.push({ name, value, opts });
    },
    delete: () => {
      h.cookie.valor = undefined;
      h.reg.cookieDelete++;
    },
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    codigoAcceso: {
      updateMany: async (a: any) => {
        h.reg.updateMany.push(a);
        return { count: 0 };
      },
      create: async (a: any) => {
        h.reg.create.push(a);
      },
      count: async () => h.cfg.count,
      deleteMany: async (a: any) => {
        h.reg.deleteMany.push(a);
        return { count: 0 };
      },
      findUnique: async () => h.cfg.fila,
      findFirst: async () => h.cfg.fila,
      update: async (a: any) => {
        h.reg.update.push(a);
      },
      delete: async (a: any) => {
        h.reg.delete.push(a);
      },
    },
  },
}));

vi.mock("@/services/mailer.service", () => ({
  enviarCorreo: async (a: any) => {
    h.reg.correos.push(a);
  },
  correoCodigoAcceso: () => ({ asunto: "Codigo", cuerpo: "..." }),
}));

vi.mock("@/services/sms.service", () => ({
  enviarSms: async (...args: any[]) => {
    h.reg.sms.push(args);
    return { enviado: h.cfg.smsEnviado, motivo: "x" };
  },
  textoCodigoAcceso: () => "Tu codigo es 123456",
}));

const {
  crearDesafio,
  verificarCodigo,
  pedirCodigoCelular,
  comprobarCodigoCelular,
} = await import("@/services/dosFactores.service");

const CODIGO = "123456";
const HASH_OK = hashToken(normalizarCodigo(CODIGO));
const MIN = 60 * 1000;

function filaAcceso(over: any = {}) {
  return {
    id: "d1",
    userId: "u1",
    codigoHash: HASH_OK,
    intentos: 0,
    expiresAt: new Date(Date.now() + 10 * MIN),
    user: { estado: "ACTIVO" },
    ...over,
  };
}

beforeEach(() => {
  h.cfg.fila = null;
  h.cfg.count = 0;
  h.cfg.smsEnviado = true;
  h.cookie.valor = "tok";
  h.reg.create = [];
  h.reg.update = [];
  h.reg.updateMany = [];
  h.reg.deleteMany = [];
  h.reg.delete = [];
  h.reg.sms = [];
  h.reg.correos = [];
  h.reg.cookieSet = [];
  h.reg.cookieDelete = 0;
});

describe("verificarCodigo: el paso entre acertar la clave y entrar", () => {
  it("sin cookie: caducado y de vuelta al login", async () => {
    h.cookie.valor = undefined;
    const r = await verificarCodigo(CODIGO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.volverAlLogin).toBe(true);
  });

  it("desafio inexistente: lo olvida y de vuelta al login", async () => {
    h.cfg.fila = null;
    const r = await verificarCodigo(CODIGO);
    expect(r.ok).toBe(false);
    expect(h.reg.deleteMany).toHaveLength(1);
    expect(h.reg.cookieDelete).toBe(1);
  });

  it("desafio caducado: de vuelta al login", async () => {
    h.cfg.fila = filaAcceso({ expiresAt: new Date(Date.now() - MIN) });
    const r = await verificarCodigo(CODIGO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.volverAlLogin).toBe(true);
  });

  it("usuario desactivado entre paso y paso: de vuelta al login", async () => {
    h.cfg.fila = filaAcceso({ user: { estado: "SUSPENDIDO" } });
    const r = await verificarCodigo(CODIGO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.volverAlLogin).toBe(true);
  });

  it("codigo incorrecto: descuenta un intento y sigue en el desafio", async () => {
    h.cfg.fila = filaAcceso({ intentos: 0 });
    const r = await verificarCodigo("000000");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("incorrecto");
    expect(h.reg.update[0].data.intentos).toBe(1);
  });

  it("al agotar los intentos: fuera, y de vuelta al login", async () => {
    h.cfg.fila = filaAcceso({ intentos: MAX_INTENTOS_CODIGO - 1 });
    const r = await verificarCodigo("000000");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.volverAlLogin).toBe(true);
    expect(h.reg.update).toHaveLength(0);
  });

  it("codigo correcto: entra, devuelve el userId y gasta el desafio", async () => {
    h.cfg.fila = filaAcceso();
    const r = await verificarCodigo(CODIGO);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.userId).toBe("u1");
    expect(h.reg.deleteMany).toHaveLength(1);
    expect(h.reg.cookieDelete).toBe(1);
  });
});

describe("crearDesafio", () => {
  it("por correo: crea el codigo, pone cookie httpOnly y avisa por correo", async () => {
    h.cookie.valor = undefined;
    const usuario = {
      id: "u1",
      companyId: "c1",
      nombres: "Ana",
      email: "ana@obra.pe",
      celular: null,
      canal2FA: "CORREO",
      celularVerificadoAt: null,
    };
    const r = await crearDesafio(usuario as any);
    expect(h.reg.create).toHaveLength(1);
    expect(h.reg.create[0].data.proposito).toBe("ACCESO");
    expect(h.reg.create[0].data.codigoHash).toMatch(/^[0-9a-f]{64}$/);
    expect(h.reg.cookieSet[0].opts.httpOnly).toBe(true);
    expect(r.canal).toBe("CORREO");
    expect(h.reg.correos).toHaveLength(1);
  });
});

describe("pedirCodigoCelular", () => {
  it("demasiados codigos seguidos: frena", async () => {
    h.cfg.count = MAX_CODIGOS_POR_VENTANA;
    const r = await pedirCodigoCelular("u1", "c1", "999888777");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("varios");
    expect(h.reg.create).toHaveLength(0);
  });

  it("camino bueno: crea el codigo sin token y sale por SMS", async () => {
    h.cfg.count = 0;
    h.cfg.smsEnviado = true;
    const r = await pedirCodigoCelular("u1", "c1", "999888777");
    expect(r.ok).toBe(true);
    expect(h.reg.create[0].data.proposito).toBe("VERIFICAR_CELULAR");
    expect(h.reg.create[0].data.tokenHash).toBeNull();
    expect(h.reg.sms).toHaveLength(1);
  });

  it("si el SMS no sale: lo dice", async () => {
    h.cfg.count = 0;
    h.cfg.smsEnviado = false;
    const r = await pedirCodigoCelular("u1", "c1", "999888777");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("No se pudo enviar");
  });
});

describe("comprobarCodigoCelular", () => {
  it("sin desafio vigente: caducado", async () => {
    h.cfg.fila = null;
    const r = await comprobarCodigoCelular("u1", "999888777", CODIGO);
    expect(r.ok).toBe(false);
  });

  it("codigo correcto: verifica y gasta el desafio", async () => {
    h.cfg.fila = { id: "d1", codigoHash: HASH_OK, intentos: 0 };
    const r = await comprobarCodigoCelular("u1", "999888777", CODIGO);
    expect(r.ok).toBe(true);
    expect(h.reg.delete).toHaveLength(1);
  });

  it("codigo incorrecto: descuenta un intento", async () => {
    h.cfg.fila = { id: "d1", codigoHash: HASH_OK, intentos: 0 };
    const r = await comprobarCodigoCelular("u1", "999888777", "000000");
    expect(r.ok).toBe(false);
    expect(h.reg.update[0].data.intentos).toBe(1);
  });
});
