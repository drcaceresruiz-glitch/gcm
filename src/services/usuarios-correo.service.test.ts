import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Cambiar el correo de un usuario.
 *
 * EL CORREO ES EL IDENTIFICADOR DE ACCESO, y hasta el 19/08/2026 no se podia
 * cambiar por ninguna via. Eso dejaba sin salida al caso mas caro: alguien que
 * pierde el acceso a su buzon no puede recuperar su clave —el enlace va ahi— y
 * si ademas era el unico ADMIN, su constructora quedaba cerrada.
 *
 * Lo que se sostiene aqui son las tres guardas que lo rodean, porque las tres
 * fallan de formas que no se ven hasta que es tarde:
 *
 * - que no se pueda pisar el correo de OTRA persona, ni de esta empresa ni de
 *   otra, porque es unico en toda la instalacion;
 * - que NO se toque el correo de un operador, que perderia el area de
 *   constructoras sin forma de recuperarla desde dentro;
 * - que cambiarlo CIERRE sus sesiones, o seguiria entrando con el de antes
 *   hasta que caducara.
 */

const estado: {
  /// El usuario que se edita.
  usuario: Record<string, unknown> | null;
  /// Lo que devuelve el `findUnique` por correo: quien ya lo tiene, si alguien.
  correoEnUso: { id: string; companyId: string; nombres: string; apellidos: string } | null;
  /// Con que `where` se busco ese correo. Es lo que delata si la consulta
  /// sale de la empresa de la sesion.
  dondeBuscoElCorreo: unknown;
  /// Ids cuyas sesiones se cerraron.
  sesionesCerradas: string[];
  escrito: Record<string, unknown> | null;
} = {
  usuario: null,
  correoEnUso: null,
  dondeBuscoElCorreo: null,
  sesionesCerradas: [],
  escrito: null,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: () => Promise.resolve(estado.usuario),
      findUnique: (args: { where: unknown }) => {
        estado.dondeBuscoElCorreo = args.where;
        return Promise.resolve(estado.correoEnUso);
      },
      count: () => Promise.resolve(2),
    },
    company: { findUnique: () => Promise.resolve({ enMigracionAt: null }) },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          update: (args: { data: Record<string, unknown> }) => {
            estado.escrito = args.data;
            return Promise.resolve({});
          },
        },
        auditLog: { create: () => Promise.resolve({}) },
      }),
  },
}));

vi.mock("@/services/sesion.service", () => ({
  cerrarTodasLasSesiones: (userId: string) => {
    estado.sesionesCerradas.push(userId);
    return Promise.resolve();
  },
}));

/// El correo del operador. Se fija aqui para poder comprobar la guarda sin
/// depender de lo que tenga el entorno de quien corra las pruebas.
vi.mock("@/lib/env", () => ({
  env: { GCM_OPERADORES: "duenno@gcm.pe" },
  isProduction: false,
}));

const { editarUsuario } = await import("@/services/usuarios.service");

function sesion(): SesionActiva {
  return {
    userId: "admin-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos: ["usuario:editar"],
    nombres: "Ana",
    apellidos: "Quispe",
    email: "ana@constructora.pe",
  } as unknown as SesionActiva;
}

const ADMIN = sesion();

/// Los datos que ya tenia el usuario que se edita.
function existente(cambios: Record<string, unknown> = {}) {
  return {
    nombres: "Luis",
    apellidos: "Torres",
    email: "luis@constructora.pe",
    cargo: "Residente",
    tipoDoc: "DNI",
    numDoc: "12345678",
    celular: null,
    role: "RESIDENTE",
    estado: "ACTIVO",
    ...cambios,
  };
}

/// Lo que manda el formulario. Por defecto, lo mismo que ya habia.
function cambios(parciales: Record<string, string> = {}) {
  return {
    nombres: "Luis",
    apellidos: "Torres",
    email: "luis@constructora.pe",
    cargo: "Residente",
    tipoDoc: "DNI",
    numDoc: "12345678",
    celular: "",
    role: "RESIDENTE",
    ...parciales,
  };
}

beforeEach(() => {
  estado.usuario = existente();
  estado.correoEnUso = null;
  estado.sesionesCerradas = [];
  estado.escrito = null;
});

describe("cambiar el correo", () => {
  it("se guarda, y en minusculas", async () => {
    const r = await editarUsuario(ADMIN, "u-2", cambios({ email: "  NUEVO@Constructora.PE " }));

    expect(r.ok).toBe(true);
    expect(estado.escrito?.["email"]).toBe("nuevo@constructora.pe");
  });

  it("un correo con mala forma no pasa", async () => {
    const r = await editarUsuario(ADMIN, "u-2", cambios({ email: "esto no es un correo" }));

    expect(r.ok).toBe(false);
    expect(estado.escrito).toBeNull();
  });

  /**
   * El correo es unico en TODA la instalacion. Cuando el choque es con alguien
   * de la MISMA empresa se dice de quien, que es lo util; cuando es de otra,
   * NO — seria contar que esa persona existe aqui.
   */
  it("no pisa el correo de un companero, y dice de quien es", async () => {
    estado.correoEnUso = {
      id: "u-9",
      companyId: "empresa-1",
      nombres: "Rosa",
      apellidos: "Diaz",
    };

    const r = await editarUsuario(ADMIN, "u-2", cambios({ email: "rosa@constructora.pe" }));

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Rosa Diaz");
    expect(estado.escrito).toBeNull();
  });

  /**
   * EL MISMO CORREO EN OTRA CONSTRUCTORA YA NO CHOCA.
   *
   * Hasta el 20/08/2026 el correo era unico en toda la instalacion y aqui
   * habia una prueba de que, en ese caso, el mensaje NO decia de quien era.
   * Ahora es unico por empresa: la consulta va acotada con
   * `companyId_email`, asi que una cuenta de otra constructora no puede
   * siquiera aparecer, y cambiar el correo a uno que exista fuera es
   * exactamente lo que se vino a permitir.
   *
   * Lo que se comprueba es que la consulta LLEVA la empresa de la sesion. Sin
   * eso volveria el choque que ya no debe existir.
   */
  it("no mira fuera de la empresa: la consulta va acotada", async () => {
    estado.correoEnUso = null;

    await editarUsuario(ADMIN, "u-2", cambios({ email: "rosa@otra.pe" }));

    expect(estado.dondeBuscoElCorreo).toEqual({
      companyId_email: { companyId: "empresa-1", email: "rosa@otra.pe" },
    });
  });

  it("que el correo ya sea suyo no lo bloquea", async () => {
    estado.correoEnUso = {
      id: "u-2",
      companyId: "empresa-1",
      nombres: "Luis",
      apellidos: "Torres",
    };

    const r = await editarUsuario(ADMIN, "u-2", cambios({ email: "luis@constructora.pe" }));

    expect(r.ok).toBe(true);
  });
});

/**
 * LA GUARDA QUE MAS PROTEGE. Quien opera GCM lo es por tener su correo en
 * `GCM_OPERADORES`, una variable del SERVIDOR. Cambiarlo desde la aplicacion
 * le quitaria el area de constructoras en silencio, y no hay forma de
 * devolverselo sin entrar a cPanel.
 */
describe("el correo de un operador no se toca desde la aplicacion", () => {
  beforeEach(() => {
    estado.usuario = existente({ email: "duenno@gcm.pe" });
  });

  it("se rechaza, y se dice el orden correcto", async () => {
    const r = await editarUsuario(ADMIN, "u-2", cambios({ email: "otro@gcm.pe" }));

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("GCM_OPERADORES");
      expect(r.error).toContain("servidor");
    }
    expect(estado.escrito).toBeNull();
  });

  it("pero SI se le pueden cambiar los demas datos", async () => {
    const r = await editarUsuario(
      ADMIN,
      "u-2",
      cambios({ email: "duenno@gcm.pe", cargo: "Gerente" }),
    );

    expect(r.ok).toBe(true);
    expect(estado.escrito?.["cargo"]).toBe("Gerente");
  });
});

describe("cambiar el correo cierra sus sesiones", () => {
  it("porque con el viejo ya no entra", async () => {
    await editarUsuario(ADMIN, "u-2", cambios({ email: "nuevo@constructora.pe" }));

    expect(estado.sesionesCerradas).toEqual(["u-2"]);
  });

  /**
   * Editar el cargo de alguien no puede echarlo de su sesion. Sin esta
   * comprobacion, cualquier retoque de la ficha lo expulsaria.
   */
  it("y no las cierra cuando el correo no cambia", async () => {
    await editarUsuario(ADMIN, "u-2", cambios({ cargo: "Jefe de campo" }));

    expect(estado.escrito?.["cargo"]).toBe("Jefe de campo");
    expect(estado.sesionesCerradas).toEqual([]);
  });

  it("ni aunque solo cambie de mayusculas a minusculas", async () => {
    await editarUsuario(ADMIN, "u-2", cambios({ email: "LUIS@CONSTRUCTORA.PE" }));

    expect(estado.sesionesCerradas).toEqual([]);
  });
});
