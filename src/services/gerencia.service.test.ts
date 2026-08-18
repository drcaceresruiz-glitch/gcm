import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SesionActiva } from "@/services/sesion.service";
import type { Permiso } from "@/lib/rbac";

/**
 * La lectura de gerencia.
 *
 * Se defienden tres cosas: que solo la vea quien responde de toda la cartera,
 * que el importe salga de las LINEAS y no del total guardado —que en un
 * borrador puede ir por detras— y que el coste no crezca con el numero de
 * obras.
 */

interface Llamada {
  modelo: string;
  args: unknown;
}

const llamadas: Llamada[] = [];
const datos = {
  movimientos: [] as unknown[],
  lineas: [] as unknown[],
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    movimientoPresupuestal: {
      findMany: async (args: unknown) => {
        llamadas.push({ modelo: "movimientoPresupuestal", args });
        return datos.movimientos;
      },
    },
    movimientoLinea: {
      groupBy: async (args: unknown) => {
        llamadas.push({ modelo: "movimientoLinea", args });
        return datos.lineas;
      },
    },
  },
}));

const { adicionalesEnBorrador } = await import("@/services/gerencia.service");

function sesion(
  obrasAsignadas: string[] | null,
  permisos: Permiso[] = ["movimiento:leer"],
): SesionActiva {
  return {
    sesionId: "s1",
    userId: "u1",
    companyId: "emp-1",
    role: obrasAsignadas === null ? "ADMIN" : "RESIDENTE",
    permisos,
    obrasAsignadas,
    nombres: "Ana",
    apellidos: "Perez",
    email: "ana@ejemplo.pe",
    mustChangePassword: false,
    esOperador: false,
  };
}

/// Dos adicionales en una obra y uno en otra.
function conTresAdicionales() {
  datos.movimientos = [
    { id: "m1", projectId: "o1", project: { nombreObra: "TORRE A" } },
    { id: "m2", projectId: "o1", project: { nombreObra: "TORRE A" } },
    { id: "m3", projectId: "o2", project: { nombreObra: "COLEGIO B" } },
  ];
  datos.lineas = [
    { movimientoId: "m1", _sum: { importe: "1000.00" } },
    { movimientoId: "m2", _sum: { importe: "500.50" } },
    { movimientoId: "m3", _sum: { importe: "9000.00" } },
  ];
}

beforeEach(() => {
  llamadas.length = 0;
  datos.movimientos = [];
  datos.lineas = [];
});

describe("adicionalesEnBorrador", () => {
  it("agrupa por obra y suma el impacto de la cartera", async () => {
    conTresAdicionales();

    const r = await adicionalesEnBorrador(sesion(null));

    expect(r?.cuantos).toBe(3);
    expect(r?.importe).toBe("10500.50");
    // Ordenado por impacto: primero lo que mas dinero mueve.
    expect(r?.porObra).toEqual([
      { obraId: "o2", obraNombre: "COLEGIO B", cuantos: 1, importe: "9000.00" },
      { obraId: "o1", obraNombre: "TORRE A", cuantos: 2, importe: "1500.50" },
    ]);
  });

  /**
   * La linea que traza el alcance por obra: quien lleva una obra no ve el
   * pendiente de las demas, aunque tenga permiso de movimientos.
   */
  it("no la ve quien no ve toda la cartera", async () => {
    conTresAdicionales();
    expect(await adicionalesEnBorrador(sesion(["o1"]))).toBeNull();
    // Y ni siquiera consulta.
    expect(llamadas).toEqual([]);
  });

  it("sin permiso de movimientos tampoco, y sin tocar la base", async () => {
    conTresAdicionales();
    expect(await adicionalesEnBorrador(sesion(null, []))).toBeNull();
    expect(llamadas).toEqual([]);
  });

  /**
   * El coste es lo que decide si esta pantalla puede existir: DOS consultas,
   * sean dos obras o cuarenta. Si alguien anade una por obra, esto falla.
   */
  it("cuesta dos consultas, no una por obra", async () => {
    conTresAdicionales();
    await adicionalesEnBorrador(sesion(null));
    expect(llamadas.map((l) => l.modelo)).toEqual([
      "movimientoPresupuestal",
      "movimientoLinea",
    ]);
  });

  it("pide solo ADICIONAL en BORRADOR y de la empresa de la sesion", async () => {
    conTresAdicionales();
    await adicionalesEnBorrador(sesion(null));

    const where = (llamadas[0]?.args as { where: Record<string, unknown> }).where;
    expect(where).toEqual({
      tipo: "ADICIONAL",
      estado: "BORRADOR",
      project: { companyId: "emp-1" },
    });
  });

  it("sin adicionales devuelve cero y no consulta las lineas", async () => {
    const r = await adicionalesEnBorrador(sesion(null));
    expect(r).toEqual({ porObra: [], importe: "0.00", cuantos: 0 });
    expect(llamadas).toHaveLength(1);
  });

  /**
   * Un movimiento sin lineas todavia —recien creado— cuenta como cero, no
   * rompe la suma ni desaparece de la lista: existe y alguien lo esta
   * redactando.
   */
  it("un borrador sin lineas suma cero y sigue contando", async () => {
    datos.movimientos = [
      { id: "m1", projectId: "o1", project: { nombreObra: "TORRE A" } },
    ];
    datos.lineas = [];

    const r = await adicionalesEnBorrador(sesion(null));
    expect(r?.cuantos).toBe(1);
    expect(r?.importe).toBe("0.00");
    expect(r?.porObra[0]?.importe).toBe("0.00");
  });
});
