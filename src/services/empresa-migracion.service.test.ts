import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * El congelado de la empresa para migrarla.
 *
 * Lo que hay que sostener aqui no es el `update` —eso lo hace la base— sino
 * las tres decisiones que lo rodean, que son las que costarian caras:
 *
 * - que solo lo pueda hacer quien tiene `empresa:migrar`;
 * - que congelar dos veces NO pise la marca original, porque esa fecha es lo
 *   unico que delata un congelado olvidado;
 * - que la auditoria anote los cambios de verdad y no las pulsaciones.
 */

const estado: {
  enMigracionAt: Date | null;
  /// Los `where` de cada `updateMany`, para poder afirmar sobre la condicion.
  wheres: Record<string, unknown>[];
  apuntes: Record<string, unknown>[];
} = { enMigracionAt: null, wheres: [], apuntes: [] };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: {
      findUnique: () =>
        Promise.resolve({ enMigracionAt: estado.enMigracionAt }),
      // Se comporta como la base: el `where` decide si toca alguna fila.
      updateMany: (args: {
        where: Record<string, unknown>;
        data: { enMigracionAt: Date | null };
      }) => {
        estado.wheres.push(args.where);
        const pideLibre = args.where.enMigracionAt === null;
        const estaLibre = estado.enMigracionAt === null;
        if (pideLibre !== estaLibre) return Promise.resolve({ count: 0 });
        estado.enMigracionAt = args.data.enMigracionAt;
        return Promise.resolve({ count: 1 });
      },
    },
    auditLog: {
      create: (args: { data: Record<string, unknown> }) => {
        estado.apuntes.push(args.data);
        return Promise.resolve({});
      },
    },
  },
}));

const { congelarEmpresa, descongelarEmpresa, leerEstadoMigracion } =
  await import("@/services/empresa-migracion.service");

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
    // `null` es «alcanza todas las obras de su empresa». Sin este campo la
    // sesion no es valida: la lista vacia y el null son cosas opuestas.
    obrasAsignadas: null,
    nombres: "Ana",
    apellidos: "Quispe",
    email: "ana@constructora.pe",
  } as unknown as SesionActiva;
}

const ADMIN = sesion(["empresa:migrar"]);
const RESIDENTE = sesion(["obra:editar", "empresa:leer"]);

beforeEach(() => {
  estado.enMigracionAt = null;
  estado.wheres = [];
  estado.apuntes = [];
});

describe("quien puede congelar la empresa", () => {
  it("el residente no puede: pararia el trabajo de todos", async () => {
    const r = await congelarEmpresa(RESIDENTE);
    expect(r.ok).toBe(false);
    expect(estado.enMigracionAt).toBeNull();
    expect(estado.wheres).toEqual([]);
  });

  it("tampoco puede descongelar", async () => {
    estado.enMigracionAt = new Date("2026-08-19T12:00:00Z");
    const r = await descongelarEmpresa(RESIDENTE);
    expect(r.ok).toBe(false);
    expect(estado.enMigracionAt).not.toBeNull();
  });

  it("el administrador congela y descongela", async () => {
    expect((await congelarEmpresa(ADMIN)).ok).toBe(true);
    expect(estado.enMigracionAt).not.toBeNull();

    expect((await descongelarEmpresa(ADMIN)).ok).toBe(true);
    expect(estado.enMigracionAt).toBeNull();
  });
});

describe("congelar dos veces no borra cuando empezo", () => {
  /**
   * La fecha que interesa es la del PRIMER congelado: es lo que permite ver
   * que uno lleva puesto desde ayer. Si la segunda pulsacion la refrescara,
   * un congelado olvidado se veria siempre recien hecho.
   */
  it("la segunda pulsacion no pisa la marca de la primera", async () => {
    await congelarEmpresa(ADMIN);
    const primera = estado.enMigracionAt;

    await congelarEmpresa(ADMIN);
    expect(estado.enMigracionAt).toBe(primera);
  });

  it("la condicion viaja en el update, no en una consulta previa", async () => {
    await congelarEmpresa(ADMIN);
    expect(estado.wheres[0]).toEqual({
      id: "empresa-1",
      enMigracionAt: null,
    });
  });

  it("volver a congelar no es un error para quien pulsa", async () => {
    await congelarEmpresa(ADMIN);
    expect((await congelarEmpresa(ADMIN)).ok).toBe(true);
  });

  it("descongelar lo ya descongelado tampoco", async () => {
    expect((await descongelarEmpresa(ADMIN)).ok).toBe(true);
  });
});

describe("la auditoria anota los cambios, no las pulsaciones", () => {
  it("un apunte por cada cambio de verdad", async () => {
    await congelarEmpresa(ADMIN);
    await congelarEmpresa(ADMIN);
    await descongelarEmpresa(ADMIN);
    await descongelarEmpresa(ADMIN);

    expect(estado.apuntes.map((a) => (a.despues as { evento: string }).evento))
      .toEqual(["congelar", "descongelar"]);
  });

  it("el apunte dice quien fue y sobre que empresa", async () => {
    await congelarEmpresa(ADMIN);
    expect(estado.apuntes[0]).toMatchObject({
      companyId: "empresa-1",
      userId: "u-1",
      entidad: "Company",
      entidadId: "empresa-1",
    });
    expect((estado.apuntes[0]!.despues as { por: string }).por).toBe("Ana Quispe");
  });
});

describe("lo que ve la pantalla", () => {
  it("dice desde cuando, no solo que si", async () => {
    await congelarEmpresa(ADMIN);
    const e = await leerEstadoMigracion(ADMIN);
    expect(e.enMigracion).toBe(true);
    expect(e.desde).toBeInstanceOf(Date);
  });

  it("sin congelar, no hay fecha que ensenar", async () => {
    const e = await leerEstadoMigracion(ADMIN);
    expect(e).toEqual({ enMigracion: false, desde: null });
  });
});
