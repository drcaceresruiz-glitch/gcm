import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Ajustar el recargo de la meta desde la app.
 *
 * Es el unico dato de la meta que se corrige sin volver al Excel, porque es el
 * unico que no es un costo: es la decision de margen. Estas pruebas fijan las
 * tres cosas que lo hacen seguro —solo sobre borrador, solo capitulos, y
 * ningun importe entra por la puerta— con Prisma doblado, sin base.
 */

interface ItemGuardado {
  id: string;
  codigoRef: string | null;
  tipo: "CAPITULO" | "PARTIDA";
  porcentajeRecargo: string | null;
}

interface Estado {
  aprobada: boolean;
  items: ItemGuardado[];
  escrituras: { id: string; porcentajeRecargo: string | null }[];
}

const estado: Estado = { aprobada: false, items: [], escrituras: [] };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: async () => ({ id: "obra-1" }) },
    presupuestoMeta: {
      findFirst: async () => ({
        id: "meta-1",
        version: 2,
        aprobadaAt: estado.aprobada ? new Date() : null,
      }),
    },
    presupuestoMetaItem: {
      findMany: async ({
        where,
      }: {
        where: { tipo?: string; codigoRef: { in: string[] } };
      }) =>
        estado.items.filter(
          (i) =>
            (where.tipo === undefined || i.tipo === where.tipo) &&
            where.codigoRef.in.includes(i.codigoRef ?? ""),
        ),
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: { porcentajeRecargo: string | null };
      }) => {
        estado.escrituras.push({ id: where.id, porcentajeRecargo: data.porcentajeRecargo });
        return { id: where.id };
      },
    },
    $transaction: async (ops: unknown[]) => ops,
  },
}));

vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: async () => null,
}));

const sesion = {
  userId: "u1",
  companyId: "c1",
  role: "RESIDENTE",
  permisos: ["meta:leer", "meta:crear"],
  nombres: "A",
  apellidos: "B",
} as never;

const ajustar = async (recargos: Record<string, string>, s = sesion) => {
  const meta = await import("@/services/meta.service");
  return meta.ajustarRecargosDeLaMeta(s, "obra-1", recargos);
};

beforeEach(() => {
  estado.aprobada = false;
  estado.escrituras = [];
  estado.items = [
    { id: "i1", codigoRef: "1.0", tipo: "CAPITULO", porcentajeRecargo: "20.000" },
    { id: "i2", codigoRef: "2.0", tipo: "CAPITULO", porcentajeRecargo: "20.000" },
    { id: "i3", codigoRef: "1.1", tipo: "PARTIDA", porcentajeRecargo: null },
    // Un costo propio: sin codigo, nunca recargable.
    { id: "i4", codigoRef: null, tipo: "PARTIDA", porcentajeRecargo: null },
  ];
});

describe("ajustarRecargosDeLaMeta", () => {
  it("guarda el porcentaje nuevo del capitulo", async () => {
    const r = await ajustar({ "1.0": "28" });
    expect(r.ok).toBe(true);
    expect(estado.escrituras).toEqual([{ id: "i1", porcentajeRecargo: "28.000" }]);
  });

  it("guarda tambien el de una PARTIDA suelta", async () => {
    /*
     * No todas las partidas de un capitulo se margenan igual: una subcontrata
     * ya cerrada no admite el mismo recargo que la mano de obra propia.
     * `generarContractual` siempre supo aplicarlo -resuelve empezando por el
     * codigo de la propia linea-; lo que faltaba era dejar guardarlo.
     */
    const r = await ajustar({ "1.1": "5" });

    expect(r.ok).toBe(true);
    expect(estado.escrituras).toEqual([{ id: "i3", porcentajeRecargo: "5.000" }]);
  });

  it("un capitulo y una partida suya, en la misma pasada", async () => {
    const r = await ajustar({ "1.0": "28", "1.1": "5" });

    expect(r.ok).toBe(true);
    expect(estado.escrituras).toHaveLength(2);
  });

  it("no toca los capitulos que nadie movio", async () => {
    await ajustar({ "1.0": "28" });
    expect(estado.escrituras.map((e) => e.id)).not.toContain("i2");
  });

  it("una meta APROBADA no se retoca: para eso se carga una version nueva", async () => {
    // Si el margen de una meta congelada se pudiera cambiar despues,
    // «congelada» no querria decir nada.
    estado.aprobada = true;
    const r = await ajustar({ "1.0": "28" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("aprobada");
    expect(estado.escrituras).toHaveLength(0);
  });

  it("un recargo negativo se rechaza y no escribe nada", async () => {
    const r = await ajustar({ "1.0": "-5" });
    expect(r.ok).toBe(false);
    expect(estado.escrituras).toHaveLength(0);
  });

  it("un recargo absurdo se rechaza: casi siempre es un dedo de mas", async () => {
    const r = await ajustar({ "1.0": "2000" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("999");
  });

  it("lo que no es un numero se rechaza, no se guarda como cero", async () => {
    const r = await ajustar({ "1.0": "veinte" });
    expect(r.ok).toBe(false);
    expect(estado.escrituras).toHaveLength(0);
  });

  it("vaciar la casilla borra el recargo: NO es un cero", async () => {
    /*
     * Vacio significa «esta linea no lleva recargo propio, que herede el de
     * su capitulo» -un `null` para el motor-, y cero significa «entra a
     * precio de costo». Son la misma tecla y decisiones opuestas.
     *
     * Antes vaciar la casilla salia «El recargo de 1.0 no es un numero»: no
     * habia forma de deshacer un recargo sin recargar la meta desde el Excel.
     */
    const r = await ajustar({ "1.0": "" });

    expect(r.ok).toBe(true);
    expect(estado.escrituras).toEqual([{ id: "i1", porcentajeRecargo: null }]);
  });

  it("un cero SI se guarda como cero", async () => {
    const r = await ajustar({ "1.1": "0" });

    expect(r.ok).toBe(true);
    expect(estado.escrituras).toEqual([{ id: "i3", porcentajeRecargo: "0.000" }]);
  });

  it("un sueldo NO se puede recargar: no tiene codigo con el que pedirlo", async () => {
    /*
     * La garantia que queda en pie ahora que las partidas si se recargan. Una
     * linea sin codigo -el residente, una poliza- no se le factura al cliente
     * linea a linea, asi que recargarla no significa nada. El filtro
     * `codigoRef: { in: [...] }` la deja fuera por construccion: no hay clave
     * con la que nombrarla.
     */
    const r = await ajustar({ "Residente de obra": "30" });

    expect(r.ok).toBe(false);
    expect(estado.escrituras).toHaveLength(0);
  });

  it("un codigo que no esta en la meta no escribe nada", async () => {
    const r = await ajustar({ "9.9": "30" });

    expect(r.ok).toBe(false);
    expect(estado.escrituras).toHaveLength(0);
  });

  it("sin permiso de meta no se escribe nada", async () => {
    const sinPermiso = { ...(sesion as object), permisos: ["meta:leer"] } as never;
    const r = await ajustar({ "1.0": "28" }, sinPermiso);
    expect(r.ok).toBe(false);
    expect(estado.escrituras).toHaveLength(0);
  });

  it("sin nada que cambiar no toca la base", async () => {
    const r = await ajustar({});
    expect(r.ok).toBe(true);
    expect(estado.escrituras).toHaveLength(0);
  });
});
