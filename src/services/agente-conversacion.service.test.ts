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
  // Opcionales a proposito: las pruebas de antes de la Fase 2b empujan
  // filas literales sin estos tres campos, y `undefined` se comporta
  // igual que "sin propuesta" en toda comparacion `!== null`/`=== null`
  // de abajo -no hace falta tocar cada una de esas pruebas viejas-.
  propuesta?: unknown;
  propuestaResueltaAt?: Date | null;
  propuestaResultado?: string | null;
}

interface ConfigProveedorPrueba {
  id: string;
  nombre: string;
  tipo: string;
  modelo: string;
  urlBase: string | null;
  apiKey: string;
}

type RespuestaConversarScript =
  | { tipo: "texto"; texto: string }
  | { tipo: "usar_herramientas"; llamadas: { id: string; nombre: string; args: unknown }[]; bruto: unknown }
  | { ok: false; error: string };

const estado: {
  conversaciones: FilaConversacion[];
  mensajes: FilaMensaje[];
  proveedorActivo: ConfigProveedorPrueba | null;
  respuestasConversar: RespuestaConversarScript[];
  /// Guion POR PROVEEDOR (clave = id), para las pruebas del conmutador
  /// automatico -donde el activo y la alternativa tienen que comportarse
  /// distinto-. Vacio en el resto de las pruebas.
  respuestasPorProveedor: Record<string, RespuestaConversarScript[]>;
  /// Otros proveedores YA VERIFICADOS de la empresa, candidatos del
  /// conmutador -vacio salvo que una prueba especifica lo llene-.
  proveedoresAlternativos: ConfigProveedorPrueba[];
  /// Ids de los proveedores que `activarProveedorInterno` activo, en
  /// orden -para comprobar que el conmutador activo el que SI respondio-.
  activaciones: string[];
  /// {proveedorId, error} de cada llamada a `marcarErrorProveedorInterno`.
  erroresMarcados: { proveedorId: string; error: string }[];
  llamadasConversar: number;
  /// Las herramientas que se le ofrecieron al proveedor en la ULTIMA
  /// llamada -para comprobar que `proponer_accion` solo aparece con
  /// `agente_ia:escribir`, sin tener que espiar la API real-.
  ultimoTurnoHerramientas: string[];
  ultimoAfter: Promise<unknown> | null;
  crearNotaResultado: { ok: true; id: string } | { ok: false; error: string };
  crearNotaLlamadas: { obraId: string; datos: unknown }[];
} = {
  conversaciones: [],
  mensajes: [],
  proveedorActivo: null,
  respuestasConversar: [],
  respuestasPorProveedor: {},
  proveedoresAlternativos: [],
  activaciones: [],
  erroresMarcados: [],
  llamadasConversar: 0,
  ultimoTurnoHerramientas: [],
  ultimoAfter: null,
  crearNotaResultado: { ok: true, id: "nota-1" },
  crearNotaLlamadas: [],
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
  conversar: (
    _tipo: string,
    config: { id: string },
    turno: { herramientas: { nombre: string }[] },
  ) => {
    estado.llamadasConversar++;
    estado.ultimoTurnoHerramientas = turno.herramientas.map((h) => h.nombre);
    // Si el escenario script0 respuestas PARA ESTE proveedor en concreto
    // -las pruebas del conmutador automatico lo hacen, para que el activo
    // y la alternativa se comporten distinto-, esas mandan. Si no, cae al
    // guion global compartido -asi las pruebas de antes del conmutador,
    // que nunca conocieron mas de un proveedor, siguen igual-.
    const propio = estado.respuestasPorProveedor[config.id];
    if (propio && propio.length > 0) {
      return Promise.resolve(propio.shift());
    }
    const r = estado.respuestasConversar.shift();
    return Promise.resolve(r ?? { ok: false, error: "sin script de prueba" });
  },
  // Stub simple y deterministico: esta suite prueba la ORQUESTACION del
  // turno, no el formato de union exacto de cada proveedor -eso ya lo
  // cubre `agente-ia.service.test.ts`-.
  mensajesDeResultados: (resultados: unknown[]) => [{ role: "user", content: resultados }],
  configuracionesAlternativas: (_companyId: string, excluirId: string) =>
    Promise.resolve(estado.proveedoresAlternativos.filter((p) => p.id !== excluirId)),
  activarProveedorInterno: (_companyId: string, proveedorId: string) => {
    estado.activaciones.push(proveedorId);
    const nuevo = estado.proveedoresAlternativos.find((p) => p.id === proveedorId);
    if (nuevo) estado.proveedorActivo = nuevo;
    return Promise.resolve();
  },
  marcarErrorProveedorInterno: (proveedorId: string, error: string) => {
    estado.erroresMarcados.push({ proveedorId, error });
    return Promise.resolve();
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

vi.mock("@/services/movimientos.service", () => ({
  obtenerPresupuestoVigente: () => Promise.resolve({ partidas: [] }),
  crearMovimiento: () =>
    Promise.resolve({ ok: false, error: "no cubierto en esta suite, ver agente-ia" }),
}));

vi.mock("@/services/cronograma.service", () => ({
  obtenerCronograma: () => Promise.resolve(null),
  registrarAvance: () =>
    Promise.resolve({ ok: false, error: "no cubierto en esta suite, ver agente-ia" }),
}));

vi.mock("@/services/notas.service", () => ({
  crearNota: (_sesion: unknown, obraId: string, datos: unknown) => {
    estado.crearNotaLlamadas.push({ obraId, datos });
    return Promise.resolve(estado.crearNotaResultado);
  },
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
          propuesta: args.data.propuesta ?? null,
          propuestaResueltaAt: args.data.propuestaResueltaAt ?? null,
          propuestaResultado: args.data.propuestaResultado ?? null,
        };
        estado.mensajes.push(fila);
        return Promise.resolve({ id: fila.id });
      },
      update: (args: { where: { id: string }; data: Partial<FilaMensaje> }) => {
        const fila = estado.mensajes.find((m) => m.id === args.where.id);
        if (fila) Object.assign(fila, args.data);
        return Promise.resolve({});
      },
      // Formas distintas segun quien llama, distinguidas por que claves
      // trae el `where` -mismo criterio que `findFirst` de abajo, que ya
      // hace este tipo de despacho manual-:
      //   1. confirmarPropuestaAgente "reclama" por id: { id: "...", propuestaResueltaAt: null }
      //   2. barridoDePropuestasExpiradas actualiza por lote de ids ya
      //      filtrados en memoria: { id: { in: [...] } }
      //   3. barridoDeTurnosMuertos: { terminadoAt: null, iniciadoAt: { lt } }
      updateMany: (args: { where: Record<string, unknown>; data: Partial<FilaMensaje> }) => {
        const w = args.where;

        if ("id" in w) {
          const idFiltro = w["id"];
          if (idFiltro && typeof idFiltro === "object" && "in" in idFiltro) {
            const ids = (idFiltro as { in: string[] }).in;
            let count = 0;
            for (const m of estado.mensajes) {
              if (!ids.includes(m.id)) continue;
              Object.assign(m, args.data);
              count++;
            }
            return Promise.resolve({ count });
          }
          const fila = estado.mensajes.find(
            (m) => m.id === idFiltro && m.propuestaResueltaAt === null,
          );
          if (!fila) return Promise.resolve({ count: 0 });
          Object.assign(fila, args.data);
          return Promise.resolve({ count: 1 });
        }

        const limite = (w["iniciadoAt"] as { lt?: Date } | undefined)?.lt;
        let count = 0;
        for (const m of estado.mensajes) {
          if (m.terminadoAt !== null) continue;
          if (limite && m.iniciadoAt >= limite) continue;
          Object.assign(m, args.data);
          count++;
        }
        return Promise.resolve({ count });
      },
      findFirst: (args: {
        where: {
          id?: string;
          conversacionId?: string;
          rol?: "USUARIO" | "ASISTENTE";
          conversacion?: { companyId: string; userId: string };
        };
        orderBy?: { iniciadoAt: "asc" | "desc" };
      }) => {
        const w = args.where;
        let filas = estado.mensajes.filter((m) => {
          if (w.id !== undefined && m.id !== w.id) return false;
          if (w.conversacionId !== undefined && m.conversacionId !== w.conversacionId) return false;
          if (w.rol !== undefined && m.rol !== w.rol) return false;
          if (w.conversacion) {
            const conv = estado.conversaciones.find((c) => c.id === m.conversacionId);
            if (!conv) return false;
            if (conv.companyId !== w.conversacion.companyId) return false;
            if (conv.userId !== w.conversacion.userId) return false;
          }
          return true;
        });
        if (args.orderBy?.iniciadoAt === "desc") {
          filas = [...filas].sort((a, b) => b.iniciadoAt.getTime() - a.iniciadoAt.getTime());
        }
        return Promise.resolve(filas[0] ?? null);
      },
      // Dos formas: el historial de una conversacion (`conversacionId`
      // presente) y el barrido de propuestas expiradas (sin
      // `conversacionId`, filtra por `propuestaResueltaAt`/`terminadoAt`).
      findMany: (args: {
        where: {
          conversacionId?: string;
          id?: { not: string };
          terminadoAt?: { not: null } | { not: null; lt: Date };
          propuestaResueltaAt?: null;
        };
        orderBy?: unknown;
      }) => {
        const w = args.where;
        const filas = estado.mensajes.filter((m) => {
          if (w.conversacionId !== undefined && m.conversacionId !== w.conversacionId) return false;
          if (w.id && m.id === w.id.not) return false;
          if (w.terminadoAt) {
            if (m.terminadoAt === null) return false;
            const lt = (w.terminadoAt as { lt?: Date }).lt;
            if (lt && m.terminadoAt >= lt) return false;
          }
          if (w.propuestaResueltaAt === null && (m.propuestaResueltaAt ?? null) !== null) {
            return false;
          }
          return true;
        });
        filas.sort((a, b) => a.iniciadoAt.getTime() - b.iniciadoAt.getTime());
        return Promise.resolve(filas);
      },
    };

    // Solo para `nombreDeObra` -una consulta de apoyo para el texto de la
    // tarjeta de confirmacion, ver el comentario en agente-conversacion.service.ts-.
    const project = {
      findFirst: () => Promise.resolve({ nombreObra: "Obra de prueba" }),
    };

    return {
      prisma: {
        conversacionAgente,
        mensajeAgente,
        project,
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
  confirmarPropuestaAgente,
  barridoDePropuestasExpiradas,
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
const CON_ESCRITURA = sesion(["agente_ia:usar", "agente_ia:escribir"]);

async function esperarTurno() {
  await estado.ultimoAfter;
}

beforeEach(() => {
  estado.conversaciones = [];
  estado.mensajes = [];
  estado.proveedorActivo = {
    id: "activo-1",
    nombre: "Proveedor de prueba",
    tipo: "claude",
    modelo: "claude-sonnet-5",
    urlBase: null,
    apiKey: "sk-test",
  };
  estado.respuestasConversar = [];
  estado.respuestasPorProveedor = {};
  estado.proveedoresAlternativos = [];
  estado.activaciones = [];
  estado.erroresMarcados = [];
  estado.llamadasConversar = 0;
  estado.ultimoTurnoHerramientas = [];
  estado.ultimoAfter = null;
  estado.crearNotaResultado = { ok: true, id: "nota-1" };
  estado.crearNotaLlamadas = [];
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

describe("conmutador automatico de proveedor", () => {
  const ALTERNATIVA: ConfigProveedorPrueba = {
    id: "alt-1",
    nombre: "Alternativa verificada",
    tipo: "claude",
    modelo: "claude-otro",
    urlBase: null,
    apiKey: "sk-alt",
  };

  it("si el activo responde bien, nunca se toca ninguna alternativa", async () => {
    estado.proveedoresAlternativos = [ALTERNATIVA];
    estado.respuestasPorProveedor["activo-1"] = [{ tipo: "texto", texto: "Todo en orden." }];

    const r = await iniciarTurno(CON_PERMISO, null, "hola");
    if (!r.ok) throw new Error("deberia haber funcionado");
    await esperarTurno();

    expect(estado.activaciones).toHaveLength(0);
    expect(estado.erroresMarcados).toHaveLength(0);
    const asistente = estado.mensajes.find((m) => m.id === r.mensajeAsistenteId);
    expect(asistente?.contenido).toBe("Todo en orden.");
  });

  it("si el activo falla y una alternativa responde, el turno se completa igual -sin que quien pregunta note nada- y esa alternativa queda activa", async () => {
    estado.proveedoresAlternativos = [ALTERNATIVA];
    estado.respuestasPorProveedor["activo-1"] = [{ ok: false, error: "(503) sobrecargado" }];
    estado.respuestasPorProveedor["alt-1"] = [{ tipo: "texto", texto: "Respondo yo." }];

    const r = await iniciarTurno(CON_PERMISO, null, "hola");
    if (!r.ok) throw new Error("deberia haber funcionado");
    await esperarTurno();

    const asistente = estado.mensajes.find((m) => m.id === r.mensajeAsistenteId);
    expect(asistente?.terminadoAt).not.toBeNull();
    expect(asistente?.error).toBeNull();
    expect(asistente?.contenido).toBe("Respondo yo.");

    expect(estado.erroresMarcados).toEqual([{ proveedorId: "activo-1", error: "(503) sobrecargado" }]);
    expect(estado.activaciones).toEqual(["alt-1"]);
    // El proveedor activo de la empresa cambio de verdad, para que el
    // PROXIMO turno ya no pague el costo de reintentar el que esta caido.
    expect(estado.proveedorActivo?.id).toBe("alt-1");
  });

  it("si el activo y todas las alternativas fallan, explica con el error del ACTIVO -el que quien administra ya conoce-, no el de la ultima alternativa", async () => {
    estado.proveedoresAlternativos = [ALTERNATIVA];
    estado.respuestasPorProveedor["activo-1"] = [{ ok: false, error: "(401) clave del activo invalida" }];
    estado.respuestasPorProveedor["alt-1"] = [{ ok: false, error: "(500) la alternativa tambien cayo" }];

    const r = await iniciarTurno(CON_PERMISO, null, "hola");
    if (!r.ok) throw new Error("deberia haber funcionado");
    await esperarTurno();

    const asistente = estado.mensajes.find((m) => m.id === r.mensajeAsistenteId);
    expect(asistente?.error).toBe("(401) clave del activo invalida");
    expect(estado.erroresMarcados.map((e) => e.proveedorId)).toEqual(["activo-1", "alt-1"]);
    // Ninguna alternativa funciono: el activo de la empresa NO cambia.
    expect(estado.activaciones).toHaveLength(0);
  });

  it("nunca prueba mas de TOPE_ALTERNATIVAS -si la que funciona esta mas alla del tope, el turno falla igual-", async () => {
    const alt2: ConfigProveedorPrueba = { ...ALTERNATIVA, id: "alt-2", nombre: "Segunda" };
    const alt3QueFunciona: ConfigProveedorPrueba = { ...ALTERNATIVA, id: "alt-3", nombre: "Tercera, nunca se llega" };
    estado.proveedoresAlternativos = [ALTERNATIVA, alt2, alt3QueFunciona];
    estado.respuestasPorProveedor["activo-1"] = [{ ok: false, error: "cae el activo" }];
    estado.respuestasPorProveedor["alt-1"] = [{ ok: false, error: "cae la primera" }];
    estado.respuestasPorProveedor["alt-2"] = [{ ok: false, error: "cae la segunda" }];
    estado.respuestasPorProveedor["alt-3"] = [{ tipo: "texto", texto: "esta SI responde, pero nunca se le pregunta" }];

    const r = await iniciarTurno(CON_PERMISO, null, "hola");
    if (!r.ok) throw new Error("deberia haber funcionado");
    await esperarTurno();

    const asistente = estado.mensajes.find((m) => m.id === r.mensajeAsistenteId);
    expect(asistente?.error).toBe("cae el activo");
    // activo + 2 alternativas (el tope) = 3 marcados, nunca la tercera.
    expect(estado.erroresMarcados.map((e) => e.proveedorId)).toEqual(["activo-1", "alt-1", "alt-2"]);
    expect(estado.activaciones).toHaveLength(0);
  });

  it("el cambio de proveedor solo puede pasar en la PRIMERA vuelta, nunca a mitad del uso de herramientas", async () => {
    estado.proveedoresAlternativos = [ALTERNATIVA];
    // La primera vuelta responde bien con el activo -pide una
    // herramienta-; la SEGUNDA vuelta, ya con historial de esa
    // herramienta acumulado en el formato del activo, falla. No debe
    // intentarse ninguna alternativa a esa altura -mezclar el formato de
    // dos proveedores a mitad de turno romperia el historial-.
    estado.respuestasPorProveedor["activo-1"] = [
      {
        tipo: "usar_herramientas",
        llamadas: [{ id: "call-1", nombre: "resumen_empresa", args: {} }],
        bruto: { role: "assistant", content: [] },
      },
      { ok: false, error: "cae a mitad de turno" },
    ];

    const r = await iniciarTurno(CON_PERMISO, null, "hola");
    if (!r.ok) throw new Error("deberia haber funcionado");
    await esperarTurno();

    const asistente = estado.mensajes.find((m) => m.id === r.mensajeAsistenteId);
    expect(asistente?.error).toBe("cae a mitad de turno");
    // Ni un solo intento de conmutar: la alternativa nunca se llamo.
    expect(estado.activaciones).toHaveLength(0);
    expect(estado.erroresMarcados).toHaveLength(0);
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

describe("proponer_accion (Fase 2b)", () => {
  it("sin agente_ia:escribir, nunca se le ofrece proponer_accion al modelo", async () => {
    estado.respuestasConversar = [{ tipo: "texto", texto: "listo" }];
    const r = await iniciarTurno(CON_PERMISO, null, "hola");
    if (!r.ok) throw new Error("deberia haber funcionado");
    await esperarTurno();

    expect(estado.ultimoTurnoHerramientas).not.toContain("proponer_accion");
  });

  it("con agente_ia:escribir, se ofrece proponer_accion", async () => {
    estado.respuestasConversar = [{ tipo: "texto", texto: "listo" }];
    const r = await iniciarTurno(CON_ESCRITURA, null, "hola");
    if (!r.ok) throw new Error("deberia haber funcionado");
    await esperarTurno();

    expect(estado.ultimoTurnoHerramientas).toContain("proponer_accion");
  });

  it("al proponer una escritura, guarda la propuesta con el resumen del SERVIDOR y corta el turno ahi", async () => {
    const datosPropuestos = {
      obraId: "obra-1",
      categoria: "OPERATIVO",
      titulo: "Falta cemento",
      cuerpo: "No hay cemento tipo I en almacen.",
    };
    estado.respuestasConversar = [
      {
        tipo: "usar_herramientas",
        llamadas: [
          { id: "call-1", nombre: "proponer_accion", args: { herramienta: "crear_nota", datos: datosPropuestos } },
        ],
        bruto: { role: "assistant", content: [] },
      },
      // Si el turno NO se cortara solo, este segundo guion se consumiria
      // -la prueba de abajo (`llamadasConversar`) es la que lo demuestra-.
      { tipo: "texto", texto: "esto nunca deberia llegar a guardarse" },
    ];

    const r = await iniciarTurno(CON_ESCRITURA, null, "hay que anotar que falta cemento");
    if (!r.ok) throw new Error("deberia haber funcionado");
    await esperarTurno();

    expect(estado.llamadasConversar).toBe(1);
    expect(estado.crearNotaLlamadas).toHaveLength(0); // proponer NUNCA ejecuta

    const asistente = estado.mensajes.find((m) => m.id === r.mensajeAsistenteId);
    expect(asistente?.terminadoAt).not.toBeNull();
    expect(asistente?.propuesta).toEqual({ herramienta: "crear_nota", datos: datosPropuestos });
    expect(asistente?.propuestaResueltaAt).toBeNull();
    expect(asistente?.contenido).toContain("Falta cemento");
    expect(asistente?.contenido).toContain("Obra de prueba"); // nombreDeObra, no lo que dijo el modelo
  });

  it("iniciarTurno bloquea un mensaje nuevo mientras haya una propuesta sin resolver", async () => {
    const primero = await iniciarTurno(CON_ESCRITURA, null, "uno");
    if (!primero.ok) throw new Error("deberia haber funcionado");

    const fila = estado.mensajes.find((m) => m.id === primero.mensajeAsistenteId)!;
    fila.propuesta = { herramienta: "crear_nota", datos: {} };
    fila.propuestaResueltaAt = null;
    fila.terminadoAt = new Date();

    const segundo = await iniciarTurno(CON_ESCRITURA, primero.conversacionId, "dos");
    expect(segundo.ok).toBe(false);
    if (!segundo.ok) expect(segundo.error).toContain("propuesta pendiente");
  });
});

describe("confirmarPropuestaAgente", () => {
  function propuestaPendiente(datos: unknown = { obraId: "obra-1", titulo: "x" }) {
    const conv: FilaConversacion = {
      id: nuevoId("conv"),
      companyId: "empresa-1",
      userId: "u-1",
      createdAt: new Date(),
    };
    estado.conversaciones.push(conv);
    const msg: FilaMensaje = {
      id: nuevoId("msg"),
      conversacionId: conv.id,
      rol: "ASISTENTE",
      contenido: '¿Confirmas crear una nota OPERATIVO en la obra "Obra de prueba": "x"?',
      herramientas: ["proponer_accion"],
      iniciadoAt: new Date(),
      terminadoAt: new Date(),
      error: null,
      propuesta: { herramienta: "crear_nota", datos },
      propuestaResueltaAt: null,
      propuestaResultado: null,
    };
    estado.mensajes.push(msg);
    return msg;
  }

  it("confirmar: ejecuta la escritura con el datos EXACTO guardado, nunca uno nuevo", async () => {
    const datos = { obraId: "obra-1", categoria: "OPERATIVO", titulo: "Falta cemento", cuerpo: "..." };
    const msg = propuestaPendiente(datos);

    const r = await confirmarPropuestaAgente(CON_ESCRITURA, msg.id, "confirmar");

    expect(r.ok).toBe(true);
    // `crearNota(sesion, obraId, datos)` recibe obraId APARTE -la
    // herramienta lo saca de `datos` antes de llamar, ver
    // `ejecutarEscritura` de crear_nota en agente-conversacion.service.ts-,
    // asi que aqui NO se repite dentro de `datos`.
    expect(estado.crearNotaLlamadas).toEqual([
      { obraId: "obra-1", datos: { categoria: "OPERATIVO", titulo: "Falta cemento", cuerpo: "..." } },
    ]);
    expect(msg.propuestaResueltaAt).not.toBeNull();
    expect(msg.propuestaResultado).toBe("Nota creada.");
    expect(msg.contenido).toContain("Nota creada.");
  });

  it("cancelar: nunca ejecuta la escritura real", async () => {
    const msg = propuestaPendiente();

    const r = await confirmarPropuestaAgente(CON_ESCRITURA, msg.id, "cancelar");

    expect(r.ok).toBe(true);
    expect(estado.crearNotaLlamadas).toHaveLength(0);
    expect(msg.propuestaResultado).toBe("Cancelada.");
    expect(msg.contenido).toContain("Cancelada.");
  });

  it("si la funcion real rechaza la escritura (permiso perdido, obra cerrada...), lo dice tal cual", async () => {
    estado.crearNotaResultado = { ok: false, error: "No tienes permiso para escribir notas." };
    const msg = propuestaPendiente();

    const r = await confirmarPropuestaAgente(CON_ESCRITURA, msg.id, "confirmar");

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("No tienes permiso para escribir notas.");
    expect(msg.propuestaResultado).toBe("No tienes permiso para escribir notas.");
  });

  it("una propuesta ya resuelta no se puede resolver otra vez", async () => {
    const msg = propuestaPendiente();
    msg.propuestaResueltaAt = new Date();
    msg.propuestaResultado = "Cancelada.";

    const r = await confirmarPropuestaAgente(CON_ESCRITURA, msg.id, "confirmar");

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ya se resolvió");
    expect(estado.crearNotaLlamadas).toHaveLength(0);
  });

  it("doble click: solo UNA de las dos peticiones simultaneas ejecuta la escritura", async () => {
    const msg = propuestaPendiente();

    const [a, b] = await Promise.all([
      confirmarPropuestaAgente(CON_ESCRITURA, msg.id, "confirmar"),
      confirmarPropuestaAgente(CON_ESCRITURA, msg.id, "confirmar"),
    ]);

    const resultados = [a, b];
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.filter((r) => !r.ok)).toHaveLength(1);
    expect(estado.crearNotaLlamadas).toHaveLength(1);
  });

  it("no resuelve la propuesta de otra empresa", async () => {
    const msg = propuestaPendiente();
    const conv = estado.conversaciones.find((c) => c.id === msg.conversacionId)!;
    conv.companyId = "otra-empresa";

    const r = await confirmarPropuestaAgente(CON_ESCRITURA, msg.id, "confirmar");

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("No se encontró");
    expect(estado.crearNotaLlamadas).toHaveLength(0);
  });
});

describe("barridoDePropuestasExpiradas", () => {
  it("expira solo las propuestas pendientes de mas de 24 horas", async () => {
    const HACE_25H = new Date(Date.now() - 25 * 60 * 60_000);
    const HACE_1H = new Date(Date.now() - 60 * 60_000);

    estado.mensajes.push(
      {
        id: "vieja-pendiente",
        conversacionId: "c1",
        rol: "ASISTENTE",
        contenido: "propuesta vieja",
        herramientas: null,
        iniciadoAt: HACE_25H,
        terminadoAt: HACE_25H,
        error: null,
        propuesta: { herramienta: "crear_nota", datos: {} },
        propuestaResueltaAt: null,
        propuestaResultado: null,
      },
      {
        id: "reciente-pendiente",
        conversacionId: "c1",
        rol: "ASISTENTE",
        contenido: "propuesta reciente",
        herramientas: null,
        iniciadoAt: HACE_1H,
        terminadoAt: HACE_1H,
        error: null,
        propuesta: { herramienta: "crear_nota", datos: {} },
        propuestaResueltaAt: null,
        propuestaResultado: null,
      },
      {
        id: "vieja-ya-resuelta",
        conversacionId: "c1",
        rol: "ASISTENTE",
        contenido: "propuesta vieja pero ya confirmada",
        herramientas: null,
        iniciadoAt: HACE_25H,
        terminadoAt: HACE_25H,
        error: null,
        propuesta: { herramienta: "crear_nota", datos: {} },
        propuestaResueltaAt: HACE_1H,
        propuestaResultado: "Nota creada.",
      },
    );

    const r = await barridoDePropuestasExpiradas();

    expect(r.expiradas).toBe(1);
    expect(estado.mensajes.find((m) => m.id === "vieja-pendiente")?.propuestaResultado).toBe(
      "Expiró sin confirmar.",
    );
    expect(estado.mensajes.find((m) => m.id === "reciente-pendiente")?.propuestaResueltaAt).toBeNull();
    expect(estado.mensajes.find((m) => m.id === "vieja-ya-resuelta")?.propuestaResultado).toBe(
      "Nota creada.",
    );
  });
});
