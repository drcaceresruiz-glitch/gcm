import { describe, it, expect, vi, beforeEach } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * El canal de soporte: la primera pieza del sistema que se lee y se
 * escribe desde LOS DOS LADOS de la pared operador/empresa.
 *
 * `aislamiento.test.ts` no cubre sesiones `esOperador` -es estructuralmente
 * imposible, ver el comentario del servicio-, asi que lo que mas importa
 * probar AQUI es justo lo que esa prueba no puede: que el lado empresa
 * nunca toca el `companyId` de otra, y que el lado operador exige
 * `esOperador` de verdad, sin colarse por ningun camino.
 */

interface Fila {
  id: string;
  companyId: string;
  direccion: "DEL_OPERADOR" | "DE_LA_EMPRESA";
  cuerpo: string;
  autorNombre: string;
  autorUserId: string | null;
  leidoPorOperadorAt: Date | null;
  leidoPorEmpresaAt: Date | null;
  createdAt: Date;
}

const estado: {
  filas: Fila[];
  creadas: Record<string, unknown>[];
  actualizaciones: { where: Record<string, unknown>; data: Record<string, unknown> }[];
  correos: { para: string; asunto: string }[];
  admins: { email: string }[];
} = {
  filas: [],
  creadas: [],
  actualizaciones: [],
  correos: [],
  admins: [],
};

let contadorId = 0;
const empresasInexistentes = new Set<string>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mensajeSoporte: {
      findMany: (args: {
        where: { companyId: string };
        orderBy: { createdAt: "desc" };
        take: number;
      }) =>
        Promise.resolve(
          estado.filas
            .filter((f) => f.companyId === args.where.companyId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, args.take),
        ),
      create: (args: { data: Record<string, unknown> }) => {
        contadorId += 1;
        const fila = {
          id: `msg-${contadorId}`,
          leidoPorOperadorAt: null,
          leidoPorEmpresaAt: null,
          createdAt: new Date(2026, 7, 22, 10, 0, contadorId),
          ...args.data,
        } as Fila;
        estado.filas.push(fila);
        estado.creadas.push(args.data);
        return Promise.resolve({ id: fila.id });
      },
      updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        estado.actualizaciones.push(args);
        const ids = (args.where["id"] as { in: string[] } | undefined)?.in ?? [];
        const companyId = args.where["companyId"] as string | undefined;
        let tocadas = 0;
        for (const f of estado.filas) {
          if (ids.includes(f.id) && (!companyId || f.companyId === companyId)) {
            Object.assign(f, args.data);
            tocadas++;
          }
        }
        return Promise.resolve({ count: tocadas });
      },
      groupBy: (args: {
        by: ["companyId"];
        where: { direccion: string; leidoPorOperadorAt: null };
      }) => {
        const filtradas = estado.filas.filter(
          (f) =>
            f.direccion === args.where.direccion && f.leidoPorOperadorAt === null,
        );
        const porEmpresa = new Map<string, number>();
        for (const f of filtradas) {
          porEmpresa.set(f.companyId, (porEmpresa.get(f.companyId) ?? 0) + 1);
        }
        return Promise.resolve(
          [...porEmpresa.entries()].map(([companyId, n]) => ({
            companyId,
            _count: { _all: n },
          })),
        );
      },
      count: (args: { where: { companyId: string; direccion: string; leidoPorEmpresaAt: null } }) =>
        Promise.resolve(
          estado.filas.filter(
            (f) =>
              f.companyId === args.where.companyId &&
              f.direccion === args.where.direccion &&
              f.leidoPorEmpresaAt === null,
          ).length,
        ),
    },
    company: {
      findUnique: (args: { where: { id: string } }) =>
        Promise.resolve(
          empresasInexistentes.has(args.where.id)
            ? null
            : { id: args.where.id, razonSocial: "CONSTRUCTORA DE PRUEBA" },
        ),
    },
    user: {
      findMany: () => Promise.resolve(estado.admins),
    },
  },
}));

vi.mock("@/services/mailer.service", () => ({
  enviarCorreo: (correo: { para: string; asunto: string }) => {
    estado.correos.push({ para: correo.para, asunto: correo.asunto });
    return Promise.resolve({ enviado: true });
  },
  correoNuevoMensajeSoporte: (datos: { paraOperador: boolean }) => ({
    asunto: datos.paraOperador ? "Soporte: mensaje" : "Tienes un mensaje",
    texto: "texto",
    html: "<p>html</p>",
  }),
}));

vi.mock("@/lib/env", () => ({
  env: { GCM_OPERADORES: "operador@gcm.test" },
}));

const {
  hiloDeSoporte,
  escribirSoporte,
  contarSoporteSinLeer,
  hiloDeSoportePorOperador,
  escribirSoportePorOperador,
  contadorSoportePorEmpresa,
} = await import("@/services/soporte.service");

function sesion(
  opciones: Partial<{ permisos: string[]; esOperador: boolean; companyId: string }> = {},
): SesionActiva {
  return {
    userId: "u-1",
    companyId: opciones.companyId ?? "empresa-1",
    nombres: "Ada",
    apellidos: "Lovelace",
    role: "ADMIN",
    permisos: opciones.permisos ?? ["soporte:usar"],
    esOperador: opciones.esOperador ?? false,
  } as unknown as SesionActiva;
}

const ADMIN_EMPRESA = sesion({ companyId: "empresa-1" });
const SIN_PERMISO = sesion({ companyId: "empresa-1", permisos: [] });
const OPERADOR = sesion({ esOperador: true, companyId: "empresa-operador" });
const NO_OPERADOR = sesion({ esOperador: false, companyId: "empresa-1" });

beforeEach(() => {
  estado.filas = [];
  estado.creadas = [];
  estado.actualizaciones = [];
  estado.correos = [];
  estado.admins = [{ email: "admin@empresa1.test" }];
  contadorId = 0;
  empresasInexistentes.clear();
});

describe("el permiso, lado empresa", () => {
  it("sin soporte:usar no se ve ni se escribe nada", async () => {
    expect(await hiloDeSoporte(SIN_PERMISO)).toEqual([]);

    const r = await escribirSoporte(SIN_PERMISO, "hola");
    expect(r.ok).toBe(false);
    expect(estado.creadas).toHaveLength(0);
  });
});

describe("el permiso, lado operador", () => {
  it("un usuario que no opera GCM no ve ni escribe nada, aunque pase un empresaId", async () => {
    expect(await hiloDeSoportePorOperador(NO_OPERADOR, "empresa-1")).toEqual([]);

    const r = await escribirSoportePorOperador(NO_OPERADOR, "empresa-1", "hola");
    expect(r.ok).toBe(false);
    expect(estado.creadas).toHaveLength(0);
  });

  it("y contadorSoportePorEmpresa tambien lo exige", async () => {
    expect(await contadorSoportePorEmpresa(NO_OPERADOR)).toEqual(new Map());
  });
});

describe("aislamiento entre empresas", () => {
  it("el hilo de una empresa nunca trae mensajes de otra", async () => {
    await escribirSoporte(ADMIN_EMPRESA, "de la empresa 1");
    await escribirSoportePorOperador(OPERADOR, "empresa-2", "de la empresa 2");

    const hilo = await hiloDeSoporte(ADMIN_EMPRESA);
    expect(hilo).toHaveLength(1);
    expect(hilo[0]?.cuerpo).toBe("de la empresa 1");
  });

  it("el operador solo ve y toca el empresaId que paso explicitamente", async () => {
    await escribirSoportePorOperador(OPERADOR, "empresa-1", "para la 1");
    await escribirSoportePorOperador(OPERADOR, "empresa-2", "para la 2");

    const hilo1 = await hiloDeSoportePorOperador(OPERADOR, "empresa-1");
    expect(hilo1.map((m) => m.cuerpo)).toEqual(["para la 1"]);
  });
});

describe("escribir y leer, lado empresa", () => {
  it("escribir crea DE_LA_EMPRESA y avisa a los operadores por correo", async () => {
    const r = await escribirSoporte(ADMIN_EMPRESA, "  necesito ayuda  ");
    expect(r.ok).toBe(true);
    expect(estado.creadas[0]).toMatchObject({
      companyId: "empresa-1",
      direccion: "DE_LA_EMPRESA",
      cuerpo: "necesito ayuda",
    });
    expect(estado.correos.map((c) => c.para)).toEqual(["operador@gcm.test"]);
  });

  it("rechaza un mensaje vacio", async () => {
    const r = await escribirSoporte(ADMIN_EMPRESA, "   ");
    expect(r.ok).toBe(false);
    expect(estado.creadas).toHaveLength(0);
  });

  it("leer el hilo marca como leidos los DEL_OPERADOR pendientes, y solo esos", async () => {
    await escribirSoportePorOperador(OPERADOR, "empresa-1", "del operador");
    await escribirSoporte(ADMIN_EMPRESA, "de la empresa, ya la escribio ella");

    await hiloDeSoporte(ADMIN_EMPRESA);

    const delOperador = estado.filas.find((f) => f.direccion === "DEL_OPERADOR");
    expect(delOperador?.leidoPorEmpresaAt).not.toBeNull();
    // El suyo propio nunca necesito marcarse.
    const propio = estado.filas.find((f) => f.direccion === "DE_LA_EMPRESA");
    expect(propio?.leidoPorEmpresaAt).toBeNull();
  });

  it("contarSoporteSinLeer cuenta los DEL_OPERADOR sin leer, no los propios", async () => {
    await escribirSoportePorOperador(OPERADOR, "empresa-1", "uno");
    await escribirSoportePorOperador(OPERADOR, "empresa-1", "dos");
    await escribirSoporte(ADMIN_EMPRESA, "el mio no cuenta");

    expect(await contarSoporteSinLeer(ADMIN_EMPRESA)).toBe(2);
  });
});

describe("escribir y leer, lado operador", () => {
  it("escribir crea DEL_OPERADOR y avisa a los ADMIN activos de la empresa", async () => {
    const r = await escribirSoportePorOperador(OPERADOR, "empresa-1", "hola, en que ayudo");
    expect(r.ok).toBe(true);
    expect(estado.creadas[0]).toMatchObject({
      companyId: "empresa-1",
      direccion: "DEL_OPERADOR",
    });
    expect(estado.correos.map((c) => c.para)).toEqual(["admin@empresa1.test"]);
  });

  it("si la constructora no existe, lo dice en vez de crear el mensaje igual", async () => {
    empresasInexistentes.add("no-existe");

    const r = await escribirSoportePorOperador(OPERADOR, "no-existe", "hola");

    expect(r).toEqual({ ok: false, error: "Constructora no encontrada." });
    expect(estado.creadas).toHaveLength(0);
  });

  it("leer el hilo marca como leidos los DE_LA_EMPRESA pendientes", async () => {
    await escribirSoporte(ADMIN_EMPRESA, "de la empresa");
    await escribirSoportePorOperador(OPERADOR, "empresa-1", "del operador, ya lo escribio el");

    await hiloDeSoportePorOperador(OPERADOR, "empresa-1");

    const deLaEmpresa = estado.filas.find((f) => f.direccion === "DE_LA_EMPRESA");
    expect(deLaEmpresa?.leidoPorOperadorAt).not.toBeNull();
    const propio = estado.filas.find((f) => f.direccion === "DEL_OPERADOR");
    expect(propio?.leidoPorOperadorAt).toBeNull();
  });

  it("contadorSoportePorEmpresa agrupa por empresa, una sola consulta", async () => {
    await escribirSoporte(sesion({ companyId: "empresa-1" }), "de la 1");
    await escribirSoporte(sesion({ companyId: "empresa-2", permisos: ["soporte:usar"] }), "de la 2");
    await escribirSoporte(sesion({ companyId: "empresa-2", permisos: ["soporte:usar"] }), "otra de la 2");

    const contador = await contadorSoportePorEmpresa(OPERADOR);
    expect(contador.get("empresa-1")).toBe(1);
    expect(contador.get("empresa-2")).toBe(2);
  });
});
