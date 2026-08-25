import { describe, it, expect, vi, beforeEach } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Deshacer una orden: ANULARLA (deja de contar, se conserva) y BORRARLA (deja
 * de existir).
 *
 * Los cinco pasos de no retorno del dinero ya estaban cubiertos; estos dos son
 * los que van al reves, y tienen su propia invariante:
 *
 *  - **Cuanto se libera al anular.** Es el importe IMPUTABLE, no el neto: con
 *    retencion de renta lo comprometido era el TOTAL. Y una orden emitida
 *    CONTRA un encargo libera CERO, porque nunca sumo por si misma —el
 *    compromiso lo puso el monto del encargo—. Contarla seria descontar dos
 *    veces el mismo dinero.
 *  - **Una orden aprobada NO se borra.** Se anula. Borrarla la sacaria del
 *    comprometido sin dejar por que, que es el modo de fallo de la casa.
 *
 * Prisma doblado, sin base. Se comprueba que el servicio se niegue ANTES de
 * escribir, y toda negativa deja `estado` sin tocar.
 */

interface FilaOrden {
  id: string;
  projectId: string;
  numero: string;
  estado: "BORRADOR" | "APROBADA" | "ANULADA";
  tipo: "COMPRA" | "SERVICIO";
  /// Los reales son IGV | RENTA | NINGUNO. `tsc` NO valida estos literales
  /// dentro del doble, asi que salen del `schema.prisma` a mano.
  tipoImpuesto: "IGV" | "RENTA" | "NINGUNO";
  neto: string;
  impuesto: string;
  total: string;
  motivoAnulado: string | null;
  /// Si cuelga de un encargo. Cambia cuanto se libera al anular.
  encargoId: string | null;
  proveedor: { razonSocial: string; ruc: string };
}

const ORDEN: FilaOrden = {
  id: "ord-1",
  projectId: "obra-1",
  numero: "00117",
  estado: "APROBADA",
  tipo: "COMPRA",
  tipoImpuesto: "IGV",
  neto: "29000.00",
  impuesto: "5220.00",
  total: "34220.00",
  motivoAnulado: null,
  encargoId: null,
  proveedor: { razonSocial: "FERRETERIA X", ruc: "20111222333" },
};

const estado: {
  orden: FilaOrden | null;
  cerrada: string | null;
  /// Lo que se escribio sobre la orden (anular).
  actualizada: Record<string, unknown> | null;
  /// Si se llego a borrar la fila.
  borrada: boolean;
  apuntes: Record<string, unknown>[];
} = {
  orden: { ...ORDEN },
  cerrada: null,
  actualizada: null,
  borrada: false,
  apuntes: [],
};

vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: () => Promise.resolve(estado.cerrada),
}));

vi.mock("@/lib/prisma", () => {
  const ordenCompra = {
    findFirst: () => Promise.resolve(estado.orden),
    update: (args: { data: Record<string, unknown> }) => {
      estado.actualizada = args.data;
      return Promise.resolve({});
    },
    delete: () => {
      estado.borrada = true;
      return Promise.resolve({});
    },
  };
  const auditLog = {
    create: (args: { data: Record<string, unknown> }) => {
      estado.apuntes.push(args.data);
      return Promise.resolve({});
    },
  };
  const tx = { ordenCompra, auditLog };

  return {
    prisma: {
      ordenCompra,
      auditLog,
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    },
  };
});

const { anularOrden, eliminarOrden } = await import(
  "@/services/ordenes.service"
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
    apellidos: "Quispe",
    email: "ana@constructora.pe",
  } as unknown as SesionActiva;
}

const PUEDE_TODO = sesion(["orden:anular", "orden:crear"]);
const SOLO_CREAR = sesion(["orden:crear"]);
const SOLO_ANULAR = sesion(["orden:anular"]);
const MIRON = sesion(["orden:leer"]);

/// El apunte de la anulacion, que es donde viaja la cifra liberada.
function liberado(): string | undefined {
  const a = estado.apuntes.at(-1)?.["despues"] as
    | { liberado?: string }
    | undefined;
  return a?.liberado;
}

beforeEach(() => {
  estado.orden = { ...ORDEN };
  estado.cerrada = null;
  estado.actualizada = null;
  estado.borrada = false;
  estado.apuntes = [];
});

describe("anular una orden: las puertas", () => {
  it("sin permiso de anular no se anula", async () => {
    const r = await anularOrden(SOLO_CREAR, "ord-1", "se cancelo el pedido");

    expect(r).toEqual({
      ok: false,
      error: "No tienes permiso para anular ordenes.",
    });
    expect(estado.actualizada).toBeNull();
  });

  it("con la obra cerrada tampoco", async () => {
    estado.cerrada = "La obra esta cerrada.";
    const r = await anularOrden(PUEDE_TODO, "ord-1", "se cancelo");

    expect(r).toEqual({ ok: false, error: "La obra esta cerrada." });
    expect(estado.actualizada).toBeNull();
  });

  /**
   * El motivo es obligatorio y esto lo sostiene: dentro de seis meses «por que
   * se anulo la 00117» es una pregunta que alguien hara, y la respuesta tiene
   * que estar en la fila, no en la memoria de quien la anulo.
   */
  it("sin motivo no se anula, y un motivo en blanco no cuenta", async () => {
    const r = await anularOrden(PUEDE_TODO, "ord-1", "   ");

    expect(r).toEqual({
      ok: false,
      error: "Explica por que se anula la orden.",
    });
    expect(estado.actualizada).toBeNull();
  });

  it("una orden que no existe lo dice", async () => {
    estado.orden = null;
    const r = await anularOrden(PUEDE_TODO, "ord-1", "motivo");

    expect(r).toEqual({ ok: false, error: "Orden no encontrada." });
  });

  it("y una ya anulada no se anula dos veces", async () => {
    estado.orden = { ...ORDEN, estado: "ANULADA" };
    const r = await anularOrden(PUEDE_TODO, "ord-1", "motivo");

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ya estaba anulada");
    expect(estado.actualizada).toBeNull();
  });
});

describe("anular una orden: cuanto deja de estar comprometido", () => {
  it("el camino bueno: anula, guarda el motivo y deja constancia", async () => {
    const r = await anularOrden(PUEDE_TODO, "ord-1", "  el proveedor no tenia stock  ");

    expect(r).toEqual({ ok: true, numero: "00117" });
    expect(estado.actualizada).toMatchObject({
      estado: "ANULADA",
      motivoAnulado: "el proveedor no tenia stock",
      anuladaPor: "Ana Quispe (ana@constructora.pe)",
    });
  });

  it("con IGV se libera el NETO: el impuesto se recupera", async () => {
    await anularOrden(PUEDE_TODO, "ord-1", "motivo");
    expect(liberado()).toBe("29000.00");
  });

  /**
   * La otra direccion de la misma regla, y la que costaria dinero: con
   * retencion de renta lo comprometido era el TOTAL —los 2 521,74 retenidos se
   * pagan igual, solo que a SUNAT—. Anotar el neto diria que se libera un 8 %
   * menos de lo que de verdad se libera.
   */
  it("con retencion de renta se libera el TOTAL, no el neto", async () => {
    estado.orden = {
      ...ORDEN,
      tipoImpuesto: "RENTA",
      neto: "29000.00",
      impuesto: "-2521.74",
      total: "31521.74",
    };

    await anularOrden(PUEDE_TODO, "ord-1", "motivo");
    expect(liberado()).toBe("31521.74");
  });

  /**
   * Una orden emitida CONTRA un encargo nunca sumo por si misma: el compromiso
   * lo puso el monto contratado del encargo. Liberar su importe al anularla
   * descontaria dos veces el mismo dinero.
   */
  it("una orden contra un encargo libera CERO", async () => {
    estado.orden = { ...ORDEN, encargoId: "enc-9" };

    await anularOrden(PUEDE_TODO, "ord-1", "motivo");
    expect(liberado()).toBe("0.00");
  });

  it("y un BORRADOR tambien libera cero: nunca llego a comprometer", async () => {
    estado.orden = { ...ORDEN, estado: "BORRADOR" };

    await anularOrden(PUEDE_TODO, "ord-1", "motivo");
    expect(liberado()).toBe("0.00");
  });
});

describe("borrar una orden", () => {
  /**
   * La regla que separa borrar de anular. Borrar una aprobada la sacaria del
   * comprometido SIN dejar por que: el modo de fallo de la casa, una fila que
   * deja de contar en silencio.
   */
  it("una APROBADA no se borra, y el mensaje manda a anularla", async () => {
    const r = await eliminarOrden(PUEDE_TODO, "ord-1");

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("no se puede borrar");
      expect(r.error).toContain("Anulala");
    }
    expect(estado.borrada).toBe(false);
  });

  it("un BORRADOR lo borra quien puede crear ordenes", async () => {
    estado.orden = { ...ORDEN, estado: "BORRADOR" };

    const r = await eliminarOrden(SOLO_CREAR, "ord-1");

    expect(r).toEqual({ ok: true, numero: "00117" });
    expect(estado.borrada).toBe(true);
  });

  it("una ANULADA la borra quien puede anular, no quien solo crea", async () => {
    estado.orden = { ...ORDEN, estado: "ANULADA" };

    const sinPermiso = await eliminarOrden(SOLO_CREAR, "ord-1");
    expect(sinPermiso.ok).toBe(false);
    if (!sinPermiso.ok) {
      expect(sinPermiso.error).toBe(
        "No tienes permiso para eliminar ordenes anuladas.",
      );
    }
    expect(estado.borrada).toBe(false);

    const conPermiso = await eliminarOrden(SOLO_ANULAR, "ord-1");
    expect(conPermiso.ok).toBe(true);
    expect(estado.borrada).toBe(true);
  });

  /// Los dos permisos son DISTINTOS y los dos mensajes tambien: si el servicio
  /// cortocircuitara en una sola guarda, uno de los dos no encontraria su
  /// texto.
  it("y un borrador sin permiso de crear da el OTRO mensaje", async () => {
    estado.orden = { ...ORDEN, estado: "BORRADOR" };

    const r = await eliminarOrden(MIRON, "ord-1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("No tienes permiso para eliminar borradores de orden.");
    }
  });

  it("con la obra cerrada no se borra nada", async () => {
    estado.orden = { ...ORDEN, estado: "BORRADOR" };
    estado.cerrada = "La obra esta cerrada.";

    const r = await eliminarOrden(SOLO_CREAR, "ord-1");
    expect(r).toEqual({ ok: false, error: "La obra esta cerrada." });
    expect(estado.borrada).toBe(false);
  });

  /**
   * La auditoria va ANTES del borrado y dentro de la misma transaccion: al
   * reves, si el borrado fallara despues de auditar quedaria constancia de
   * algo que sigue ahi. Y guarda el importe, porque la fila ya no estara para
   * decirlo.
   */
  it("deja el apunte con lo que habia, antes de borrarlo", async () => {
    estado.orden = { ...ORDEN, estado: "ANULADA", motivoAnulado: "duplicada" };

    await eliminarOrden(SOLO_ANULAR, "ord-1");

    expect(estado.apuntes).toHaveLength(1);
    const antes = estado.apuntes[0]?.["antes"] as Record<string, string>;
    expect(estado.apuntes[0]?.["accion"]).toBe("DELETE");
    expect(antes["numero"]).toBe("00117");
    expect(antes["estado"]).toBe("ANULADA");
    expect(antes["motivoAnulado"]).toBe("duplicada");
  });
});
