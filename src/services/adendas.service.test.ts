import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El circuito de dos firmas de una adenda de contratista.
 *
 * QUIEN PIDE NO FIRMA. Es lo unico que hace que el circuito exista, y lo que
 * estas pruebas vigilan: que registrar no apruebe, que aprobar necesite su
 * propio permiso, y que una adenda resuelta no se pueda volver a resolver.
 *
 * Sin base de datos: Prisma va doblado y GUARDA lo que se le escribe, porque
 * lo que hay que comprobar es con que estado nace y con cual queda.
 */

interface AdendaGuardada {
  id: string;
  numero: number;
  estado: string;
  importe: string;
  resueltaPor?: string | null;
  motivoRechazo?: string | null;
}

interface Estado {
  encargo: { id: string; estado: string; numero: number } | null;
  adendas: AdendaGuardada[];
  creadas: Record<string, unknown>[];
  actualizaciones: { where: Record<string, unknown>; data: Record<string, unknown> }[];
  /// Simula que otra persona resuelve la adenda entre la lectura y el update.
  seCuelaOtraFirma: boolean;
}

const estado: Estado = {
  encargo: { id: "enc-1", estado: "VIGENTE", numero: 4 },
  adendas: [],
  creadas: [],
  actualizaciones: [],
  seCuelaOtraFirma: false,
};

vi.mock("@/lib/prisma", () => {
  const adendaEncargo = {
    aggregate: () =>
      Promise.resolve({
        _max: {
          numero: estado.adendas.reduce((m, a) => Math.max(m, a.numero), 0) || null,
        },
      }),
    findFirst: (args: { where: { id: string } }) =>
      Promise.resolve(estado.adendas.find((a) => a.id === args.where.id) ?? null),
    findMany: () => Promise.resolve(estado.adendas),
    create: (args: { data: Record<string, unknown> }) => {
      estado.creadas.push(args.data);
      return Promise.resolve({ id: "ad-nueva", numero: args.data.numero });
    },
    updateMany: (args: {
      where: { id: string; estado: string };
      data: Record<string, unknown>;
    }) => {
      // Justo aqui es donde se cuela la otra firma, que es donde puede pasar
      // de verdad: despues de que esta transaccion leyera el estado.
      if (estado.seCuelaOtraFirma) {
        estado.seCuelaOtraFirma = false;
        const otra = estado.adendas.find((a) => a.id === args.where.id);
        if (otra) otra.estado = "APROBADA";
      }

      estado.actualizaciones.push(args);
      // El filtro por estado se implementa DE VERDAD: es la guarda que impide
      // que dos firmas simultaneas se pisen, y un doble que devolviera 1
      // siempre la daria por buena sin comprobarla.
      const fila = estado.adendas.find(
        (a) => a.id === args.where.id && a.estado === args.where.estado,
      );
      if (!fila) return Promise.resolve({ count: 0 });
      fila.estado = String(args.data.estado);
      return Promise.resolve({ count: 1 });
    },
  };

  return {
    prisma: {
      encargoProveedor: {
        findFirst: () => Promise.resolve(estado.encargo),
      },
      adendaEncargo,
      auditLog: { create: () => Promise.resolve({}) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ adendaEncargo, auditLog: { create: () => Promise.resolve({}) } }),
    },
  };
});

vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: async () => null,
}));

import { crearAdenda, resolverAdenda } from "@/services/adendas.service";
import type { Permiso } from "@/lib/rbac";

const sesion = (permisos: Permiso[]) =>
  ({
    userId: "u1",
    companyId: "c1",
    role: "RESIDENTE",
    permisos,
    nombres: "Ana",
    apellidos: "Quispe",
  }) as never;

const RESIDENTE = sesion(["adenda:crear", "encargo:leer"]);
const GERENCIA = sesion(["adenda:aprobar", "encargo:leer"]);

const DATOS = {
  fecha: "2026-08-23",
  importe: "8000",
  concepto: "Refuerzo de columnas no previsto",
  motivo: "El plano de detalle llego despues de la orden.",
};

beforeEach(() => {
  estado.encargo = { id: "enc-1", estado: "VIGENTE", numero: 4 };
  estado.adendas = [];
  estado.creadas = [];
  estado.actualizaciones = [];
  estado.seCuelaOtraFirma = false;
});

describe("registrar una adenda", () => {
  it("nace PENDIENTE, con quien la registro", async () => {
    const r = await crearAdenda(RESIDENTE, "obra-1", "enc-1", DATOS);

    expect(r.ok).toBe(true);
    expect(estado.creadas[0]!.registradaPor).toBe("Ana Quispe");
    // El estado no se pasa: lo pone el DEFAULT del esquema. Que no viaje aqui
    // es lo que impide que alguien lo fuerce desde el formulario.
    expect(estado.creadas[0]!.estado).toBeUndefined();
  });

  it("un deductivo se guarda con su signo", async () => {
    await crearAdenda(RESIDENTE, "obra-1", "enc-1", {
      ...DATOS,
      importe: "-12000",
      concepto: "Zona 2 sale de su alcance",
    });

    expect(estado.creadas[0]!.importe).toBe("-12000.00");
  });

  it("una adenda de cero se rechaza, y se dice por que", async () => {
    // No cambia el contrato, asi que no es una adenda. Si lo que se quiere es
    // dejar constancia de un acuerdo sin efecto economico, eso es una nota.
    const r = await crearAdenda(RESIDENTE, "obra-1", "enc-1", {
      ...DATOS,
      importe: "0",
    });

    expect(r.ok).toBe(false);
    expect(estado.creadas).toHaveLength(0);
  });

  it("sin motivo no se guarda: un adicional sin sustento no se puede firmar", async () => {
    const r = await crearAdenda(RESIDENTE, "obra-1", "enc-1", {
      ...DATOS,
      motivo: "   ",
    });

    expect(r.ok).toBe(false);
    expect(estado.creadas).toHaveLength(0);
  });

  it("un encargo ANULADO no admite adendas", async () => {
    estado.encargo = { id: "enc-1", estado: "ANULADO", numero: 4 };
    const r = await crearAdenda(RESIDENTE, "obra-1", "enc-1", DATOS);

    expect(r.ok).toBe(false);
    expect(estado.creadas).toHaveLength(0);
  });

  it("sin permiso no se registra nada", async () => {
    const r = await crearAdenda(GERENCIA, "obra-1", "enc-1", DATOS);

    expect(r.ok).toBe(false);
    expect(estado.creadas).toHaveLength(0);
  });

  it("el correlativo sigue al ultimo del encargo", async () => {
    estado.adendas = [
      { id: "a1", numero: 1, estado: "APROBADA", importe: "1000.00" },
      { id: "a2", numero: 2, estado: "RECHAZADA", importe: "500.00" },
    ];

    await crearAdenda(RESIDENTE, "obra-1", "enc-1", DATOS);

    // La 3, contando tambien la rechazada: los numeros de documento no se
    // reciclan, o dos papeles distintos acabarian llamandose igual.
    expect(estado.creadas[0]!.numero).toBe(3);
  });
});

describe("la segunda firma", () => {
  beforeEach(() => {
    estado.adendas = [
      { id: "a1", numero: 1, estado: "PENDIENTE", importe: "8000.00" },
    ];
  });

  it("quien la registro NO puede aprobarla", async () => {
    // La razon de ser del circuito. Si el residente pudiera firmar lo que
    // pide, no habria dos firmas: habria una escrita dos veces.
    const r = await resolverAdenda(RESIDENTE, "obra-1", "a1", { aprobar: true });

    expect(r.ok).toBe(false);
    expect(estado.adendas[0]!.estado).toBe("PENDIENTE");
  });

  it("gerencia la aprueba, y queda quien firmo", async () => {
    const r = await resolverAdenda(GERENCIA, "obra-1", "a1", { aprobar: true });

    expect(r.ok).toBe(true);
    expect(estado.adendas[0]!.estado).toBe("APROBADA");
    expect(estado.actualizaciones[0]!.data.resueltaPor).toBe("Ana Quispe");
  });

  it("rechazar SIN motivo no vale", async () => {
    // Un «no» sin motivo no sirve para negociar con el contratista despues.
    const r = await resolverAdenda(GERENCIA, "obra-1", "a1", { aprobar: false });

    expect(r.ok).toBe(false);
    expect(estado.adendas[0]!.estado).toBe("PENDIENTE");
  });

  it("rechazar con motivo deja el motivo, no lo pierde", async () => {
    const r = await resolverAdenda(GERENCIA, "obra-1", "a1", {
      aprobar: false,
      motivoRechazo: "Ese alcance ya estaba en la partida 3.2.",
    });

    expect(r.ok).toBe(true);
    expect(estado.adendas[0]!.estado).toBe("RECHAZADA");
    expect(estado.actualizaciones[0]!.data.motivoRechazo).toBe(
      "Ese alcance ya estaba en la partida 3.2.",
    );
  });

  it("una adenda ya aprobada no se vuelve a resolver", async () => {
    /*
     * Aprobar es irreversible, como aprobar un movimiento presupuestal. Si se
     * pudiera desaprobar, el comprometido de la obra bajaria sin que quedara
     * rastro de que alguna vez subio, y esa es la cifra que se mira para
     * saber si la obra se esta yendo. Se corrige con otra adenda de signo
     * contrario.
     */
    estado.adendas = [
      { id: "a1", numero: 1, estado: "APROBADA", importe: "8000.00" },
    ];

    const r = await resolverAdenda(GERENCIA, "obra-1", "a1", { aprobar: false, motivoRechazo: "x" });

    expect(r.ok).toBe(false);
    expect(estado.adendas[0]!.estado).toBe("APROBADA");
    expect(estado.actualizaciones).toHaveLength(0);
  });

  it("si otro firma primero, se avisa y NO se dice que si", async () => {
    /*
     * La carrera real: dos personas con permiso abren la misma adenda
     * pendiente y las dos pulsan. La comprobacion de arriba deja pasar a las
     * dos -cuando leyeron, estaba pendiente-, y lo unico que separa la
     * segunda de pisar la firma de la primera es que la condicion de estado
     * viaje tambien en el WHERE del update.
     *
     * Decir que si a la segunda la dejaria creyendo que aprobo ella, y el
     * rastro diria otra cosa. En un circuito de dos firmas, quien firmo es el
     * dato.
     */
    estado.adendas = [
      { id: "a1", numero: 1, estado: "PENDIENTE", importe: "8000.00" },
    ];
    // La otra firma entra justo despues de que esta leyera.
    estado.seCuelaOtraFirma = true;

    const r = await resolverAdenda(GERENCIA, "obra-1", "a1", { aprobar: true });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Otra persona");
    // Y la firma de la primera sigue en pie: no se sobrescribio.
    expect(estado.adendas[0]!.estado).toBe("APROBADA");
  });
});
