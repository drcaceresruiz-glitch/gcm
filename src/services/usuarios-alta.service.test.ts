import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SesionActiva } from "@/services/sesion.service";
import type { Permiso } from "@/lib/rbac";

/**
 * QUE UN RECHAZO DE LA BASE NO SALGA COMO PANTALLA ROTA, en el alta de
 * usuarios.
 *
 * El 20/08/2026 se arreglo este mismo hueco en el importador de presupuesto y
 * al mirar alrededor resulto que `crearUsuario` lo tenia igual: la escritura
 * se llamaba sin capturar, asi que cualquier rechazo de MariaDB subia hasta el
 * limite de Next y el administrador veia «Esta pantalla no se pudo cargar».
 *
 * Se fija la PROPIEDAD, no el texto: `crearUsuario` DEVUELVE el fallo, nunca
 * lo lanza.
 */

/// Con que revienta la transaccion, si es que revienta.
let fallaAlEscribir: unknown = null;
/// Lo que devuelve el `findUnique` por correo: quien ya lo tiene, si alguien.
let correoEnUso: { nombres: string; apellidos: string } | null = null;

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: {
      findUnique: () => Promise.resolve(correoEnUso),
      // El documento libre: lo que se prueba aqui es la escritura.
      findFirst: () => Promise.resolve(null),
      count: () => Promise.resolve(2),
    },
    $transaction: (fn: (tx: unknown) => unknown) => {
      if (fallaAlEscribir !== null) return Promise.reject(fallaAlEscribir);
      return Promise.resolve(
        fn({
          user: { create: () => Promise.resolve({ id: "u-nuevo" }) },
          auditLog: { create: () => Promise.resolve({}) },
        }),
      );
    },
  };
  return { prisma };
});

vi.mock("@/lib/password", () => ({ hashPassword: () => Promise.resolve("hash") }));
vi.mock("@/lib/tokens", () => ({ generateTemporaryPassword: () => "CLAVE-TEMP" }));
vi.mock("@/services/sesion.service", () => ({
  cerrarTodasLasSesiones: () => Promise.resolve(),
}));
vi.mock("@/services/empresa-migracion.service", () => ({
  motivoSiEmpresaEnMigracion: () => Promise.resolve(null),
}));
vi.mock("@/services/mailer.service", () => ({
  enviarCorreo: () => Promise.resolve({ enviado: true }),
  correoBienvenida: () => ({ asunto: "", texto: "", html: "" }),
  correoClaveRestablecida: () => ({ asunto: "", texto: "", html: "" }),
}));

const { crearUsuario, motivoDeFalloConUsuario } = await import(
  "@/services/usuarios.service"
);

function sesion(permisos: Permiso[] = ["usuario:crear"]): SesionActiva {
  return {
    sesionId: "s1",
    userId: "u1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
    obrasAsignadas: null,
    nombres: "Ana",
    apellidos: "Perez",
    email: "ana@ejemplo.pe",
    mustChangePassword: false,
    esOperador: false,
    rolReal: "ADMIN",
    previsualizacionHabilitada: false,
  };
}

const ALTA = {
  nombres: "Luis",
  apellidos: "Torres",
  email: "luis@constructora.pe",
  tipoDoc: "DNI",
  numDoc: "12345678",
  cargo: "Residente",
  celular: "999888777",
  role: "RESIDENTE",
};

beforeEach(() => {
  fallaAlEscribir = null;
  correoEnUso = null;
});

describe("crearUsuario: un fallo de la base se devuelve, no se lanza", () => {
  it("el camino bueno sigue devolviendo la clave temporal", async () => {
    const r = await crearUsuario(sesion(), ALTA);

    expect(r).toEqual({
      ok: true,
      claveTemporal: "CLAVE-TEMP",
      correoEnviado: true,
    });
  });

  it("no lanza cuando la escritura revienta", async () => {
    fallaAlEscribir = Object.assign(new Error("Duplicate entry"), {
      code: "P2002",
    });

    // `rejects` seria lo que pasaba antes: el error llegaba a la interfaz.
    await expect(crearUsuario(sesion(), ALTA)).resolves.toMatchObject({
      ok: false,
    });
  });

  it("y explica que no se guardo nada a medias", async () => {
    fallaAlEscribir = { code: "P2002" };

    const r = await crearUsuario(sesion(), ALTA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("No se guardo nada");
  });

  it("un error sin codigo tampoco se escapa", async () => {
    fallaAlEscribir = new Error("socket hang up");

    const r = await crearUsuario(sesion(), ALTA);
    expect(r.ok).toBe(false);
  });

  /**
   * Los textos largos se rechazan ANTES de escribir, con un mensaje que dice
   * el campo. El P2000 de abajo es solo la red por debajo.
   */
  it("un nombre larguisimo se para antes, sin tocar la base", async () => {
    const r = await crearUsuario(sesion(), { ...ALTA, nombres: "A".repeat(120) });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("100");
  });
});

describe("motivoDeFalloConUsuario", () => {
  it("P2002 habla de un alta simultanea, que es lo unico que queda", () => {
    expect(motivoDeFalloConUsuario({ code: "P2002" })).toContain("otra pantalla");
  });

  it("P2000 dice los topes", () => {
    const m = motivoDeFalloConUsuario({ code: "P2000" });
    expect(m).toContain("100");
    expect(m).toContain("150");
  });

  it("lo desconocido no se queda sin mensaje", () => {
    for (const e of [null, undefined, "texto", 42, {}, new Error("x")]) {
      expect(motivoDeFalloConUsuario(e)).toContain("No se pudo guardar");
    }
  });

  it("todos prometen que no quedo nada a medias", () => {
    for (const code of ["P2002", "P2000", "P2003", "PXXXX"]) {
      expect(motivoDeFalloConUsuario({ code })).toContain("No se guardo nada");
    }
  });
});
