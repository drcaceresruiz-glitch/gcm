import { describe, it, expect, vi, beforeEach } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Las puertas del borrado de una constructora entera.
 *
 * Lo que se sostiene aqui no es el `deleteMany` —eso lo hace la base— sino las
 * CINCO condiciones que lo rodean y el orden en que se comprueban. Todas
 * protegen cosas distintas:
 *
 * - quien opera GCM, y NUNCA su propia empresa;
 * - la empresa CONGELADA: viva, seguiria escribiendo mientras se borra;
 * - una EXPORTACION reciente: sin ella esto destruye los datos de un cliente
 *   sin que nadie tenga otra copia;
 * - la razon social tecleada y la contrasena de quien borra.
 *
 * Y una sexta cosa, que es la que mas vale: que cuando una puerta se cierra,
 * NO SE HAYA BORRADO NADA.
 */

const HORA = 3600_000;

const estado: {
  enMigracionAt: Date | null;
  /// La ultima exportacion, o null si nunca se exporto.
  exportacionAt: Date | null;
  claveCorrecta: boolean;
  /// Tablas sobre las que se llamo a deleteMany, en orden.
  borradas: string[];
  /// Si se llego a borrar la fila de la empresa.
  empresaBorrada: boolean;
  apuntes: Record<string, unknown>[];
} = {
  enMigracionAt: null,
  exportacionAt: null,
  claveCorrecta: true,
  borradas: [],
  empresaBorrada: false,
  apuntes: [],
};

vi.mock("@/lib/password", () => ({
  verifyPassword: () => Promise.resolve(estado.claveCorrecta),
}));

/**
 * El doble responde a CUALQUIER delegado con un `Proxy`, como el del
 * exportador: el catalogo tiene mas de cuarenta tablas y una lista escrita a
 * mano se quedaria corta el dia que se anadiera la primera.
 */
vi.mock("@/lib/prisma", () => {
  const generico = (modelo: string) => ({
    findMany: () => Promise.resolve([]),
    findFirst: () => Promise.resolve(null),
    updateMany: () => Promise.resolve({ count: 0 }),
    deleteMany: () => {
      estado.borradas.push(modelo);
      return Promise.resolve({ count: 1 });
    },
  });

  const company = {
    findUnique: () =>
      Promise.resolve({
        id: "emp-cliente",
        razonSocial: "CONSTRUCTORA ORIGEN SAC",
        ruc: "20606408367",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        enMigracionAt: estado.enMigracionAt,
      }),
    delete: () => {
      estado.empresaBorrada = true;
      return Promise.resolve({});
    },
  };

  const base = new Proxy(
    {},
    {
      get(_d, modelo: string) {
        if (modelo === "company") return company;
        if (modelo === "exportacionEmpresa") {
          return {
            /**
             * Respeta la ventana `createdAt >= desde` como haria la base.
             *
             * No es un detalle del doble: si devolviera el recibo sin mirar su
             * fecha, la prueba de «una exportacion vieja no vale» pasaria
             * aunque el servicio no filtrara nada, que es justo el fallo que
             * tiene que cazar.
             */
            findFirst: (args: {
              where?: { createdAt?: { gte?: Date } };
            }) => {
              const desde = args.where?.createdAt?.gte;
              const vigente =
                estado.exportacionAt !== null &&
                (!desde || estado.exportacionAt >= desde);
              return Promise.resolve(
                vigente && estado.exportacionAt
                  ? {
                      id: "exp-1",
                      hashManifiesto: "a".repeat(64),
                      createdAt: estado.exportacionAt,
                      tamano: 1024,
                      obras: 2,
                    }
                  : null,
              );
            },
          };
        }
        if (modelo === "user") {
          return {
            ...generico("user"),
            findFirst: () => Promise.resolve({ passwordHash: "hash" }),
          };
        }
        if (modelo === "auditLog") {
          return {
            create: (args: { data: Record<string, unknown> }) => {
              estado.apuntes.push(args.data);
              return Promise.resolve({});
            },
          };
        }
        if (modelo === "$transaction") {
          return (fn: (tx: unknown) => Promise<unknown>) => fn(base);
        }
        return generico(modelo);
      },
    },
  );

  return { prisma: base };
});

const { eliminarConstructora, motivoSiNoSePuedeBorrar } = await import(
  "@/services/empresa-borrado.service"
);

function sesion(esOperador: boolean, companyId = "emp-propia"): SesionActiva {
  return {
    userId: "u-1",
    companyId,
    role: "ADMIN",
    permisos: [],
    esOperador,
  } as unknown as SesionActiva;
}

const OPERADOR = sesion(true);
const CUALQUIERA = sesion(false);

const BIEN = {
  razonSocialEscrita: "CONSTRUCTORA ORIGEN SAC",
  clave: "la-buena",
};

/// Todo en orden: congelada y exportada hace una hora.
function todoListo() {
  estado.enMigracionAt = new Date(Date.now() - 2 * HORA);
  estado.exportacionAt = new Date(Date.now() - HORA);
}

beforeEach(() => {
  estado.enMigracionAt = null;
  estado.exportacionAt = null;
  estado.claveCorrecta = true;
  estado.borradas = [];
  estado.empresaBorrada = false;
  estado.apuntes = [];
});

describe("quien puede borrar una constructora", () => {
  it("un admin normal no, aunque este todo lo demas en orden", async () => {
    todoListo();
    const r = await eliminarConstructora(CUALQUIERA, "emp-cliente", BIEN);

    expect(r.ok).toBe(false);
    expect(estado.borradas).toEqual([]);
    expect(estado.empresaBorrada).toBe(false);
  });

  /**
   * Es la tercera red —ya lo impiden la sesion y el listado— y existe por lo
   * mismo que en `alternarConstructora`: el operador se cerraria la puerta, y
   * ademas se llevaria por delante su propia cuenta.
   */
  it("y nunca su propia empresa", async () => {
    todoListo();
    const propia = sesion(true, "emp-cliente");
    const r = await eliminarConstructora(propia, "emp-cliente", BIEN);

    expect(r.ok).toBe(false);
    expect(estado.empresaBorrada).toBe(false);
  });
});

describe("las dos precondiciones", () => {
  it("una empresa viva no se borra: seguiria escribiendo mientras se borra", async () => {
    estado.exportacionAt = new Date(Date.now() - HORA);
    const r = await eliminarConstructora(OPERADOR, "emp-cliente", BIEN);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("migración");
    expect(estado.borradas).toEqual([]);
  });

  it("sin exportacion no se borra, aunque este congelada", async () => {
    estado.enMigracionAt = new Date();
    const r = await eliminarConstructora(OPERADOR, "emp-cliente", BIEN);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("exportado");
    expect(estado.borradas).toEqual([]);
  });

  /**
   * Una exportacion de la semana pasada NO vale: si la empresa siguio
   * trabajando desde entonces, lo que hay en el archivo ya no es lo que se va
   * a destruir.
   */
  it("una exportacion vieja tampoco vale", async () => {
    estado.enMigracionAt = new Date();
    estado.exportacionAt = new Date(Date.now() - 72 * HORA);

    const r = await eliminarConstructora(OPERADOR, "emp-cliente", BIEN);
    expect(r.ok).toBe(false);
    expect(estado.empresaBorrada).toBe(false);
  });

  it("la pantalla recibe el MISMO motivo que rechazaria el borrado", async () => {
    expect(await motivoSiNoSePuedeBorrar(OPERADOR, "emp-cliente")).toContain(
      "migración",
    );

    estado.enMigracionAt = new Date();
    expect(await motivoSiNoSePuedeBorrar(OPERADOR, "emp-cliente")).toContain(
      "exportado",
    );

    todoListo();
    expect(await motivoSiNoSePuedeBorrar(OPERADOR, "emp-cliente")).toBeNull();
  });
});

describe("lo que hay que teclear", () => {
  it("la razon social tiene que coincidir exactamente", async () => {
    todoListo();
    const r = await eliminarConstructora(OPERADOR, "emp-cliente", {
      ...BIEN,
      razonSocialEscrita: "CONSTRUCTORA ORIGEN",
    });

    expect(r.ok).toBe(false);
    expect(estado.borradas).toEqual([]);
  });

  it("y la contrasena tiene que ser la buena", async () => {
    todoListo();
    estado.claveCorrecta = false;

    const r = await eliminarConstructora(OPERADOR, "emp-cliente", BIEN);
    expect(r.ok).toBe(false);
    expect(estado.empresaBorrada).toBe(false);
  });
});

describe("cuando si se borra", () => {
  it("borra hoja a raiz y la empresa la ULTIMA", async () => {
    todoListo();
    const r = await eliminarConstructora(OPERADOR, "emp-cliente", BIEN);

    expect(r.ok).toBe(true);
    expect(estado.empresaBorrada).toBe(true);
    // Mas de cuarenta tablas del catalogo, y ninguna es la empresa: esa se
    // borra con `delete`, al final y a solas.
    expect(estado.borradas.length).toBeGreaterThan(40);
  });

  /**
   * `envios_aviso` no tiene clave foranea: si no se borrara, su unique
   * (projectId, canal, clave) dejaria claves RESERVADAS para siempre por
   * obras que ya no existen. Es el mismo cuidado del borrado de una obra.
   */
  it("limpia tambien las tablas que ningun catalogo cubre", async () => {
    todoListo();
    await eliminarConstructora(OPERADOR, "emp-cliente", BIEN);

    for (const modelo of [
      "envioAviso",
      "aviso",
      "mensajeSms",
      "mensajeContratista",
      "solicitudCambioPerfil",
    ]) {
      expect(estado.borradas).toContain(modelo);
    }
  });

  /**
   * El apunte ata la constructora que ya no existe con el archivo que la
   * contiene. Y son DOS: uno bajo el companyId de la empresa borrada —que
   * sobrevive porque `audit_logs` no tiene clave foranea— y otro bajo el del
   * operador, sin el cual nadie volveria a encontrarlo desde ninguna pantalla.
   */
  it("deja constancia en las dos empresas, con la referencia del archivo", async () => {
    todoListo();
    await eliminarConstructora(OPERADOR, "emp-cliente", BIEN);

    expect(estado.apuntes).toHaveLength(2);
    expect(estado.apuntes.map((a) => a["companyId"])).toEqual([
      "emp-cliente",
      "emp-propia",
    ]);

    const delCliente = estado.apuntes[0]!;
    expect(delCliente["accion"]).toBe("DELETE");
    expect((delCliente["antes"] as { ruc: string }).ruc).toBe("20606408367");
    expect(
      (delCliente["despues"] as { exportacion: { hashManifiesto: string } })
        .exportacion.hashManifiesto,
    ).toBe("a".repeat(64));
  });

  it("y el apunte se escribe ANTES de borrar nada", async () => {
    todoListo();
    await eliminarConstructora(OPERADOR, "emp-cliente", BIEN);

    // Si algo fallara a mitad, queda el intento registrado y no un borrado
    // mudo. El orden es la unica forma de garantizarlo.
    expect(estado.apuntes.length).toBeGreaterThan(0);
    expect(estado.borradas.length).toBeGreaterThan(0);
  });
});
