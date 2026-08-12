import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FilaImportada } from "@/lib/excel-presupuesto";
import type { SesionActiva } from "@/services/sesion.service";
import type { Permiso } from "@/lib/rbac";

/**
 * La escritura del presupuesto importado.
 *
 * Existe por un incidente que no llego a produccion de milagro: la insercion
 * era FILA A FILA dentro de una transaccion, y Prisma concede cinco segundos
 * por defecto. Con las 348 partidas de una obra real eso rozaba el limite; al
 * pasarlo, la transaccion aborta con P2028 y **revierte la importacion
 * entera**. Es la peor forma posible de fallar, porque cargar el presupuesto
 * es lo primero que hace una constructora nueva.
 *
 * Se prueban las tres propiedades de las que depende el arreglo, y ninguna se
 * ve leyendo el codigo una vez que alguien lo cambie:
 *
 *   1. Las partidas entran POR TANDAS, no de una en una.
 *   2. Los padres se insertan ANTES que sus hijos, y el hijo recibe el id real
 *      del padre — que es lo unico que hacia obligatorio el bucle original.
 *   3. La transaccion lleva un tope de tiempo EXPLICITO, mayor que los cinco
 *      segundos de Prisma.
 *
 * Aqui no hay base de datos. Se sustituye Prisma por un doble que ademas
 * GUARDA lo que se le escribe, porque `createMany` no devuelve ids en MariaDB
 * y el codigo los relee: un doble que respondiera `[]` dejaria todos los
 * `parentId` en nulo y la prueba pasaria sin comprobar nada.
 */

interface FilaGuardada {
  id: string;
  codigoPartida: string;
  parentId: string | null;
  nivel: number;
}

interface OpcionesTransaccion {
  timeout?: number;
  maxWait?: number;
}

const guardadas: FilaGuardada[] = [];
/** Los codigos de cada `createMany`, en orden: una entrada por tanda. */
const tandas: string[][] = [];
let opciones: OpcionesTransaccion | undefined;
/** Cuantas veces se creo una fila suelta. Debe quedarse en cero. */
let sueltas = 0;

vi.mock("@/lib/prisma", () => {
  let secuencia = 0;

  const wbsItem = {
    count: () => Promise.resolve(0),
    deleteMany: () => Promise.resolve({ count: 0 }),

    create: () => {
      sueltas += 1;
      return Promise.resolve({ id: `suelta-${(secuencia += 1)}` });
    },

    createMany: (args: { data: FilaGuardada[] }) => {
      tandas.push(args.data.map((f) => f.codigoPartida));
      for (const f of args.data) {
        guardadas.push({
          id: `id-${(secuencia += 1)}`,
          codigoPartida: f.codigoPartida,
          parentId: f.parentId ?? null,
          nivel: f.nivel,
        });
      }
      return Promise.resolve({ count: args.data.length });
    },

    findMany: (args?: { where?: { codigoPartida?: { in?: string[] } } }) => {
      const pedidos = args?.where?.codigoPartida?.in;
      if (!pedidos) return Promise.resolve([]);
      return Promise.resolve(
        guardadas.filter((f) => pedidos.includes(f.codigoPartida)),
      );
    },
  };

  const prisma = {
    // Las dos consultas de guarda: la obra existe, es de la empresa de la
    // sesion y no esta cerrada.
    project: {
      findFirst: () =>
        Promise.resolve({ id: "obra-1", estado: "EN_EJECUCION" }),
    },
    // Sin linea base aprobada: el presupuesto no esta congelado.
    baseline: { findFirst: () => Promise.resolve(null) },
    auditLog: { create: () => Promise.resolve({}) },
    wbsItem,
    $transaction: (
      fn: (tx: unknown) => unknown,
      opcionesRecibidas?: OpcionesTransaccion,
    ) => {
      opciones = opcionesRecibidas;
      return Promise.resolve(fn(prisma));
    },
  };

  return { prisma };
});

const { aplicarImportacion } = await import("@/services/importacion.service");

function sesion(permisos: Permiso[] = ["partida:importar"]): SesionActiva {
  return {
    sesionId: "s1",
    userId: "u1",
    companyId: "empresa-1",
    role: "RESIDENTE",
    permisos,
    nombres: "Ana",
    apellidos: "Perez",
    email: "ana@ejemplo.pe",
    mustChangePassword: false,
    esOperador: false,
  };
}

function capitulo(codigo: string, descripcion: string): FilaImportada {
  return {
    fila: 1,
    codigo,
    tipo: "CAPITULO",
    modalidad: "PRECIOS_UNITARIOS",
    descripcion,
    nivel: 0,
    unidad: null,
    metrado: null,
    precioUnitario: null,
    parcial: null,
  };
}

function partida(codigo: string, parcial: string): FilaImportada {
  return {
    fila: 2,
    codigo,
    tipo: "PARTIDA",
    modalidad: "PRECIOS_UNITARIOS",
    descripcion: `Partida ${codigo}`,
    nivel: 1,
    unidad: "m2",
    metrado: "10.0000",
    precioUnitario: "25.0000",
    parcial,
  };
}

/**
 * Un arbol de tres niveles, que es lo minimo para que el orden importe: con
 * dos, cualquier reparto en tandas «funciona» por casualidad.
 *
 *   1        capitulo
 *   1.1      capitulo
 *   1.1.1    partida
 *   1.1.2    partida
 *   2        capitulo
 *   2.1      partida
 */
const ARBOL: FilaImportada[] = [
  capitulo("1", "Estructuras"),
  capitulo("1.1", "Movimiento de tierras"),
  partida("1.1.1", "250.00"),
  partida("1.1.2", "250.00"),
  capitulo("2", "Acabados"),
  partida("2.1", "250.00"),
];

function porCodigo(codigo: string): FilaGuardada {
  const fila = guardadas.find((f) => f.codigoPartida === codigo);
  if (!fila) throw new Error(`No se guardo la partida ${codigo}`);
  return fila;
}

beforeEach(() => {
  guardadas.length = 0;
  tandas.length = 0;
  opciones = undefined;
  sueltas = 0;
});

describe("aplicarImportacion: como entran las partidas", () => {
  it("las inserta por tandas y nunca de una en una", async () => {
    const r = await aplicarImportacion(sesion(), "obra-1", ARBOL, false);

    expect(r.ok).toBe(true);
    expect(guardadas).toHaveLength(6);

    // LO QUE DE VERDAD SE VIGILA. Una fila por viaje es lo que agotaba los
    // cinco segundos de la transaccion; que vuelva a aparecer un `create`
    // suelto aqui dentro significa que se ha reintroducido el defecto.
    expect(sueltas).toBe(0);

    // Tres niveles de profundidad, tres tandas. No seis.
    expect(tandas).toHaveLength(3);
    expect(tandas.length).toBeLessThan(ARBOL.length);
  });

  it("agrupa cada tanda por nivel, de menos profundo a mas", async () => {
    await aplicarImportacion(sesion(), "obra-1", ARBOL, false);

    expect(tandas[0]).toEqual(["1", "2"]);
    expect(tandas[1]).toEqual(["1.1", "2.1"]);
    expect(tandas[2]).toEqual(["1.1.1", "1.1.2"]);
  });

  it("cuelga cada hijo del id REAL de su padre", async () => {
    await aplicarImportacion(sesion(), "obra-1", ARBOL, false);

    // Esta es la propiedad que obligaba a insertar fila a fila: el hijo
    // necesita un id que solo existe despues de crear al padre. Si la
    // relectura entre tandas se rompe, los `parentId` salen nulos y el
    // presupuesto se ve como una lista plana, sin capitulos.
    expect(porCodigo("1").parentId).toBeNull();
    expect(porCodigo("2").parentId).toBeNull();

    expect(porCodigo("1.1").parentId).toBe(porCodigo("1").id);
    expect(porCodigo("2.1").parentId).toBe(porCodigo("2").id);

    expect(porCodigo("1.1.1").parentId).toBe(porCodigo("1.1").id);
    expect(porCodigo("1.1.2").parentId).toBe(porCodigo("1.1").id);
  });

  it("guarda la profundidad real del arbol, no los segmentos del codigo", async () => {
    await aplicarImportacion(sesion(), "obra-1", ARBOL, false);

    expect(porCodigo("1").nivel).toBe(0);
    expect(porCodigo("1.1").nivel).toBe(1);
    expect(porCodigo("1.1.1").nivel).toBe(2);
  });

  it("entra un presupuesto del tamano de uno real sin multiplicar los viajes", async () => {
    // CRIOCORD son 348 partidas y es UNA obra. Con la insercion fila a fila
    // esto eran 400 viajes dentro de la transaccion; ahora son dos tandas.
    const grande: FilaImportada[] = [capitulo("1", "Estructuras")];
    for (let i = 1; i <= 400; i++) grande.push(partida(`1.${i}`, "100.00"));

    const r = await aplicarImportacion(sesion(), "obra-1", grande, false);

    expect(r.ok).toBe(true);
    expect(guardadas).toHaveLength(401);
    expect(tandas).toHaveLength(2);
    expect(sueltas).toBe(0);
  });
});

describe("aplicarImportacion: el tope de tiempo de la transaccion", () => {
  it("fija un tope explicito y mayor que los cinco segundos de Prisma", async () => {
    await aplicarImportacion(sesion(), "obra-1", ARBOL, false);

    // Sin esta opcion, Prisma aborta a los 5 s con P2028 y revierte la
    // importacion entera. Que este puesta es la mitad del arreglo; la otra
    // mitad es que las tandas de arriba no lleguen a necesitarla.
    expect(opciones?.timeout).toBeDefined();
    expect(opciones?.timeout ?? 0).toBeGreaterThan(5_000);
    // Esperar conexion libre en el pool no debe consumir el tope de arriba.
    expect(opciones?.maxWait ?? 0).toBeGreaterThan(0);
  });
});

describe("aplicarImportacion: las guardas siguen en pie", () => {
  it("no escribe nada sin el permiso de importar", async () => {
    const r = await aplicarImportacion(sesion([]), "obra-1", ARBOL, false);

    expect(r.ok).toBe(false);
    expect(guardadas).toHaveLength(0);
    expect(tandas).toHaveLength(0);
  });

  it("no escribe nada si no llegan filas", async () => {
    const r = await aplicarImportacion(sesion(), "obra-1", [], false);

    expect(r.ok).toBe(false);
    expect(guardadas).toHaveLength(0);
  });

  it("devuelve el reparto entre capitulos y partidas", async () => {
    const r = await aplicarImportacion(sesion(), "obra-1", ARBOL, false);

    expect(r).toMatchObject({ ok: true, capitulos: 3, partidas: 3 });
  });
});
