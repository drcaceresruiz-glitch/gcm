import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * `aprobarMovimiento`: el paso que convierte un borrador en cifra que cuenta.
 *
 * Hasta que se aprueba, un movimiento no suma en ningun sitio. Al aprobarlo,
 * sus lineas pasan a formar parte del vigente de la obra, nacen las partidas
 * propuestas y el dinero cambia de verdad. Es el punto de no retorno.
 *
 * La invariante que cuida es la del SIGNO, y es la que este proyecto ya pago
 * caro: una partida de costo que quedara en negativo seria un descuento que
 * nadie pacto, y un descuento que cruzara a positivo dejaria de ajustar a su
 * capitulo y **le borraria el importe del costo directo, sin error ni
 * rastro**. Se comprueban las dos direcciones.
 *
 * Va en archivo aparte de `movimientos.service.test.ts` porque necesita un
 * doble mucho mas grande: aqui casi todo ocurre dentro de la transaccion.
 */

const estado: {
  movimiento: Record<string, unknown> | null;
  /// Las lineas releidas DENTRO de la transaccion. El servicio no se fia de
  /// las del borrador: entre medias pudieron editarse.
  lineas: { wbsItemId: string | null; importe: string; codigoPartida: string }[];
  /// La linea base congelada, por codigo de partida.
  itemsBase: { codigoPartida: string; tipo: string; parcial: string | null }[];
  /// Lo que ya aprobaron OTROS movimientos sobre la misma partida.
  yaAprobado: { wbsItemId: string; suma: string }[];
  cerrada: string | null;
  /// true si se pidio el bloqueo de la linea base.
  bloqueo: boolean;
  aprobado: Record<string, unknown> | null;
  /// El `where` del cierre. Ahi tiene que estar el estado BORRADOR.
  condicionCierre: Record<string, unknown> | null;
  /// Cuantas filas cambia el cierre. 0 simula que otro se adelanto.
  filasQueCambian: number;
  /// Las opciones con las que se llamo a la guarda. Aprobar tiene que pasar
  /// `{ permiteEnParalizada: true }`: cierra una decision que ya estaba en
  /// curso, no abre trabajo nuevo.
  opcionesGuarda: { permiteEnParalizada?: boolean } | null;
} = {
  movimiento: null,
  lineas: [],
  itemsBase: [],
  yaAprobado: [],
  cerrada: null,
  bloqueo: false,
  aprobado: null,
  condicionCierre: null,
  filasQueCambian: 1,
  opcionesGuarda: null,
};

vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: (
    _sesion: unknown,
    _obraId: string,
    opciones?: { permiteEnParalizada?: boolean },
  ) => {
    estado.opcionesGuarda = opciones ?? null;
    return Promise.resolve(estado.cerrada);
  },
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    movimientoPresupuestal: {
      findFirst: () => Promise.resolve(estado.movimiento),
      // El cierre es un `updateMany` CONDICIONADO al estado BORRADOR, no un
      // `update` por id: es lo que hace que dos pulsaciones a la vez no
      // aprueben dos veces (la segunda no encuentra fila que cambiar). Se
      // guarda el `where` para poder comprobarlo.
      updateMany: (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        estado.condicionCierre = args.where;
        estado.aprobado = args.data;
        return Promise.resolve({ count: estado.filasQueCambian });
      },
    },
    // El bloqueo `FOR UPDATE` sobre la linea base es lo que serializa dos
    // aprobaciones sobre la misma obra. Se registra que se pidio.
    $queryRaw: () => {
      estado.bloqueo = true;
      return Promise.resolve([{ id: "base-1" }]);
    },
    movimientoLinea: {
      findMany: () =>
        Promise.resolve(
          estado.lineas.map((l) => ({ ...l, importe: l.importe })),
        ),
      groupBy: () =>
        Promise.resolve(
          estado.yaAprobado.map((a) => ({
            wbsItemId: a.wbsItemId,
            _sum: { importe: a.suma },
          })),
        ),
      update: () => Promise.resolve({}),
    },
    baselineItem: { findMany: () => Promise.resolve(estado.itemsBase) },
    wbsItem: {
      findFirst: () => Promise.resolve(null),
      findMany: () => Promise.resolve([]),
      updateMany: () => Promise.resolve({ count: 0 }),
      create: () => Promise.resolve({ id: "n", codigoPartida: "n" }),
    },
    baseline: { update: () => Promise.resolve({}) },
    auditLog: { create: () => Promise.resolve({}) },
  };

  return {
    prisma: {
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
      // FUERA de la transaccion, y a proposito: cuenta las partidas nacidas
      // del movimiento solo para el enlace de la pantalla. La transaccion,
      // que mueve dinero, no se alarga por una cifra decorativa.
      wbsItem: { count: () => Promise.resolve(0) },
    },
  };
});

const { aprobarMovimiento } = await import("@/services/movimientos.service");

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
    nombres: "Ana",
    apellidos: "Quispe",
    email: "ana@constructora.pe",
  } as unknown as SesionActiva;
}

const CON_PERMISO = sesion(["movimiento:aprobar"]);

/** Un movimiento en borrador, listo para aprobar. */
function borrador(cambios: Record<string, unknown> = {}) {
  return {
    id: "mov-1",
    projectId: "obra-1",
    baselineId: "base-1",
    numero: 8,
    tipo: "DEDUCTIVO",
    estado: "BORRADOR",
    lineas: [],
    ...cambios,
  };
}

beforeEach(() => {
  estado.movimiento = borrador();
  estado.lineas = [];
  estado.itemsBase = [];
  estado.yaAprobado = [];
  estado.cerrada = null;
  estado.bloqueo = false;
  estado.aprobado = null;
  estado.condicionCierre = null;
  estado.filasQueCambian = 1;
  estado.opcionesGuarda = null;
});

function seNego(r: { ok: boolean; error?: string }, trozo: string) {
  expect(r.ok).toBe(false);
  expect(!r.ok && r.error).toContain(trozo);
  expect(estado.aprobado).toBeNull();
}

describe("aprobarMovimiento: ninguna partida cambia de signo", () => {
  it("no se puede sacar de una partida mas de lo que tiene", async () => {
    // Base 1000, ya aprobado -400, y este movimiento quita otros -800:
    // quedaria en -200. Seria un descuento que nadie pacto.
    estado.movimiento = borrador({ tipo: "DEDUCTIVO" });
    estado.itemsBase = [
      { codigoPartida: "01.01.01", tipo: "PARTIDA", parcial: "1000.00" },
    ];
    estado.yaAprobado = [{ wbsItemId: "p-1", suma: "-400.00" }];
    estado.lineas = [
      { wbsItemId: "p-1", importe: "-800.00", codigoPartida: "01.01.01" },
    ];

    const r = await aprobarMovimiento(CON_PERMISO, "mov-1");
    seNego(r, "quedaria en -200.00");
  });

  it("un descuento que cruzaria a positivo se rechaza, y explica que borra a su capitulo", async () => {
    // ESTE es el fallo que este proyecto ya pago: una partida de importe
    // negativo que cruza a positivo deja de ajustar a su capitulo y pasa a
    // CUBRIRLO, borrando el importe del capitulo del costo directo. No da
    // error: la cifra simplemente desaparece.
    estado.movimiento = borrador({ tipo: "ADICIONAL" });
    estado.itemsBase = [
      { codigoPartida: "7.09.00", tipo: "PARTIDA", parcial: "-500.00" },
    ];
    estado.lineas = [
      { wbsItemId: "p-9", importe: "700.00", codigoPartida: "7.09.00" },
    ];

    const r = await aprobarMovimiento(CON_PERMISO, "mov-1");
    seNego(r, "deja de ajustar a su capitulo");
  });

  it("un deductivo que deja la partida justo en cero se aprueba", async () => {
    // El borde exacto: cero no es negativo. Vaciar una partida entera es
    // legitimo; pasarse de ahi, no.
    estado.movimiento = borrador({ tipo: "DEDUCTIVO" });
    estado.itemsBase = [
      { codigoPartida: "01.01.01", tipo: "PARTIDA", parcial: "1000.00" },
    ];
    estado.lineas = [
      { wbsItemId: "p-1", importe: "-1000.00", codigoPartida: "01.01.01" },
    ];

    const r = await aprobarMovimiento(CON_PERMISO, "mov-1");
    expect(r.ok).toBe(true);
    expect(estado.aprobado).toMatchObject({ estado: "APROBADO" });
  });
});

describe("aprobarMovimiento: cuenta lo ya aprobado, no solo esta linea", () => {
  it("suma base, lo ya aprobado por otros movimientos y esta linea", async () => {
    // Si el servicio mirara solo la linea, -800 sobre una base de 1000
    // pareceria correcto. Es el -400 ya aprobado el que lo tumba, y por eso
    // la comprobacion tiene que ir contra el vigente, no contra la base.
    estado.itemsBase = [
      { codigoPartida: "01.01.01", tipo: "PARTIDA", parcial: "1000.00" },
    ];
    estado.yaAprobado = [{ wbsItemId: "p-1", suma: "-400.00" }];
    estado.lineas = [
      { wbsItemId: "p-1", importe: "-700.00", codigoPartida: "01.01.01" },
    ];

    const r = await aprobarMovimiento(CON_PERMISO, "mov-1");
    seNego(r, "-100.00");
  });

  it("bloquea la linea base antes de decidir, para que dos aprobaciones no se crucen", async () => {
    // Sin el `FOR UPDATE`, dos movimientos que vacian la misma partida se
    // aprueban a la vez: cada uno bloquea su propia fila, la lectura de
    // saldos no bloquea nada, los dos pasan, y la partida queda en negativo.
    // Lo observable desde aqui es que el bloqueo se pida.
    estado.itemsBase = [
      { codigoPartida: "01.01.01", tipo: "PARTIDA", parcial: "1000.00" },
    ];
    estado.lineas = [
      { wbsItemId: "p-1", importe: "-100.00", codigoPartida: "01.01.01" },
    ];

    await aprobarMovimiento(CON_PERMISO, "mov-1");
    expect(estado.bloqueo).toBe(true);
  });
});

describe("aprobarMovimiento: quien puede y que se puede aprobar", () => {
  it("sin el permiso de aprobar, no aprueba nada", async () => {
    // Aprobar es un permiso PROPIO: quien crea el borrador no lo aprueba
    // solo por haberlo creado.
    const r = await aprobarMovimiento(sesion(["movimiento:crear"]), "mov-1");
    seNego(r, "No tienes permiso para aprobar");
  });

  it("un movimiento de otra empresa no se encuentra", async () => {
    estado.movimiento = null;
    const r = await aprobarMovimiento(CON_PERMISO, "mov-1");
    seNego(r, "no encontrado");
  });

  it("aprobar dos veces se rechaza diciendo el numero", async () => {
    // Sin esto, la segunda aprobacion volveria a sumar las mismas lineas y
    // el ajuste contaria dos veces.
    estado.movimiento = borrador({ estado: "APROBADO" });
    const r = await aprobarMovimiento(CON_PERMISO, "mov-1");
    seNego(r, "8 ya estaba aprobado");
  });

  it("con la obra cerrada no se aprueba", async () => {
    estado.cerrada = "La obra esta cerrada desde el 01/07/2026.";
    const r = await aprobarMovimiento(CON_PERMISO, "mov-1");
    seNego(r, "cerrada");
  });

  it("pide la excepcion de obra paralizada: aprobar cierra, no abre", async () => {
    estado.itemsBase = [
      { codigoPartida: "01.01.01", tipo: "PARTIDA", parcial: "1000.00" },
    ];
    estado.lineas = [
      { wbsItemId: "p-1", importe: "-100.00", codigoPartida: "01.01.01" },
    ];

    await aprobarMovimiento(CON_PERMISO, "mov-1");
    expect(estado.opcionesGuarda).toEqual({ permiteEnParalizada: true });
  });
});

describe("aprobarMovimiento: dos pulsaciones no aprueban dos veces", () => {
  it("el cierre exige que la fila siga en BORRADOR", async () => {
    // No basta con haber leido el estado al principio: entre la lectura y la
    // escritura cabe otra aprobacion. La condicion viaja EN el update.
    estado.itemsBase = [
      { codigoPartida: "01.01.01", tipo: "PARTIDA", parcial: "1000.00" },
    ];
    estado.lineas = [
      { wbsItemId: "p-1", importe: "-100.00", codigoPartida: "01.01.01" },
    ];

    await aprobarMovimiento(CON_PERMISO, "mov-1");
    expect(estado.condicionCierre).toMatchObject({ estado: "BORRADOR" });
  });

  it("si otro se adelanto y no queda fila que cambiar, no se da por aprobado", async () => {
    estado.itemsBase = [
      { codigoPartida: "01.01.01", tipo: "PARTIDA", parcial: "1000.00" },
    ];
    estado.lineas = [
      { wbsItemId: "p-1", importe: "-100.00", codigoPartida: "01.01.01" },
    ];
    estado.filasQueCambian = 0;

    const r = await aprobarMovimiento(CON_PERMISO, "mov-1");
    expect(r.ok).toBe(false);
  });
});
