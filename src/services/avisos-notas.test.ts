import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * El aviso de nota con recordatorio vencido.
 *
 * Se prueba con Prisma doblado, sin base. Mismas tres cosas que
 * `avisos-valorizacion.test.ts`, por el mismo motivo: que suene UNA vez al
 * dia por nota, que llegue a alguien, y que lleve a la nota exacta.
 */

interface FilaNota {
  id: string;
  titulo: string;
  categoria: string;
  fechaRecordatorio: Date | null;
}

interface Estado {
  notas: FilaNota[];
  miembros: { userId: string; role: string }[];
  reservadas: Set<string>;
  avisos: { userId: string; titulo: string; cuerpo: string; camino: string }[];
}

const estado: Estado = {
  notas: [],
  miembros: [],
  reservadas: new Set(),
  avisos: [],
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    nota: { findMany: async () => estado.notas },
    projectMembership: { findMany: async () => estado.miembros },
    envioAviso: {
      create: async ({ data }: { data: { clave: string } }) => {
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

const { avisarNotasVencidas } = await import("@/services/avisos-notas");

const OBRA = { id: "obra-1", companyId: "emp-1" };
const HOY = new Date("2026-08-21T10:00:00.000Z");

function notaVencida(): FilaNota {
  return {
    id: "nota-1",
    titulo: "Falta el certificado de calidad del fierro",
    categoria: "LOGISTICA",
    fechaRecordatorio: new Date("2026-08-10T00:00:00.000Z"),
  };
}

beforeEach(() => {
  estado.notas = [];
  estado.miembros = [];
  estado.reservadas = new Set();
  estado.avisos = [];
});

describe("avisarNotasVencidas", () => {
  it("avisa al residente asignado, con el ancla a la nota exacta", async () => {
    estado.notas = [notaVencida()];
    estado.miembros = [{ userId: "u-rita", role: "RESIDENTE" }];

    const creados = await avisarNotasVencidas(OBRA, HOY);

    expect(creados).toBe(1);
    expect(estado.avisos).toHaveLength(1);
    expect(estado.avisos[0]).toMatchObject({
      userId: "u-rita",
      camino: "/notas#nota-nota-1",
    });
    expect(estado.avisos[0]?.titulo).toContain(
      "Falta el certificado de calidad del fierro",
    );
    expect(estado.avisos[0]?.cuerpo).toContain("No bloquea");
  });

  it("no repite en la misma pasada ni en la siguiente del mismo dia", async () => {
    estado.notas = [notaVencida()];
    estado.miembros = [{ userId: "u-rita", role: "RESIDENTE" }];

    const primera = await avisarNotasVencidas(OBRA, HOY);
    const segunda = await avisarNotasVencidas(OBRA, HOY);

    expect(primera).toBe(1);
    expect(segunda).toBe(0);
    expect(estado.avisos).toHaveLength(1);
  });

  it("al dia siguiente vuelve a sonar: sigue sin atenderse", async () => {
    estado.notas = [notaVencida()];
    estado.miembros = [{ userId: "u-rita", role: "RESIDENTE" }];

    await avisarNotasVencidas(OBRA, HOY);
    const manana = await avisarNotasVencidas(
      OBRA,
      new Date("2026-08-22T10:00:00.000Z"),
    );

    expect(manana).toBe(1);
    expect(estado.avisos).toHaveLength(2);
  });

  it("sin residente, avisa al administrador de obra", async () => {
    estado.notas = [notaVencida()];
    estado.miembros = [{ userId: "u-admin", role: "ADMIN_OBRA" }];

    await avisarNotasVencidas(OBRA, HOY);

    expect(estado.avisos).toHaveLength(1);
    expect(estado.avisos[0]?.userId).toBe("u-admin");
  });

  it("con residente, solo al residente", async () => {
    estado.notas = [notaVencida()];
    estado.miembros = [
      { userId: "u-rita", role: "RESIDENTE" },
      { userId: "u-admin", role: "ADMIN_OBRA" },
    ];

    await avisarNotasVencidas(OBRA, HOY);

    expect(estado.avisos.map((a) => a.userId)).toEqual(["u-rita"]);
  });

  it("una nota con fecha futura no genera nada", async () => {
    estado.notas = [
      { ...notaVencida(), fechaRecordatorio: new Date("2026-09-01T00:00:00.000Z") },
    ];
    estado.miembros = [{ userId: "u-rita", role: "RESIDENTE" }];

    expect(await avisarNotasVencidas(OBRA, HOY)).toBe(0);
    expect(estado.avisos).toEqual([]);
  });

  it("una nota sin fecha de recordatorio no genera nada", async () => {
    estado.notas = [{ ...notaVencida(), fechaRecordatorio: null }];
    estado.miembros = [{ userId: "u-rita", role: "RESIDENTE" }];

    expect(await avisarNotasVencidas(OBRA, HOY)).toBe(0);
    expect(estado.avisos).toEqual([]);
  });

  it("sin nadie a quien avisar no escribe nada, ni reserva la clave", async () => {
    estado.notas = [notaVencida()];
    estado.miembros = [];

    expect(await avisarNotasVencidas(OBRA, HOY)).toBe(0);
    expect(estado.avisos).toEqual([]);
    // Si reservara la clave sin avisar, el dia que alguien asigne un
    // residente el aviso ya no sonaria hasta el dia siguiente.
    expect(estado.reservadas.size).toBe(0);
  });
});
