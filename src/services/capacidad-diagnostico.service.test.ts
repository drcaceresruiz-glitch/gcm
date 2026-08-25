import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * `historialDeCapacidad`: la herramienta de diagnostico temporal para
 * contrastar los umbrales de `lib/capacidad.ts` contra semanas ya cerradas.
 * Solo se prueba la agregacion -el calculo de ambicion en si ya lo prueba
 * `capacidad.test.ts`-.
 */

const estado: {
  planes: {
    projectId: string;
    numero: number;
    fechaCorte: Date;
    nombreObra: string;
    compromisos: { cumplido: boolean | null; causa: null }[];
  }[];
} = {
  planes: [],
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    planSemanal: {
      findMany: () =>
        Promise.resolve(
          estado.planes.map((p) => ({
            projectId: p.projectId,
            numero: p.numero,
            fechaCorte: p.fechaCorte,
            project: { nombreObra: p.nombreObra },
            compromisos: p.compromisos,
          })),
        ),
    },
  },
}));

const { historialDeCapacidad } = await import(
  "@/services/capacidad-diagnostico.service"
);

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
    // `null` es «alcanza todas las obras de su empresa». Sin este campo la
    // sesion no es valida: la lista vacia y el null son cosas opuestas.
    obrasAsignadas: null,
  } as unknown as SesionActiva;
}

beforeEach(() => {
  estado.planes = [];
});

describe("historialDeCapacidad", () => {
  it("sin el permiso, no devuelve nada", async () => {
    const r = await historialDeCapacidad(sesion([]));
    expect(r).toEqual([]);
  });

  it("agrupa por obra y cuenta comprometidos/cumplidos desde los compromisos", async () => {
    estado.planes = [
      {
        projectId: "obra-1",
        numero: 1,
        fechaCorte: new Date("2026-07-01"),
        nombreObra: "Obra Uno",
        compromisos: [
          { cumplido: true, causa: null },
          { cumplido: false, causa: null },
        ],
      },
      {
        projectId: "obra-1",
        numero: 2,
        fechaCorte: new Date("2026-07-08"),
        nombreObra: "Obra Uno",
        compromisos: [{ cumplido: true, causa: null }],
      },
      {
        projectId: "obra-2",
        numero: 1,
        fechaCorte: new Date("2026-07-01"),
        nombreObra: "Obra Dos",
        compromisos: [],
      },
    ];

    const r = await historialDeCapacidad(sesion(["configuracion:editar"]));

    // Obra con mas historial primero.
    expect(r[0]?.obraId).toBe("obra-1");
    expect(r[0]?.semanas).toEqual([
      { numero: 1, fechaCorte: new Date("2026-07-01"), comprometidos: 2, cumplidos: 1 },
      { numero: 2, fechaCorte: new Date("2026-07-08"), comprometidos: 1, cumplidos: 1 },
    ]);

    expect(r[1]?.obraId).toBe("obra-2");
    expect(r[1]?.semanas).toEqual([
      { numero: 1, fechaCorte: new Date("2026-07-01"), comprometidos: 0, cumplidos: 0 },
    ]);
  });
});
