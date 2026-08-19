import { describe, it, expect, vi, beforeEach } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * El area del operador: ver una constructora por dentro y corregir su alta.
 *
 * Este servicio no tenia NINGUNA prueba, y es el unico del sistema que toca
 * filas de una empresa que no es la de la sesion. Lo que se sostiene aqui:
 *
 * - que fuera del operador no se ve ni se cambia nada;
 * - que la ficha se queda en identificacion y contadores —el dia que alguien
 *   anada el nombre de una obra, esta prueba lo dice—;
 * - que una empresa congelada no se edita a media migracion;
 * - que la auditoria guarda el ANTES, sin el cual un RUC corregido es
 *   irreconstruible.
 */

interface FilaEmpresa {
  id: string;
  razonSocial: string;
  ruc: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  activa: boolean;
  enMigracionAt: Date | null;
  createdAt: Date;
  _count: { users: number; projects: number };
}

const EMPRESA: FilaEmpresa = {
  id: "emp-cliente",
  razonSocial: "CONSTRUCTORA ORIGEN SAC",
  ruc: "20606408367",
  direccion: "Av. Siempre Viva 123",
  telefono: null,
  email: null,
  activa: true,
  enMigracionAt: null,
  createdAt: new Date("2026-08-07T00:00:00Z"),
  _count: { users: 1, projects: 0 },
};

const estado: {
  empresa: FilaEmpresa | null;
  /// El `select` con el que se pidio la ficha, para poder afirmar sobre EL.
  selects: Record<string, unknown>[];
  actualizada: Record<string, unknown> | null;
  apuntes: Record<string, unknown>[];
  /// Simula el unico global de `ruc`.
  rucOcupado: string | null;
  exportacion: { createdAt: Date; obras: number; tamano: number } | null;
} = {
  empresa: { ...EMPRESA },
  selects: [],
  actualizada: null,
  apuntes: [],
  rucOcupado: null,
  exportacion: null,
};

vi.mock("@/lib/prisma", () => {
  const company = {
    findUnique: (args: { select?: Record<string, unknown> }) => {
      if (args.select) estado.selects.push(args.select);
      return Promise.resolve(estado.empresa);
    },
    update: (args: { data: Record<string, unknown> }) => {
      if (
        estado.rucOcupado !== null &&
        args.data["ruc"] === estado.rucOcupado
      ) {
        // Como la base: choque del unico global de RUC.
        return Promise.reject(Object.assign(new Error("unique"), { code: "P2002" }));
      }
      estado.actualizada = args.data;
      return Promise.resolve({});
    },
  };
  const auditLog = {
    create: (args: { data: Record<string, unknown> }) => {
      estado.apuntes.push(args.data);
      return Promise.resolve({});
    },
  };
  /// El recibo de la ultima exportacion. Vive en su propia tabla porque NO
  /// cuelga de la empresa: tiene que sobrevivir a su borrado.
  const exportacionEmpresa = {
    findFirst: () => Promise.resolve(estado.exportacion),
  };
  return {
    prisma: {
      company,
      auditLog,
      exportacionEmpresa,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ company, auditLog }),
    },
  };
});

const { detalleConstructora, editarConstructora } = await import(
  "@/services/operador.service"
);

function sesion(esOperador: boolean): SesionActiva {
  return {
    userId: "u-1",
    companyId: "emp-propia",
    role: "ADMIN",
    permisos: ["empresa:editar"],
    esOperador,
  } as unknown as SesionActiva;
}

const OPERADOR = sesion(true);
const CUALQUIERA = sesion(false);

const DATOS = {
  razonSocial: "CONSTRUCTORA ORIGEN SAC",
  ruc: "20606408367",
  direccion: "Av. Siempre Viva 123",
  telefono: "",
  email: "",
};

beforeEach(() => {
  estado.empresa = { ...EMPRESA };
  estado.selects = [];
  estado.actualizada = null;
  estado.apuntes = [];
  estado.rucOcupado = null;
  estado.exportacion = null;
});

describe("solo el operador", () => {
  it("un admin normal no ve la ficha de otra empresa", async () => {
    expect(await detalleConstructora(CUALQUIERA, "emp-cliente")).toBeNull();
  });

  it("un admin normal no puede editarla", async () => {
    const r = await editarConstructora(CUALQUIERA, "emp-cliente", DATOS);
    expect(r.ok).toBe(false);
    expect(estado.actualizada).toBeNull();
    // Y ni siquiera se pregunto por ella: la guarda va ANTES de leer.
    expect(estado.selects).toEqual([]);
  });
});

describe("la ficha no asoma los datos del cliente", () => {
  /**
   * La regla de `listarConstructoras` vale igual con un id delante. Si algun
   * dia alguien anade `projects: { select: { nombreObra } }` "solo para ver
   * cuales son", esto se pone rojo.
   */
  it("solo pide identificacion, contacto, estado y CONTADORES", async () => {
    await detalleConstructora(OPERADOR, "emp-cliente");

    const campos = Object.keys(estado.selects[0] ?? {});
    expect(campos.sort()).toEqual(
      [
        "_count",
        "activa",
        "createdAt",
        "direccion",
        "email",
        "enMigracionAt",
        "id",
        "razonSocial",
        "ruc",
        "telefono",
      ].sort(),
    );

    const contadores = Object.keys(
      (estado.selects[0]?.["_count"] as { select: Record<string, unknown> })
        .select,
    );
    expect(contadores.sort()).toEqual(["projects", "users"]);
  });

  /**
   * El recibo NO cuelga de la empresa —no tiene clave foranea, para poder
   * sobrevivir a su borrado—, asi que llega por su propia consulta. Sin el,
   * «nunca se ha exportado» y «se exporto ayer» se verian igual, que es
   * justo lo que no puede pasar antes de plantearse un borrado.
   */
  it("dice si hay copia completa y de cuando, o que no hay ninguna", async () => {
    const sinCopia = await detalleConstructora(OPERADOR, "emp-cliente");
    expect(sinCopia?.ultimaExportacion).toBeNull();

    estado.exportacion = {
      createdAt: new Date("2026-08-19T10:00:00Z"),
      obras: 4,
      tamano: 12_345_678,
    };
    const conCopia = await detalleConstructora(OPERADOR, "emp-cliente");
    expect(conCopia?.ultimaExportacion).toEqual({
      at: new Date("2026-08-19T10:00:00Z"),
      obras: 4,
      tamano: 12_345_678,
    });
  });

  it("marca cual es la propia empresa del operador", async () => {
    const ajena = await detalleConstructora(OPERADOR, "emp-cliente");
    expect(ajena?.esLaPropia).toBe(false);

    estado.empresa = { ...EMPRESA, id: "emp-propia" };
    const propia = await detalleConstructora(OPERADOR, "emp-propia");
    expect(propia?.esLaPropia).toBe(true);
  });
});

describe("corregir un alta", () => {
  it("guarda y deja el ANTES en la auditoria", async () => {
    const r = await editarConstructora(OPERADOR, "emp-cliente", {
      ...DATOS,
      ruc: "20601689988",
      telefono: "987654321",
    });

    expect(r.ok).toBe(true);
    expect(estado.actualizada?.["ruc"]).toBe("20601689988");

    const apunte = estado.apuntes[0];
    expect((apunte?.["antes"] as Record<string, string>)["ruc"]).toBe(
      "20606408367",
    );
    expect((apunte?.["despues"] as Record<string, string>)["ruc"]).toBe(
      "20601689988",
    );
  });

  it("rechaza un RUC que no son 11 digitos, antes de tocar la base", async () => {
    const r = await editarConstructora(OPERADOR, "emp-cliente", {
      ...DATOS,
      ruc: "2060-6408367",
    });
    expect(r.ok).toBe(false);
    expect(estado.actualizada).toBeNull();
  });

  it("dice claro que ese RUC ya es de otra constructora", async () => {
    estado.rucOcupado = "20111111111";
    const r = await editarConstructora(OPERADOR, "emp-cliente", {
      ...DATOS,
      ruc: "20111111111",
    });
    expect(r).toEqual({
      ok: false,
      error: "Ya existe otra constructora con ese RUC.",
    });
  });

  it("no toca una empresa congelada a media migracion", async () => {
    estado.empresa = {
      ...EMPRESA,
      enMigracionAt: new Date("2026-08-19T10:00:00Z"),
    };

    const r = await editarConstructora(OPERADOR, "emp-cliente", {
      ...DATOS,
      razonSocial: "OTRO NOMBRE SAC",
    });

    expect(r.ok).toBe(false);
    expect(estado.actualizada).toBeNull();
    expect(estado.apuntes).toEqual([]);
  });

  it("si no existe, lo dice en vez de crearla", async () => {
    estado.empresa = null;
    const r = await editarConstructora(OPERADOR, "no-existe", DATOS);
    expect(r).toEqual({ ok: false, error: "Constructora no encontrada." });
  });
});
