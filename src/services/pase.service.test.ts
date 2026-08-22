/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { hashToken } from "@/lib/tokens";
import {
  normalizarCodigo,
  MAX_INTENTOS_CODIGO,
  MAX_CODIGOS_POR_VENTANA,
} from "@/lib/pase";
import type { SesionActiva } from "@/services/sesion.service";

const h = vi.hoisted(() => ({
  cfg: {
    puede: [] as string[],
    alcanza: true,
    validaOk: true,
    proyecto: null as any,
    paseFindFirst: null as any,
    lista: [] as any[],
    desafio: null as any,
    sesionPaseFila: null as any,
    count: 0,
    updateManyCount: 1,
    smsEnviado: true,
    correoEnviado: true,
  },
  cookie: { pase: undefined as string | undefined, codigo: undefined as string | undefined },
  reg: {
    create: [] as any[], update: [] as any[], delete: [] as any[], updateMany: [] as any[],
    audit: [] as any[],
    sesionCreate: [] as any[], sesionDelete: [] as any[], sesionDeleteMany: [] as any[],
    codigoCreate: [] as any[], codigoUpdate: [] as any[], codigoDeleteMany: [] as any[],
    sms: [] as any[], correos: [] as any[],
    cookieSet: [] as any[], cookieDel: [] as string[],
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const v = name === "gcm_pase" ? h.cookie.pase : h.cookie.codigo;
      return v === undefined ? undefined : { value: v };
    },
    set: (name: string, value: string, opts: any) => {
      if (name === "gcm_pase") h.cookie.pase = value;
      else h.cookie.codigo = value;
      h.reg.cookieSet.push({ name, value, opts });
    },
    delete: (name: string) => {
      if (name === "gcm_pase") h.cookie.pase = undefined;
      else h.cookie.codigo = undefined;
      h.reg.cookieDel.push(name);
    },
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paseObra: {
      findMany: async () => h.cfg.lista,
      findFirst: async () => h.cfg.paseFindFirst,
      create: async (a: any) => {
        h.reg.create.push(a);
        return { id: "p1" };
      },
      update: async (a: any) => {
        h.reg.update.push(a);
      },
      delete: async (a: any) => {
        h.reg.delete.push(a);
      },
      updateMany: async (a: any) => {
        h.reg.updateMany.push(a);
        return { count: h.cfg.updateManyCount };
      },
    },
    project: { findFirst: async () => h.cfg.proyecto },
    auditLog: {
      create: async (a: any) => {
        h.reg.audit.push(a);
      },
    },
    sesionPase: {
      findUnique: async () => h.cfg.sesionPaseFila,
      create: async (a: any) => {
        h.reg.sesionCreate.push(a);
      },
      delete: async (a: any) => {
        h.reg.sesionDelete.push(a);
      },
      deleteMany: async (a: any) => {
        h.reg.sesionDeleteMany.push(a);
        return { count: 0 };
      },
    },
    codigoPase: {
      findUnique: async () => h.cfg.desafio,
      create: async (a: any) => {
        h.reg.codigoCreate.push(a);
      },
      update: async (a: any) => {
        h.reg.codigoUpdate.push(a);
      },
      deleteMany: async (a: any) => {
        h.reg.codigoDeleteMany.push(a);
        return { count: 0 };
      },
      count: async () => h.cfg.count,
    },
  },
}));

vi.mock("@/lib/rbac", () => ({
  puede: (_s: any, p: any) => h.cfg.puede.includes(p),
}));

vi.mock("@/lib/alcance-obras", () => ({
  alcanzaObra: () => h.cfg.alcanza,
  FUERA_DE_ALCANCE: "Esa obra no esta en tu alcance.",
}));

vi.mock("@/lib/env", () => ({ isProduction: false }));

vi.mock("@/lib/pase", async (orig) => {
  const real = await orig<typeof import("@/lib/pase")>();
  return {
    ...real,
    validarAltaPase: (d: any) =>
      h.cfg.validaOk ? { ok: true, datos: d } : { ok: false, error: "Datos invalidos." },
  };
});

vi.mock("@/services/mailer.service", () => ({
  enviarCorreo: async (a: any) => {
    h.reg.correos.push(a);
    return { enviado: h.cfg.correoEnviado };
  },
  correoCodigoAcceso: () => ({ asunto: "Codigo", cuerpo: "..." }),
}));

vi.mock("@/services/sms.service", () => ({
  enviarSms: async (...args: any[]) => {
    h.reg.sms.push(args);
    return { enviado: h.cfg.smsEnviado };
  },
  textoCodigoPase: () => "Tu codigo de obra es 123456",
}));

const {
  listarPases,
  crearPase,
  cambiarEstadoPase,
  solicitarCodigo,
  verificarCodigoPase,
  obtenerPase,
  obtenerPaseVigente,
} = await import("@/services/pase.service");

const CODIGO = "123456";
const HASH_OK = hashToken(normalizarCodigo(CODIGO));
const MIN = 60 * 1000;

const sesion = {
  companyId: "c1",
  userId: "u1",
  nombres: "Ana",
  apellidos: "Perez",
} as unknown as SesionActiva;

function desafioVivo(over: any = {}) {
  return {
    id: "cp1",
    paseId: "p1",
    codigoHash: HASH_OK,
    intentos: 0,
    expiresAt: new Date(Date.now() + 10 * MIN),
    pase: {
      id: "p1",
      projectId: "o1",
      activo: true,
      nombres: "Juan",
      apellidos: "Ramos",
      project: { companyId: "c1", estado: "EN_EJECUCION" },
    },
    ...over,
  };
}

beforeEach(() => {
  h.cfg.puede = ["lookahead:gestionar"];
  h.cfg.alcanza = true;
  h.cfg.validaOk = true;
  h.cfg.proyecto = {
    id: "o1",
    estado: "PLANIFICACION",
    archivadaEn: null,
    company: { enMigracionAt: null },
  };
  h.cfg.paseFindFirst = null;
  h.cfg.lista = [];
  h.cfg.desafio = null;
  h.cfg.sesionPaseFila = null;
  h.cfg.count = 0;
  h.cfg.updateManyCount = 1;
  h.cfg.smsEnviado = true;
  h.cfg.correoEnviado = true;
  h.cookie.pase = undefined;
  h.cookie.codigo = "tok";
  for (const k of Object.keys(h.reg)) (h.reg as any)[k] = [];
});

describe("verificarCodigoPase: la puerta del pase", () => {
  it("sin cookie de codigo: caducado", async () => {
    h.cookie.codigo = undefined;
    const r = await verificarCodigoPase("o1", CODIGO);
    expect(r.ok).toBe(false);
  });

  it("desafio inexistente: lo olvida y caducado", async () => {
    h.cfg.desafio = null;
    const r = await verificarCodigoPase("o1", CODIGO);
    expect(r.ok).toBe(false);
    expect(h.reg.codigoDeleteMany.length).toBeGreaterThan(0);
    expect(h.reg.cookieDel).toContain("gcm_pase_codigo");
  });

  it("desafio caducado: caducado", async () => {
    h.cfg.desafio = desafioVivo({ expiresAt: new Date(Date.now() - MIN) });
    const r = await verificarCodigoPase("o1", CODIGO);
    expect(r.ok).toBe(false);
  });

  it("codigo de OTRA obra: no sirve para esta", async () => {
    h.cfg.desafio = desafioVivo();
    const r = await verificarCodigoPase("obra-distinta", CODIGO);
    expect(r.ok).toBe(false);
  });

  it("pase revocado entre pedir y teclear: no sirve", async () => {
    h.cfg.desafio = desafioVivo({ pase: { ...desafioVivo().pase, activo: false } });
    const r = await verificarCodigoPase("o1", CODIGO);
    expect(r.ok).toBe(false);
  });

  it("obra cerrada: no sirve", async () => {
    h.cfg.desafio = desafioVivo({
      pase: { ...desafioVivo().pase, project: { companyId: "c1", estado: "CERRADA" } },
    });
    const r = await verificarCodigoPase("o1", CODIGO);
    expect(r.ok).toBe(false);
  });

  it("codigo incorrecto: descuenta un intento", async () => {
    h.cfg.desafio = desafioVivo({ intentos: 0 });
    const r = await verificarCodigoPase("o1", "000000");
    expect(r.ok).toBe(false);
    expect(h.reg.codigoUpdate[0].data.intentos).toBe(1);
  });

  it("al agotar los intentos: fuera", async () => {
    h.cfg.desafio = desafioVivo({ intentos: MAX_INTENTOS_CODIGO - 1 });
    const r = await verificarCodigoPase("o1", "000000");
    expect(r.ok).toBe(false);
    expect(h.reg.codigoUpdate).toHaveLength(0);
  });

  it("codigo correcto: reconoce el telefono y abre la sesion del pase", async () => {
    h.cfg.desafio = desafioVivo();
    const r = await verificarCodigoPase("o1", CODIGO);
    expect(r.ok).toBe(true);
    expect(h.reg.sesionCreate).toHaveLength(1);
    const setPase = h.reg.cookieSet.find((c) => c.name === "gcm_pase");
    expect(setPase?.opts.httpOnly).toBe(true);
  });
});

describe("solicitarCodigo: la via publica calla", () => {
  it("contacto no registrado: responde ok sin crear codigo", async () => {
    h.cfg.paseFindFirst = null;
    const r = await solicitarCodigo("o1", "desconocido@x.pe");
    expect(r.ok).toBe(true);
    expect(h.reg.codigoCreate).toHaveLength(0);
  });

  it("contacto registrado y bajo el limite: crea y reparte", async () => {
    h.cfg.count = 0;
    h.cfg.paseFindFirst = {
      id: "p1", nombres: "Juan", apellidos: "Ramos",
      email: "juan@x.pe", celular: "999888777",
      project: { companyId: "c1" },
    };
    const r = await solicitarCodigo("o1", "juan@x.pe");
    expect(r.ok).toBe(true);
    expect(h.reg.codigoCreate).toHaveLength(1);
  });

  it("demasiados codigos: calla y no crea otro", async () => {
    h.cfg.count = MAX_CODIGOS_POR_VENTANA;
    h.cfg.paseFindFirst = {
      id: "p1", nombres: "Juan", apellidos: "Ramos",
      email: "juan@x.pe", celular: null,
      project: { companyId: "c1" },
    };
    const r = await solicitarCodigo("o1", "juan@x.pe");
    expect(r.ok).toBe(true);
    expect(h.reg.codigoCreate).toHaveLength(0);
  });
});

describe("crearPase: guardas de gestion", () => {
  const datos = { nombres: "Juan", apellidos: "Ramos", celular: "999888777", email: "juan@x.pe" };

  it("sin permiso: lo rechaza", async () => {
    h.cfg.puede = [];
    const r = await crearPase(sesion, "o1", datos as any);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("No tienes permiso");
  });

  it("fuera de alcance: lo rechaza", async () => {
    h.cfg.alcanza = false;
    const r = await crearPase(sesion, "o1", datos as any);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("alcance");
  });

  it("contacto ya usado en la obra: lo rechaza", async () => {
    h.cfg.paseFindFirst = { nombres: "Otro", apellidos: "Pase" };
    const r = await crearPase(sesion, "o1", datos as any);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ya lo tiene");
  });

  it("camino bueno: crea el pase y lo audita", async () => {
    h.cfg.paseFindFirst = null;
    const r = await crearPase(sesion, "o1", datos as any);
    expect(r.ok).toBe(true);
    expect(h.reg.create).toHaveLength(1);
    expect(h.reg.audit).toHaveLength(1);
  });
});

describe("cambiarEstadoPase", () => {
  it("revocar tira sus sesiones y codigos en el acto", async () => {
    h.cfg.updateManyCount = 1;
    h.cfg.paseFindFirst = {
      project: { estado: "EN_EJECUCION", archivadaEn: null, company: { enMigracionAt: null } },
    };
    const r = await cambiarEstadoPase(sesion, "o1", "p1", false);
    expect(r.ok).toBe(true);
    expect(h.reg.sesionDeleteMany).toHaveLength(1);
    expect(h.reg.codigoDeleteMany).toHaveLength(1);
  });

  it("pase inexistente: no encontrado", async () => {
    h.cfg.updateManyCount = 0;
    const r = await cambiarEstadoPase(sesion, "o1", "px", false);
    expect(r.ok).toBe(false);
  });
});

describe("listarPases", () => {
  it("sin permiso: lista vacia", async () => {
    h.cfg.puede = [];
    expect(await listarPases(sesion, "o1")).toEqual([]);
  });
});

describe("obtenerPase / obtenerPaseVigente", () => {
  function sesionPaseViva(over: any = {}) {
    return {
      id: "sp1",
      expiresAt: new Date(Date.now() + 10 * MIN),
      pase: {
        id: "p1", projectId: "o1", activo: true,
        nombres: "Juan", apellidos: "Ramos",
        project: { companyId: "c1", estado: "EN_EJECUCION", company: { activa: true } },
      },
      ...over,
    };
  }

  it("cookie valida y obra correcta: devuelve el pase", async () => {
    h.cookie.pase = "tok";
    h.cfg.sesionPaseFila = sesionPaseViva();
    const p = await obtenerPase("o1");
    expect(p?.obraId).toBe("o1");
  });

  it("misma cookie pero otra obra: null (no cruza de obra)", async () => {
    h.cookie.pase = "tok";
    h.cfg.sesionPaseFila = sesionPaseViva();
    const p = await obtenerPase("obra-distinta");
    expect(p).toBeNull();
  });

  it("pase revocado: borra la sesion y devuelve null", async () => {
    h.cookie.pase = "tok";
    h.cfg.sesionPaseFila = sesionPaseViva({ pase: { ...sesionPaseViva().pase, activo: false } });
    const p = await obtenerPaseVigente();
    expect(p).toBeNull();
    expect(h.reg.sesionDelete).toHaveLength(1);
  });
});
