import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Las dos reglas del presupuesto que, al fallar, no dan error: descuadran.
 *
 * Aqui NO hay base de datos, igual que en `aislamiento.test.ts`: se sustituye
 * Prisma por un doble al que se le dice que devolver. Lo que se comprueba no
 * es que la base guarde bien —eso lo garantiza el motor—, sino que el servicio
 * se niegue antes de llegar a ella.
 */

interface Fila {
  id: string;
  codigoPartida: string;
  orden: number;
  parentId: string | null;
}

const estado: {
  partida: Record<string, unknown> | null;
  existentes: Fila[];
  creada: Record<string, unknown> | null;
} = { partida: null, existentes: [], creada: null };

vi.mock("@/lib/prisma", () => {
  const wbsItem = {
    findFirst: () => Promise.resolve(estado.partida),
    findMany: () => Promise.resolve(estado.existentes),
    update: () => Promise.resolve({}),
    updateMany: () => Promise.resolve({ count: 0 }),
    create: (args: { data: Record<string, unknown> }) => {
      estado.creada = args.data;
      return Promise.resolve({ id: "nueva" });
    },
  };

  return {
    prisma: {
      wbsItem,
      // Sin linea base aprobada: el presupuesto esta abierto.
      baseline: { findFirst: () => Promise.resolve(null) },
      project: { findFirst: () => Promise.resolve({ id: "obra", estado: "PLANIFICACION", archivadaEn: null }) },
      auditLog: { create: () => Promise.resolve({}) },
      $transaction: (fn: (tx: unknown) => unknown) => Promise.resolve(fn({ wbsItem })),
    },
  };
});

const { actualizarPartida, crearPartida } = await import("@/services/partidas.service");

const sesion = {
  userId: "u1",
  companyId: "c1",
  role: "RESIDENTE",
  permisos: ["partida:editar", "partida:crear"],
} as unknown as SesionActiva;

beforeEach(() => {
  estado.partida = null;
  estado.existentes = [];
  estado.creada = null;
});

function partidaAlcance() {
  estado.partida = {
    id: "p1",
    projectId: "obra",
    codigoPartida: "3.1",
    descripcion: "Tabiqueria incluida",
    unidad: null,
    metrado: null,
    precioUnitario: null,
    parcial: null,
    tipo: "PARTIDA",
    modalidad: "ALCANCE",
    project: { estado: "PLANIFICACION", archivadaEn: null },
  };
}

/**
 * Por que esto importa tanto: `aportantes` hace que cualquier importe positivo
 * CUBRA a sus ancestros. Un alcance con importe no suma de mas —eso seria
 * benigno—, sino que borra del costo directo el precio cerrado de su partida
 * padre. El descuadre aparece lejos del sitio donde se causo.
 */
describe("una fila de alcance no lleva cifras propias", () => {
  it("rechaza el importe", async () => {
    partidaAlcance();
    const r = await actualizarPartida(sesion, "p1", { parcial: "1500.00" });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("no lleva cifras propias");
  });

  it("rechaza tambien el metrado y el precio", async () => {
    partidaAlcance();
    expect((await actualizarPartida(sesion, "p1", { metrado: "10" })).ok).toBe(false);
    expect((await actualizarPartida(sesion, "p1", { precioUnitario: "5" })).ok).toBe(false);
  });

  /** Vaciar si se admite: es la forma de corregir una fila que ya traia cifras. */
  it("deja vaciarlas", async () => {
    partidaAlcance();
    expect((await actualizarPartida(sesion, "p1", { parcial: null })).ok).toBe(true);
  });

  it("sigue dejando cambiar lo que si es suyo", async () => {
    partidaAlcance();
    expect((await actualizarPartida(sesion, "p1", { descripcion: "Otra cosa" })).ok).toBe(true);
  });
});

describe("un capitulo no tiene modalidad", () => {
  it("la rechaza, porque su importe es la suma de lo que cuelga", async () => {
    estado.partida = {
      id: "c1",
      projectId: "obra",
      codigoPartida: "3.0",
      descripcion: "INSTALACIONES ELECTRICAS",
      unidad: null,
      metrado: null,
      precioUnitario: null,
      parcial: null,
      tipo: "CAPITULO",
      modalidad: "PRECIOS_UNITARIOS",
      project: { estado: "PLANIFICACION", archivadaEn: null },
    };

    const r = await actualizarPartida(sesion, "c1", { modalidad: "SUMA_ALZADA" });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("Un capitulo no tiene modalidad");
  });
});

/**
 * El fallo que motivo todo esto: `orden = padre.orden + 1` metia cada fila
 * nueva LA PRIMERA de su capitulo, asi que teclear 2.1, 2.2 y 2.3 seguidas las
 * dejaba al reves. Nadie escribe un presupuesto de abajo arriba.
 */
describe("las hermanas salen en el orden en que se teclean", () => {
  it("coloca la nueva detras de la ultima hermana, no detras del padre", async () => {
    estado.existentes = [
      { id: "cap", codigoPartida: "2.0", orden: 10, parentId: null },
      { id: "a", codigoPartida: "2.1", orden: 11, parentId: "cap" },
      { id: "b", codigoPartida: "2.2", orden: 12, parentId: "cap" },
    ];

    await crearPartida(sesion, "obra", {
      codigoPartida: "2.3",
      descripcion: "Tercera",
      tipo: "PARTIDA",
      metrado: "1",
      precioUnitario: "1",
    });

    // Detras de la 2.2 (orden 12), no detras del capitulo (orden 10).
    expect(estado.creada?.["orden"]).toBe(13);
  });

  it("la primera hija de un capitulo vacio va justo detras de el", async () => {
    estado.existentes = [{ id: "cap", codigoPartida: "4.0", orden: 20, parentId: null }];

    await crearPartida(sesion, "obra", {
      codigoPartida: "4.1",
      descripcion: "Primera",
      tipo: "PARTIDA",
      metrado: "1",
      precioUnitario: "1",
    });

    expect(estado.creada?.["orden"]).toBe(21);
  });
});

/**
 * El capitulo elegido y el que dice el codigo tienen que coincidir. No se
 * escoge uno de los dos: en esta app los subtotales salen del `parentId` y el
 * total de la obra del codigo, asi que dejarlos apuntando a sitios distintos
 * descuadra el presupuesto en una pantalla y no en la otra.
 */
describe("elegir el capitulo del que cuelga", () => {
  const capitulos: Fila[] = [
    { id: "cap2", codigoPartida: "2.0", orden: 10, parentId: null },
    { id: "cap4", codigoPartida: "4.0", orden: 20, parentId: null },
  ];

  function conTipos(filas: Fila[]) {
    estado.existentes = filas.map((f) => ({
      ...f,
      tipo: f.codigoPartida.endsWith(".0") ? "CAPITULO" : "PARTIDA",
    })) as unknown as Fila[];
  }

  it("acepta el codigo que de verdad cuelga del capitulo elegido", async () => {
    conTipos(capitulos);

    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "4.1",
      descripcion: "Pintura",
      tipo: "PARTIDA",
      parentId: "cap4",
      metrado: "1",
      precioUnitario: "1",
    });

    expect(r.ok).toBe(true);
    expect(estado.creada?.["parentId"]).toBe("cap4");
  });

  /** El caso de la captura: se crea el capitulo 4.0 y se teclea 2.1. */
  it("rechaza el codigo que cuelga de otro capitulo", async () => {
    conTipos(capitulos);

    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "2.1",
      descripcion: "Pintura",
      tipo: "PARTIDA",
      parentId: "cap4",
      metrado: "1",
      precioUnitario: "1",
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("no cuelga de");
  });

  it("rechaza colgar de una partida, que borraria el importe de esa partida", async () => {
    conTipos([...capitulos, { id: "p", codigoPartida: "4.1", orden: 21, parentId: "cap4" }]);

    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "4.1.1",
      descripcion: "Detalle",
      tipo: "PARTIDA",
      parentId: "p",
      metrado: "1",
      precioUnitario: "1",
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("no es un capitulo");
  });
});
