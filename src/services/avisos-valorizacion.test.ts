import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * El aviso de valorizacion pendiente.
 *
 * Se prueba con Prisma doblado, sin base. Lo que se defiende son las tres
 * cosas que convierten este aviso en inutil o en spam:
 *
 *   - que suene UNA vez al dia por encargo, y no en cada pasada del reloj
 *     —el cron corre cada minuto—;
 *   - que llegue a alguien: al residente asignado, y si no hay, al
 *     administrador de obra;
 *   - que lleve a la pantalla donde se resuelve.
 */

interface Estado {
  encargos: unknown[];
  miembros: { userId: string; role: string }[];
  /// Claves ya reservadas: la segunda vez, `envioAviso.create` lanza.
  reservadas: Set<string>;
  avisos: { userId: string; titulo: string; cuerpo: string; camino: string }[];
}

const estado: Estado = {
  encargos: [],
  miembros: [],
  reservadas: new Set(),
  avisos: [],
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    encargoProveedor: { findMany: async () => estado.encargos },
    projectMembership: { findMany: async () => estado.miembros },
    envioAviso: {
      create: async ({ data }: { data: { clave: string } }) => {
        // La clave unica (projectId, canal, clave) es lo que hace idempotente
        // al reloj. El doble la imita: repetirla lanza, como en la base.
        if (estado.reservadas.has(data.clave)) {
          throw new Error("Unique constraint failed");
        }
        estado.reservadas.add(data.clave);
        return { id: "e1" };
      },
    },
    aviso: {
      createMany: async ({ data }: { data: Estado["avisos"] }) => {
        estado.avisos.push(...data);
        return { count: data.length };
      },
    },
  },
}));

const { avisarValorizacionesPendientes } = await import(
  "@/services/avisos-valorizacion"
);

const OBRA = { id: "obra-1", companyId: "emp-1", diaCorteSemanal: 5 };
const HOY = new Date("2026-08-21T10:00:00.000Z"); // viernes

/// Un encargo que arranco hace mucho y nunca valorizo: vencido seguro.
function encargoVencido() {
  return {
    id: "enc-1",
    numero: 3,
    cadenciaDias: 7,
    fechaInicio: new Date("2026-07-01T00:00:00.000Z"),
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    proveedor: { razonSocial: "ENCOFRADOS DEL SUR SAC" },
    fechasValorizacion: [],
    valorizaciones: [],
  };
}

beforeEach(() => {
  estado.encargos = [];
  estado.miembros = [];
  estado.reservadas = new Set();
  estado.avisos = [];
});

describe("avisarValorizacionesPendientes", () => {
  it("avisa al residente asignado, con el camino de la pantalla", async () => {
    estado.encargos = [encargoVencido()];
    estado.miembros = [{ userId: "u-rita", role: "RESIDENTE" }];

    const creados = await avisarValorizacionesPendientes(OBRA, HOY);

    expect(creados).toBe(1);
    expect(estado.avisos).toHaveLength(1);
    expect(estado.avisos[0]).toMatchObject({
      userId: "u-rita",
      camino: "/valorizaciones",
    });
    expect(estado.avisos[0]?.titulo).toContain("ENCOFRADOS DEL SUR SAC");
    // Dice los dias de retraso y que no bloquea: las dos cosas que hacen
    // accionable el aviso en vez de alarmante.
    expect(estado.avisos[0]?.cuerpo).toContain("días");
    expect(estado.avisos[0]?.cuerpo).toContain("No bloquea");
  });

  /**
   * El cron corre cada minuto. Sin la reserva por clave, un contratista con
   * una semana de retraso generaria miles de avisos en un dia.
   */
  it("no repite en la misma pasada ni en la siguiente del mismo dia", async () => {
    estado.encargos = [encargoVencido()];
    estado.miembros = [{ userId: "u-rita", role: "RESIDENTE" }];

    const primera = await avisarValorizacionesPendientes(OBRA, HOY);
    const segunda = await avisarValorizacionesPendientes(OBRA, HOY);

    expect(primera).toBe(1);
    expect(segunda).toBe(0);
    expect(estado.avisos).toHaveLength(1);
  });

  it("al dia siguiente vuelve a sonar: la deuda sigue ahi", async () => {
    estado.encargos = [encargoVencido()];
    estado.miembros = [{ userId: "u-rita", role: "RESIDENTE" }];

    await avisarValorizacionesPendientes(OBRA, HOY);
    const manana = await avisarValorizacionesPendientes(
      OBRA,
      new Date("2026-08-22T10:00:00.000Z"),
    );

    expect(manana).toBe(1);
    expect(estado.avisos).toHaveLength(2);
  });

  it("sin residente, avisa al administrador de obra", async () => {
    estado.encargos = [encargoVencido()];
    estado.miembros = [{ userId: "u-admin", role: "ADMIN_OBRA" }];

    await avisarValorizacionesPendientes(OBRA, HOY);

    expect(estado.avisos).toHaveLength(1);
    expect(estado.avisos[0]?.userId).toBe("u-admin");
  });

  /**
   * Con residente, el administrador de obra NO recibe: el aviso es para quien
   * lo tiene que resolver, y duplicarlo a todo el mundo es como se aprende a
   * ignorar la campanita.
   */
  it("con residente, solo al residente", async () => {
    estado.encargos = [encargoVencido()];
    estado.miembros = [
      { userId: "u-rita", role: "RESIDENTE" },
      { userId: "u-admin", role: "ADMIN_OBRA" },
    ];

    await avisarValorizacionesPendientes(OBRA, HOY);

    expect(estado.avisos.map((a) => a.userId)).toEqual(["u-rita"]);
  });

  it("un encargo al dia no genera nada", async () => {
    estado.encargos = [
      { ...encargoVencido(), valorizaciones: [{ fecha: HOY }] },
    ];
    estado.miembros = [{ userId: "u-rita", role: "RESIDENTE" }];

    expect(await avisarValorizacionesPendientes(OBRA, HOY)).toBe(0);
    expect(estado.avisos).toEqual([]);
  });

  it("sin nadie a quien avisar no escribe nada, ni reserva la clave", async () => {
    estado.encargos = [encargoVencido()];
    estado.miembros = [];

    expect(await avisarValorizacionesPendientes(OBRA, HOY)).toBe(0);
    expect(estado.avisos).toEqual([]);
    // Importa: si reservara la clave sin avisar, el dia que alguien asigne un
    // residente el aviso ya no sonaria hasta el dia siguiente.
    expect(estado.reservadas.size).toBe(0);
  });
});
