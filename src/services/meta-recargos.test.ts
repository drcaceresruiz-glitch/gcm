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

interface GastoGuardado {
  concepto: string;
  tipo: "FIJO" | "VARIABLE";
  montoMensual: { toString: () => string } | null;
  meses: { toString: () => string } | null;
  montoTotal: { toString: () => string };
  orden: number;
}

interface Estado {
  aprobada: boolean;
  gastos: GastoGuardado[];
  items: ItemGuardado[];
  escrituras: { id: string; porcentajeRecargo: string | null }[];
}

const estado: Estado = { aprobada: false, gastos: [], items: [], escrituras: [] };

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
        where: { tipo: string; codigoRef: { in: string[] } };
      }) =>
        estado.items.filter(
          (i) => i.tipo === where.tipo && where.codigoRef.in.includes(i.codigoRef ?? ""),
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
    gastoGeneralMeta: {
      findMany: async () => estado.gastos,
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
  ];
});

describe("ajustarRecargosDeLaMeta", () => {
  it("guarda el porcentaje nuevo del capitulo", async () => {
    const r = await ajustar({ "1.0": "28" });
    expect(r.ok).toBe(true);
    expect(estado.escrituras).toEqual([{ id: "i1", porcentajeRecargo: "28.000" }]);
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

  it("solo escribe en CAPITULOS: una partida hereda el de su capitulo", async () => {
    // Escribir un recargo en una partida seria un dato muerto que ademas
    // cambiaria el calculo sin que nadie lo hubiera pedido.
    const r = await ajustar({ "1.1": "30" });
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


describe("gastosGeneralesDeLaMeta", () => {
  /*
   * El desglose no se guardaba: `crearMeta` escribia solo el TOTAL en la meta
   * y las filas se perdian, asi que no habia forma de ensenar que parte es
   * fija y que parte crece con el plazo -que es justo la diferencia que se
   * paga en dinero por cada mes de atraso-.
   */
  const gasto = (
    concepto: string,
    tipo: "FIJO" | "VARIABLE",
    total: string,
    mensual: string | null = null,
    meses: string | null = null,
  ): GastoGuardado => ({
    concepto,
    tipo,
    montoMensual: mensual === null ? null : { toString: () => mensual },
    meses: meses === null ? null : { toString: () => meses },
    montoTotal: { toString: () => total },
    orden: 0,
  });

  it("devuelve las filas con sus importes como TEXTO, nunca como number", async () => {
    estado.gastos = [
      gasto("Residente", "VARIABLE", "52000.00", "6500.00", "8.00"),
      gasto("Póliza CAR", "FIJO", "4200.00"),
    ];
    const meta = await import("@/services/meta.service");
    const r = await meta.gastosGeneralesDeLaMeta(sesion, "obra-1");

    expect(r).toHaveLength(2);
    expect(r[0]!.montoTotal).toBe("52000.00");
    expect(r[0]!.montoMensual).toBe("6500.00");
    // Un FIJO no lleva mensual ni meses: no se inventan.
    expect(r[1]!.montoMensual).toBeNull();
    expect(r[1]!.meses).toBeNull();
  });

  it("sin permiso de meta no devuelve nada", async () => {
    estado.gastos = [gasto("Residente", "VARIABLE", "52000.00", "6500.00", "8.00")];
    const sinPermiso = { ...(sesion as object), permisos: [] } as never;
    const meta = await import("@/services/meta.service");

    expect(await meta.gastosGeneralesDeLaMeta(sinPermiso, "obra-1")).toEqual([]);
  });
});
