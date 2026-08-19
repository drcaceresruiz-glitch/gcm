import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Que releer el buzon no duplique una respuesta.
 *
 * ES LA INVARIANTE DEL MODULO, y no es opcional: el buzon es de la
 * constructora y GCM no lo marca ni lo vacia, asi que la pasada de dentro de
 * cinco minutos volvera a ver exactamente los mismos correos. Lo unico que
 * impide que la conversacion se llene de copias es el indice unico
 * `(companyId, messageIdEntrante)` y que este codigo trate su choque como el
 * caso NORMAL, no como un error.
 *
 * Se prueba con Prisma doblado y sin servidor de correo: `emparejarYGuardar`
 * recibe la descarga del texto como funcion, asi que aqui se le pasa una de
 * mentira. Sin ese corte habria que levantar un IMAP para comprobar una regla
 * que no tiene nada que ver con IMAP.
 */

const TOKEN = "c".repeat(32);

interface FilaCreada {
  companyId: string;
  messageIdEntrante: string | null;
  [k: string]: unknown;
}

const guardadas: FilaCreada[] = [];
const avisos: unknown[] = [];

const datos = {
  salientes: [] as unknown[],
  proveedores: [] as unknown[],
};

/// Se comporta como la base: un `create` que repite `(companyId,
/// messageIdEntrante)` revienta, igual que hara MySQL con el indice unico.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    mensajeContratista: {
      findMany: async () => datos.salientes,
      create: async ({ data }: { data: FilaCreada }) => {
        const choca = guardadas.some(
          (g) =>
            g.companyId === data.companyId &&
            g.messageIdEntrante !== null &&
            g.messageIdEntrante === data.messageIdEntrante,
        );
        if (choca) throw new Error("Unique constraint failed");
        guardadas.push(data);
        return data;
      },
    },
    proveedor: {
      findMany: async () => datos.proveedores,
    },
    aviso: {
      create: async ({ data }: { data: unknown }) => {
        avisos.push(data);
        return data;
      },
    },
  },
}));

const { emparejarYGuardar } = await import("./correo-entrante.service");

const buzon = {
  companyId: "emp-1",
  host: "mail.constructora.pe",
  usuario: "obras@constructora.pe",
  clave: "x",
  desde: new Date("2026-08-01"),
};

const bajar = async () => "Confirmado, el lunes estamos ahí.";

function candidato(sobre: Partial<{
  uid: number;
  messageId: string;
  remitente: string | null;
  tokens: string[];
}> = {}) {
  return {
    uid: 10,
    messageId: "<respuesta-1@ferreteria.pe>",
    remitente: "juan@ferreteria.pe",
    asunto: "Re: Plano del muro",
    fecha: new Date("2026-08-18T10:00:00Z"),
    tokens: [TOKEN],
    parteTexto: "1",
    ...sobre,
  };
}

beforeEach(() => {
  guardadas.length = 0;
  avisos.length = 0;
  datos.salientes = [
    {
      id: "msj-1",
      token: TOKEN,
      proveedorId: "prov-1",
      projectId: "obra-1",
      userId: "u-1",
    },
  ];
  datos.proveedores = [{ id: "prov-1", email: "juan@ferreteria.pe" }];
});

describe("la respuesta se guarda una sola vez", () => {
  it("la primera pasada la guarda y avisa a quien escribio", async () => {
    const r = await emparejarYGuardar(buzon, bajar, [candidato()]);

    expect(r).toEqual({ respuestas: 1, ignorados: 0 });
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0]).toMatchObject({
      direccion: "ENTRANTE",
      projectId: "obra-1",
      proveedorId: "prov-1",
      enRespuestaA: "msj-1",
      cuerpo: "Confirmado, el lunes estamos ahí.",
    });
    expect(avisos).toHaveLength(1);
  });

  /**
   * EL CASO QUE JUSTIFICA TODO ESTO. El buzon no se marca, asi que la pasada
   * siguiente vuelve a ver el mismo correo. Si esto fallara, la conversacion
   * de una obra se llenaria de copias cada cinco minutos.
   */
  it("la segunda pasada no la duplica ni vuelve a avisar", async () => {
    await emparejarYGuardar(buzon, bajar, [candidato()]);
    const segunda = await emparejarYGuardar(buzon, bajar, [candidato()]);

    expect(segunda).toEqual({ respuestas: 0, ignorados: 1 });
    expect(guardadas).toHaveLength(1);
    expect(avisos).toHaveLength(1);
  });

  /**
   * Dos constructoras pueden recibir copia del mismo correo —van las dos en
   * copia— y cada una guarda el suyo. Por eso el indice es por empresa y no
   * global: si fuera global, la segunda perderia la respuesta.
   */
  it("el mismo correo en dos empresas se guarda en las dos", async () => {
    await emparejarYGuardar(buzon, bajar, [candidato()]);
    await emparejarYGuardar({ ...buzon, companyId: "emp-2" }, bajar, [
      candidato(),
    ]);

    expect(guardadas).toHaveLength(2);
  });
});

describe("lo que no es nuestro no se guarda", () => {
  it("un correo sin hilo y de un desconocido se ignora entero", async () => {
    const r = await emparejarYGuardar(buzon, bajar, [
      candidato({ tokens: [], remitente: "spam@ninguna-parte.com" }),
    ]);

    expect(r).toEqual({ respuestas: 0, ignorados: 1 });
    expect(guardadas).toHaveLength(0);
    expect(avisos).toHaveLength(0);
  });

  /**
   * NI SE LE BAJA EL TEXTO. Es la promesa de privacidad de la pantalla: del
   * correo privado de la constructora GCM no llega a leer el cuerpo. Aqui se
   * comprueba de verdad, contando las descargas.
   */
  it("de lo que no es nuestro no se descarga el cuerpo", async () => {
    const descargas: number[] = [];
    const espia = async (uid: number) => {
      descargas.push(uid);
      return "texto";
    };

    await emparejarYGuardar(buzon, espia, [
      candidato({ uid: 1, tokens: [], remitente: "ajeno@otro.com" }),
      candidato({ uid: 2, messageId: "<otra@ferreteria.pe>" }),
    ]);

    expect(descargas).toEqual([2]);
  });
});

describe("cuando no se puede leer el texto", () => {
  it("se guarda igual: que contesto es el hecho que importa", async () => {
    const rota = async () => {
      throw new Error("parte ilegible");
    };

    const r = await emparejarYGuardar(buzon, rota, [candidato()]);

    expect(r.respuestas).toBe(1);
    expect(guardadas[0]!.cuerpo).toContain("sin texto legible");
  });
});

describe("la respuesta que no se pudo atar a una obra", () => {
  it("va a la ficha del contratista, sin obra y sin sonar", async () => {
    // Sin ningun saliente que case: empareja por el remitente, que da el
    // contratista pero no la obra.
    datos.salientes = [];

    const r = await emparejarYGuardar(buzon, bajar, [
      candidato({ tokens: [] }),
    ]);

    expect(r).toEqual({ respuestas: 1, ignorados: 0 });
    expect(guardadas[0]).toMatchObject({
      proveedorId: "prov-1",
      projectId: null,
      enRespuestaA: null,
    });
    // `Aviso.projectId` es obligatorio: sin obra no hay aviso, y la pantalla
    // lo dice en vez de taparlo.
    expect(avisos).toHaveLength(0);
  });
});
