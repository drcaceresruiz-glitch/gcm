import { describe, it, expect, beforeEach, vi } from "vitest";
import { hashToken } from "@/lib/tokens";

/**
 * A quien alcanza un emisor de SMS, que es una frontera entre inquilinos.
 *
 * Por esta cola viajan los codigos del pase y los del segundo factor EN CLARO
 * —hay que poder mandarlos—, asi que quien resuelva a una empresa lee sus
 * codigos antes que sus duenos. Hasta el 12 de agosto de 2026 habia ademas un
 * `SMS_COLA_TOKEN` de entorno que servia a TODA empresa sin emisor propio: un
 * solo secreto para varios clientes a la vez.
 *
 * Se quito, y estas pruebas existen para que no vuelva. La de abajo que de
 * verdad importa no comprueba un valor sino una FORMA: que un token que no
 * casa con ningun emisor agote el camino en UNA consulta. Un respaldo, sea del
 * tipo que sea, tendria que preguntar una segunda vez.
 */

interface Llamada {
  metodo: string;
  args: unknown;
}

const llamadas: Llamada[] = [];
/** Lo que devolvera el `findFirst` de emisores en la proxima llamada. */
let emisorEncontrado: { id: string; companyId: string } | null = null;
/** Lo que devolvera el `count` de emisores. */
let emisoresDeLaEmpresa = 0;

vi.mock("@/lib/prisma", () => {
  const apuntar = (metodo: string, valor: () => unknown) => (args?: unknown) => {
    llamadas.push({ metodo, args });
    return Promise.resolve(valor());
  };

  return {
    prisma: {
      emisorSms: {
        findFirst: apuntar("emisorSms.findFirst", () => emisorEncontrado),
        count: apuntar("emisorSms.count", () => emisoresDeLaEmpresa),
      },
    },
  };
});

const { resolverAlcance, hayColaSms } = await import(
  "@/services/sms-cola.service"
);

beforeEach(() => {
  llamadas.length = 0;
  emisorEncontrado = null;
  emisoresDeLaEmpresa = 0;
});

describe("resolverAlcance", () => {
  it("sin token no resuelve a nadie, y no llega a preguntar", async () => {
    expect(await resolverAlcance(null)).toBeNull();
    expect(llamadas).toHaveLength(0);
  });

  it("un emisor reconocido alcanza SU empresa", async () => {
    emisorEncontrado = { id: "emi-1", companyId: "empresa-1" };

    expect(await resolverAlcance("token-bueno")).toEqual({
      companyId: "empresa-1",
      emisorId: "emi-1",
    });
  });

  it("busca por HASH del token, nunca por el token", async () => {
    emisorEncontrado = { id: "emi-1", companyId: "empresa-1" };
    await resolverAlcance("token-bueno");

    const donde = (llamadas[0]?.args as { where: Record<string, unknown> }).where;

    expect(donde["tokenHash"]).toBe(hashToken("token-bueno"));
    // El token en claro no aparece por ninguna parte de la consulta.
    expect(JSON.stringify(donde)).not.toContain("token-bueno");
  });

  it("exige emisor activo Y empresa activa", async () => {
    emisorEncontrado = { id: "emi-1", companyId: "empresa-1" };
    await resolverAlcance("token-bueno");

    const donde = (llamadas[0]?.args as { where: Record<string, unknown> }).where;

    // Suspender una empresa cliente tiene que callar su cola tambien: si no,
    // su telefono seguiria sacando codigos de una cuenta cerrada.
    expect(donde["activo"]).toBe(true);
    expect(donde["company"]).toEqual({ activa: true });
  });

  it("un token que no casa NO tiene segunda oportunidad", async () => {
    emisorEncontrado = null;

    expect(await resolverAlcance("token-de-nadie")).toBeNull();

    // ESTA es la prueba del respaldo borrado. Antes, al no casar ningun
    // emisor, se comprobaba un `SMS_COLA_TOKEN` de entorno que alcanzaba la
    // cola de TODA empresa sin emisor propio. Cualquier respaldo que alguien
    // reintroduzca tendria que consultar algo mas: una sola llamada significa
    // que el camino se agota donde debe.
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]?.metodo).toBe("emisorSms.findFirst");
  });
});

describe("hayColaSms", () => {
  it("hay cola si la empresa tiene emisor propio", async () => {
    emisoresDeLaEmpresa = 1;
    expect(await hayColaSms("empresa-1")).toBe(true);
  });

  it("sin emisor propio NO hay cola, aunque haya un token en el entorno", async () => {
    emisoresDeLaEmpresa = 0;
    // Se pone la variable vieja a proposito: antes esto bastaba para que la
    // funcion dijera que si, y los SMS de esta empresa salian por el telefono
    // de otra. Ahora solo cuenta lo suyo, y sus codigos saldran por correo.
    vi.stubEnv("SMS_COLA_TOKEN", "x".repeat(48));

    expect(await hayColaSms("empresa-1")).toBe(false);

    vi.unstubAllEnvs();
  });

  it("cuenta solo los emisores ACTIVOS de ESA empresa", async () => {
    emisoresDeLaEmpresa = 2;
    await hayColaSms("empresa-1");

    const donde = (llamadas[0]?.args as { where: Record<string, unknown> }).where;

    expect(donde).toEqual({ companyId: "empresa-1", activo: true });
  });
});
