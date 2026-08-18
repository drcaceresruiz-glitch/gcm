import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Las guardas de `crearOrden`, que es por donde se compromete el gasto.
 *
 * Sin base de datos: se dobla Prisma, como en `partidas.service.test.ts` y
 * `movimientos.service.test.ts`. Lo que se comprueba es que el servicio se
 * NIEGUE antes de escribir, y que ninguna negativa deje nada guardado.
 *
 * La regla que mas cuesta si se rompe no es ninguna de las de forma, sino
 * contra QUE cifra se reparte el gasto: con IGV es el neto, porque el
 * impuesto se recupera; con retencion es el total, porque no. Repartir el
 * total en una orden con IGV es el error mas probable de todos, y no da
 * error de sistema: infla el comprometido de cada partida.
 */

interface FilaWbs {
  id: string;
  codigoPartida: string;
  tipo: "CAPITULO" | "PARTIDA";
  modalidad: "PRECIOS_UNITARIOS" | "SUMA_ALZADA" | "ALCANCE";
}

const estado: {
  proveedor: {
    id: string;
    activo: boolean;
    razonSocial: string;
    tipoImpuesto: string;
  } | null;
  /// null = la obra no es de esta empresa (o no existe).
  obra: { id: string } | null;
  partidas: FilaWbs[];
  /// La orden que ya ocupa el numero, si la hay.
  ocupado: { id: string; descripcion: string; estado: string } | null;
  cerrada: string | null;
  creadas: Record<string, unknown>[];
  /// El encargo que la base devolveria al validar `encargoId`.
  encargo: {
    id: string;
    numero: number;
    estado: string;
    proveedorId: string;
  } | null;
  /// Para `obtenerComprometido`: encargos vigentes y sueltas agrupadas.
  encargosVigentes: unknown[];
  sueltasAgrupadas: unknown[];
  consultas: { modelo: string; args: unknown }[];
} = {
  proveedor: null,
  obra: { id: "obra-1" },
  partidas: [],
  ocupado: null,
  cerrada: null,
  creadas: [],
  encargo: null,
  encargosVigentes: [],
  sueltasAgrupadas: [],
  consultas: [],
};

vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: () => Promise.resolve(estado.cerrada),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    ordenCompra: {
      create: (args: { data: Record<string, unknown> }) => {
        estado.creadas.push(args.data);
        return Promise.resolve({ id: "orden-nueva" });
      },
    },
    ordenLinea: { createMany: () => Promise.resolve({ count: 0 }) },
    ordenImputacion: { createMany: () => Promise.resolve({ count: 0 }) },
    proveedorPartida: {
      deleteMany: () => Promise.resolve({ count: 0 }),
      createMany: () => Promise.resolve({ count: 0 }),
    },
    auditLog: { create: () => Promise.resolve({}) },
  };

  return {
    prisma: {
      proveedor: { findFirst: () => Promise.resolve(estado.proveedor) },
      project: { findFirst: () => Promise.resolve(estado.obra) },
      ordenCompra: { findFirst: () => Promise.resolve(estado.ocupado) },
      wbsItem: {
        findMany: (args: { where: { id: { in: string[] } } }) =>
          Promise.resolve(
            estado.partidas.filter((p) => args.where.id.in.includes(p.id)),
          ),
      },
      encargoProveedor: {
        findFirst: () => Promise.resolve(estado.encargo),
        findMany: (args: unknown) => {
          estado.consultas.push({ modelo: "encargoProveedor", args });
          return Promise.resolve(estado.encargosVigentes);
        },
      },
      ordenImputacion: {
        groupBy: (args: unknown) => {
          estado.consultas.push({ modelo: "ordenImputacion", args });
          return Promise.resolve(estado.sueltasAgrupadas);
        },
      },
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    },
  };
});

const { crearOrden, obtenerComprometido } = await import(
  "@/services/ordenes.service"
);

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
  } as unknown as SesionActiva;
}

const CON_PERMISO = sesion(["orden:crear"]);

const PARTIDA: FilaWbs = {
  id: "p-1",
  codigoPartida: "01.01.01",
  tipo: "PARTIDA",
  modalidad: "PRECIOS_UNITARIOS",
};

/**
 * Orden valida con IGV: subtotal 1000, sin descuento, IGV 18%.
 *
 *   neto 1000.00   igv 180.00   total 1180.00
 *
 * Se imputa el NETO, asi que el reparto suma 1000.00. Cada prueba cambia
 * solo lo que examina.
 */
function orden(cambios: Record<string, unknown> = {}) {
  return {
    proveedorId: "prov-1",
    numero: "F001-0001",
    tipo: "COMPRA" as const,
    fecha: "2026-08-18",
    descripcion: "Acero corrugado para zapatas",
    porcentajeIgv: "0.18",
    lineas: [],
    subtotal: "1000.00",
    imputaciones: [{ wbsItemId: "p-1", importe: "1000.00" }],
    ...cambios,
  };
}

beforeEach(() => {
  estado.proveedor = {
    id: "prov-1",
    activo: true,
    razonSocial: "Aceros del Norte SAC",
    tipoImpuesto: "IGV",
  };
  estado.obra = { id: "obra-1" };
  estado.partidas = [PARTIDA];
  estado.ocupado = null;
  estado.cerrada = null;
  estado.creadas = [];
  estado.encargo = null;
  estado.encargosVigentes = [];
  estado.sueltasAgrupadas = [];
  estado.consultas = [];
});

function seNego(r: { ok: boolean; error?: string }, trozo: string) {
  expect(r.ok).toBe(false);
  expect(!r.ok && r.error).toContain(trozo);
  expect(estado.creadas).toHaveLength(0);
}

describe("crearOrden: el camino bueno", () => {
  it("una orden con IGV cuyo reparto suma el neto se guarda", async () => {
    // Sin esta, una funcion que rechazara TODO pasaria las demas pruebas.
    const r = await crearOrden(CON_PERMISO, "obra-1", orden());
    expect(r.ok).toBe(true);
    expect(estado.creadas).toHaveLength(1);
    expect(estado.creadas[0]).toMatchObject({ numero: "F001-0001" });
  });
});

describe("crearOrden: contra que cifra se reparte el gasto", () => {
  it("repartir el TOTAL en una orden con IGV se rechaza, y dice cuanto sobra", async () => {
    // El error mas probable del modulo. 1180 repartidos contra 1000 de neto:
    // sobran 180, que es justo el IGV que la empresa recupera y por tanto no
    // compromete. Si esto pasara, cada partida quedaria inflada un 18%.
    const r = await crearOrden(
      CON_PERMISO,
      "obra-1",
      orden({ imputaciones: [{ wbsItemId: "p-1", importe: "1180.00" }] }),
    );
    seNego(r, "sobran 180.00");
  });

  it("al rechazar el reparto explica que con IGV se imputa SIN IGV", async () => {
    // El mensaje no puede limitarse a decir que no cuadra: la cifra contra la
    // que hay que cuadrar es distinta segun el impuesto, y esa es la duda.
    const r = await crearOrden(
      CON_PERMISO,
      "obra-1",
      orden({ imputaciones: [{ wbsItemId: "p-1", importe: "1180.00" }] }),
    );
    expect(!r.ok && r.error).toContain("SIN IGV");
  });

  it("un reparto corto se rechaza diciendo cuanto falta", async () => {
    const r = await crearOrden(
      CON_PERMISO,
      "obra-1",
      orden({ imputaciones: [{ wbsItemId: "p-1", importe: "700.00" }] }),
    );
    seNego(r, "faltan 300.00");
  });
});

describe("crearOrden: la partida a la que se imputa", () => {
  it("no deja imputar a un capitulo", async () => {
    // Un capitulo no lleva importe propio: es la suma de sus hijas. El gasto
    // colgado ahi no aparece en ninguna partida y descuadra el comprometido.
    estado.partidas = [{ ...PARTIDA, tipo: "CAPITULO" }];
    const r = await crearOrden(CON_PERMISO, "obra-1", orden());
    seNego(r, "es un capitulo");
  });

  it("no deja imputar a una partida que solo detalla alcance", async () => {
    estado.partidas = [{ ...PARTIDA, modalidad: "ALCANCE" }];
    const r = await crearOrden(CON_PERMISO, "obra-1", orden());
    seNego(r, "no lleva importe propio");
  });

  it("una partida de otra obra no existe para el servicio", async () => {
    estado.partidas = [];
    const r = await crearOrden(CON_PERMISO, "obra-1", orden());
    seNego(r, "no existe en esta obra");
  });
});

describe("crearOrden: el proveedor y el numero del documento", () => {
  it("un proveedor de otra empresa no se encuentra", async () => {
    // La consulta filtra por `companyId`. Si el filtro se cayera, esta
    // prueba pasaria a fallar.
    estado.proveedor = null;
    const r = await crearOrden(CON_PERMISO, "obra-1", orden());
    seNego(r, "Proveedor no encontrado");
  });

  it("a un proveedor desactivado no se le compra", async () => {
    estado.proveedor = { ...estado.proveedor!, activo: false };
    const r = await crearOrden(CON_PERMISO, "obra-1", orden());
    seNego(r, "esta desactivado");
  });

  it("un numero ya usado se rechaza diciendo que orden lo ocupa", async () => {
    // Cada numero identifica un documento, y es lo que impide que la carga
    // manual y la del importador se pisen.
    estado.ocupado = {
      id: "orden-vieja",
      descripcion: "Cemento",
      estado: "APROBADA",
    };
    const r = await crearOrden(CON_PERMISO, "obra-1", orden());
    seNego(r, "Cemento");
  });
});

describe("crearOrden: quien puede, cuando, y que llega", () => {
  it("sin el permiso de registrar ordenes, no registra nada", async () => {
    const r = await crearOrden(sesion([]), "obra-1", orden());
    seNego(r, "No tienes permiso");
  });

  it("con la obra cerrada se niega, aunque tenga permiso", async () => {
    estado.cerrada = "La obra esta cerrada desde el 01/07/2026.";
    const r = await crearOrden(CON_PERMISO, "obra-1", orden());
    seNego(r, "cerrada");
  });

  it("una obra de otra empresa no se encuentra", async () => {
    estado.obra = null;
    const r = await crearOrden(CON_PERMISO, "obra-1", orden());
    seNego(r, "Obra no encontrada");
  });

  it("sin numero de orden no se guarda", async () => {
    const r = await crearOrden(CON_PERMISO, "obra-1", orden({ numero: "  " }));
    seNego(r, "numero de la orden");
  });

  it("una fecha que no es una fecha se rechaza", async () => {
    const r = await crearOrden(
      CON_PERMISO,
      "obra-1",
      orden({ fecha: "18/08/2026" }),
    );
    seNego(r, "fecha del documento");
  });

  it("una linea en negativo se rechaza: una orden no devuelve dinero", async () => {
    // Una orden compromete gasto. El signo negativo pertenece a los
    // movimientos presupuestales, no aqui.
    const r = await crearOrden(
      CON_PERMISO,
      "obra-1",
      orden({
        subtotal: undefined,
        lineas: [
          { esAgrupador: false, descripcion: "Acero", importe: "-100.00" },
        ],
      }),
    );
    seNego(r, "negativo");
  });

  it("un subtotal de cabecera que no es un numero se rechaza aparte", async () => {
    // Camino distinto del anterior: las ordenes historicas entran solo por
    // cabecera, sin lineas que sumar, y su subtotal se valida por su cuenta.
    const r = await crearOrden(
      CON_PERMISO,
      "obra-1",
      orden({ subtotal: "-500.00" }),
    );
    seNego(r, "subtotal no es un numero valido");
  });

  it("si el descuento se come el subtotal, el neto no es positivo y se niega", async () => {
    const r = await crearOrden(
      CON_PERMISO,
      "obra-1",
      orden({ descuentoComercial: "1000.00" }),
    );
    seNego(r, "neto de la orden");
  });
});

describe("crearOrden: contra un encargo", () => {
  const VIGENTE = {
    id: "enc-1",
    numero: 3,
    estado: "VIGENTE",
    proveedorId: "prov-1",
  };

  it("guarda el vinculo cuando el encargo es del proveedor y sigue vigente", async () => {
    estado.encargo = VIGENTE;
    const r = await crearOrden(
      CON_PERMISO,
      "obra-1",
      orden({ encargoId: "enc-1" }),
    );
    expect(r.ok).toBe(true);
    expect(estado.creadas[0]).toMatchObject({ encargoId: "enc-1" });
  });

  it("sin encargo, la orden queda SUELTA y lo dice la fila", async () => {
    // El null es la marca de «cuenta por si misma en el comprometido»: si un
    // dia se guardara undefined, el filtro `encargoId: null` dejaria de
    // encontrarla y la orden desapareceria del comprometido sin dar error.
    const r = await crearOrden(CON_PERMISO, "obra-1", orden());
    expect(r.ok).toBe(true);
    expect(estado.creadas[0]).toMatchObject({ encargoId: null });
  });

  it("un encargo de otro contratista se rechaza", async () => {
    // Un encargo es un contrato CON alguien. Formalizarlo con una orden a
    // otro proveedor mezclaria el dinero de dos contratos sin dar error.
    estado.encargo = { ...VIGENTE, proveedorId: "prov-2" };
    const r = await crearOrden(
      CON_PERMISO,
      "obra-1",
      orden({ encargoId: "enc-1" }),
    );
    seNego(r, "otro contratista");
  });

  it("un encargo cerrado ya no recibe ordenes", async () => {
    estado.encargo = { ...VIGENTE, estado: "CERRADO" };
    const r = await crearOrden(
      CON_PERMISO,
      "obra-1",
      orden({ encargoId: "enc-1" }),
    );
    seNego(r, "ya no recibe ordenes");
  });

  it("un encargo de otra obra no existe para el servicio", async () => {
    // La consulta filtra por `projectId`; el doble devuelve null como haria
    // la base.
    estado.encargo = null;
    const r = await crearOrden(
      CON_PERMISO,
      "obra-1",
      orden({ encargoId: "enc-ajeno" }),
    );
    seNego(r, "no existe en esta obra");
  });
});

describe("obtenerComprometido: encargos vigentes + ordenes sueltas", () => {
  const LEE = sesion(["orden:leer"]);

  it("funde el reparto de los encargos con las ordenes sueltas", async () => {
    // Encargo de 9.000 sobre dos partidas (pesos 10.000 y 5.000: dos tercios
    // y un tercio) mas una orden suelta de 500 en la primera.
    estado.encargosVigentes = [
      {
        montoContratado: "9000.00",
        partidas: [
          { wbsItemId: "p-1", fraccion: "100", partida: { parcial: "10000.00" } },
          { wbsItemId: "p-2", fraccion: "50", partida: { parcial: "10000.00" } },
        ],
      },
    ];
    estado.sueltasAgrupadas = [
      { wbsItemId: "p-1", _sum: { importe: "500.00" } },
    ];

    const r = await obtenerComprometido(LEE, "obra-1");

    expect(r).toEqual(
      expect.arrayContaining([
        { wbsItemId: "p-1", comprometido: "6500.00" },
        { wbsItemId: "p-2", comprometido: "3000.00" },
      ]),
    );
    expect(r).toHaveLength(2);
  });

  /**
   * LA REGLA que evita contar dos veces: la consulta de sueltas exige
   * `encargoId: null`, y la de encargos, `estado: "VIGENTE"`. Si alguien
   * quita cualquiera de los dos filtros, el mismo dinero entra por las dos
   * puertas y ninguna prueba de suma lo nota: por eso se fijan los filtros.
   */
  it("pide solo ordenes SUELTAS y encargos VIGENTES", async () => {
    await obtenerComprometido(LEE, "obra-1");

    const sueltas = estado.consultas.find((c) => c.modelo === "ordenImputacion");
    expect(
      (sueltas?.args as { where: { ordenCompra: { encargoId: unknown } } }).where
        .ordenCompra.encargoId,
    ).toBeNull();

    const encargos = estado.consultas.find(
      (c) => c.modelo === "encargoProveedor",
    );
    expect(
      (encargos?.args as { where: { estado: string } }).where.estado,
    ).toBe("VIGENTE");
  });

  it("sin permiso de ordenes devuelve vacio y no consulta", async () => {
    estado.encargosVigentes = [{ montoContratado: "9000.00", partidas: [] }];
    expect(await obtenerComprometido(sesion([]), "obra-1")).toEqual([]);
    expect(estado.consultas).toEqual([]);
  });
});
