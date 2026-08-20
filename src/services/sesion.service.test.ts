import { describe, it, expect, beforeEach, vi } from "vitest";
import { hashToken } from "@/lib/tokens";

// Estado mutable compartido con los dobles. Los factory de vi.mock se elevan
// por encima de los imports, asi que el estado se crea con vi.hoisted para
// poder leerlo desde ellos.
const h = vi.hoisted(() => ({
  estado: { fila: null as any, contadorPurga: 0 },
  cookie: { valor: undefined as string | undefined },
  cfg: { operadores: "", veTodas: false, esOperador: false },
  reg: {
    create: [] as any[],
    update: [] as any[],
    delete: [] as any[],
    deleteMany: [] as any[],
    cookieSet: [] as any[],
    cookieDelete: 0,
    findUnique: 0,
  },
}));

// cache() de React memoiza por peticion; fuera de ella no hay contexto, asi
// que aqui lo volvemos identidad para poder llamar a obtenerSesion.
vi.mock("react", async (orig) => {
  const real = await orig<typeof import("react")>();
  return { ...real, cache: (fn: any) => fn };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (_n: string) =>
      h.cookie.valor === undefined ? undefined : { value: h.cookie.valor },
    set: (name: string, value: string, opts: any) => {
      h.cookie.valor = value;
      h.reg.cookieSet.push({ name, value, opts });
    },
    delete: (_n: string) => {
      h.cookie.valor = undefined;
      h.reg.cookieDelete++;
    },
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findUnique: vi.fn(async () => {
        h.reg.findUnique++;
        return h.estado.fila;
      }),
      create: vi.fn(async (args: any) => {
        h.reg.create.push(args);
      }),
      update: vi.fn(async (args: any) => {
        h.reg.update.push(args);
      }),
      delete: vi.fn(async (args: any) => {
        h.reg.delete.push(args);
        return {};
      }),
      deleteMany: vi.fn(async (args: any) => {
        h.reg.deleteMany.push(args);
        return { count: h.estado.contadorPurga };
      }),
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    get GCM_OPERADORES() {
      return h.cfg.operadores;
    },
  },
  isProduction: false,
}));

vi.mock("@/lib/rbac", () => ({
  resolverPermisos: () => ["PERMISO_RESUELTO"],
}));

vi.mock("@/lib/alcance-obras", () => ({
  veTodasLasObras: () => h.cfg.veTodas,
}));

vi.mock("@/lib/operador", () => ({
  parsearOperadores: () => [],
  esCorreoOperador: () => h.cfg.esOperador,
}));

const {
  crearSesion,
  obtenerSesion,
  cerrarSesion,
  cerrarTodasLasSesiones,
  limpiarSesionesExpiradas,
} = await import("@/services/sesion.service");

const MIN = 60 * 1000;
const HORA = 60 * MIN;

// Una fila de sesion viva y sana: vence dentro de 20 min y nacio hace 10.
function filaViva() {
  const ahora = Date.now();
  return {
    id: "ses1",
    expiresAt: new Date(ahora + 20 * MIN),
    createdAt: new Date(ahora - 10 * MIN),
    user: {
      id: "u1",
      companyId: "c1",
      role: "RESIDENTE",
      nombres: "Ana",
      apellidos: "Perez",
      email: "ana@obra.pe",
      estado: "ACTIVO",
      mustChangePassword: false,
      memberships: [{ projectId: "p1" }, { projectId: "p2" }],
      company: { activa: true, permisos: [] },
    },
  };
}

beforeEach(() => {
  h.estado.fila = filaViva();
  h.estado.contadorPurga = 0;
  h.cookie.valor = "tok";
  h.cfg.operadores = "";
  h.cfg.veTodas = false;
  h.cfg.esOperador = false;
  h.reg.create = [];
  h.reg.update = [];
  h.reg.delete = [];
  h.reg.deleteMany = [];
  h.reg.cookieSet = [];
  h.reg.cookieDelete = 0;
  h.reg.findUnique = 0;
});

describe("obtenerSesion: cuando NO hay sesion valida, devuelve null", () => {
  it("sin cookie, ni siquiera consulta la base", async () => {
    h.cookie.valor = undefined;
    expect(await obtenerSesion()).toBeNull();
    expect(h.reg.findUnique).toBe(0);
  });

  it("con cookie pero sin fila en la base, no borra nada", async () => {
    h.estado.fila = null;
    expect(await obtenerSesion()).toBeNull();
    expect(h.reg.findUnique).toBe(1);
    expect(h.reg.delete).toHaveLength(0);
  });

  it("sesion caducada: la borra y devuelve null", async () => {
    h.estado.fila.expiresAt = new Date(Date.now() - MIN);
    expect(await obtenerSesion()).toBeNull();
    expect(h.reg.delete[0].where.id).toBe("ses1");
  });

  it("usuario no ACTIVO: la borra y devuelve null", async () => {
    h.estado.fila.user.estado = "SUSPENDIDO";
    expect(await obtenerSesion()).toBeNull();
    expect(h.reg.delete[0].where.id).toBe("ses1");
  });

  it("empresa suspendida y no operador: la borra y devuelve null", async () => {
    h.estado.fila.user.company.activa = false;
    h.cfg.esOperador = false;
    expect(await obtenerSesion()).toBeNull();
    expect(h.reg.delete[0].where.id).toBe("ses1");
  });
});

describe("obtenerSesion: el operador se salta la empresa suspendida", () => {
  it("empresa suspendida pero es operador: entra y no se borra", async () => {
    h.estado.fila.user.company.activa = false;
    h.cfg.esOperador = true;
    const s = await obtenerSesion();
    expect(s).not.toBeNull();
    expect(s?.esOperador).toBe(true);
    expect(h.reg.delete).toHaveLength(0);
  });
});

describe("obtenerSesion: camino bueno", () => {
  it("devuelve la sesion con sus campos", async () => {
    const s = await obtenerSesion();
    expect(s?.sesionId).toBe("ses1");
    expect(s?.userId).toBe("u1");
    expect(s?.companyId).toBe("c1");
    expect(s?.role).toBe(h.estado.fila.user.role);
    expect(s?.email).toBe("ana@obra.pe");
    expect(s?.esOperador).toBe(false);
  });
});

describe("obrasAsignadas: null y lista vacia son OPUESTOS", () => {
  it("no ve todas y tiene obras: la lista de sus obras", async () => {
    h.cfg.veTodas = false;
    const s = await obtenerSesion();
    expect(s?.obrasAsignadas).toEqual(["p1", "p2"]);
  });

  it("no ve todas y no tiene ninguna: lista VACIA, no null", async () => {
    h.cfg.veTodas = false;
    h.estado.fila.user.memberships = [];
    const s = await obtenerSesion();
    expect(s?.obrasAsignadas).toEqual([]);
    expect(s?.obrasAsignadas).not.toBeNull();
  });

  it("ve toda la cartera: null, sin restriccion", async () => {
    h.cfg.veTodas = true;
    const s = await obtenerSesion();
    expect(s?.obrasAsignadas).toBeNull();
  });
});

describe("obtenerSesion: expiracion deslizante", () => {
  it("renueva si con ello gana mas de un minuto", async () => {
    const s = await obtenerSesion();
    expect(s).not.toBeNull();
    expect(h.reg.update).toHaveLength(1);
    expect(h.reg.update[0].where.id).toBe("ses1");
  });

  it("NO renueva si el avance no llega a un minuto", async () => {
    h.estado.fila.expiresAt = new Date(Date.now() + 30 * MIN - 30 * 1000);
    const s = await obtenerSesion();
    expect(s).not.toBeNull();
    expect(h.reg.update).toHaveLength(0);
  });

  it("la renovacion NUNCA pasa del tope absoluto de 8 horas", async () => {
    const nace = Date.now() - (8 * HORA - 5 * MIN);
    h.estado.fila.createdAt = new Date(nace);
    h.estado.fila.expiresAt = new Date(Date.now() + 30 * 1000);
    const s = await obtenerSesion();
    expect(s).not.toBeNull();
    expect(h.reg.update).toHaveLength(1);
    const escrito = h.reg.update[0].data.expiresAt.getTime();
    const tope = nace + 8 * HORA;
    expect(escrito).toBeLessThanOrEqual(tope);
    expect(escrito).toBeGreaterThan(tope - 2000);
    expect(escrito).toBeLessThan(Date.now() + 30 * MIN);
  });
});

describe("crearSesion", () => {
  it("guarda solo el hash del token y lo pone en cookie httpOnly", async () => {
    h.cookie.valor = undefined;
    await crearSesion("u1", { ip: "1.2.3.4", userAgent: "AgenteX" });
    expect(h.reg.create).toHaveLength(1);
    const data = h.reg.create[0].data;
    expect(data.userId).toBe("u1");
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    const cookie = h.reg.cookieSet[0];
    // El token va en la cookie en claro, pero en la base solo su hash.
    expect(hashToken(cookie.value)).toBe(data.tokenHash);
    expect(cookie.opts.httpOnly).toBe(true);
    expect(cookie.opts.sameSite).toBe("lax");
    expect(cookie.opts.maxAge).toBe((8 * HORA) / 1000);
  });
});

describe("cerrar sesiones", () => {
  it("cerrarSesion con token: borra por hash y limpia la cookie", async () => {
    h.cookie.valor = "tok";
    await cerrarSesion();
    expect(h.reg.deleteMany[0].where.tokenHash).toBe(hashToken("tok"));
    expect(h.reg.cookieDelete).toBe(1);
  });

  it("cerrarSesion sin token: no toca la base pero limpia la cookie", async () => {
    h.cookie.valor = undefined;
    await cerrarSesion();
    expect(h.reg.deleteMany).toHaveLength(0);
    expect(h.reg.cookieDelete).toBe(1);
  });

  it("cerrarTodasLasSesiones borra todas las del usuario", async () => {
    await cerrarTodasLasSesiones("u1");
    expect(h.reg.deleteMany[0].where.userId).toBe("u1");
  });
});

describe("limpiarSesionesExpiradas", () => {
  it("borra las vencidas y devuelve cuantas", async () => {
    h.estado.contadorPurga = 7;
    const n = await limpiarSesionesExpiradas();
    expect(n).toBe(7);
    expect(h.reg.deleteMany[0].where.expiresAt.lt).toBeInstanceOf(Date);
  });
});
