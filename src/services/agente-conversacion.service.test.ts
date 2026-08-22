import { describe, it, expect, vi, beforeEach } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * El motor de conversacion del agente de IA — Fase 2a, solo lectura.
 *
 * `after()` se mockea para correr YA (no diferido): en produccion sigue
 * trabajando tras la respuesta, aqui se ejecuta y se guarda su promesa
 * para poder esperarla antes de comprobar el resultado -sin eso, la
 * prueba terminaria antes de que `ejecutarTurno` escribiera nada-.
 */

interface FilaConversacion {
  id: string;
  companyId: string;
  userId: string;
  createdAt: Date;
}
interface FilaMensaje {
  id: string;
  conversacionId: string;
  rol: "USUARIO" | "ASISTENTE";
  contenido: string;
  herramientas: unknown;
  iniciadoAt: Date;
  terminadoAt: Date | null;
  error: string | null;
}

const estado: {
  conversaciones: FilaConversacion[];
  mensajes: FilaMensaje[];
  proveedorActivo: { tipo: string; modelo: string; urlBase: string | null; apiKey: string } | null;
  respuestasConversar: (
    | { tipo: "texto"; texto: string }
    | { tipo: "usar_herramientas"; llamadas: { id: string; nombre: string; args: unknown }[]; bruto: unknown }
    | { ok: false; error: string }
  )[];
  llamadasConversar: number;
  ultimoAfter: Promise<unknown> | null;
} = {
  conversaciones: [],
  mensajes: [],
  proveedorActivo: null,
  respuestasConversar: [],
  llamadasConversar: 0,
  ultimoAfter: null,
};

let contadorId = 0;
const nuevoId = (prefijo: string) => `${prefijo}-${++contadorId}`;

vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    estado.ultimoAfter = Promise.resolve().then(fn);
  },
}));

vi.mock("@/services/agente-ia.service", () => ({
  configuracionProveedorActivo: () => Promise.resolve(estado.proveedorActivo),
  conversar: () => {
    estado.llamadasConversar++;
    const r = estado.respuestasConversar.shift();
    return Promise.resolve(r ?? { ok: false, error: "sin script de prueba" });
  },
}));

vi.mock("@/services/obras.service", () => ({
  listarObras: () => Promise.resolve({ datos: [], total: 0 }),
  obtenerResumenEmpresa: () => Promise.resolve({ obras: 0 }),
}));

vi.mock("@/services/gerencia.service", () => ({
  semaforoDeCartera: () => Promise.resolve(null),
  sobregiroProyectadoDeCartera: () => Promise.resolve(null),
  confiabilidadDeCartera: () => Promise.resolve(null),
}));

vi.mock("@/lib/prisma", () => {
  const conversacionAgente = {
    findFirst: (args: { where: Record<string, unknown>; orderBy?: unknown }) => {
        const w = args.where;
        const filas = estado.conversaciones.filter(
          (c) =>
            (w["id"] === undefined || c.id === w["id"]) &&
            (w["companyId"] === undefined || c.companyId === w["companyId"]) &&
            (w["userId"] === undefined || c.userId === w["userId"]),
        );
        if (args.orderBy) filas.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return Promise.resolve(filas[0] ?? null);
      },
      create: (args: { data: { companyId: string; userId: string } }) => {
        const fila: FilaConversacion = {
          id: nuevoId("conv"),
          companyId: args.data.companyId,
          userId: args.data.userId,
          createdAt: new Date(),
        };
        estado.conversaciones.push(fila);
        return Promise.resolve({ id: fila.id });
      },
    };

    const mensajeAgente = {
      create: (args: { data: Partial<FilaMensaje> & { conversacionId: string; rol: "USUARIO" | "ASISTENTE" } }) => {
        const fila: FilaMensaje = {
          id: nuevoId("msg"),
          conversacionId: args.data.conversacionId,
          rol: args.data.rol,
          contenido: args.data.contenido ?? "",
          herramientas: args.data.herramientas ?? null,
          iniciadoAt: new Date(),
          terminadoAt: args.data.terminadoAt ?? null,
          error: null,
        };
        estado.mensajes.push(fila);
        return Promise.resolve({ id: fila.id });
      },
      update: (args: { where: { id: string }; data: Partial<FilaMensaje> }) => {
        const fila = estado.mensajes.find((m) => m.id === args.where.id);
        if (fila) Object.assign(fila, args.data);
        return Promise.resolve({});
      },
      updateMany: (args: { where: Record<string, unknown>; data: Partial<FilaMensaje> }) => {
        const limite = (args.where["iniciadoAt"] as { lt: Date } | undefined)?.lt;
        let count = 0;
        for (const m of estado.mensajes) {
          if (m.terminadoAt === null && limite && m.iniciadoAt < limite) {
            Object.assign(m, args.data);
            count++;
          }
        }
        return Promise.resolve({ count });
      },
      findFirst: (args: {
        where: { id?: string; conversacion?: { companyId: string; userId: string } };
      }) => {
        const w = args.where;
        const fila = estado.mensajes.find((m) => {
          if (w.id !== undefined && m.id !== w.id) return false;
          if (w.conversacion) {
            const conv = estado.conversaciones.find((c) => c.id === m.conversacionId);
            if (!conv) return false;
            if (conv.companyId !== w.conversacion.companyId) return false;
            if (conv.userId !== w.conversacion.userId) return false;
          }
          return true;
        });
        return Promise.resolve(fila ?? null);
      },
      findMany: (args: {
        where: { conversacionId: string; id?: { not: string }; terminadoAt?: { not: null } };
        orderBy?: unknown;
      }) => {
        const w = args.where;
        const filas = estado.mensajes.filter((m) => {
          if (m.conversacionId !== w.conversacionId) return false;
          if (w.id && m.id === w.id.not) return false;
          if (w.terminadoAt && m.terminadoAt === null) return false;
          return true;
        });
        filas.sort((a, b) => a.iniciadoAt.getTime() - b.iniciadoAt.getTime());
        return Promise.resolve(filas);
      },
    };

    return {
      prisma: {
        conversacionAgente,
        mensajeAgente,
        $transaction: async (fn: (tx: unknown) => unknown) =>
          fn({ conversacionAgente, mensajeAgente }),
      },
    };
});

const {
  iniciarTurno,
  estadoDeTurno,
  historialDeConversacion,
  conversacionReciente,
  barridoDeTurnosMuertos,
} = await import("@/services/agente-conversacion.service");

function sesion(permisos: string[] = ["agente_ia:usar"]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    nombres: "Ada",
    apellidos: "Lovelace",
    role: "ADMIN",
    permisos,
    esOperador: false,
  } as unknown as SesionActiva;
}

const CON_PERMISO = sesion();
const SIN_PERMISO = sesion([]);

async function esperarTurno() {
  await estado.ultimoAfter;
}

beforeEach(() => {
  estado.conversaciones = [];
  estado.mensajes = [];
  estado.proveedorActivo = { tipo: "claude", modelo: "claude-sonnet-5", urlBase: null, apiKey: "sk-test" };
  estado.respuestasConversar = [];
  estado.llamadasConversar = 0;
  estado.ultimoAfter = null;
  contadorId = 0;
});

describe("el permiso", () => {
  it("protege las cuatro funciones", async () => {
    const r = await iniciarTurno(SIN_PERMISO, null, "hola");
    expect(r.ok).toBe(false);
    expect(estado.mensajes).toHaveLength(0);

    expect(await estadoDeTurno(SIN_PERMISO, "cualquiera")).toBeNull();
    expect(await historialDeConversacion(SIN_PERMISO, "cualquiera")).toEqual([]);
    expect(await conversacionReciente(SIN_PERMISO)).toBeNull();
  });
});

describe("iniciarTurno", () => {
  it("rechaza un mensaje vacio", async () => {
    const r = await iniciarTurno(CON_PERMISO, null, "   ");
    expect(r.ok).toBe(false);
    expect(estado.mensajes).toHaveLength(0);
  });

  it("crea la conversacion, el mensaje del usuario y uno vacio del asistente", async () => {
    const r = await iniciarTurno(CON_PERMISO, null, "¿Cómo va la cartera?");
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(estado.conversaciones).toHaveLength(1);
    const usuario = estado.mensajes.find((m) => m.rol === "USUARIO");
    expect(usuario?.contenido).toBe("¿Cómo va la cartera?");
    expect(usuario?.terminadoAt).not.toBeNull();

    const asistente = estado.mensajes.find((m) => m.id === r.mensajeAsistenteId);
    expect(asistente?.rol).toBe("ASISTENTE");
    expect(asistente?.terminadoAt).toBeNull(); // antes de que after() corra
  });

  it("reusa una conversacion propia si se le pasa su id", async () => {
    const primero = await iniciarTurno(CON_PERMISO, null, "uno");
    if (!primero.ok) throw new Error("deberia haber funcionado");
    await esperarTurno();

    const segundo = await iniciarTurno(CON_PERMISO, primero.conversacionId, "dos");
    if (!segundo.ok) throw new Error("deberia haber funcionado");

    expect(segundo.conversacionId).toBe(primero.conversacionId);
    expect(estado.conversaciones).toHaveLength(1);
  });

  it("si el id no es una conversacion propia, abre una nueva en vez de fallar", async () => {
    estado.conversaciones.push({
      id: "ajena",
      companyId: "otra-empresa",
      userId: "otro-user",
      createdAt: new Date(),
    });

    const r = await iniciarTurno(CON_PERMISO, "ajena", "hola");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.conversacionId).not.toBe("ajena");
  });
});

describe("ejecutarTurno, disparado por after()", () => {
  it("con proveedor activo y respuesta de texto directa, guarda y termina", async () => {
    estado.respuestasConversar = [{ tipo: "texto", texto: "Todo en orden." }];

    const r = await iniciarTurno(CON_PERMISO, null, "hola");
    if (!r.ok) throw new Error("deberia haber funcionado");
    await esperarTurno();

    const asistente = estado.mensajes.find((m) => m.id === r.mensajeAsistenteId);
    expect(asistente?.contenido).toBe("Todo en orden.");
    expect(asistente?.terminadoAt).not.toBeNull();
    expect(asistente?.error).toBeNull();
  });

  it("sin proveedor activo, marca el error sin llamar al adaptador", async () => {
    estado.proveedorActivo = null;

    const r = await iniciarTurno(CON_PERMISO, null, "hola");
    if (!r.ok) throw new Error("deberia haber funcionado");
    await esperarTurno();

    expect(estado.llamadasConversar).toBe(0);
    const asistente = estado.mensajes.find((m) => m.id === r.mensajeAsistenteId);
    expect(asistente?.terminadoAt).not.toBeNull();
    expect(asistente?.error).toContain("Configura y activa un proveedor");
  });

  it("si el proveedor rechaza la llamada, guarda el motivo como error", async () => {
    estado.respuestasConversar = [{ ok: false, error: "(401) clave invalida" }];

    const r = await iniciarTurno(CON_PERMISO, null, "hola");
    if (!r.ok) throw new Error("deberia haber funcionado");
    await esperarTurno();

    const asistente = estado.mensajes.find((m) => m.id === r.mensajeAsistenteId);
    expect(asistente?.terminadoAt).not.toBeNull();
    expect(asistente?.error).toBe("(401) clave invalida");
  });

  it("ejecuta una herramienta pedida y sigue hasta la respuesta final", async () => {
    estado.respuestasConversar = [
      {
        tipo: "usar_herramientas",
        llamadas: [{ id: "call-1", nombre: "resumen_empresa", args: {} }],
        bruto: [{ type: "tool_use", id: "call-1", name: "resumen_empresa", input: {} }],
      },
      { tipo: "texto", texto: "Tienes 3 obras en la cartera." },
    ];

    const r = await iniciarTurno(CON_PERMISO, null, "¿cuántas obras tengo?");
    if (!r.ok) throw new Error("deberia haber funcionado");
    await esperarTurno();

    expect(estado.llamadasConversar).toBe(2);
    const asistente = estado.mensajes.find((m) => m.id === r.mensajeAsistenteId);
    expect(asistente?.contenido).toBe("Tienes 3 obras en la cartera.");
    expect(asistente?.terminadoAt).not.toBeNull();
    expect(asistente?.herramientas).toEqual(["resumen_empresa"]);
  });

  it("una herramienta desconocida no tumba el turno: se lo dice al modelo y sigue", async () => {
    estado.respuestasConversar = [
      {
        tipo: "usar_herramientas",
        llamadas: [{ id: "call-1", nombre: "no_existe", args: {} }],
        bruto: [{ type: "tool_use", id: "call-1", name: "no_existe", input: {} }],
      },
      { tipo: "texto", texto: "No tengo esa herramienta, pero..." },
    ];

    const r = await iniciarTurno(CON_PERMISO, null, "algo raro");
    if (!r.ok) throw new Error("deberia haber funcionado");
    await esperarTurno();

    const asistente = estado.mensajes.find((m) => m.id === r.mensajeAsistenteId);
    expect(asistente?.terminadoAt).not.toBeNull();
    expect(asistente?.error).toBeNull();
    expect(asistente?.contenido).toBe("No tengo esa herramienta, pero...");
  });

  it("si el modelo nunca deja de pedir herramientas, corta con un error explicado", async () => {
    estado.respuestasConversar = Array.from({ length: 10 }, (_, i) => ({
      tipo: "usar_herramientas" as const,
      llamadas: [{ id: `call-${i}`, nombre: "resumen_empresa", args: {} }],
      bruto: [{ type: "tool_use", id: `call-${i}`, name: "resumen_empresa", input: {} }],
    }));

    const r = await iniciarTurno(CON_PERMISO, null, "insiste");
    if (!r.ok) throw new Error("deberia haber funcionado");
    await esperarTurno();

    const asistente = estado.mensajes.find((m) => m.id === r.mensajeAsistenteId);
    expect(asistente?.terminadoAt).not.toBeNull();
    expect(asistente?.error).toContain("Se agotaron los intentos");
    // Nunca mas de MAX_VUELTAS llamadas al adaptador, aunque el script de
    // prueba tenga 10 preparadas.
    expect(estado.llamadasConversar).toBeLessThanOrEqual(6);
  });
});

describe("estadoDeTurno y aislamiento", () => {
  it("no encuentra el mensaje de otra empresa", async () => {
    estado.conversaciones.push({
      id: "conv-ajena",
      companyId: "otra-empresa",
      userId: "otro-user",
      createdAt: new Date(),
    });
    estado.mensajes.push({
      id: "msg-ajeno",
      conversacionId: "conv-ajena",
      rol: "ASISTENTE",
      contenido: "secreto de otra empresa",
      herramientas: null,
      iniciadoAt: new Date(),
      terminadoAt: new Date(),
      error: null,
    });

    expect(await estadoDeTurno(CON_PERMISO, "msg-ajeno")).toBeNull();
    expect(await historialDeConversacion(CON_PERMISO, "conv-ajena")).toEqual([]);
  });
});

describe("barridoDeTurnosMuertos", () => {
  it("marca error solo a los que llevan mas de 3 minutos sin terminar", async () => {
    estado.mensajes.push(
      {
        id: "viejo-sin-terminar",
        conversacionId: "c1",
        rol: "ASISTENTE",
        contenido: "",
        herramientas: null,
        iniciadoAt: new Date(Date.now() - 5 * 60_000),
        terminadoAt: null,
        error: null,
      },
      {
        id: "reciente-sin-terminar",
        conversacionId: "c1",
        rol: "ASISTENTE",
        contenido: "",
        herramientas: null,
        iniciadoAt: new Date(),
        terminadoAt: null,
        error: null,
      },
      {
        id: "viejo-ya-terminado",
        conversacionId: "c1",
        rol: "ASISTENTE",
        contenido: "listo",
        herramientas: null,
        iniciadoAt: new Date(Date.now() - 5 * 60_000),
        terminadoAt: new Date(),
        error: null,
      },
    );

    const r = await barridoDeTurnosMuertos();
    expect(r.marcados).toBe(1);

    expect(estado.mensajes.find((m) => m.id === "viejo-sin-terminar")?.terminadoAt).not.toBeNull();
    expect(estado.mensajes.find((m) => m.id === "reciente-sin-terminar")?.terminadoAt).toBeNull();
  });
});
