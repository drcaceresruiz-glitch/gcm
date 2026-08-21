/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { hashToken } from "@/lib/tokens";
import { COOKIE_VISTA_ROL } from "@/lib/vista-rol";

// Estado mutable compartido con los dobles. Los factory de vi.mock se elevan
// por encima de los imports, asi que el estado se crea con vi.hoisted para
// poder leerlo desde ellos.
const h = vi.hoisted(() => ({
  estado: { fila: null as any, contadorPurga: 0 },
  // Dos cookies, DOS estados: `obtenerSesion` lee la de sesion y, si toca,
  // tambien la de vista previa. Un mock que devolviera el mismo valor para
  // cualquier nombre —como habia antes— dejaria de distinguirlas en cuanto
  // el servicio empezara a leer la segunda.
  cookie: { valor: undefined as string | undefined },
  cookieVista: { valor: undefined as string | undefined },
  // Que ve toda la cartera, por ROL: el ADMIN real y, si se simula, el rol
  // simulado pueden necesitar respuestas distintas en la MISMA prueba.
  // Los valores por defecto son los reales de produccion.
  cfg: {
    operadores: "",
    rolesQueVenTodo: ["ADMIN", "GERENTE"] as string[],
    esOperador: false,
  },
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
    // `@/lib/vista-rol` NO esta doblado —es un modulo puro sin Prisma ni
    // cookies propias—, asi que `COOKIE_VISTA_ROL` importado arriba ya vale
    // en cuanto este factory se EJECUTA (la primera vez que algo pide
    // `cookies()`, mucho despues de que los imports del archivo resuelvan).
    // Cualquier otra cookie que se pida aqui es la de sesion: este servicio
    // solo lee dos.
    get: (n: string) => {
      const valor = n === COOKIE_VISTA_ROL ? h.cookieVista.valor : h.cookie.valor;
      return valor === undefined ? undefined : { value: valor };
    },
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

// Sensibles al ROL que reciben, y no una respuesta fija: la vista previa
// pide `resolverPermisos`/`veTodasLasObras` dos veces en la misma peticion
// —una para el rol real, otra para el simulado si lo hay— y hace falta
// poder distinguirlas para probar que la interseccion recorta de verdad.
// ADMIN es superconjunto de GERENTE, que es superconjunto de RESIDENTE:
// mismo orden que en produccion, para que "previsualizar hacia abajo" tenga
// algo real que recortar.
vi.mock("@/lib/rbac", () => {
  const PERMISOS_POR_ROL: Record<string, string[]> = {
    ADMIN: ["p:a", "p:b", "p:c"],
    GERENTE: ["p:a", "p:b"],
    RESIDENTE: ["p:a"],
    ADMIN_OBRA: ["p:a"],
    ALMACENERO: [],
    CONSULTOR: ["p:a"],
  };
  return {
    resolverPermisos: (rol: string) => [...(PERMISOS_POR_ROL[rol] ?? [])],
    // `rolValido` (en `@/lib/usuarios`, sin doblar) lee esto de verdad para
    // decidir si la cookie de vista previa nombra un rol real.
    ROLES: Object.keys(PERMISOS_POR_ROL),
  };
});

vi.mock("@/lib/alcance-obras", () => ({
  veTodasLasObras: (rol: string) => h.cfg.rolesQueVenTodo.includes(rol),
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
      company: { activa: true, permisos: [], permitirVistaPreviaRoles: false },
    },
  };
}

beforeEach(() => {
  h.estado.fila = filaViva();
  h.estado.contadorPurga = 0;
  h.cookie.valor = "tok";
  h.cookieVista.valor = undefined;
  h.cfg.operadores = "";
  h.cfg.rolesQueVenTodo = ["ADMIN", "GERENTE"];
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
    // RESIDENTE, el rol por defecto de filaViva(), no esta en
    // rolesQueVenTodo: no hace falta forzar nada mas.
    const s = await obtenerSesion();
    expect(s?.obrasAsignadas).toEqual(["p1", "p2"]);
  });

  it("no ve todas y no tiene ninguna: lista VACIA, no null", async () => {
    h.estado.fila.user.memberships = [];
    const s = await obtenerSesion();
    expect(s?.obrasAsignadas).toEqual([]);
    expect(s?.obrasAsignadas).not.toBeNull();
  });

  it("ve toda la cartera: null, sin restriccion", async () => {
    h.estado.fila.user.role = "ADMIN";
    const s = await obtenerSesion();
    expect(s?.obrasAsignadas).toBeNull();
  });
});

/**
 * La vista previa de rol. La cuenta de estas pruebas es ADMIN —el unico rol
 * que puede activarla— con la empresa habilitada, salvo que la prueba diga
 * lo contrario.
 */
describe("obtenerSesion: vista previa de rol", () => {
  beforeEach(() => {
    h.estado.fila.user.role = "ADMIN";
    h.estado.fila.user.company.permitirVistaPreviaRoles = true;
  });

  it("sin cookie de vista, no simula nada aunque este todo permitido", async () => {
    const s = await obtenerSesion();
    expect(s?.role).toBe("ADMIN");
    expect(s?.rolReal).toBe("ADMIN");
    expect(s?.previsualizacionHabilitada).toBe(true);
  });

  it("con el ajuste de la empresa APAGADO, la cookie se ignora", async () => {
    h.estado.fila.user.company.permitirVistaPreviaRoles = false;
    h.cookieVista.valor = "GERENTE";
    const s = await obtenerSesion();
    expect(s?.role).toBe("ADMIN");
    expect(s?.previsualizacionHabilitada).toBe(false);
  });

  it("con el rol real distinto de ADMIN, la cookie se ignora aunque la empresa lo permita", async () => {
    h.estado.fila.user.role = "RESIDENTE";
    h.cookieVista.valor = "GERENTE";
    const s = await obtenerSesion();
    expect(s?.role).toBe("RESIDENTE");
    expect(s?.rolReal).toBe("RESIDENTE");
  });

  it("un rol que no existe en la cookie se ignora, no revienta", async () => {
    h.cookieVista.valor = "SUPERADMIN_INVENTADO";
    const s = await obtenerSesion();
    expect(s?.role).toBe("ADMIN");
  });

  it("camino bueno: role, permisos y obrasAsignadas reflejan la simulacion", async () => {
    h.cookieVista.valor = "GERENTE";
    const s = await obtenerSesion();

    expect(s?.role).toBe("GERENTE");
    // rolReal NUNCA cambia: es la identidad verdadera, se este
    // previsualizando o no.
    expect(s?.rolReal).toBe("ADMIN");
    // ADMIN tiene p:a, p:b, p:c; GERENTE solo p:a y p:b. La interseccion
    // (que aqui es un no-op porque ADMIN lo contiene todo) da justo lo de
    // GERENTE, nunca mas.
    expect(s?.permisos).toEqual(["p:a", "p:b"]);
    // GERENTE esta en `rolesQueVenTodo`: sigue viendo toda la cartera, no
    // las obras propias del ADMIN (que aqui son p1 y p2).
    expect(s?.obrasAsignadas).toBeNull();
  });

  it("previsualizar un rol que NO ve toda la cartera limita a las obras propias de la cuenta", async () => {
    h.cookieVista.valor = "RESIDENTE";
    const s = await obtenerSesion();
    expect(s?.role).toBe("RESIDENTE");
    // Las memberships de filaViva(): p1 y p2. Un ADMIN tipicamente no tiene
    // memberships propias -veTodasLasObras ya se las hace innecesarias-,
    // pero si las tuviera, son las que la simulacion tendria que enseñar.
    expect(s?.obrasAsignadas).toEqual(["p1", "p2"]);
  });

  it("previsualizar el mismo rol real no es una simulacion", async () => {
    h.cookieVista.valor = "ADMIN";
    const s = await obtenerSesion();
    expect(s?.role).toBe("ADMIN");
    expect(s?.permisos).toEqual(["p:a", "p:b", "p:c"]);
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
