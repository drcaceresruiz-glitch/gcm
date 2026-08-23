import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Corregir la meta dentro de la app.
 *
 * Lo que estas pruebas protegen es que se pueda escribir en la meta SIN abrir
 * las dos puertas que la hacen fiable: que una meta aprobada siga congelada
 * -si su costo se pudiera bajar despues, la bolsa no significaria nada- y que
 * ningun importe se guarde tal como llego del formulario.
 *
 * Con Prisma doblado, sin base.
 */

interface Fila {
  id: string;
  presupuestoMetaId: string;
  codigoRef: string | null;
  tipo: "CAPITULO" | "PARTIDA";
  descripcion: string;
  parcial: { toString: () => string } | null;
}

interface Estado {
  aprobada: boolean;
  filas: Fila[];
  creadas: Record<string, unknown>[];
  borradas: string[];
  actualizadas: { id: string; data: Record<string, unknown> }[];
  costoGuardado: Record<string, unknown> | null;
}

const importe = (v: string | null) => (v === null ? null : { toString: () => v });

const estado: Estado = {
  aprobada: false,
  filas: [],
  creadas: [],
  borradas: [],
  actualizadas: [],
  costoGuardado: null,
};

const tx = {
  presupuestoMetaItem: {
    findMany: async () => estado.filas,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      estado.creadas.push(data);
      return { id: "nueva" };
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      estado.actualizadas.push({ id: where.id, data });
      return { id: where.id };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      estado.borradas.push(where.id);
      return { id: where.id };
    },
  },
  presupuestoMeta: {
    findUniqueOrThrow: async () => ({ gastosGenerales: importe("1000.00") }),
    update: async ({ data }: { data: Record<string, unknown> }) => {
      estado.costoGuardado = data;
      return { id: "meta-1" };
    },
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    presupuestoMetaItem: {
      findMany: async () => estado.filas,
      findFirst: async ({
        where,
      }: {
        where: { id?: string; codigoRef?: string; orden?: unknown };
      }) => {
        if (where.id) {
          return estado.filas.find((f) => f.id === where.id) ?? null;
        }
        if (where.codigoRef) {
          return estado.filas.find((f) => f.codigoRef === where.codigoRef) ?? null;
        }
        // La consulta del ultimo orden.
        return { orden: estado.filas.length };
      },
    },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

vi.mock("@/services/meta.service", () => ({
  metaQueManda: async () => ({
    id: "meta-1",
    version: 3,
    aprobadaAt: estado.aprobada ? new Date() : null,
  }),
}));

vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: async () => null,
}));

import {
  anadirLineaAMeta,
  editarLineaDeMeta,
  eliminarLineaDeMeta,
} from "@/services/meta-edicion.service";

const sesion = {
  userId: "u1",
  companyId: "c1",
  role: "RESIDENTE",
  permisos: ["meta:leer", "meta:crear"],
  nombres: "A",
  apellidos: "B",
} as never;

beforeEach(() => {
  estado.aprobada = false;
  estado.creadas = [];
  estado.borradas = [];
  estado.actualizadas = [];
  estado.costoGuardado = null;
  estado.filas = [
    {
      id: "cap",
      presupuestoMetaId: "meta-1",
      codigoRef: "1.0",
      tipo: "CAPITULO",
      descripcion: "PRELIMINARES",
      parcial: null,
    },
    {
      id: "p1",
      presupuestoMetaId: "meta-1",
      codigoRef: "1.1",
      tipo: "PARTIDA",
      descripcion: "Cartel de obra",
      parcial: importe("700.00"),
    },
  ];
});

describe("editar una linea de la meta", () => {
  it("el importe se CALCULA de metrado x precio, no se acepta del formulario", async () => {
    // Un importe que viaja por el formulario y se guarda tal cual es un
    // importe que cualquiera puede cambiar editando la pagina.
    const r = await editarLineaDeMeta(sesion, "obra-1", "p1", {
      descripcion: "Cartel de obra",
      metrado: "2",
      precioUnitario: "350",
      parcial: "999999.00",
    });

    expect(r.ok).toBe(true);
    expect(estado.actualizadas[0]!.data.parcial).toBe("700.00");
  });

  it("sin metrado ni precio si vale el importe suelto: es una suma alzada", async () => {
    const r = await editarLineaDeMeta(sesion, "obra-1", "p1", {
      descripcion: "Partida global",
      parcial: "2600",
    });

    expect(r.ok).toBe(true);
    expect(estado.actualizadas[0]!.data.parcial).toBe("2600.00");
  });

  it("un capitulo no lleva importe propio aunque se teclee", async () => {
    // Si lo llevara, el costo directo contaria el mismo dinero dos veces.
    await editarLineaDeMeta(sesion, "obra-1", "cap", {
      descripcion: "PRELIMINARES",
      parcial: "5000",
    });

    expect(estado.actualizadas[0]!.data.parcial).toBeNull();
  });

  it("recalcula el costo de la meta despues de cada cambio", async () => {
    await editarLineaDeMeta(sesion, "obra-1", "p1", {
      descripcion: "Cartel",
      parcial: "700",
    });

    // 700 de la unica linea con importe, mas los 1000 de gastos generales.
    expect(estado.costoGuardado).toEqual({
      costoDirecto: "700.00",
      costoTotal: "1700.00",
    });
  });

  it("una linea de OTRA meta no se toca", async () => {
    // El identificador viene del formulario: sin atarlo a esta meta se podria
    // editar el presupuesto de otra obra.
    const r = await editarLineaDeMeta(sesion, "obra-1", "ajena", {
      descripcion: "X",
    });

    expect(r.ok).toBe(false);
    expect(estado.actualizadas).toHaveLength(0);
  });

  it("una descripcion vacia se rechaza", async () => {
    const r = await editarLineaDeMeta(sesion, "obra-1", "p1", { descripcion: "   " });
    expect(r.ok).toBe(false);
    expect(estado.actualizadas).toHaveLength(0);
  });

  it("un precio negativo se rechaza y no escribe nada", async () => {
    const r = await editarLineaDeMeta(sesion, "obra-1", "p1", {
      descripcion: "Cartel",
      metrado: "1",
      precioUnitario: "-50",
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("negativo");
    expect(estado.actualizadas).toHaveLength(0);
  });

  it("lo que no es un numero se rechaza, no se guarda como cero", async () => {
    const r = await editarLineaDeMeta(sesion, "obra-1", "p1", {
      descripcion: "Cartel",
      metrado: "dos",
      precioUnitario: "350",
    });

    expect(r.ok).toBe(false);
    expect(estado.actualizadas).toHaveLength(0);
  });
});

describe("la meta aprobada sigue congelada", () => {
  it("no se edita", async () => {
    estado.aprobada = true;
    const r = await editarLineaDeMeta(sesion, "obra-1", "p1", { descripcion: "X" });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("aprobada");
    expect(estado.actualizadas).toHaveLength(0);
  });

  it("no se le anaden lineas", async () => {
    estado.aprobada = true;
    const r = await anadirLineaAMeta(sesion, "obra-1", {
      codigoRef: "9.9",
      descripcion: "X",
      parcial: "10",
    });

    expect(r.ok).toBe(false);
    expect(estado.creadas).toHaveLength(0);
  });

  it("no se le quitan lineas", async () => {
    estado.aprobada = true;
    const r = await eliminarLineaDeMeta(sesion, "obra-1", "p1");

    expect(r.ok).toBe(false);
    expect(estado.borradas).toHaveLength(0);
  });
});

describe("anadir una linea", () => {
  it("entra como PARTIDA y al final", async () => {
    const r = await anadirLineaAMeta(sesion, "obra-1", {
      codigoRef: "1.2",
      descripcion: "Cerco provisional",
      metrado: "45",
      precioUnitario: "28",
    });

    expect(r.ok).toBe(true);
    expect(estado.creadas[0]).toMatchObject({
      codigoRef: "1.2",
      tipo: "PARTIDA",
      parcial: "1260.00",
    });
  });

  it("sin codigo es un costo propio de la meta, y se admite", async () => {
    // Es el caso del andamio alquilado: cuesta, pero el contrato no lo
    // desglosa. Con codigo iria al contractual y al cronograma.
    const r = await anadirLineaAMeta(sesion, "obra-1", {
      codigoRef: "",
      descripcion: "Andamio en alquiler",
      parcial: "1520",
    });

    expect(r.ok).toBe(true);
    expect(estado.creadas[0]!.codigoRef).toBeNull();
  });

  it("un codigo repetido se rechaza: cada linea es unica", async () => {
    const r = await anadirLineaAMeta(sesion, "obra-1", {
      codigoRef: "1.1",
      descripcion: "Otra cosa",
      parcial: "100",
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("ya está en la meta");
    expect(estado.creadas).toHaveLength(0);
  });
});

describe("quitar una linea", () => {
  it("una partida se quita y el costo se recalcula", async () => {
    const r = await eliminarLineaDeMeta(sesion, "obra-1", "p1");

    expect(r.ok).toBe(true);
    expect(estado.borradas).toEqual(["p1"]);
    expect(estado.costoGuardado).not.toBeNull();
  });

  it("un CAPITULO no se borra desde aqui", async () => {
    // Sus partidas se quedarian sin sitio y sin recargo, que es de donde sale
    // el contractual.
    const r = await eliminarLineaDeMeta(sesion, "obra-1", "cap");

    expect(r.ok).toBe(false);
    expect(estado.borradas).toHaveLength(0);
  });
});

describe("permisos", () => {
  it("sin meta:crear no se escribe nada", async () => {
    const soloLectura = { ...(sesion as object), permisos: ["meta:leer"] } as never;
    const r = await editarLineaDeMeta(soloLectura, "obra-1", "p1", {
      descripcion: "X",
    });

    expect(r.ok).toBe(false);
    expect(estado.actualizadas).toHaveLength(0);
  });
});
