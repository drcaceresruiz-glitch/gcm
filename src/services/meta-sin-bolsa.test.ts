import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Por que no hay bolsa: el MOTIVO, no la frase.
 *
 * Existe por un ciclo real visto en produccion. La pantalla de la meta elegia
 * a donde mandar al usuario buscando las palabras «linea base» dentro del
 * mensaje de error, y ese mensaje aparecia justo cuando lo que faltaba era el
 * CONTRACTUAL. Resultado: quien acababa de cargar su meta iba a Revisiones
 * —que sirve para congelar un contractual que todavia no existe—, no
 * encontraba nada que hacer, volvia, y le seguian pidiendo lo mismo.
 *
 * Estas pruebas fijan el codigo de motivo, que es lo que la pantalla mira
 * ahora. Con Prisma doblado, sin base.
 */

interface Estado {
  obraExiste: boolean;
  hayMeta: boolean;
  hayLineaBase: boolean;
}

const estado: Estado = { obraExiste: true, hayMeta: true, hayLineaBase: false };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: async () => (estado.obraExiste ? { id: "obra-1" } : null),
    },
    presupuestoMeta: {
      findFirst: async () =>
        estado.hayMeta
          ? {
              id: "meta-1",
              version: 1,
              modo: "PARTIDA",
              costoTotal: "100.00",
              mesesPlazo: "1.00",
              fechaMeta: new Date(Date.UTC(2026, 7, 8)),
              aprobadaAt: null,
              notas: null,
            }
          : null,
    },
    presupuestoMetaItem: { findMany: async () => [] },
  },
}));

/**
 * El presupuesto contractual vive en `movimientos.service` y lanza
 * `SinLineaBaseError` cuando todavia no hay ninguno. Es exactamente el camino
 * que producia el mensaje enganoso sobre la linea base.
 */
vi.mock("@/services/movimientos.service", async () => {
  const real =
    await vi.importActual<typeof import("@/services/movimientos.service")>(
      "@/services/movimientos.service",
    );
  return {
    ...real,
    // Se dobla la version SIN SESION, que es la que llama `meta.service`
    // desde que el reloj de avisos necesita la misma cuenta sin nadie detras.
    presupuestoVigenteDeObra: async () => {
      if (!estado.hayLineaBase) throw new real.SinLineaBaseError();
      return { lineas: [], version: 1 };
    },
  };
});

const sesion = {
  userId: "u1",
  companyId: "c1",
  role: "ADMIN",
  permisos: ["meta:leer", "movimiento:leer"],
  nombres: "A",
  apellidos: "B",
} as never;

beforeEach(() => {
  estado.obraExiste = true;
  estado.hayMeta = true;
  estado.hayLineaBase = false;
});

describe("compararConContractual - por que no hay bolsa", () => {
  it("sin contractual dice sin-contractual, no algo sobre la linea base", () => {
    // El motivo es lo que decide a donde se manda al usuario. Si esto vuelve
    // a mezclarse con el caso de la linea base, vuelve el ciclo.
    return import("@/services/meta.service").then(async (meta) => {
      const r = await meta.compararConContractual(sesion, "obra-1");
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.motivo).toBe("sin-contractual");
    });
  });

  it("y el mensaje habla de generar el contractual, que es lo que toca", () => {
    return import("@/services/meta.service").then(async (meta) => {
      const r = await meta.compararConContractual(sesion, "obra-1");
      if (r.ok) throw new Error("deberia fallar");
      expect(r.error).toContain("contractual");
      // La frase que mandaba a congelar algo inexistente ya no aparece.
      expect(r.error).not.toContain("linea base aprobada");
    });
  });

  it("sin meta cargada el motivo es otro: ahi si toca cargarla", () => {
    estado.hayMeta = false;
    return import("@/services/meta.service").then(async (meta) => {
      const r = await meta.compararConContractual(sesion, "obra-1");
      if (r.ok) throw new Error("deberia fallar");
      expect(r.motivo).toBe("sin-meta");
    });
  });

  it("una obra de otra empresa no revela nada mas que «no encontrada»", () => {
    estado.obraExiste = false;
    return import("@/services/meta.service").then(async (meta) => {
      const r = await meta.compararConContractual(sesion, "obra-ajena");
      if (r.ok) throw new Error("deberia fallar");
      expect(r.motivo).toBe("sin-obra");
    });
  });

  it("sin permiso ni siquiera se mira la obra", () => {
    const sinPermiso = { ...(sesion as object), permisos: [] } as never;
    return import("@/services/meta.service").then(async (meta) => {
      const r = await meta.compararConContractual(sinPermiso, "obra-1");
      if (r.ok) throw new Error("deberia fallar");
      expect(r.motivo).toBe("sin-permiso");
    });
  });

  it("quien ve la meta pero no el contractual recibe un motivo propio", () => {
    // Es el caso de RESIDENTE y ADMIN_OBRA, que tienen `meta:leer` y
    // `movimiento:crear` pero no `movimiento:leer`. Antes la pantalla se caia
    // con el error crudo de permiso dentro de una caja roja de averia.
    const soloMeta = { ...(sesion as object), permisos: ["meta:leer"] } as never;
    return import("@/services/meta.service").then(async (meta) => {
      const r = await meta.compararConContractual(soloMeta, "obra-1");
      if (r.ok) throw new Error("deberia fallar");
      expect(r.motivo).toBe("sin-permiso-contractual");
      expect(r.error).toContain("permiso");
    });
  });
});
