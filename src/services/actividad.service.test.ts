import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * La actividad reciente del panel.
 *
 * LO QUE SE PROTEGE AQUI ES EL AISLAMIENTO POR EMPRESA, y no en una consulta
 * sino en TRES: los apuntes, las obras que nombran, y —la que faltaba— las
 * PERSONAS que figuran como autoras.
 *
 * El 19/08/2026 un cliente recien dado de alta vio en su panel «Administrador
 * GCM», el nombre de una persona de otra constructora. El apunte era suyo
 * —cuando el operador de GCM registra una empresa, el apunte queda a nombre de
 * la empresa nueva— pero su `userId` apunta a un usuario de OTRA empresa, y la
 * consulta que resuelve el nombre no filtraba por `companyId`. La de obras,
 * justo debajo, si lo hacia.
 *
 * No lo vio ninguna prueba: las de servicio doblan Prisma y no cruzaban
 * empresas, y la de humo abre la pantalla con una sola constructora en la
 * base. Por eso esta prueba existe con DOS empresas dentro.
 */

const OTRA_EMPRESA = "empresa-2";

const estado: {
  /// Los `where` con los que se pidio cada tabla, para poder afirmar sobre
  /// lo que se pregunta y no solo sobre lo que se devuelve.
  whereAudit: Record<string, unknown> | null;
  whereUsuarios: Record<string, unknown> | null;
  whereObras: Record<string, unknown> | null;
  apuntes: Record<string, unknown>[];
} = {
  whereAudit: null,
  whereUsuarios: null,
  whereObras: null,
  apuntes: [],
};

/// Las personas de la base: una de cada empresa.
const USUARIOS = [
  { id: "u-1", companyId: "empresa-1", nombres: "Ana", apellidos: "Quispe" },
  {
    id: "u-operador",
    companyId: OTRA_EMPRESA,
    nombres: "Administrador",
    apellidos: "GCM",
  },
];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      findMany: (args: { where: Record<string, unknown> }) => {
        estado.whereAudit = args.where;
        return Promise.resolve(estado.apuntes);
      },
    },
    user: {
      findMany: (args: { where: Record<string, unknown> }) => {
        estado.whereUsuarios = args.where;
        // El doble se comporta como la base: si piden companyId, filtra.
        const pedido = args.where["companyId"];
        return Promise.resolve(
          USUARIOS.filter((u) => pedido === undefined || u.companyId === pedido),
        );
      },
    },
    project: {
      findMany: (args: { where: Record<string, unknown> }) => {
        estado.whereObras = args.where;
        return Promise.resolve([]);
      },
    },
  },
}));

const { listarActividad } = await import("@/services/actividad.service");

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
    obrasAsignadas: null,
    nombres: "Ana",
    apellidos: "Quispe",
    email: "ana@constructora.pe",
  } as unknown as SesionActiva;
}

const ADMIN = sesion(["obra:leer"]);

function apunte(userId: string | null) {
  return {
    id: "a-1",
    userId,
    projectId: null,
    entidad: "Company",
    accion: "CREATE",
    antes: null,
    despues: { razonSocial: "CONSTRUCTORA NUEVA" },
    createdAt: new Date("2026-08-19T12:00:00Z"),
  };
}

beforeEach(() => {
  estado.whereAudit = null;
  estado.whereUsuarios = null;
  estado.whereObras = null;
  estado.apuntes = [];
});

describe("ninguna consulta se salta el aislamiento por empresa", () => {
  it("los apuntes se piden solo de esta empresa", async () => {
    estado.apuntes = [apunte("u-1")];
    await listarActividad(ADMIN);

    expect(estado.whereAudit).toMatchObject({ companyId: "empresa-1" });
  });

  /**
   * LA QUE FALTABA. Resolver un nombre es ensenarselo a alguien: el filtro
   * tiene que estar donde se lee, no confiado a que el apunte venga limpio.
   */
  it("los nombres de las personas, tambien", async () => {
    estado.apuntes = [apunte("u-operador")];
    await listarActividad(ADMIN);

    expect(estado.whereUsuarios).toMatchObject({ companyId: "empresa-1" });
  });

  it("y las obras que se nombran", async () => {
    estado.apuntes = [apunte("u-1")];
    await listarActividad(ADMIN);

    expect(estado.whereObras).toMatchObject({ companyId: "empresa-1" });
  });
});

describe("el autor de fuera de la empresa no se ensena", () => {
  /**
   * El caso exacto de produccion: el operador de GCM da de alta una
   * constructora, el apunte queda a nombre de la empresa NUEVA y con el
   * `userId` del operador, que vive en otra.
   */
  it("un apunte de esta empresa firmado por alguien de otra sale SIN autor", async () => {
    estado.apuntes = [apunte("u-operador")];

    const [linea] = await listarActividad(ADMIN);

    expect(linea).toBeDefined();
    expect(linea!.autor).toBeNull();
  });

  it("y no se cuela su nombre por ningun lado de la linea", async () => {
    estado.apuntes = [apunte("u-operador")];

    const [linea] = await listarActividad(ADMIN);

    expect(JSON.stringify(linea)).not.toContain("Administrador");
    expect(JSON.stringify(linea)).not.toContain("GCM");
  });

  it("el de dentro si se ensena: no se ha roto lo que funcionaba", async () => {
    estado.apuntes = [apunte("u-1")];

    const [linea] = await listarActividad(ADMIN);

    expect(linea!.autor).toBe("Ana Quispe");
  });

  it("un apunte sin autor sigue saliendo, como antes", async () => {
    estado.apuntes = [apunte(null)];

    const [linea] = await listarActividad(ADMIN);

    expect(linea).toBeDefined();
    expect(linea!.autor).toBeNull();
  });
});

describe("sin permiso para ver obras no hay actividad", () => {
  it("no se pregunta siquiera", async () => {
    estado.apuntes = [apunte("u-1")];

    const r = await listarActividad(sesion(["empresa:leer"]));

    expect(r).toEqual([]);
    expect(estado.whereAudit).toBeNull();
  });
});
