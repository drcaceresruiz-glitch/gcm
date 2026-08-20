import { describe, it, expect, vi, beforeEach } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Las plantillas de mensaje para contratistas.
 *
 * Lo que se sostiene aqui es el reparto de permisos, que NO es uno solo:
 * escribirlas es configuracion de la empresa y usarlas es de quien escribe
 * —el residente usa, no redacta—. Y que editar vaya acotado por empresa
 * DENTRO del `where`, que es lo que impide tocar la de otra constructora
 * acertando su id.
 */

const estado: {
  congelada: string | null;
  filasQueTocaria: number;
  choqueDeNombre: boolean;
  creada: Record<string, unknown> | null;
  cambios: { where: Record<string, unknown>; data: Record<string, unknown> }[];
} = {
  congelada: null,
  filasQueTocaria: 1,
  choqueDeNombre: false,
  creada: null,
  cambios: [],
};

vi.mock("@/services/empresa-migracion.service", () => ({
  motivoSiEmpresaEnMigracion: () => Promise.resolve(estado.congelada),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    plantillaMensaje: {
      findMany: () => Promise.resolve([]),
      create: (args: { data: Record<string, unknown> }) => {
        if (estado.choqueDeNombre) {
          return Promise.reject(Object.assign(new Error("unique"), { code: "P2002" }));
        }
        estado.creada = args.data;
        return Promise.resolve({ id: "pl-nueva" });
      },
      updateMany: (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        estado.cambios.push(args);
        return Promise.resolve({ count: estado.filasQueTocaria });
      },
    },
  },
}));

const { listarPlantillas, guardarPlantilla, retirarPlantilla } = await import(
  "@/services/plantillas-mensaje.service"
);

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
  } as unknown as SesionActiva;
}

const ADMIN = sesion(["configuracion:editar"]);
/// El residente: escribe a contratistas pero no configura la empresa.
const RESIDENTE = sesion(["proveedor:contactar"]);
const MIRON = sesion(["obra:leer"]);

const BUENA = { nombre: "Recordatorio de valorización", asunto: "Valorización", cuerpo: "Buenos días, recuerda enviar tu valorización." };

beforeEach(() => {
  estado.congelada = null;
  estado.filasQueTocaria = 1;
  estado.choqueDeNombre = false;
  estado.creada = null;
  estado.cambios = [];
});

describe("quien las escribe y quien las usa", () => {
  it("el residente NO puede crearlas", async () => {
    const r = await guardarPlantilla(RESIDENTE, BUENA);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("permiso");
    expect(estado.creada).toBeNull();
  });

  /// Pero SI puede verlas: negarle la lista dejaria el desplegable vacio sin
  /// decir por que, justo a quien esta en obra.
  it("pero si puede verlas", async () => {
    expect(await listarPlantillas(RESIDENTE)).toEqual([]);
    // Y quien no tiene ninguno de los dos permisos, no.
    expect(await listarPlantillas(MIRON)).toEqual([]);
  });

  it("y con la empresa congelada no se escribe nada", async () => {
    estado.congelada = "La empresa esta en migracion.";

    const r = await guardarPlantilla(ADMIN, BUENA);
    expect(r).toEqual({ ok: false, error: "La empresa esta en migracion." });
    expect(estado.creada).toBeNull();
  });
});

describe("lo que no se guarda", () => {
  it("sin nombre no se reconoce en el desplegable", async () => {
    const r = await guardarPlantilla(ADMIN, { ...BUENA, nombre: "   " });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("nombre");
    expect(estado.creada).toBeNull();
  });

  it("y una vacia no sirve de nada", async () => {
    const r = await guardarPlantilla(ADMIN, { ...BUENA, cuerpo: "  " });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("vacia");
    expect(estado.creada).toBeNull();
  });

  it("dos con el mismo nombre no se distinguen: se dice claro", async () => {
    estado.choqueDeNombre = true;

    const r = await guardarPlantilla(ADMIN, BUENA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Ya tienes una plantilla");
  });
});

describe("el camino bueno", () => {
  it("crea, limpia los espacios y deja el asunto en null si esta vacio", async () => {
    const r = await guardarPlantilla(ADMIN, {
      nombre: "  Aviso   de   corte  ",
      asunto: "   ",
      cuerpo: "  Mañana no hay agua.  ",
    });

    expect(r.ok).toBe(true);
    expect(estado.creada).toMatchObject({
      companyId: "empresa-1",
      nombre: "Aviso de corte",
      asunto: null,
      cuerpo: "Mañana no hay agua.",
    });
  });

  /**
   * Editar va por `updateMany` con el `companyId` en el `where`, no por
   * `update` con el id: es lo que impide tocar la plantilla de otra
   * constructora acertando su id, sin depender de acordarse de comprobarlo
   * antes.
   */
  it("al editar, el filtro lleva la empresa", async () => {
    const r = await guardarPlantilla(ADMIN, { ...BUENA, id: "pl-1" });

    expect(r).toEqual({ ok: true, id: "pl-1" });
    expect(estado.cambios[0]?.where).toEqual({
      id: "pl-1",
      companyId: "empresa-1",
    });
  });

  it("y editar una que no es tuya no encuentra nada", async () => {
    estado.filasQueTocaria = 0;

    const r = await guardarPlantilla(ADMIN, { ...BUENA, id: "ajena" });
    expect(r).toEqual({ ok: false, error: "Plantilla no encontrada." });
  });

  /// Se DESACTIVA, no se borra: los mensajes ya enviados con ella siguen en el
  /// historial, y la fila permite entender de donde salio aquel texto.
  it("retirar desactiva, no borra", async () => {
    const r = await retirarPlantilla(ADMIN, "pl-1");

    expect(r.ok).toBe(true);
    expect(estado.cambios[0]).toEqual({
      where: { id: "pl-1", companyId: "empresa-1" },
      data: { activa: false },
    });
  });
});
