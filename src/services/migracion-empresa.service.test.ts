import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Las guardas del exportador de la empresa.
 *
 * No se comprueba aqui como sale el zip —eso es `archiver` y el catalogo, que
 * tienen sus propias pruebas— sino LO QUE TIENE QUE PASAR ANTES de leer un
 * solo dato. Son tres puertas y las tres protegen cosas distintas:
 *
 * - el PERMISO: el archivo lleva la constructora entera, con los hashes de
 *   contrasena de su gente;
 * - la FRASE: sin ella el archivo no se puede dar por bueno en destino, y
 *   una corta se adivina probando contra el zip sin limite y sin ruido;
 * - el CONGELADO: sin el, cuarenta consultas sin transaccion dan un archivo
 *   con las partidas de un momento y los pagos de otro.
 *
 * Y una cuarta cosa, que es la que mas valor tiene de todas: que cuando una
 * puerta se cierra, NO SE HAYA LEIDO NADA. Si el orden se invirtiera, un
 * rechazo seguiria habiendo sacado la empresa de la base.
 */

const estado: {
  enMigracionAt: Date | null;
  /// Cuantas tablas se llegaron a leer. 0 = no se toco la base.
  lecturas: number;
  apuntes: Record<string, unknown>[];
  /// Los RECIBOS (`ExportacionEmpresa`), que no son lo mismo que los apuntes:
  /// estos solo aparecen si el zip termino de salir.
  recibos: Record<string, unknown>[];
} = { enMigracionAt: null, lecturas: 0, apuntes: [], recibos: [] };

/**
 * El doble cuenta lecturas por CUALQUIER delegado.
 *
 * Con un `Proxy` y no con una lista de modelos escrita a mano: el catalogo de
 * migracion tiene mas de cuarenta tablas y una lista se quedaria corta el dia
 * que se anadiera la primera, justo cuando esta prueba tendria que avisar.
 */
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get(_destino, modelo: string) {
        if (modelo === "company") {
          return {
            findUnique: () =>
              Promise.resolve({
                id: "empresa-1",
                razonSocial: "Constructora de Prueba SAC",
                ruc: "20123456789",
                enMigracionAt: estado.enMigracionAt,
              }),
          };
        }
        if (modelo === "exportacionEmpresa") {
          return {
            create: (args: { data: Record<string, unknown> }) => {
              estado.recibos.push(args.data);
              return Promise.resolve({});
            },
          };
        }
        if (modelo === "auditLog") {
          return {
            create: (args: { data: Record<string, unknown> }) => {
              estado.apuntes.push(args.data);
              return Promise.resolve({});
            },
          };
        }
        return {
          findMany: () => {
            estado.lecturas += 1;
            return Promise.resolve([]);
          },
        };
      },
    },
  ),
}));

const { exportarEmpresa } = await import("@/services/migracion-empresa.service");

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

beforeEach(() => {
  estado.enMigracionAt = null;
  estado.lecturas = 0;
  estado.apuntes = [];
  estado.recibos = [];
});

describe("quien puede sacar la empresa entera", () => {
  it("el residente no puede, aunque la empresa este congelada", async () => {
    estado.enMigracionAt = new Date("2026-08-19T12:00:00Z");
    const r = await exportarEmpresa(RESIDENTE, FRASE);

    expect(r.ok).toBe(false);
    expect(estado.lecturas).toBe(0);
  });
});

describe("la frase que firma el archivo", () => {
  it("una frase corta no pasa", async () => {
    estado.enMigracionAt = new Date("2026-08-19T12:00:00Z");
    const r = await exportarEmpresa(ADMIN, "clave");

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("caracteres");
  });

  /**
   * Se comprueba ANTES de leer, y no despues de armar el zip: al final del
   * proceso el rechazo llegaria con la empresa entera ya en memoria.
   */
  it("y se comprueba antes de tocar la base", async () => {
    estado.enMigracionAt = new Date("2026-08-19T12:00:00Z");
    await exportarEmpresa(ADMIN, "corta");

    expect(estado.lecturas).toBe(0);
  });
});

describe("sin congelar no se exporta", () => {
  it("una empresa viva no se puede sacar", async () => {
    const r = await exportarEmpresa(ADMIN, FRASE);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("migración");
  });

  it("y el rechazo llega sin haber leido una sola tabla", async () => {
    await exportarEmpresa(ADMIN, FRASE);

    expect(estado.lecturas).toBe(0);
  });

  it("congelada, si sale", async () => {
    estado.enMigracionAt = new Date("2026-08-19T12:00:00Z");
    const r = await exportarEmpresa(ADMIN, FRASE);

    expect(r.ok).toBe(true);
    if (r.ok) {
      // El nombre lleva el RUC: es lo que distingue un archivo de otro cuando
      // hay varios en la misma carpeta, y no depende de la razon social, que
      // se escribe distinta cada vez.
      expect(r.migracion.nombreArchivo).toContain("20123456789");
      expect(r.migracion.nombreArchivo).toMatch(/\.zip$/);
    }
  });

  it("y entonces si se lee la empresa entera", async () => {
    estado.enMigracionAt = new Date("2026-08-19T12:00:00Z");
    await exportarEmpresa(ADMIN, FRASE);

    // Una por tabla del catalogo, mas la consulta de las obras.
    expect(estado.lecturas).toBeGreaterThan(40);
  });
});

describe("la constancia de que alguien se llevo la constructora", () => {
  it("queda apuntada, y dice quien y cuando", async () => {
    estado.enMigracionAt = new Date("2026-08-19T12:00:00Z");
    await exportarEmpresa(ADMIN, FRASE);

    expect(estado.apuntes).toHaveLength(1);
    expect(estado.apuntes[0]).toMatchObject({
      companyId: "empresa-1",
      userId: "u-1",
      entidad: "Company",
    });
    expect((estado.apuntes[0]!.despues as { evento: string }).evento).toBe(
      "exportar_migracion",
    );
  });

  /**
   * La frase es lo unico que da por bueno el archivo en destino. Auditarla
   * seria dejarla escrita en la misma base de la que salio el zip: quien
   * leyera el libro de auditoria tendria las dos mitades.
   */
  it("la frase NO aparece por ningun lado del apunte", async () => {
    estado.enMigracionAt = new Date("2026-08-19T12:00:00Z");
    await exportarEmpresa(ADMIN, FRASE);

    expect(JSON.stringify(estado.apuntes)).not.toContain(FRASE);
  });

  /**
   * Se apunta el INTENTO, no la descarga completa. Colgarlo del final del zip
   * permitiria sacar los datos y cortar la conexion para no dejar rastro.
   */
  it("se apunta aunque nadie llegue a descargar el zip", async () => {
    estado.enMigracionAt = new Date("2026-08-19T12:00:00Z");
    const r = await exportarEmpresa(ADMIN, FRASE);

    // El apunte ya esta escrito y del zip no se ha leido un solo byte.
    expect(r.ok).toBe(true);
    expect(estado.apuntes).toHaveLength(1);
  });
});

/**
 * El RECIBO es otra cosa que el apunte, y la diferencia es la que sostiene el
 * borrado de una constructora.
 *
 * El apunte dice «alguien lo intento» y por eso se escribe al empezar. El
 * recibo dice «el archivo salio entero», y de EL se cuelga el permiso para
 * borrar: si bastara el intento, se podria pedir la exportacion, cortar la
 * descarga y borrar la empresa igual, sin que nadie tenga sus datos.
 */
describe("el recibo de la exportacion", () => {
  /// Deja salir el zip entero, que es lo que dispara el recibo.
  async function vaciar(archivo: NodeJS.ReadableStream): Promise<void> {
    await new Promise<void>((listo, falla) => {
      archivo.on("data", () => {});
      archivo.on("end", () => setTimeout(listo, 0));
      archivo.on("error", falla);
    });
  }

  it("no existe mientras el zip no ha terminado de salir", async () => {
    estado.enMigracionAt = new Date("2026-08-19T12:00:00Z");
    const r = await exportarEmpresa(ADMIN, FRASE);

    expect(r.ok).toBe(true);
    // El apunte si, el recibo no: son dos cosas distintas a proposito.
    expect(estado.apuntes).toHaveLength(1);
    expect(estado.recibos).toHaveLength(0);
  });

  it("se escribe cuando el archivo sale entero, y dice de que empresa hablaba", async () => {
    estado.enMigracionAt = new Date("2026-08-19T12:00:00Z");
    const r = await exportarEmpresa(ADMIN, FRASE);
    if (!r.ok) throw new Error("no exporto");

    await vaciar(r.migracion.archivo);

    expect(estado.recibos).toHaveLength(1);
    const recibo = estado.recibos[0]!;
    expect(recibo).toMatchObject({
      companyId: "empresa-1",
      userId: "u-1",
      // Copiados: cuando la empresa se borre, esto es lo unico que queda.
      razonSocial: "Constructora de Prueba SAC",
      ruc: "20123456789",
    });
    // El hash ata la fila con el zip que alguien tiene en su disco.
    expect(String(recibo["hashManifiesto"])).toMatch(/^[0-9a-f]{64}$/);
    expect(Number(recibo["tamano"])).toBeGreaterThan(0);
  });

  it("tampoco lleva la frase", async () => {
    estado.enMigracionAt = new Date("2026-08-19T12:00:00Z");
    const r = await exportarEmpresa(ADMIN, FRASE);
    if (!r.ok) throw new Error("no exporto");

    await vaciar(r.migracion.archivo);

    expect(JSON.stringify(estado.recibos)).not.toContain(FRASE);
  });
});
