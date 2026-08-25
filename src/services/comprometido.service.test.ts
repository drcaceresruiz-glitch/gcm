import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * LA definicion de «comprometido», la unica que queda.
 *
 * NACE DE UN NUMERO EQUIVOCADO EN PANTALLA, reportado el 23 de agosto de
 * 2026: el tablero de una obra decia «Comprometido S/ 0,00 de S/ 740,00 -
 * saldo disponible S/ 740,00» teniendo un contratista con 735 firmados y 740
 * ya pagados. Ofrecia como disponible dinero que ya estaba gastado.
 *
 * La causa no fue un calculo mal hecho: eran CINCO lecturas distintas del
 * comprometido -tablero, tres en el panel de obras, una en gerencia- y solo
 * algunas se actualizaron cuando el encargo paso a ser el contrato marco. La
 * del tablero se quedo contando ordenes de compra, y esa obra no tenia
 * ninguna: todo su dinero estaba en el encargo.
 *
 * Por eso la primera prueba de abajo es exactamente ese caso. Si alguien
 * vuelve a escribir una lectura propia del comprometido en otro sitio, esta
 * prueba no lo cazara -no puede-; lo que si garantiza es que la definicion
 * compartida cuenta lo que tiene que contar.
 */

interface FilaEncargo {
  projectId: string;
  montoContratado: string;
  adendas: { importe: string }[];
  partidas: {
    wbsItemId: string;
    fraccion: string;
    partida: { parcial: string | null };
  }[];
}

const estado: {
  encargos: FilaEncargo[];
  sueltas: { wbsItemId: string; _sum: { importe: string } }[];
  partidas: { id: string; parcial: string | null; projectId: string }[];
  consultas: { modelo: string; args: unknown }[];
} = { encargos: [], sueltas: [], partidas: [], consultas: [] };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    encargoProveedor: {
      findMany: (args: unknown) => {
        estado.consultas.push({ modelo: "encargoProveedor", args });
        return Promise.resolve(estado.encargos);
      },
    },
    ordenImputacion: {
      groupBy: (args: unknown) => {
        estado.consultas.push({ modelo: "ordenImputacion", args });
        return Promise.resolve(estado.sueltas);
      },
    },
    wbsItem: {
      findMany: (args: unknown) => {
        estado.consultas.push({ modelo: "wbsItem", args });
        return Promise.resolve(estado.partidas);
      },
    },
  },
}));

const { comprometidoDelAmbito, comprometidoPorObra } = await import(
  "@/services/comprometido.service"
);

const SESION = {
  userId: "u-1",
  companyId: "empresa-1",
  role: "ADMIN",
  permisos: [],
  // `null` es «alcanza todas las obras de su empresa». Sin este campo la
  // sesion no es valida: la lista vacia y el null son cosas opuestas.
  obrasAsignadas: null,
} as unknown as SesionActiva;

function encargo(parcial: Partial<FilaEncargo> = {}): FilaEncargo {
  return {
    projectId: "obra-1",
    montoContratado: "735.00",
    adendas: [],
    partidas: [],
    ...parcial,
  };
}

beforeEach(() => {
  estado.encargos = [];
  estado.sueltas = [];
  estado.partidas = [];
  estado.consultas = [];
});

describe("EL CASO REPORTADO: una obra llevada entera por contratistas", () => {
  it("cuenta el encargo aunque no haya ni una orden de compra", async () => {
    // Exactamente lo que habia en pantalla: un solo contratista de 735 y
    // ninguna orden. El tablero decia 0,00 comprometido.
    estado.encargos = [encargo()];

    const r = await comprometidoDelAmbito(SESION, { id: "obra-1" });

    expect(r.total).toBe("735.00");
    expect(r.deEncargos).toBe("735.00");
    expect(r.deOrdenesSueltas).toBe("0.00");
  });

  it("un encargo SIN partidas repartidas sigue contando en el total", async () => {
    // El caso real: el encargo no tenia ninguna partida asignada. Si el total
    // saliera del reparto en vez de los montos, volveria a dar cero.
    estado.encargos = [encargo({ partidas: [] })];

    const r = await comprometidoDelAmbito(SESION, { id: "obra-1" });

    expect(r.total).toBe("735.00");
    // Y no pinta ninguna fila por partida: la diferencia se ve, no se
    // descuadra en silencio.
    expect(r.porPartida.size).toBe(0);
  });
});

describe("el monto es el VIGENTE, no lo firmado", () => {
  it("una adenda APROBADA sube el comprometido", async () => {
    estado.encargos = [
      encargo({ montoContratado: "50000.00", adendas: [{ importe: "8000.00" }] }),
    ];

    const r = await comprometidoDelAmbito(SESION, { id: "obra-1" });
    expect(r.total).toBe("58000.00");
  });

  it("un deductivo aprobado lo baja", async () => {
    estado.encargos = [
      encargo({ montoContratado: "50000.00", adendas: [{ importe: "-12000.00" }] }),
    ];

    const r = await comprometidoDelAmbito(SESION, { id: "obra-1" });
    expect(r.total).toBe("38000.00");
  });

  /**
   * Una adenda PENDIENTE no es un compromiso: gerencia todavia puede
   * rechazarla. Contarla inflaria el saldo negativo con plata que quiza no se
   * pague, y contra ese numero se decide si se aprieta o no.
   *
   * Quien la deja fuera es la CONSULTA, con `estado: "APROBADA"`. Se fija
   * aqui porque ninguna suma lo notaria si alguien quita el filtro.
   */
  it("solo pide al servidor las adendas APROBADAS", async () => {
    await comprometidoDelAmbito(SESION, { id: "obra-1" });

    const c = estado.consultas.find((x) => x.modelo === "encargoProveedor");
    const select = (
      c?.args as { select: { adendas: { where: { estado: string } } } }
    ).select;
    expect(select.adendas.where.estado).toBe("APROBADA");
  });
});

describe("las dos puertas del comprometido, y ni una tercera", () => {
  it("funde el reparto de los encargos con las ordenes sueltas", async () => {
    estado.encargos = [
      encargo({
        montoContratado: "9000.00",
        partidas: [
          { wbsItemId: "p-1", fraccion: "100", partida: { parcial: "10000.00" } },
          { wbsItemId: "p-2", fraccion: "50", partida: { parcial: "10000.00" } },
        ],
      }),
    ];
    estado.sueltas = [{ wbsItemId: "p-1", _sum: { importe: "500.00" } }];

    const r = await comprometidoDelAmbito(SESION, { id: "obra-1" });

    expect(r.porPartida.get("p-1")).toBe("6500.00");
    expect(r.porPartida.get("p-2")).toBe("3000.00");
    expect(r.total).toBe("9500.00");
  });

  /**
   * LA REGLA que evita contar dos veces el mismo dinero: las sueltas exigen
   * `encargoId: null` y los encargos, `estado: "VIGENTE"`. Quitar cualquiera
   * de los dos filtros hace entrar el mismo compromiso por las dos puertas, y
   * ninguna prueba de suma lo notaria.
   */
  it("pide solo ordenes SUELTAS aprobadas y encargos VIGENTES", async () => {
    await comprometidoDelAmbito(SESION, { id: "obra-1" });

    const sueltas = estado.consultas.find((c) => c.modelo === "ordenImputacion");
    const donde = (
      sueltas?.args as {
        where: { ordenCompra: { encargoId: unknown; estado: string } };
      }
    ).where.ordenCompra;
    expect(donde.encargoId).toBeNull();
    expect(donde.estado).toBe("APROBADA");

    const encargos = estado.consultas.find(
      (c) => c.modelo === "encargoProveedor",
    );
    expect((encargos?.args as { where: { estado: string } }).where.estado).toBe(
      "VIGENTE",
    );
  });
});

describe("el aislamiento entre empresas se aplica DONDE se lee", () => {
  it("la empresa de la sesion entra en las tres consultas", async () => {
    estado.sueltas = [{ wbsItemId: "p-9", _sum: { importe: "100.00" } }];

    await comprometidoDelAmbito(SESION, { id: "obra-1" });

    const encargos = estado.consultas.find(
      (c) => c.modelo === "encargoProveedor",
    );
    expect(
      (encargos?.args as { where: { project: { companyId: string } } }).where
        .project.companyId,
    ).toBe("empresa-1");

    const ordenes = estado.consultas.find((c) => c.modelo === "ordenImputacion");
    expect(
      (ordenes?.args as { where: { ordenCompra: { companyId: string } } }).where
        .ordenCompra.companyId,
    ).toBe("empresa-1");

    const partidas = estado.consultas.find((c) => c.modelo === "wbsItem");
    expect(
      (partidas?.args as { where: { project: { companyId: string } } }).where
        .project.companyId,
    ).toBe("empresa-1");
  });

  /**
   * El filtro que llega es de OBRAS. Aplicarlo tal cual sobre `OrdenCompra`
   * -como se hacia en el panel de empresa- convierte `id` en el id de la
   * ORDEN: la consulta no falla, devuelve cero, y un comprometido de 0,00 es
   * perfectamente creible en pantalla.
   */
  it("el filtro de obras cuelga de `project`, no del id de la orden", async () => {
    await comprometidoDelAmbito(SESION, { id: "obra-1" });

    const ordenes = estado.consultas.find((c) => c.modelo === "ordenImputacion");
    const donde = (
      ordenes?.args as {
        where: { ordenCompra: { id?: unknown; project: { id: string } } };
      }
    ).where.ordenCompra;

    expect(donde.project.id).toBe("obra-1");
    expect(donde.id).toBeUndefined();
  });
});

describe("el sobregiro se mide una sola vez, aqui", () => {
  it("marca la partida que se paso de su parcial", async () => {
    estado.encargos = [
      encargo({
        montoContratado: "12000.00",
        partidas: [
          { wbsItemId: "p-1", fraccion: "100", partida: { parcial: "10000.00" } },
        ],
      }),
    ];

    const r = await comprometidoDelAmbito(SESION, { id: "obra-1" });
    expect(r.sobregiradas).toEqual(["p-1"]);
  });

  /**
   * Un parcial NEGATIVO existe de verdad: el descuento comercial de CRIOCORD
   * es una partida en -26.821,60. La resta va con `restar` y no con
   * `sumar([importe, "-" + parcial])`, que con un parcial ya negativo produce
   * "--26821.60" y `sumar` lo descarta en silencio, dejando el exceso igual
   * al importe. Esa regla estaba copiada en tres sitios; ahora esta en uno.
   */
  it("con un parcial negativo, la resta sigue siendo exacta", async () => {
    estado.encargos = [
      encargo({
        montoContratado: "-30000.00",
        partidas: [
          {
            wbsItemId: "descuento",
            fraccion: "100",
            partida: { parcial: "-26821.60" },
          },
        ],
      }),
    ];

    // Se consiguio MAS descuento del presupuestado: -30.000 contra -26.821,60
    // es 3.178,40 a favor, no un sobregiro.
    const r = await comprometidoDelAmbito(SESION, { id: "obra-1" });
    expect(r.porPartida.get("descuento")).toBe("-30000.00");
    expect(r.sobregiradas).toEqual([]);
  });

  it("una partida cuyo parcial no se pudo leer no se marca", async () => {
    // Sin fila en `wbsItem`: no se afirma nada sobre ella.
    estado.sueltas = [{ wbsItemId: "fantasma", _sum: { importe: "999.00" } }];
    estado.partidas = [];

    const r = await comprometidoDelAmbito(SESION, { id: "obra-1" });
    expect(r.sobregiradas).toEqual([]);
    expect(r.total).toBe("999.00");
  });
});

describe("por obra, desde una sola lectura", () => {
  it("cada obra se lleva lo suyo", async () => {
    estado.encargos = [
      encargo({ projectId: "obra-1", montoContratado: "735.00" }),
      encargo({ projectId: "obra-2", montoContratado: "1200.00" }),
    ];
    estado.sueltas = [{ wbsItemId: "p-9", _sum: { importe: "300.00" } }];
    estado.partidas = [{ id: "p-9", parcial: "1000.00", projectId: "obra-2" }];

    const r = await comprometidoPorObra(SESION, {});

    expect(r.get("obra-1")?.total).toBe("735.00");
    expect(r.get("obra-2")?.total).toBe("1500.00");
  });

  it("cuesta las mismas consultas con una obra que con veinte", async () => {
    estado.encargos = Array.from({ length: 20 }, (_, i) =>
      encargo({ projectId: `obra-${i}`, montoContratado: "100.00" }),
    );

    await comprometidoPorObra(SESION, {});

    // Dos: encargos y ordenes sueltas. Ni una por obra.
    expect(estado.consultas).toHaveLength(2);
  });
});
