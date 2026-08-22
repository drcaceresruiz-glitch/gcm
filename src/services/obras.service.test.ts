import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * `cambiarEstadoObra`, la parte de PARALIZADA: exige motivo al paralizar,
 * deja la fecha estimada como opcional, y limpia los tres campos al salir
 * (reanudar o cerrar). El resto de la maquina de estados (transiciones
 * validas, requisitos de arranque/cierre) ya se prueba en `lib/obras.test.ts`
 * como logica pura; aqui solo se prueba el pegamento nuevo.
 */

const estado: {
  obra: { estado: string; nombreObra: string } | null;
  actualizado: Record<string, unknown> | null;
} = {
  obra: null,
  actualizado: null,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: () => Promise.resolve(estado.obra),
    },
    // Solo se consultan cuando nuevoEstado es CERRADA. Vacios: ninguna de
    // estas pruebas necesita que requisitosParaCerrar bloquee nada.
    encargoProveedor: { findMany: () => Promise.resolve([]) },
    movimientoPresupuestal: { count: () => Promise.resolve(0) },
    // Solo se consulta al arrancar desde PLANIFICACION. Con partidas, el
    // presupuesto obligatorio no bloquea.
    wbsItem: { count: () => Promise.resolve(1) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        project: {
          update: (args: { data: Record<string, unknown> }) => {
            estado.actualizado = args.data;
            return Promise.resolve({});
          },
        },
        auditLog: { create: () => Promise.resolve({}) },
      }),
  },
}));

const { cambiarEstadoObra } = await import("@/services/obras.service");

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
  } as unknown as SesionActiva;
}

const CON_PERMISO = sesion(["obra:editar"]);

beforeEach(() => {
  estado.obra = { estado: "EN_EJECUCION", nombreObra: "Obra de pruebas" };
  estado.actualizado = null;
});

describe("cambiarEstadoObra: paralizar exige motivo", () => {
  it("sin motivo, se rechaza y no escribe nada", async () => {
    const r = await cambiarEstadoObra(CON_PERMISO, "obra-1", "PARALIZADA");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("motivo");
    expect(estado.actualizado).toBeNull();
  });

  it("con motivo, guarda motivo, fecha estimada y cuando se paralizo", async () => {
    const r = await cambiarEstadoObra(CON_PERMISO, "obra-1", "PARALIZADA", undefined, {
      motivo: "Falta de financiamiento del cliente.",
      fechaEstimada: "2026-10-01",
    });
    expect(r.ok).toBe(true);
    expect(estado.actualizado).toMatchObject({
      estado: "PARALIZADA",
      motivoParalizacion: "Falta de financiamiento del cliente.",
    });
    expect(estado.actualizado?.fechaEstimadaReanudacion).toBeInstanceOf(Date);
    expect(estado.actualizado?.paralizadaEn).toBeInstanceOf(Date);
  });

  it("una fecha estimada invalida se rechaza", async () => {
    const r = await cambiarEstadoObra(CON_PERMISO, "obra-1", "PARALIZADA", undefined, {
      motivo: "Litigio con el proveedor.",
      fechaEstimada: "no-es-una-fecha",
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("fecha estimada");
    expect(estado.actualizado).toBeNull();
  });

  it("sin fecha estimada tambien se paraliza: a veces de verdad no se sabe", async () => {
    const r = await cambiarEstadoObra(CON_PERMISO, "obra-1", "PARALIZADA", undefined, {
      motivo: "Litigio con el proveedor.",
    });
    expect(r.ok).toBe(true);
    expect(estado.actualizado?.fechaEstimadaReanudacion).toBeNull();
  });
});

describe("cambiarEstadoObra: salir de PARALIZADA limpia motivo, fecha y marca", () => {
  it("reanudar limpia los tres campos", async () => {
    estado.obra = { estado: "PARALIZADA", nombreObra: "Obra de pruebas" };
    const r = await cambiarEstadoObra(CON_PERMISO, "obra-1", "EN_EJECUCION");
    expect(r.ok).toBe(true);
    expect(estado.actualizado).toMatchObject({
      estado: "EN_EJECUCION",
      motivoParalizacion: null,
      fechaEstimadaReanudacion: null,
      paralizadaEn: null,
    });
  });

  it("cerrar desde paralizada tambien limpia los tres campos", async () => {
    estado.obra = { estado: "PARALIZADA", nombreObra: "Obra de pruebas" };
    const r = await cambiarEstadoObra(CON_PERMISO, "obra-1", "CERRADA");
    expect(r.ok).toBe(true);
    expect(estado.actualizado).toMatchObject({
      estado: "CERRADA",
      motivoParalizacion: null,
      fechaEstimadaReanudacion: null,
      paralizadaEn: null,
    });
  });

  it("una transicion que no toca PARALIZADA no anade estos campos", async () => {
    // PLANIFICACION -> EN_EJECUCION: nunca estuvo paralizada, no hay nada
    // que limpiar.
    estado.obra = { estado: "PLANIFICACION", nombreObra: "Obra de pruebas" };
    const r = await cambiarEstadoObra(CON_PERMISO, "obra-1", "EN_EJECUCION");
    expect(r.ok).toBe(true);
    expect(estado.actualizado).not.toHaveProperty("motivoParalizacion");
  });
});
