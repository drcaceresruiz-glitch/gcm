import { describe, it, expect, vi, beforeEach } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * El historial de contratos de un contratista, CRUZANDO OBRAS.
 *
 * Es la unica consulta del sistema que mira los encargos por proveedor en vez
 * de por obra, y por eso es la unica donde el alcance por obra se puede
 * escapar: quien solo tiene asignada una obra no puede enterarse aqui de que
 * existen las demas.
 *
 * Lo que se sostiene:
 *
 *  - que el filtro de alcance viaje DENTRO del `where` (lo unico observable
 *    desde el doble es que se pida);
 *  - que el total no cuente los ANULADOS, que nunca comprometieron nada;
 *  - y que ver la ficha y ver sus contratos sean permisos distintos.
 */

interface FilaEncargo {
  id: string;
  numero: number;
  descripcion: string;
  estado: string;
  montoContratado: string;
  fechaInicio: Date | null;
  fechaFin: Date | null;
  project: { id: string; nombreObra: string; correlativo: string | null };
  valorizaciones: { porcentaje: string }[];
}

function encargo(p: Partial<FilaEncargo> & { id: string }): FilaEncargo {
  return {
    numero: 1,
    descripcion: "Estructuras",
    estado: "VIGENTE",
    montoContratado: "10000.00",
    fechaInicio: null,
    fechaFin: null,
    project: { id: "obra-1", nombreObra: "OBRA UNO", correlativo: "OB-001" },
    valorizaciones: [],
    ...p,
  };
}

const estado: {
  proveedor: { id: string; razonSocial: string; ruc: string; activo: boolean } | null;
  encargos: FilaEncargo[];
  /// El `where` con el que se pidieron. Ahi es donde tiene que ir el alcance.
  filtro: Record<string, unknown> | null;
} = {
  proveedor: {
    id: "prov-1",
    razonSocial: "FERRETERIA X",
    ruc: "20111222333",
    activo: true,
  },
  encargos: [],
  filtro: null,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    proveedor: { findFirst: () => Promise.resolve(estado.proveedor) },
    encargoProveedor: {
      findMany: (args: { where: Record<string, unknown> }) => {
        estado.filtro = args.where;
        return Promise.resolve(
          estado.encargos.map((e) => ({
            ...e,
            // Como Prisma: los Decimal salen como objeto con `toString`.
            montoContratado: { toString: () => e.montoContratado },
            valorizaciones: e.valorizaciones.map((v) => ({
              porcentaje: { toString: () => v.porcentaje },
            })),
          })),
        );
      },
    },
  },
}));

const { historialDeProveedor } = await import("@/services/proveedores.service");

function sesion(
  permisos: string[],
  obrasAsignadas: string[] | null = null,
): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: obrasAsignadas === null ? "ADMIN" : "RESIDENTE",
    permisos,
    obrasAsignadas,
  } as unknown as SesionActiva;
}

const ADMIN = sesion(["proveedor:leer", "encargo:leer"]);
const RESIDENTE = sesion(["proveedor:leer", "encargo:leer"], ["obra-1"]);
const SIN_CONTRATOS = sesion(["proveedor:leer"]);
const MIRON = sesion([]);

beforeEach(() => {
  estado.proveedor = {
    id: "prov-1",
    razonSocial: "FERRETERIA X",
    ruc: "20111222333",
    activo: true,
  };
  estado.encargos = [];
  estado.filtro = null;
});

describe("quien puede verlo", () => {
  it("sin permiso de leer proveedores, nada", async () => {
    expect(await historialDeProveedor(MIRON, "prov-1")).toBeNull();
  });

  it("un proveedor de otra empresa no existe", async () => {
    estado.proveedor = null;
    expect(await historialDeProveedor(ADMIN, "ajeno")).toBeNull();
  });

  /**
   * Ver la ficha y ver lo que se le ha contratado son cosas distintas: lo
   * segundo es dinero pactado. Sin `encargo:leer` la ficha se ve vacia, que no
   * es lo mismo que negarse.
   */
  it("sin permiso de encargos se ve el contratista pero no sus contratos", async () => {
    estado.encargos = [encargo({ id: "e-1" })];

    const h = await historialDeProveedor(SIN_CONTRATOS, "prov-1");

    expect(h?.proveedor.razonSocial).toBe("FERRETERIA X");
    expect(h?.contratos).toEqual([]);
    expect(h?.totalContratado).toBe("0.00");
    // Y no se llego a preguntar: la negativa va antes de la consulta.
    expect(estado.filtro).toBeNull();
  });
});

describe("el alcance por obra manda tambien aqui", () => {
  /**
   * LA FUGA QUE ESTA PANTALLA PODRIA ABRIR. Cruzar obras es exactamente la
   * forma de ensenar de rebote una obra que no te toca, asi que el filtro
   * tiene que ir DENTRO del `where`: un repaso posterior ya habria traido de
   * la base los nombres de las obras ajenas.
   */
  it("un residente solo pregunta por SUS obras", async () => {
    await historialDeProveedor(RESIDENTE, "prov-1");

    expect(estado.filtro).toMatchObject({
      proveedorId: "prov-1",
      projectId: { in: ["obra-1"] },
      project: { companyId: "empresa-1" },
    });
  });

  it("y un admin no lleva ese filtro, pero si el de empresa", async () => {
    await historialDeProveedor(ADMIN, "prov-1");

    expect(estado.filtro).toMatchObject({
      proveedorId: "prov-1",
      project: { companyId: "empresa-1" },
    });
    expect(estado.filtro).not.toHaveProperty("projectId");
  });
});

describe("las cuentas", () => {
  it("suma lo contratado y cuenta las obras distintas", async () => {
    estado.encargos = [
      encargo({ id: "e-1", montoContratado: "10000.00" }),
      encargo({
        id: "e-2",
        montoContratado: "5500.50",
        project: { id: "obra-2", nombreObra: "OBRA DOS", correlativo: null },
      }),
      // Misma obra que el primero: no cuenta como obra nueva.
      encargo({ id: "e-3", montoContratado: "1000.00" }),
    ];

    const h = await historialDeProveedor(ADMIN, "prov-1");

    expect(h?.totalContratado).toBe("16500.50");
    expect(h?.obras).toBe(2);
    expect(h?.contratos).toHaveLength(3);
  });

  /**
   * Un encargo anulado nunca comprometio nada. Sumarlo diria que a este
   * contratista se le dio mas trabajo del que se le dio. Los CERRADOS si
   * cuentan: esos se ejecutaron.
   */
  it("no suma los ANULADOS, y si los cerrados", async () => {
    estado.encargos = [
      encargo({ id: "e-1", montoContratado: "10000.00", estado: "CERRADO" }),
      encargo({ id: "e-2", montoContratado: "7000.00", estado: "ANULADO" }),
    ];

    const h = await historialDeProveedor(ADMIN, "prov-1");

    expect(h?.totalContratado).toBe("10000.00");
    // Pero el anulado SI se ensena: la pantalla cuenta la historia entera.
    expect(h?.contratos).toHaveLength(2);
  });

  it("trae el ultimo avance, o nada si no se valorizo", async () => {
    estado.encargos = [
      encargo({ id: "e-1", valorizaciones: [{ porcentaje: "45.5" }] }),
      encargo({ id: "e-2", valorizaciones: [] }),
    ];

    const h = await historialDeProveedor(ADMIN, "prov-1");

    expect(h?.contratos[0]?.avance).toBe("45.5");
    expect(h?.contratos[1]?.avance).toBeNull();
  });
});
