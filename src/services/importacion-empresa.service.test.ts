import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Las guardas del importador de una constructora entera.
 *
 * La ida y vuelta de verdad —que los identificadores remapeados encajen contra
 * las claves foraneas y que el dinero cuadre— no se puede probar con Prisma
 * doblado: se ejercita contra la base con `storage/probar-ida-y-vuelta.ts`.
 *
 * Lo que SI se sostiene aqui son las puertas que hay ANTES de escribir una
 * fila, que son las que protegen de lo irreversible:
 *
 * - el PERMISO;
 * - la FRASE, sin la cual el archivo no se puede dar por bueno;
 * - que el destino este VACIO, que es lo unico que impide mezclar dos
 *   constructoras en una;
 * - y que un correo de OTRA empresa pare la importacion entera, en vez de
 *   fabricar una segunda cuenta con ese correo o renombrarla en silencio.
 */

const estado: {
  obras: number;
  proveedores: number;
  /// Usuarios de la empresa DISTINTOS del que importa.
  otrosUsuarios: number;
  /// Si se llego a abrir el zip. 0 = se rechazo antes de tocar el archivo.
  lecturas: number;
} = { obras: 0, proveedores: 0, otrosUsuarios: 0, lecturas: 0 };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { count: () => Promise.resolve(estado.obras) },
    proveedor: { count: () => Promise.resolve(estado.proveedores) },
    user: { count: () => Promise.resolve(estado.otrosUsuarios) },
  },
}));

// El zip no se llega a abrir en ninguna de estas pruebas: todas se rechazan
// antes. Si alguna lo abriera, este doble lo delataria contando la lectura.
vi.mock("unzipper", () => ({
  Open: {
    file: () => {
      estado.lecturas += 1;
      return Promise.reject(new Error("no deberia abrirse"));
    },
  },
}));

const { importarEmpresa, puedeRecibirMigracion } = await import(
  "@/services/importacion-empresa.service"
);

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
    nombres: "Ana",
    apellidos: "Quispe",
    email: "ana@constructora.pe",
  } as unknown as SesionActiva;
}

const ADMIN = sesion(["empresa:migrar"]);
const RESIDENTE = sesion(["obra:leer", "obra:editar"]);
const FRASE = "obra-nueva-2026-lima";
const ZIP = "no-se-usa.zip";

beforeEach(() => {
  estado.obras = 0;
  estado.proveedores = 0;
  estado.otrosUsuarios = 0;
  estado.lecturas = 0;
});

describe("quien puede traer una constructora", () => {
  it("el residente no puede", async () => {
    const r = await importarEmpresa(RESIDENTE, ZIP, FRASE);

    expect(r.ok).toBe(false);
    expect(estado.lecturas).toBe(0);
  });
});

describe("la frase", () => {
  it("una frase corta no pasa, y el zip ni se abre", async () => {
    const r = await importarEmpresa(ADMIN, ZIP, "corta");

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("caracteres");
    expect(estado.lecturas).toBe(0);
  });
});

/**
 * LA PUERTA QUE MAS PROTEGE. Importar encima de datos existentes obligaria a
 * decidir dato por dato cual manda, y no hay respuesta buena para eso: se
 * rechaza y se dice exactamente que hay dentro.
 */
describe("el destino tiene que estar vacio", () => {
  it("con obras dentro, no entra", async () => {
    estado.obras = 3;
    const r = await importarEmpresa(ADMIN, ZIP, FRASE);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("3 obra(s)");
    expect(estado.lecturas).toBe(0);
  });

  it("con contratistas dentro, tampoco", async () => {
    estado.proveedores = 7;
    const r = await importarEmpresa(ADMIN, ZIP, FRASE);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("7 contratista(s)");
  });

  it("con mas gente dentro, tampoco", async () => {
    estado.otrosUsuarios = 2;
    const r = await importarEmpresa(ADMIN, ZIP, FRASE);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("2 usuario(s)");
  });

  it("dice TODO lo que hay, no solo lo primero que encuentra", async () => {
    estado.obras = 1;
    estado.proveedores = 4;
    const r = await importarEmpresa(ADMIN, ZIP, FRASE);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("1 obra(s)");
      expect(r.error).toContain("4 contratista(s)");
    }
  });

  /**
   * El administrador que importa NO cuenta: el operador crea la empresa con
   * el dentro, y no hay forma de llegar a esta pantalla sin una cuenta.
   */
  it("el administrador que importa no cuenta como ocupacion", async () => {
    const r = await importarEmpresa(ADMIN, ZIP, FRASE);

    // Pasa las guardas y muere al abrir el zip, que es el doble.
    expect(estado.lecturas).toBe(1);
    expect(r.ok).toBe(false);
  });
});

describe("lo que ve la pantalla coincide con lo que hara el servicio", () => {
  it("vacia cuando lo esta", async () => {
    const r = await puedeRecibirMigracion(ADMIN);
    expect(r).toEqual({ vacia: true, motivo: null });
  });

  it("y si no, da el MISMO motivo que el rechazo", async () => {
    estado.obras = 2;

    const pantalla = await puedeRecibirMigracion(ADMIN);
    const servicio = await importarEmpresa(ADMIN, ZIP, FRASE);

    expect(pantalla.vacia).toBe(false);
    expect(servicio.ok).toBe(false);
    if (!servicio.ok) expect(pantalla.motivo).toBe(servicio.error);
  });

  it("a quien no puede migrar no se le ofrece", async () => {
    const r = await puedeRecibirMigracion(RESIDENTE);
    expect(r.vacia).toBe(false);
  });
});
