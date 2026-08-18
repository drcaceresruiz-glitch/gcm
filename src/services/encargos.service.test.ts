import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Las guardas de `crearEncargo`, que es donde se reparte el trabajo de la
 * obra entre contratistas.
 *
 * Sin base de datos: Prisma doblado, como en `partidas`, `movimientos` y
 * `ordenes`. Se comprueba que el servicio se NIEGUE antes de escribir.
 *
 * La invariante del modulo es la del frente: una partida se puede fraccionar
 * entre varios proveedores, pero la suma de las fracciones VIGENTES no puede
 * pasar del 100 %. Si se pasa, la obra queda contratada por encima de lo que
 * hay que hacer y nadie se entera hasta valorizar.
 */

interface FilaWbs {
  id: string;
  codigoPartida: string;
  /// Lo que YA tienen asignado otros encargos vigentes, en porcentaje.
  encargos: { fraccion: string }[];
}

const estado: {
  obra: { id: string } | null;
  proveedor: { id: string; tipoImpuesto: string } | null;
  /// Solo aparecen aqui las que la consulta deja ver: son de ESTA obra, de
  /// esta empresa, y de tipo PARTIDA. Vaciarlo simula cualquiera de las tres.
  partidas: FilaWbs[];
  cerrada: string | null;
  creados: Record<string, unknown>[];
  /// El `where` con el que el servicio pidio los encargos ya asignados. Es
  /// lo unico observable del filtro por estado desde aqui.
  filtroEncargos: Record<string, unknown> | null;
} = {
  obra: { id: "obra-1" },
  proveedor: { id: "prov-1", tipoImpuesto: "IGV" },
  partidas: [],
  cerrada: null,
  creados: [],
  filtroEncargos: null,
};

vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: () => Promise.resolve(estado.cerrada),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    encargoProveedor: {
      aggregate: () => Promise.resolve({ _max: { numero: 3 } }),
      create: (args: { data: Record<string, unknown> }) => {
        estado.creados.push(args.data);
        return Promise.resolve({ id: "encargo-nuevo" });
      },
    },
    auditLog: { create: () => Promise.resolve({}) },
  };

  return {
    prisma: {
      project: { findFirst: () => Promise.resolve(estado.obra) },
      proveedor: { findFirst: () => Promise.resolve(estado.proveedor) },
      wbsItem: {
        findMany: (args: {
          where: { id: { in: string[] } };
          select?: { encargos?: { where?: { encargo?: Record<string, unknown> } } };
        }) => {
          estado.filtroEncargos = args.select?.encargos?.where?.encargo ?? null;
          return Promise.resolve(
            estado.partidas.filter((p) => args.where.id.in.includes(p.id)),
          );
        },
      },
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    },
  };
});

const { crearEncargo } = await import("@/services/encargos.service");

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
    nombre: "Quien sea",
  } as unknown as SesionActiva;
}

const CON_PERMISO = sesion(["encargo:gestionar"]);

/** Encargo valido: una partida libre, entera. */
function encargo(cambios: Record<string, unknown> = {}) {
  return {
    proveedorId: "prov-1",
    descripcion: "Encofrado y vaciado de zapatas",
    montoContratado: "25000.00",
    partidas: [{ wbsItemId: "p-1", fraccion: "100" }],
    ...cambios,
  };
}

/** Una partida de la obra con lo que ya tenga asignado. */
function partida(id: string, yaAsignado: string[] = []): FilaWbs {
  return {
    id,
    codigoPartida: `01.01.${id.slice(-1).padStart(2, "0")}`,
    encargos: yaAsignado.map((fraccion) => ({ fraccion })),
  };
}

beforeEach(() => {
  estado.obra = { id: "obra-1" };
  estado.proveedor = { id: "prov-1", tipoImpuesto: "IGV" };
  estado.partidas = [partida("p-1")];
  estado.cerrada = null;
  estado.creados = [];
  estado.filtroEncargos = null;
});

function seNego(r: { ok: boolean; error?: string }, trozo: string) {
  expect(r.ok).toBe(false);
  expect(!r.ok && r.error).toContain(trozo);
  expect(estado.creados).toHaveLength(0);
}

describe("crearEncargo: el camino bueno", () => {
  it("un encargo sobre una partida libre se guarda y numera por obra", async () => {
    // Sin esta, una funcion que rechazara todo pasaria las demas.
    const r = await crearEncargo(CON_PERMISO, "obra-1", encargo());
    expect(r.ok).toBe(true);
    expect(estado.creados).toHaveLength(1);
    // El correlativo sale del maximo de la obra, no de un contador global.
    expect(estado.creados[0]).toMatchObject({ numero: 4 });
  });
});

describe("crearEncargo: una partida no se contrata dos veces", () => {
  it("fraccionar entre proveedores es valido mientras no se pase del 100", async () => {
    // El caso legitimo: 60 % ya dado a otro, se contrata el 40 % restante.
    estado.partidas = [partida("p-1", ["60"])];
    const r = await crearEncargo(
      CON_PERMISO,
      "obra-1",
      encargo({ partidas: [{ wbsItemId: "p-1", fraccion: "40" }] }),
    );
    expect(r.ok).toBe(true);
  });

  it("pasarse del 100 % entre proveedores se rechaza nombrando la partida", async () => {
    // ESTA es la invariante. Si se rompe, la obra queda contratada por
    // encima de lo que hay que ejecutar y no se nota hasta valorizar.
    estado.partidas = [partida("p-1", ["60"])];
    const r = await crearEncargo(
      CON_PERMISO,
      "obra-1",
      encargo({ partidas: [{ wbsItemId: "p-1", fraccion: "50" }] }),
    );
    seNego(r, "por encima del 100");
  });

  it("al sumar lo ya asignado pide SOLO los encargos vigentes", async () => {
    // No se puede comprobar filtrando en el doble —seria el doble
    // demostrandose a si mismo—, asi que se comprueba lo que SI es
    // observable: que la consulta pida `estado: "VIGENTE"`. Si alguien lo
    // quitara, un encargo anulado seguiria ocupando la partida y nadie
    // podria recontratarla. `tsc` no ve este tipo de cambio.
    await crearEncargo(CON_PERMISO, "obra-1", encargo());
    expect(estado.filtroEncargos).toMatchObject({ estado: "VIGENTE" });
  });

  it("la misma partida dos veces en el mismo encargo se rechaza", async () => {
    // Sin esto, 60 + 60 dentro del mismo encargo pasaria la comprobacion del
    // frente, que mira los OTROS encargos.
    const r = await crearEncargo(
      CON_PERMISO,
      "obra-1",
      encargo({
        partidas: [
          { wbsItemId: "p-1", fraccion: "60" },
          { wbsItemId: "p-1", fraccion: "60" },
        ],
      }),
    );
    seNego(r, "dos veces en el mismo encargo");
  });
});

describe("crearEncargo: que se puede encargar y a quien", () => {
  it("un capitulo no se encarga: la consulta solo trae partidas", async () => {
    // `verificarFrente` filtra por tipo PARTIDA. Un capitulo no aparece, y
    // para el servicio no esta en el presupuesto.
    estado.partidas = [];
    const r = await crearEncargo(CON_PERMISO, "obra-1", encargo());
    seNego(r, "no esta en el presupuesto de esta obra");
  });

  it("un proveedor de otra empresa no vale", async () => {
    estado.proveedor = null;
    const r = await crearEncargo(CON_PERMISO, "obra-1", encargo());
    seNego(r, "no es de tu empresa");
  });

  it("una obra de otra empresa no se encuentra", async () => {
    estado.obra = null;
    const r = await crearEncargo(CON_PERMISO, "obra-1", encargo());
    seNego(r, "Obra no encontrada");
  });
});

describe("crearEncargo: quien puede, cuando, y que llega", () => {
  it("sin el permiso de gestionar encargos, no crea nada", async () => {
    const r = await crearEncargo(sesion([]), "obra-1", encargo());
    seNego(r, "No tienes permiso");
  });

  it("con la obra cerrada se niega, aunque tenga permiso", async () => {
    estado.cerrada = "La obra esta cerrada desde el 01/07/2026.";
    const r = await crearEncargo(CON_PERMISO, "obra-1", encargo());
    seNego(r, "cerrada");
  });

  it("sin descripcion no se guarda", async () => {
    const r = await crearEncargo(
      CON_PERMISO,
      "obra-1",
      encargo({ descripcion: "   " }),
    );
    seNego(r, "necesita una descripcion");
  });

  it("un monto negativo se rechaza", async () => {
    const r = await crearEncargo(
      CON_PERMISO,
      "obra-1",
      encargo({ montoContratado: "-1000.00" }),
    );
    seNego(r, "no negativo");
  });

  it("un encargo sin ninguna partida no encarga nada", async () => {
    const r = await crearEncargo(CON_PERMISO, "obra-1", encargo({ partidas: [] }));
    seNego(r, "al menos una partida");
  });

  it("una fraccion de cero no reparte nada y se rechaza", async () => {
    const r = await crearEncargo(
      CON_PERMISO,
      "obra-1",
      encargo({ partidas: [{ wbsItemId: "p-1", fraccion: "0" }] }),
    );
    seNego(r, "entre 0 y 100");
  });

  it("una fraccion mayor que 100 se rechaza", async () => {
    const r = await crearEncargo(
      CON_PERMISO,
      "obra-1",
      encargo({ partidas: [{ wbsItemId: "p-1", fraccion: "120" }] }),
    );
    seNego(r, "entre 0 y 100");
  });
});
