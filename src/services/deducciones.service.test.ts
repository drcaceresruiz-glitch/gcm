import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * El circuito de dos firmas de una deduccion de costo propio.
 *
 * PEDIDO ASI: «que el residente y/o el administrador de la obra pueda
 * solicitar deducir monto de los gastos generales, se le presenta al gerente
 * general y si este lo aprueba perfecto, se hacen todos los ajustes».
 *
 * Con Prisma doblado, sin base. Lo que se comprueba no es la aritmetica -esa
 * vive en `lib/deducciones` y se prueba alli- sino las guardas del circuito:
 * quien puede pedir, quien puede firmar, que no se pueda hacer las dos cosas
 * en un acto, y que dos firmas simultaneas no se pisen.
 */

interface Fila {
  id: string;
  numero: number;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  importe: string;
  metaItemId: string;
  presupuestoMetaId: string;
  item: { descripcion: string; parcial: string };
}

const estado: {
  /// La meta que manda. `null` = la obra no tiene ninguna.
  meta: { id: string; aprobadaAt: Date | null } | null;
  /// El item que la base devuelve al validar `metaItemId`.
  item: {
    id: string;
    codigoRef: string | null;
    descripcion: string;
    parcial: string;
  } | null;
  deducciones: Fila[];
  /// La que devuelve `findFirst` al resolver.
  aResolver: Fila | null;
  /// Cuantas filas toco el `updateMany`. 0 = otro se adelanto.
  filasTocadas: number;
  creadas: Record<string, unknown>[];
  actualizadas: Record<string, unknown>[];
  cerrada: string | null;
} = {
  meta: { id: "meta-1", aprobadaAt: new Date("2026-08-01") },
  item: {
    id: "item-1",
    codigoRef: null,
    descripcion: "Alquiler de andamios",
    parcial: "40000.00",
  },
  deducciones: [],
  aResolver: null,
  filasTocadas: 1,
  creadas: [],
  actualizadas: [],
  cerrada: null,
};

vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: () => Promise.resolve(estado.cerrada),
}));

vi.mock("@/services/meta.service", () => ({
  metaQueManda: () => Promise.resolve(estado.meta),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    deduccionCostoPropio: {
      aggregate: () =>
        Promise.resolve({
          _max: {
            numero: estado.deducciones.reduce(
              (max, d) => Math.max(max, d.numero),
              0,
            ),
          },
        }),
      create: (args: { data: Record<string, unknown> }) => {
        estado.creadas.push(args.data);
        return Promise.resolve({ id: "ded-nueva", numero: args.data.numero });
      },
      updateMany: (args: { data: Record<string, unknown> }) => {
        estado.actualizadas.push(args.data);
        return Promise.resolve({ count: estado.filasTocadas });
      },
    },
    auditLog: { create: () => Promise.resolve({}) },
  };

  return {
    prisma: {
      presupuestoMetaItem: { findFirst: () => Promise.resolve(estado.item) },
      deduccionCostoPropio: {
        findMany: () =>
          Promise.resolve(
            estado.deducciones.map((d) => ({
              ...d,
              motivo: "x",
              solicitadaPor: "Ana",
              createdAt: new Date(),
              resueltaAt: null,
              resueltaPor: null,
              motivoRechazo: null,
              item: { descripcion: d.item.descripcion },
            })),
          ),
        findFirst: () => Promise.resolve(estado.aResolver),
      },
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    },
  };
});

const { solicitarDeduccion, resolverDeduccion } = await import(
  "@/services/deducciones.service"
);

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
    apellidos: "Perez",
  } as unknown as SesionActiva;
}

const RESIDENTE = sesion(["deduccion:solicitar"]);
const GERENTE = sesion(["deduccion:aprobar"]);

const BUENA = {
  metaItemId: "item-1",
  importe: "8000.00",
  motivo: "El andamio se devuelve en octubre y no en diciembre.",
};

function pendiente(over: Partial<Fila> = {}): Fila {
  return {
    id: "ded-1",
    numero: 1,
    estado: "PENDIENTE",
    importe: "8000.00",
    metaItemId: "item-1",
    presupuestoMetaId: "meta-1",
    item: { descripcion: "Alquiler de andamios", parcial: "40000.00" },
    ...over,
  };
}

beforeEach(() => {
  estado.meta = { id: "meta-1", aprobadaAt: new Date("2026-08-01") };
  estado.item = {
    id: "item-1",
    codigoRef: null,
    descripcion: "Alquiler de andamios",
    parcial: "40000.00",
  };
  estado.deducciones = [];
  estado.aResolver = null;
  estado.filasTocadas = 1;
  estado.creadas = [];
  estado.actualizadas = [];
  estado.cerrada = null;
});

describe("quien pide", () => {
  it("sin permiso no se pide, y no se escribe nada", async () => {
    const r = await solicitarDeduccion(sesion([]), "obra-1", BUENA);

    expect(r.ok).toBe(false);
    expect(estado.creadas).toEqual([]);
  });

  it("el residente la pide y nace PENDIENTE", async () => {
    const r = await solicitarDeduccion(RESIDENTE, "obra-1", BUENA);

    expect(r).toEqual({ ok: true, numero: 1 });
    expect(estado.creadas).toHaveLength(1);
    // No se escribe `estado`: lo pone el valor por defecto del modelo, que es
    // PENDIENTE. Un alta que lo escribiera podria escribir otro.
    expect(estado.creadas[0]).not.toHaveProperty("estado");
  });

  /**
   * NO HAY ATAJO PARA PEDIRLA YA APROBADA, ni aunque quien la pida tenga los
   * dos permisos: el circuito son dos firmas y una de ellas se daria por
   * puesta. Quien tenga los dos la pide y la firma en dos actos, y el rastro
   * dice que fue la misma persona -que es justo lo que alguien querria poder
   * auditar-.
   */
  it("con los dos permisos tampoco nace aprobada", async () => {
    const ambos = sesion(["deduccion:solicitar", "deduccion:aprobar"]);
    await solicitarDeduccion(ambos, "obra-1", BUENA);

    expect(estado.creadas[0]).not.toHaveProperty("estado");
    expect(estado.creadas[0]).not.toHaveProperty("resueltaAt");
  });

  it("una obra cerrada no admite deducciones", async () => {
    estado.cerrada = "La obra está cerrada.";
    const r = await solicitarDeduccion(RESIDENTE, "obra-1", BUENA);

    expect(r.ok).toBe(false);
    expect(estado.creadas).toEqual([]);
  });
});

describe("sobre que se pide", () => {
  /**
   * SOBRE UNA META APROBADA Y NO SOBRE UN BORRADOR. Mientras la meta es
   * borrador se corrige la meta y ya esta: pedirle firma a gerencia para bajar
   * un numero que quien lo pide puede editar el mismo seria un tramite sin
   * contenido. La deduccion existe PORQUE la meta esta congelada.
   */
  it("sobre un borrador no: se corrige la meta y ya esta", async () => {
    estado.meta = { id: "meta-1", aprobadaAt: null };
    const r = await solicitarDeduccion(RESIDENTE, "obra-1", BUENA);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("borrador");
    expect(estado.creadas).toEqual([]);
  });

  it("sin meta no hay de que deducir", async () => {
    estado.meta = null;
    const r = await solicitarDeduccion(RESIDENTE, "obra-1", BUENA);
    expect(r.ok).toBe(false);
  });

  /**
   * El item tiene que ser de ESTA meta, no el que llegue en la peticion. Sin
   * esto, un id copiado de otra obra deduciria de una linea ajena.
   */
  it("una linea que no es de esta meta se rechaza", async () => {
    estado.item = null;
    const r = await solicitarDeduccion(RESIDENTE, "obra-1", BUENA);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("no es del presupuesto meta vigente");
  });

  it("de una partida no se deduce: eso seria reescribir el plan", async () => {
    estado.item = {
      id: "item-1",
      codigoRef: "3.2",
      descripcion: "Concreto",
      parcial: "90000.00",
    };
    const r = await solicitarDeduccion(RESIDENTE, "obra-1", BUENA);

    expect(r.ok).toBe(false);
    expect(estado.creadas).toEqual([]);
  });

  it("no mas de lo que queda en la linea, contando lo ya aprobado", async () => {
    estado.deducciones = [pendiente({ estado: "APROBADA", importe: "35000.00" })];

    const r = await solicitarDeduccion(RESIDENTE, "obra-1", BUENA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("solo quedan");
  });
});

describe("quien firma", () => {
  it("quien pide no firma", async () => {
    estado.aResolver = pendiente();
    const r = await resolverDeduccion(RESIDENTE, "obra-1", "ded-1", {
      aprobar: true,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("segunda firma es de gerencia");
    expect(estado.actualizadas).toEqual([]);
  });

  it("gerencia aprueba y queda el rastro de quien firmo", async () => {
    estado.aResolver = pendiente();
    const r = await resolverDeduccion(GERENTE, "obra-1", "ded-1", {
      aprobar: true,
    });

    expect(r.ok).toBe(true);
    expect(estado.actualizadas[0]).toMatchObject({
      estado: "APROBADA",
      resueltaPor: "Ana Perez",
    });
  });

  it("rechazar sin motivo no vale", async () => {
    estado.aResolver = pendiente();
    const r = await resolverDeduccion(GERENTE, "obra-1", "ded-1", {
      aprobar: false,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Y dice para que sirve el motivo, no solo que falta.
    expect(r.error).toContain("insistir con otra cifra");
    expect(estado.actualizadas).toEqual([]);
  });

  it("una ya resuelta no se vuelve a resolver", async () => {
    estado.aResolver = pendiente({ estado: "APROBADA" });
    const r = await resolverDeduccion(GERENTE, "obra-1", "ded-1", {
      aprobar: false,
      motivoRechazo: "me arrepiento",
    });

    expect(r.ok).toBe(false);
    expect(estado.actualizadas).toEqual([]);
  });

  /**
   * DOS FIRMAS A LA VEZ. La condicion de estado viaja en el WHERE, no solo en
   * la comprobacion previa: entre leer y escribir puede colarse otra firma. Si
   * esto devolviera `ok`, quien pulso creeria que aprobo el y el rastro diria
   * otra cosa —y en un circuito de dos firmas, quien firmo ES el dato—.
   */
  it("si otro se adelanta, se avisa; no se devuelve ok", async () => {
    estado.aResolver = pendiente();
    estado.filasTocadas = 0;

    const r = await resolverDeduccion(GERENTE, "obra-1", "ded-1", {
      aprobar: true,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Otra persona acaba de resolver");
  });

  /**
   * EL TOPE SE VUELVE A MIRAR AL FIRMAR. Entre la peticion y la firma pueden
   * pasar dias, y en medio pudo aprobarse OTRA deduccion sobre la misma linea.
   * Dos peticiones de 30.000 sobre un alquiler de 40.000 pasan las dos la
   * validacion del alta -cada una mira lo aprobado en ese momento- y solo aqui
   * se puede ver que juntas inventan 20.000 de bolsa.
   */
  it("no se firma la que se pasaria del tope por otra aprobada mientras esperaba", async () => {
    estado.aResolver = pendiente({ importe: "30000.00" });
    estado.deducciones = [
      pendiente({ id: "otra", estado: "APROBADA", importe: "30000.00" }),
    ];

    const r = await resolverDeduccion(GERENTE, "obra-1", "ded-1", {
      aprobar: true,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("mientras esta esperaba");
    expect(estado.actualizadas).toEqual([]);
  });

  it("pero RECHAZARLA sigue siendo posible aunque ya no quepa", async () => {
    // Si no, una deduccion imposible se quedaria pendiente para siempre,
    // saliendo en la bandeja de gerencia sin forma de quitarla.
    estado.aResolver = pendiente({ importe: "30000.00" });
    estado.deducciones = [
      pendiente({ id: "otra", estado: "APROBADA", importe: "30000.00" }),
    ];

    const r = await resolverDeduccion(GERENTE, "obra-1", "ded-1", {
      aprobar: false,
      motivoRechazo: "Ya se aprobó la otra.",
    });

    expect(r.ok).toBe(true);
    expect(estado.actualizadas[0]).toMatchObject({ estado: "RECHAZADA" });
  });
});
