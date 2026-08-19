import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Que un buzon que NO se puede leer deje rastro donde alguien lo vea.
 *
 * Es la otra mitad de la invariante del modulo. La primera —no duplicar— vive
 * en `correo-entrante.service.test.ts`; esta es la contraria: sin ella, un
 * buzon roto y un buzon donde nadie ha contestado se ven EXACTAMENTE igual
 * desde la pantalla, porque el fallo se apuntaba solo en la consola del
 * servidor. En un hosting compartido esa consola no la lee nadie.
 *
 * Va en su propio fichero porque `vi.mock` es por fichero y aqui hace falta
 * doblar `imapflow` entero, cosa que la prueba de idempotencia evita a
 * proposito.
 */

/// Lo que hara el IMAP de mentira en la prueba que toque.
let conectar: () => Promise<void>;

const actualizaciones: { where: unknown; data: Record<string, unknown> }[] = [];

vi.mock("imapflow", () => ({
  ImapFlow: class {
    connect() {
      return conectar();
    }
    async getMailboxLock() {
      return { release: () => {} };
    }
    /// Buzon vacio: la lectura termina bien sin tocar ningun correo, que es
    /// justo el camino de exito que interesa aqui.
    async search() {
      return [];
    }
    fetch() {
      return (async function* () {})();
    }
    async logout() {}
    close() {}
  },
}));

vi.mock("@/lib/secreto", () => ({
  hayLlaveDeCifrado: () => true,
  descifrar: () => "la-clave",
  cifrar: (t: string) => t,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    relojTarea: {
      findUnique: async () => null,
      upsert: async () => ({}),
      update: async () => ({}),
    },
    remitenteCorreo: {
      findMany: async () => [
        {
          companyId: "emp-1",
          host: "mail.constructora.pe",
          usuario: "obras@constructora.pe",
          claveCifrada: "cifrada",
          leidoHastaAt: null,
        },
      ],
      updateMany: async (args: {
        where: unknown;
        data: Record<string, unknown>;
      }) => {
        actualizaciones.push(args);
        return { count: 1 };
      },
    },
  },
}));

const { pasadaDeCorreoEntrante } = await import("./correo-entrante.service");

beforeEach(() => {
  actualizaciones.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("cuando el buzon no se puede leer", () => {
  it("apunta el motivo en la fila, para que la pantalla pueda decirlo", async () => {
    conectar = () => Promise.reject(new Error("Invalid credentials"));

    const r = await pasadaDeCorreoEntrante();

    // La pasada NO se considera fallida: las demas empresas se leyeron.
    expect(r.ok).toBe(true);
    expect(r.buzones).toBe(0);

    expect(actualizaciones).toHaveLength(1);
    const data = actualizaciones[0]?.data ?? {};
    expect(data["lecturaError"]).toBe("Invalid credentials");
    expect(data["lecturaErrorAt"]).toBeInstanceOf(Date);

    // Y NO se avanza la marca de lectura: la ventana que fallo hay que volver
    // a intentarla, o esos correos se pierden para siempre.
    expect(data).not.toHaveProperty("leidoHastaAt");
  });

  it("no deja el motivo puesto cuando la lectura vuelve a funcionar", async () => {
    conectar = () => Promise.resolve();

    await pasadaDeCorreoEntrante();

    expect(actualizaciones).toHaveLength(1);
    const data = actualizaciones[0]?.data ?? {};
    expect(data["lecturaError"]).toBeNull();
    expect(data["lecturaErrorAt"]).toBeNull();
    expect(data["leidoHastaAt"]).toBeInstanceOf(Date);
  });

  it("recorta un motivo larguisimo a lo que cabe en la columna", async () => {
    conectar = () => Promise.reject(new Error("x".repeat(500)));

    await pasadaDeCorreoEntrante();

    expect(String(actualizaciones[0]?.data["lecturaError"])).toHaveLength(300);
  });
});
