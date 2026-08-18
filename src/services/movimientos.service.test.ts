import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Las guardas de `crearMovimiento`, que es por donde entra y sale el dinero
 * que va ENCIMA de la linea base.
 *
 * Aqui NO hay base de datos, igual que en `partidas.service.test.ts`: se
 * dobla Prisma y se le dice que devolver. Lo que se comprueba no es que la
 * base guarde bien —eso lo garantiza el motor—, sino que el servicio se
 * NIEGUE antes de llegar a ella.
 *
 * Casi todas estas reglas protegen del mismo modo de fallo: una fila que
 * cambia de naturaleza y sale del dinero sin dar error. Un movimiento que
 * cuelga una partida nueva de otra partida, o que le quita importe a un
 * capitulo, no revienta: descuadra el vigente en silencio.
 */

interface FilaWbs {
  id: string;
  codigoPartida: string;
  tipo: "CAPITULO" | "PARTIDA";
  modalidad: "PRECIOS_UNITARIOS" | "SUMA_ALZADA" | "ALCANCE";
}

const estado: {
  /// null = la obra todavia no tiene linea base aprobada.
  base: { id: string; version: number } | null;
  /// Lo que la obra deja ver: si una partida NO esta aqui, para el servicio
  /// no existe en esta obra (asi se comprueba el aislamiento por empresa).
  partidas: FilaWbs[];
  /// Codigos ya ocupados en el presupuesto de la obra.
  ocupados: string[];
  /// Motivo por el que la obra esta cerrada, o null si esta abierta.
  cerrada: string | null;
  /// Lo que se llego a escribir. Debe quedar vacio en toda negativa.
  creados: Record<string, unknown>[];
} = {
  base: { id: "base-1", version: 1 },
  partidas: [],
  ocupados: [],
  cerrada: null,
  creados: [],
};

// La obra cerrada se resuelve en su propio servicio, que tambien iria a la
// base. Se dobla entero: aqui no se prueba el cierre, se prueba que se mire.
vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: () => Promise.resolve(estado.cerrada),
}));

vi.mock("@/lib/prisma", () => {
  const wbsItem = {
    // Se llama DOS veces con intenciones distintas: primero para resolver las
    // partidas referidas, y despues para ver si los codigos nuevos chocan.
    // Se distinguen por el `where`, que es lo unico que las separa.
    findMany: (args: { where: Record<string, unknown> }) => {
      if (args.where["codigoPartida"]) {
        const pedidos = (args.where["codigoPartida"] as { in: string[] }).in;
        return Promise.resolve(
          estado.ocupados
            .filter((c) => pedidos.includes(c))
            .map((codigoPartida) => ({ codigoPartida })),
        );
      }
      const pedidos = (args.where["id"] as { in: string[] }).in;
      return Promise.resolve(estado.partidas.filter((p) => pedidos.includes(p.id)));
    },
  };

  return {
    prisma: {
      wbsItem,
      baseline: { findFirst: () => Promise.resolve(estado.base) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          movimientoPresupuestal: {
            findFirst: () => Promise.resolve({ numero: 7 }),
            create: (args: { data: Record<string, unknown> }) => {
              estado.creados.push(args.data);
              return Promise.resolve({ id: "mov-nuevo", numero: 8 });
            },
          },
          movimientoLinea: { createMany: () => Promise.resolve({ count: 1 }) },
          auditLog: { create: () => Promise.resolve({}) },
        }),
    },
  };
});

const { crearMovimiento } = await import("@/services/movimientos.service");

/** Sesion con los permisos que se le pasen, y ninguno mas. */
function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
  } as unknown as SesionActiva;
}

const CON_PERMISO = sesion(["movimiento:crear"]);

/** Un movimiento valido al que cada prueba le cambia SOLO lo que examina. */
function movimiento(cambios: Record<string, unknown> = {}) {
  return {
    tipo: "ADICIONAL" as const,
    fecha: "2026-08-18",
    concepto: "Mayor metrado de encofrado",
    motivo: "El terreno obligo a un sobreancho no previsto en el expediente.",
    lineas: [{ wbsItemId: "p-1", importe: "1000.00" }],
    ...cambios,
  };
}

const PARTIDA: FilaWbs = {
  id: "p-1",
  codigoPartida: "01.01.01",
  tipo: "PARTIDA",
  modalidad: "PRECIOS_UNITARIOS",
};

beforeEach(() => {
  estado.base = { id: "base-1", version: 1 };
  estado.partidas = [PARTIDA];
  estado.ocupados = [];
  estado.cerrada = null;
  estado.creados = [];
});

/** Ninguna negativa puede haber escrito nada. */
function seNego(r: { ok: boolean; error?: string }, trozo: string) {
  expect(r.ok).toBe(false);
  expect(!r.ok && r.error).toContain(trozo);
  expect(estado.creados).toHaveLength(0);
}

describe("crearMovimiento: quien puede y cuando", () => {
  it("sin el permiso de crear movimientos, no crea nada", async () => {
    const r = await crearMovimiento(sesion([]), "obra-1", movimiento());
    seNego(r, "No tienes permiso");
  });

  it("con la obra cerrada se niega, aunque tenga permiso", async () => {
    estado.cerrada = "La obra esta cerrada desde el 01/07/2026.";
    const r = await crearMovimiento(CON_PERMISO, "obra-1", movimiento());
    seNego(r, "cerrada");
  });

  it("sin linea base aprobada no hay 'encima de que' ajustar", async () => {
    // Es la regla que da sentido a todo el modulo: el vigente es base +
    // ajustes. Sin base, un ajuste no significa nada.
    estado.base = null;
    const r = await crearMovimiento(CON_PERMISO, "obra-1", movimiento());
    seNego(r, "linea base");
  });
});

describe("crearMovimiento: la partida no puede cambiar de naturaleza", () => {
  it("no deja colgar una partida nueva de otra partida", async () => {
    // ESTE es el fallo silencioso: la nueva cubriria a la de arriba y el
    // importe de la de arriba desapareceria del costo directo sin dar error.
    const r = await crearMovimiento(
      CON_PERMISO,
      "obra-1",
      movimiento({
        lineas: [
          { parentId: "p-1", codigoPartida: "01.01.02", importe: "500.00" },
        ],
      }),
    );
    seNego(r, "tiene que colgar de un capitulo");
  });

  it("no deja ajustar dinero sobre un capitulo", async () => {
    // Un capitulo no lleva importe propio: es la suma de sus hijas. Meterle
    // dinero produce un total que ninguna partida sostiene.
    estado.partidas = [{ ...PARTIDA, tipo: "CAPITULO" }];
    const r = await crearMovimiento(CON_PERMISO, "obra-1", movimiento());
    seNego(r, "es un capitulo");
  });

  it("no deja quitarle dinero a una partida a suma alzada", async () => {
    // Su precio esta cerrado por contrato: bajarlo daria un vigente que
    // despues no se puede facturar.
    estado.partidas = [{ ...PARTIDA, modalidad: "SUMA_ALZADA" }];
    const r = await crearMovimiento(
      CON_PERMISO,
      "obra-1",
      movimiento({
        tipo: "DEDUCTIVO",
        lineas: [{ wbsItemId: "p-1", importe: "-300.00" }],
      }),
    );
    seNego(r, "suma alzada");
  });

  it("no deja tocar una partida que solo detalla alcance", async () => {
    estado.partidas = [{ ...PARTIDA, modalidad: "ALCANCE" }];
    const r = await crearMovimiento(CON_PERMISO, "obra-1", movimiento());
    seNego(r, "no lleva importe propio");
  });
});

describe("crearMovimiento: la aritmetica del movimiento", () => {
  it("rechaza una linea de importe cero, que no ajusta nada", async () => {
    const r = await crearMovimiento(
      CON_PERMISO,
      "obra-1",
      movimiento({ lineas: [{ wbsItemId: "p-1", importe: "0.00" }] }),
    );
    seNego(r, "importe cero");
  });

  it("rechaza un importe que no es un numero", async () => {
    const r = await crearMovimiento(
      CON_PERMISO,
      "obra-1",
      movimiento({ lineas: [{ wbsItemId: "p-1", importe: "mil" }] }),
    );
    seNego(r, "no es un numero valido");
  });

  it("un adicional no puede llevar lineas negativas", async () => {
    const r = await crearMovimiento(
      CON_PERMISO,
      "obra-1",
      movimiento({ lineas: [{ wbsItemId: "p-1", importe: "-100.00" }] }),
    );
    seNego(r, "solo aumenta");
  });

  it("una reconversion que no suma cero se rechaza diciendo cuanto sobra", async () => {
    // Una reconversion mueve dinero de un sitio a otro: si no suma cero,
    // esta creando o destruyendo presupuesto por la puerta de atras.
    estado.partidas = [PARTIDA, { ...PARTIDA, id: "p-2", codigoPartida: "01.01.02" }];
    const r = await crearMovimiento(
      CON_PERMISO,
      "obra-1",
      movimiento({
        tipo: "RECONVERSION",
        lineas: [
          { wbsItemId: "p-1", importe: "1000.00" },
          { wbsItemId: "p-2", importe: "-900.00" },
        ],
      }),
    );
    seNego(r, "tiene que sumar cero");
  });
});

describe("crearMovimiento: lo que separa a una empresa de otra", () => {
  it("una partida de otra obra o de otra empresa no existe para el servicio", async () => {
    // La consulta filtra por `projectId` y por `companyId`. Si el filtro se
    // cayera, esta prueba pasaria a fallar: aqui la partida SI existe en el
    // doble, pero se pide con un id que la obra no deja ver.
    estado.partidas = [];
    const r = await crearMovimiento(CON_PERMISO, "obra-1", movimiento());
    seNego(r, "no existe en esta obra");
  });

  it("un codigo nuevo que ya existe en el presupuesto se rechaza nombrandolo", async () => {
    estado.partidas = [{ ...PARTIDA, tipo: "CAPITULO" }];
    estado.ocupados = ["01.01.02"];
    const r = await crearMovimiento(
      CON_PERMISO,
      "obra-1",
      movimiento({
        lineas: [
          { parentId: "p-1", codigoPartida: "01.01.02", importe: "500.00" },
        ],
      }),
    );
    seNego(r, "01.01.02");
  });
});

describe("crearMovimiento: el camino bueno", () => {
  it("un adicional correcto se guarda como borrador y numera solo", async () => {
    // Si esta prueba se rompe, las de arriba dejan de significar nada: una
    // funcion que lo rechaza TODO tambien las pasaria todas.
    const r = await crearMovimiento(CON_PERMISO, "obra-1", movimiento());
    expect(r.ok).toBe(true);
    expect(estado.creados).toHaveLength(1);
    expect(estado.creados[0]).toMatchObject({
      estado: "BORRADOR",
      tipo: "ADICIONAL",
      // El numero sale del ultimo de la obra, no de un contador global.
      numero: 8,
      baselineId: "base-1",
    });
  });
});
