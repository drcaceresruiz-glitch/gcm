import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Los proveedores de IA de la empresa: guardar, probar, activar, eliminar.
 *
 * Lo que se sostiene aqui:
 * - El permiso (`configuracion:editar`) protege las cinco funciones.
 * - Sin llave de cifrado no se guarda nada.
 * - La clave vacia al editar conserva la que ya estaba; cualquier cambio
 *   anula `verificadoAt`.
 * - Activar exige `verificadoAt`, y eliminar el activo limpia el puntero
 *   de la empresa dentro de la misma transaccion.
 * - `listarProveedoresIa` nunca devuelve la clave cifrada.
 * - `probarProveedorIa` explica cuando un tipo no tiene adaptador, y
 *   nunca deja la clave en el mensaje de error.
 */

const estado: {
  filas: {
    id: string;
    companyId: string;
    tipo: string;
    nombre: string;
    urlBase: string | null;
    modelo: string;
    apiKeyCifrada: string;
    verificadoAt: Date | null;
    ultimoError: string | null;
    ultimoErrorAt: Date | null;
  }[];
  proveedorIaActivoId: string | null;
  cambiosDeFila: { where: Record<string, unknown>; data: Record<string, unknown> }[];
  cambiosDeEmpresa: { where?: Record<string, unknown>; data: Record<string, unknown> }[];
  borradas: string[];
} = {
  filas: [],
  proveedorIaActivoId: null,
  cambiosDeFila: [],
  cambiosDeEmpresa: [],
  borradas: [],
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agenteIaProveedor: {
      findMany: (args: { where: { companyId: string } }) =>
        Promise.resolve(estado.filas.filter((f) => f.companyId === args.where.companyId)),
      findFirst: (args: { where: { id: string; companyId: string } }) =>
        Promise.resolve(
          estado.filas.find(
            (f) => f.id === args.where.id && f.companyId === args.where.companyId,
          ) ?? null,
        ),
      create: (args: { data: Record<string, unknown> }) => {
        const id = `prov-${estado.filas.length + 1}`;
        const fila = { id, verificadoAt: null, ultimoError: null, ultimoErrorAt: null, ...args.data };
        estado.filas.push(fila as (typeof estado.filas)[number]);
        return Promise.resolve({ id: fila.id });
      },
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
        estado.cambiosDeFila.push(args);
        const i = estado.filas.findIndex((f) => f.id === args.where.id);
        if (i >= 0) Object.assign(estado.filas[i]!, args.data);
        return Promise.resolve({ id: args.where.id });
      },
    },
    company: {
      findUnique: () =>
        Promise.resolve({ proveedorIaActivoId: estado.proveedorIaActivoId }),
      update: (args: { data: Record<string, unknown> }) => {
        estado.cambiosDeEmpresa.push(args);
        if ("proveedorIaActivoId" in args.data) {
          estado.proveedorIaActivoId = args.data["proveedorIaActivoId"] as string | null;
        }
        return Promise.resolve({});
      },
      updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        estado.cambiosDeEmpresa.push(args);
        if ("proveedorIaActivoId" in args.data) {
          estado.proveedorIaActivoId = args.data["proveedorIaActivoId"] as string | null;
        }
        return Promise.resolve({ count: 1 });
      },
    },
    auditLog: { create: () => Promise.resolve({}) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        company: {
          updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
            estado.cambiosDeEmpresa.push(args);
            if (
              "proveedorIaActivoId" in args.data &&
              args.where["proveedorIaActivoId"] === estado.proveedorIaActivoId
            ) {
              estado.proveedorIaActivoId = args.data["proveedorIaActivoId"] as string | null;
            }
            return Promise.resolve({ count: 1 });
          },
        },
        agenteIaProveedor: {
          delete: (args: { where: { id: string } }) => {
            estado.borradas.push(args.where.id);
            estado.filas = estado.filas.filter((f) => f.id !== args.where.id);
            return Promise.resolve({});
          },
        },
        auditLog: { create: () => Promise.resolve({}) },
      }),
  },
}));

const llaveDisponible = { valor: true };
vi.mock("@/lib/secreto", () => ({
  hayLlaveDeCifrado: () => llaveDisponible.valor,
  cifrar: (texto: string) => `cif:${texto}`,
  descifrar: (guardado: string) =>
    guardado.startsWith("cif:") ? guardado.slice(4) : null,
}));

const {
  listarProveedoresIa,
  guardarProveedorIa,
  eliminarProveedorIa,
  activarProveedorIa,
  probarProveedorIa,
  listarModelosProveedor,
} = await import("@/services/agente-ia.service");

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    nombres: "Ada",
    apellidos: "Lovelace",
    role: "ADMIN",
    permisos,
    // `null` es «alcanza todas las obras de su empresa». Sin este campo la
    // sesion no es valida: la lista vacia y el null son cosas opuestas.
    obrasAsignadas: null,
  } as unknown as SesionActiva;
}

const ADMIN = sesion(["configuracion:editar"]);
const RESIDENTE = sesion(["obra:leer"]);

beforeEach(() => {
  estado.filas = [];
  estado.proveedorIaActivoId = null;
  estado.cambiosDeFila = [];
  estado.cambiosDeEmpresa = [];
  estado.borradas = [];
  llaveDisponible.valor = true;
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const DATOS_BUENOS = {
  tipo: "claude",
  nombre: "El de producción",
  urlBase: "",
  modelo: "claude-sonnet-5",
  apiKey: "sk-abc123",
};

describe("el permiso", () => {
  it("protege las cinco funciones", async () => {
    expect(await listarProveedoresIa(RESIDENTE)).toEqual([]);
    expect((await guardarProveedorIa(RESIDENTE, DATOS_BUENOS)).ok).toBe(false);
    expect((await eliminarProveedorIa(RESIDENTE, "prov-1")).ok).toBe(false);
    expect((await activarProveedorIa(RESIDENTE, "prov-1")).ok).toBe(false);
    expect((await probarProveedorIa(RESIDENTE, "prov-1")).ok).toBe(false);
    expect(estado.filas).toHaveLength(0);
  });
});

describe("guardar", () => {
  it("sin llave de cifrado no se guarda nada", async () => {
    llaveDisponible.valor = false;
    const r = await guardarProveedorIa(ADMIN, DATOS_BUENOS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("clave de cifrado");
    expect(estado.filas).toHaveLength(0);
  });

  it("crea con la clave cifrada, nunca en claro", async () => {
    const r = await guardarProveedorIa(ADMIN, DATOS_BUENOS);
    expect(r.ok).toBe(true);
    expect(estado.filas[0]?.apiKeyCifrada).toBe("cif:sk-abc123");
  });

  it("al editar con la clave vacia, conserva la que ya estaba", async () => {
    await guardarProveedorIa(ADMIN, DATOS_BUENOS);
    const id = estado.filas[0]!.id;

    const r = await guardarProveedorIa(ADMIN, {
      ...DATOS_BUENOS,
      id,
      nombre: "Nuevo nombre",
      apiKey: "",
    });

    expect(r.ok).toBe(true);
    expect(estado.filas[0]?.apiKeyCifrada).toBe("cif:sk-abc123");
    expect(estado.filas[0]?.nombre).toBe("Nuevo nombre");
  });

  it("cualquier cambio anula la verificacion anterior", async () => {
    await guardarProveedorIa(ADMIN, DATOS_BUENOS);
    const id = estado.filas[0]!.id;
    estado.filas[0]!.verificadoAt = new Date();

    await guardarProveedorIa(ADMIN, { ...DATOS_BUENOS, id, nombre: "Otro" });

    expect(estado.filas[0]?.verificadoAt).toBeNull();
  });

  it("no encuentra un proveedor de otra empresa", async () => {
    estado.filas.push({
      id: "ajeno",
      companyId: "otra-empresa",
      tipo: "claude",
      nombre: "x",
      urlBase: null,
      modelo: "x",
      apiKeyCifrada: "cif:x",
      verificadoAt: null,
      ultimoError: null,
      ultimoErrorAt: null,
    });

    const r = await guardarProveedorIa(ADMIN, { ...DATOS_BUENOS, id: "ajeno" });
    expect(r.ok).toBe(false);
  });
});

describe("listar", () => {
  it("nunca devuelve la clave, y marca cual es el activo", async () => {
    await guardarProveedorIa(ADMIN, DATOS_BUENOS);
    await guardarProveedorIa(ADMIN, { ...DATOS_BUENOS, nombre: "Otro" });
    estado.filas[0]!.verificadoAt = new Date();
    estado.proveedorIaActivoId = estado.filas[0]!.id;

    const lista = await listarProveedoresIa(ADMIN);

    expect(lista).toHaveLength(2);
    expect(lista[0]).not.toHaveProperty("apiKeyCifrada");
    expect(lista[0]?.hayClave).toBe(true);
    expect(lista[0]?.activo).toBe(true);
    expect(lista[1]?.activo).toBe(false);
  });
});

describe("activar", () => {
  it("exige que este verificado", async () => {
    await guardarProveedorIa(ADMIN, DATOS_BUENOS);
    const id = estado.filas[0]!.id;

    const r = await activarProveedorIa(ADMIN, id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Pruébalo");
    expect(estado.proveedorIaActivoId).toBeNull();
  });

  it("con uno ya probado, lo activa", async () => {
    await guardarProveedorIa(ADMIN, DATOS_BUENOS);
    const id = estado.filas[0]!.id;
    estado.filas[0]!.verificadoAt = new Date();

    const r = await activarProveedorIa(ADMIN, id);
    expect(r.ok).toBe(true);
    expect(estado.proveedorIaActivoId).toBe(id);
  });
});

describe("eliminar", () => {
  it("si era el activo, limpia el puntero de la empresa", async () => {
    await guardarProveedorIa(ADMIN, DATOS_BUENOS);
    const id = estado.filas[0]!.id;
    estado.proveedorIaActivoId = id;

    const r = await eliminarProveedorIa(ADMIN, id);

    expect(r.ok).toBe(true);
    expect(estado.borradas).toEqual([id]);
    expect(estado.proveedorIaActivoId).toBeNull();
  });

  it("uno ya borrado no falla: el estado pedido es el que hay", async () => {
    const r = await eliminarProveedorIa(ADMIN, "no-existe");
    expect(r.ok).toBe(true);
  });
});

describe("probar", () => {
  it("un tipo sin adaptador lo dice, no falla en silencio", async () => {
    await guardarProveedorIa(ADMIN, { ...DATOS_BUENOS, tipo: "algo_inventado" });
    const id = estado.filas[0]!.id;

    const r = await probarProveedorIa(ADMIN, id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no tiene conexión implementada");
  });

  it("en exito, marca verificadoAt y limpia el error anterior", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("") }),
    );
    await guardarProveedorIa(ADMIN, DATOS_BUENOS);
    const id = estado.filas[0]!.id;
    estado.filas[0]!.ultimoError = "fallo viejo";

    const r = await probarProveedorIa(ADMIN, id);

    expect(r.ok).toBe(true);
    expect(estado.filas[0]?.verificadoAt).toBeInstanceOf(Date);
    expect(estado.filas[0]?.ultimoError).toBeNull();
  });

  /**
   * LOS FALLOS DEL ENTORNO, EN EL IDIOMA DE LA APLICACION.
   *
   * `AbortSignal.timeout` y `fetch` lanzan en ingles y sin salida: «The
   * operation was aborted due to timeout». Eso llegaba tal cual a la pantalla
   * del asistente. Visto el 25 de agosto de 2026 preguntandole algo.
   *
   * Lo que se fija aqui no es el texto exacto sino la REGLA: un fallo del
   * entorno se cuenta en español y dice que hacer; lo que responda el
   * proveedor se deja como viene, porque ahi su texto es la unica pista real.
   */
  it("un tiempo agotado se cuenta en español, no con el mensaje del runtime", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        Object.assign(new Error("The operation was aborted due to timeout"), {
          name: "TimeoutError",
        }),
      ),
    );
    await guardarProveedorIa(ADMIN, DATOS_BUENOS);
    const id = estado.filas[0]!.id;

    const r = await probarProveedorIa(ADMIN, id);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).not.toContain("aborted");
      expect(r.error).toContain("tardó demasiado");
      expect(r.error).toContain("Vuelve a intentarlo");
    }
  });

  it("y una red caida tambien, sin hablar de «fetch failed»", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    await guardarProveedorIa(ADMIN, DATOS_BUENOS);
    const id = estado.filas[0]!.id;

    const r = await probarProveedorIa(ADMIN, id);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).not.toContain("fetch");
      expect(r.error).toContain("No se pudo contactar");
    }
  });

  it("pero lo que responde el proveedor se deja como viene", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve("model not found: gpt-inventado"),
      }),
    );
    await guardarProveedorIa(ADMIN, DATOS_BUENOS);
    const id = estado.filas[0]!.id;

    const r = await probarProveedorIa(ADMIN, id);

    expect(r.ok).toBe(false);
    // Su texto es la unica pista de que modelo no existe: taparlo seria peor.
    if (!r.ok) expect(r.error).toContain("model not found");
  });

  it("en fallo, guarda el motivo del proveedor pero nunca la clave, y sugiere probar otro modelo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("clave sk-abc123 invalida"),
      }),
    );
    await guardarProveedorIa(ADMIN, DATOS_BUENOS);
    const id = estado.filas[0]!.id;

    const r = await probarProveedorIa(ADMIN, id);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).not.toContain("sk-abc123");
      expect(r.error).toContain("***");
      expect(r.error).toContain("tool");
    }
    expect(estado.filas[0]?.verificadoAt).toBeNull();
    expect(estado.filas[0]?.ultimoError).not.toContain("sk-abc123");
  });

  it("manda una herramienta de mentira -para que 'Probar' detecte un modelo sin tool-use, no solo una clave mala-", async () => {
    const fetchEspiado = vi
      .fn()
      .mockResolvedValue({ ok: true, text: () => Promise.resolve("") });
    vi.stubGlobal("fetch", fetchEspiado);
    await guardarProveedorIa(ADMIN, DATOS_BUENOS); // tipo: "claude"
    const id = estado.filas[0]!.id;

    await probarProveedorIa(ADMIN, id);

    const cuerpo = JSON.parse(fetchEspiado.mock.calls[0]![1].body);
    expect(cuerpo.tools).toHaveLength(1);
    expect(cuerpo.tools[0].name).toBe("confirmar_recepcion");
  });

  it("openai_compatible: tambien manda la herramienta de mentira, en su propio formato", async () => {
    const fetchEspiado = vi
      .fn()
      .mockResolvedValue({ ok: true, text: () => Promise.resolve("") });
    vi.stubGlobal("fetch", fetchEspiado);
    await guardarProveedorIa(ADMIN, {
      ...DATOS_BUENOS,
      tipo: "openai_compatible",
      urlBase: "https://api.groq.com/openai/v1",
    });
    const id = estado.filas[0]!.id;

    await probarProveedorIa(ADMIN, id);

    const cuerpo = JSON.parse(fetchEspiado.mock.calls[0]![1].body);
    expect(cuerpo.tools).toHaveLength(1);
    expect(cuerpo.tools[0].type).toBe("function");
    expect(cuerpo.tools[0].function.name).toBe("confirmar_recepcion");
  });

  it("un error de proveedor LARGO mas la pista de tool-use nunca supera el limite de la columna (300)", async () => {
    // Regresion de un fallo real, cazado en vivo: un cuerpo de error largo
    // -algunos proveedores mandan trazas HTML o JSON con detalle- mas la
    // pista de tool-use juntos superaban VARCHAR(300) y el guardado
    // reventaba con "el valor es demasiado largo para la columna" en vez
    // de guardar el error. `ultimoError` es la columna real que se llena
    // -y la que importa aqui: lo que devuelve la funcion al que llama
    // (`r.error`) lleva ADEMAS el prefijo "El proveedor rechazó la
    // prueba: ", que no va a ninguna columna con limite, asi que no hace
    // falta acotarlo-.
    const cuerpoLargo = "x".repeat(500);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: () => Promise.resolve(cuerpoLargo) }),
    );
    await guardarProveedorIa(ADMIN, DATOS_BUENOS); // tipo: "claude"
    const id = estado.filas[0]!.id;

    const r = await probarProveedorIa(ADMIN, id);

    expect(r.ok).toBe(false);
    // La pista se conserva ENTERA -se trunca el mensaje del proveedor,
    // nunca la parte util para quien lo lee-.
    if (!r.ok) expect(r.error).toContain("prueba con otro modelo");
    expect(estado.filas[0]?.ultimoError?.length).toBeLessThanOrEqual(300);
    expect(estado.filas[0]?.ultimoError).toContain("prueba con otro modelo");
  });

  it("openai_compatible sin URL base lo dice, sin llamar a la red", async () => {
    const fetchEspiado = vi.fn();
    vi.stubGlobal("fetch", fetchEspiado);
    await guardarProveedorIa(ADMIN, { ...DATOS_BUENOS, tipo: "openai_compatible" });
    const id = estado.filas[0]!.id;

    const r = await probarProveedorIa(ADMIN, id);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("URL base");
    expect(fetchEspiado).not.toHaveBeenCalled();
  });

  describe("reintento ante sobrecarga transitoria del proveedor", () => {
    // Regresion de un fallo real, cazado en vivo: Gemini devolviendo
    // "(503) ... high demand ... try again later" y GCM dandolo por
    // perdido en vez de reintentar solo una vez, que es exactamente lo
    // que el propio proveedor sugiere hacer.
    it("un 503 se reintenta una vez, y si el segundo intento funciona, se recupera solo", async () => {
      const fetchEspiado = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: () => Promise.resolve('{"error":{"message":"high demand"}}'),
        })
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("") });
      vi.stubGlobal("fetch", fetchEspiado);
      await guardarProveedorIa(ADMIN, DATOS_BUENOS);
      const id = estado.filas[0]!.id;

      const r = await probarProveedorIa(ADMIN, id);

      expect(r.ok).toBe(true);
      expect(fetchEspiado).toHaveBeenCalledTimes(2);
    });

    it("un error permanente (401) NUNCA se reintenta -insistir no arregla una clave mala-", async () => {
      const fetchEspiado = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("invalid api key"),
      });
      vi.stubGlobal("fetch", fetchEspiado);
      await guardarProveedorIa(ADMIN, DATOS_BUENOS);
      const id = estado.filas[0]!.id;

      const r = await probarProveedorIa(ADMIN, id);

      expect(r.ok).toBe(false);
      expect(fetchEspiado).toHaveBeenCalledTimes(1);
    });

    it("si el proveedor sigue saturado tras el reintento, se rinde y lo explica -no una guerra de desgaste-", async () => {
      const fetchEspiado = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve("still overloaded"),
      });
      vi.stubGlobal("fetch", fetchEspiado);
      await guardarProveedorIa(ADMIN, DATOS_BUENOS);
      const id = estado.filas[0]!.id;

      const r = await probarProveedorIa(ADMIN, id);

      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("503");
      // Un intento original + UN reintento, nunca mas.
      expect(fetchEspiado).toHaveBeenCalledTimes(2);
    });
  });
});

describe("listarModelosProveedor", () => {
  it("claude: pide /v1/models con x-api-key y devuelve los ids", async () => {
    const fetchEspiado = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "claude-sonnet-5" }, { id: "claude-haiku-4-5" }] }),
    });
    vi.stubGlobal("fetch", fetchEspiado);

    const r = await listarModelosProveedor("claude", { apiKey: "sk-abc123", urlBase: null });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.modelos).toEqual(["claude-sonnet-5", "claude-haiku-4-5"]);
    const [url, opciones] = fetchEspiado.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/models");
    expect(opciones.headers["x-api-key"]).toBe("sk-abc123");
  });

  it("openai_compatible: pide {urlBase}/models con Bearer y ordena los ids", async () => {
    const fetchEspiado = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "z-modelo" }, { id: "a-modelo" }] }),
    });
    vi.stubGlobal("fetch", fetchEspiado);

    const r = await listarModelosProveedor("openai_compatible", {
      apiKey: "sk-abc123",
      urlBase: "https://api.groq.com/openai/v1",
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.modelos).toEqual(["a-modelo", "z-modelo"]);
    const [url, opciones] = fetchEspiado.mock.calls[0]!;
    expect(url).toBe("https://api.groq.com/openai/v1/models");
    expect(opciones.headers.authorization).toBe("Bearer sk-abc123");
  });

  it("gemini: le quita el prefijo 'models/' que trae su listado -su chat/completions no lo acepta-", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: "models/gemini-2.5-flash" }, { id: "models/antigravity-preview-05-2026" }],
          }),
      }),
    );

    const r = await listarModelosProveedor("openai_compatible", {
      apiKey: "sk-abc123",
      urlBase: "https://generativelanguage.googleapis.com/v1beta/openai",
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.modelos).toEqual(["antigravity-preview-05-2026", "gemini-2.5-flash"]);
      expect(r.modelos.some((m) => m.startsWith("models/"))).toBe(false);
    }
  });

  it("openai_compatible sin URL base lo dice, sin llamar a la red", async () => {
    const fetchEspiado = vi.fn();
    vi.stubGlobal("fetch", fetchEspiado);

    const r = await listarModelosProveedor("openai_compatible", { apiKey: "sk-abc123", urlBase: null });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("URL base");
    expect(fetchEspiado).not.toHaveBeenCalled();
  });

  it("en fallo del proveedor, nunca deja la clave en el mensaje", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("clave sk-abc123 invalida"),
      }),
    );

    const r = await listarModelosProveedor("claude", { apiKey: "sk-abc123", urlBase: null });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).not.toContain("sk-abc123");
      expect(r.error).toContain("***");
    }
  });

  it("lista vacia se trata como fallo, no como exito sin modelos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: [] }) }),
    );

    const r = await listarModelosProveedor("claude", { apiKey: "sk-abc123", urlBase: null });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("sin ningún modelo");
  });

  it("un tipo sin adaptador lo dice, sin llamar a la red", async () => {
    const fetchEspiado = vi.fn();
    vi.stubGlobal("fetch", fetchEspiado);

    const r = await listarModelosProveedor("algo_inventado", { apiKey: "sk-abc123", urlBase: null });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no permite detectar");
    expect(fetchEspiado).not.toHaveBeenCalled();
  });
});
