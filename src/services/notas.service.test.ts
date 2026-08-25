import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Las guardas de la bitacora libre de la obra.
 *
 * Sin base de datos: Prisma doblado, como en `encargos`. Se comprueba que el
 * servicio se NIEGUE antes de escribir, y que "vencida" —que nunca se
 * guarda— salga bien derivada al leer.
 */

interface FilaNota {
  id: string;
  companyId: string;
  projectId: string;
  categoria: string;
  titulo: string;
  cuerpo: string;
  fechaRecordatorio: Date | null;
  atendida: boolean;
  atendidaAt: Date | null;
  atendidaPor: string | null;
  creadoPor: string;
  createdAt: Date;
  updatedAt: Date;
}

const estado: {
  obra: { id: string } | null;
  cerrada: string | null;
  notas: FilaNota[];
  creados: Record<string, unknown>[];
  auditorias: Record<string, unknown>[];
} = {
  obra: { id: "obra-1" },
  cerrada: null,
  notas: [],
  creados: [],
  auditorias: [],
};

/** Compara una fila contra un `where` de Prisma tal cual lo manda el servicio. */
function coincide(fila: FilaNota, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([campo, condicion]) => {
    const valor = (fila as unknown as Record<string, unknown>)[campo];
    if (condicion && typeof condicion === "object" && "not" in condicion) {
      return valor !== (condicion as { not: unknown }).not;
    }
    return valor === condicion;
  });
}

vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: () => Promise.resolve(estado.cerrada),
}));

vi.mock("@/lib/prisma", () => {
  const notaOps = {
    findMany: (args: {
      where: Record<string, unknown>;
      orderBy?: { createdAt?: "asc" | "desc"; fechaRecordatorio?: "asc" | "desc" };
      take?: number;
    }) => {
      let filas = estado.notas.filter((n) => coincide(n, args.where));

      if (args.orderBy?.createdAt) {
        filas = [...filas].sort((a, b) =>
          args.orderBy!.createdAt === "desc"
            ? b.createdAt.getTime() - a.createdAt.getTime()
            : a.createdAt.getTime() - b.createdAt.getTime(),
        );
      }
      if (args.orderBy?.fechaRecordatorio) {
        filas = [...filas].sort((a, b) => {
          const fa = a.fechaRecordatorio?.getTime() ?? 0;
          const fb = b.fechaRecordatorio?.getTime() ?? 0;
          return args.orderBy!.fechaRecordatorio === "desc" ? fb - fa : fa - fb;
        });
      }
      if (args.take !== undefined) filas = filas.slice(0, args.take);

      // Copias, no las filas en vivo: Prisma de verdad devuelve objetos
      // deserializados de la base, y una fila leida ANTES de un `update` no
      // puede cambiar de valor sola cuando el `update` llega despues. Sin
      // esto, `editarNota` leia "antes" y el propio `update` se lo pisaba,
      // porque las dos operaciones apuntaban al mismo objeto en memoria.
      //
      // `adjuntos: []` porque `listarNotas` pide `include: { adjuntos }` y
      // este doble no simula `include` de verdad: ninguna prueba de aqui
      // sube archivos, asi que la lista vacia siempre es correcta.
      return Promise.resolve(filas.map((f) => ({ ...f, adjuntos: [] })));
    },
    findFirst: (args: { where: Record<string, unknown> }) =>
      Promise.resolve(
        (() => {
          const f = estado.notas.find((n) => coincide(n, args.where));
          return f ? { ...f } : null;
        })(),
      ),
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const coincidentes = estado.notas.filter((n) => coincide(n, args.where));
      for (const n of coincidentes) Object.assign(n, args.data);
      return Promise.resolve({ count: coincidentes.length });
    },
  };

  const tx = {
    nota: {
      ...notaOps,
      create: (args: { data: Record<string, unknown> }) => {
        estado.creados.push(args.data);
        const fila: FilaNota = {
          id: `nota-${estado.notas.length + 1}`,
          companyId: "",
          projectId: "",
          categoria: "OPERATIVO",
          titulo: "",
          cuerpo: "",
          fechaRecordatorio: null,
          atendida: false,
          atendidaAt: null,
          atendidaPor: null,
          creadoPor: "",
          createdAt: new Date(),
          updatedAt: new Date(),
          ...(args.data as Partial<FilaNota>),
        };
        estado.notas.push(fila);
        return Promise.resolve({ id: fila.id });
      },
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const fila = estado.notas.find((n) => n.id === args.where.id);
        if (fila) Object.assign(fila, args.data);
        return Promise.resolve(fila);
      },
      delete: (args: { where: { id: string } }) => {
        estado.notas = estado.notas.filter((n) => n.id !== args.where.id);
        return Promise.resolve({});
      },
    },
    auditLog: {
      create: (args: { data: Record<string, unknown> }) => {
        estado.auditorias.push(args.data);
        return Promise.resolve({});
      },
    },
  };

  return {
    prisma: {
      project: { findFirst: () => Promise.resolve(estado.obra) },
      nota: notaOps,
      // Sin store real: las pruebas de adjuntos solo ejercitan las guardas
      // (permiso, obra cerrada, nota/adjunto inexistente), que devuelven
      // ANTES de tocar esta tabla. Ver el comentario de mas abajo.
      adjuntoNota: { findFirst: () => Promise.resolve(null) },
      // Fuera de la transaccion: `alternarAtendida` no abre una, y aun asi
      // tiene que dejar rastro en la auditoria.
      auditLog: {
        create: (args: { data: Record<string, unknown> }) => {
          estado.auditorias.push(args.data);
          return Promise.resolve({});
        },
      },
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    },
  };
});

const {
  listarNotas,
  recordatoriosDeObra,
  crearNota,
  editarNota,
  alternarAtendida,
  eliminarNota,
  subirAdjuntoNota,
  eliminarAdjuntoNota,
} = await import("@/services/notas.service");

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
    // `null` es «alcanza todas las obras de su empresa». Sin este campo la
    // sesion no es valida: la lista vacia y el null son cosas opuestas.
    obrasAsignadas: null,
    nombres: "Quien",
    apellidos: "Sea",
  } as unknown as SesionActiva;
}

const CON_TODO = sesion(["nota:leer", "nota:crear", "nota:gestionar"]);

function nota(cambios: Partial<FilaNota> = {}): FilaNota {
  return {
    id: `nota-${estado.notas.length + 1}`,
    companyId: "empresa-1",
    projectId: "obra-1",
    categoria: "OPERATIVO",
    titulo: "Falta el plano de instalaciones",
    cuerpo: "El plano de instalaciones electricas no llego con el resto.",
    fechaRecordatorio: null,
    atendida: false,
    atendidaAt: null,
    atendidaPor: null,
    creadoPor: "Alguien Mas",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...cambios,
  };
}

function datos(cambios: Record<string, unknown> = {}) {
  return {
    categoria: "OPERATIVO" as const,
    titulo: "Falta el plano de instalaciones",
    cuerpo: "El plano de instalaciones electricas no llego con el resto.",
    ...cambios,
  };
}

function seNego(r: { ok: boolean; error?: string }, trozo: string) {
  expect(r.ok).toBe(false);
  expect(!r.ok && r.error).toContain(trozo);
  expect(estado.creados).toHaveLength(0);
}

beforeEach(() => {
  estado.obra = { id: "obra-1" };
  estado.cerrada = null;
  estado.notas = [];
  estado.creados = [];
  estado.auditorias = [];
});

describe("listarNotas", () => {
  it("sin nota:leer no devuelve nada", async () => {
    const r = await listarNotas(sesion([]), "obra-1");
    expect(r).toBeNull();
  });

  it("una obra de otra empresa no devuelve nada", async () => {
    estado.obra = null;
    const r = await listarNotas(CON_TODO, "obra-1");
    expect(r).toBeNull();
  });

  it("deriva vencida: pendiente con fecha pasada, y solo esa", async () => {
    estado.notas = [
      nota({ id: "n-pasada", fechaRecordatorio: new Date("2020-01-01") }),
      nota({ id: "n-futura", fechaRecordatorio: new Date("2099-01-01") }),
      nota({ id: "n-sin-fecha", fechaRecordatorio: null }),
      // Fecha pasada pero YA atendida: no cuenta como vencida.
      nota({
        id: "n-atendida",
        fechaRecordatorio: new Date("2020-01-01"),
        atendida: true,
      }),
    ];

    const r = await listarNotas(CON_TODO, "obra-1");
    const vencidas = r!.filter((n) => n.vencida).map((n) => n.id);
    expect(vencidas).toEqual(["n-pasada"]);
  });
});

describe("recordatoriosDeObra", () => {
  it("sin nota:leer devuelve null, no una lista vacia", async () => {
    // Distincion a proposito: null = no puede ver esto, [] = al dia. Un
    // widget que confundiera las dos pintaria en verde a quien no tiene
    // permiso, como si no hubiera nada pendiente.
    const r = await recordatoriosDeObra(sesion([]), "obra-1");
    expect(r).toBeNull();
  });

  it("sin notas con recordatorio, lista vacia (no null)", async () => {
    estado.notas = [nota({ fechaRecordatorio: null })];
    const r = await recordatoriosDeObra(CON_TODO, "obra-1");
    expect(r).toEqual([]);
  });

  it("las vencidas van primero, sin importar el orden de llegada", async () => {
    estado.notas = [
      nota({ id: "n-futura", fechaRecordatorio: new Date("2099-06-01") }),
      nota({ id: "n-vencida", fechaRecordatorio: new Date("2020-01-01") }),
    ];
    const r = await recordatoriosDeObra(CON_TODO, "obra-1");
    expect(r!.map((x) => x.id)).toEqual(["n-vencida", "n-futura"]);
    expect(r!.find((x) => x.id === "n-vencida")!.vencida).toBe(true);
    expect(r!.find((x) => x.id === "n-futura")!.vencida).toBe(false);
  });

  it("las atendidas no aparecen aunque tengan fecha pasada", async () => {
    estado.notas = [
      nota({ fechaRecordatorio: new Date("2020-01-01"), atendida: true }),
    ];
    const r = await recordatoriosDeObra(CON_TODO, "obra-1");
    expect(r).toEqual([]);
  });

  it("respeta el limite", async () => {
    estado.notas = Array.from({ length: 8 }, (_, i) =>
      nota({
        id: `n-${i}`,
        fechaRecordatorio: new Date(2030, 0, i + 1),
      }),
    );
    const r = await recordatoriosDeObra(CON_TODO, "obra-1", 3);
    expect(r).toHaveLength(3);
  });
});

describe("crearNota: quien puede, cuando, y que llega", () => {
  it("sin nota:crear no guarda nada", async () => {
    const r = await crearNota(sesion(["nota:leer"]), "obra-1", datos());
    seNego(r, "No tienes permiso");
  });

  it("con la obra cerrada se niega, aunque tenga permiso", async () => {
    estado.cerrada = "La obra esta cerrada desde el 01/07/2026.";
    const r = await crearNota(CON_TODO, "obra-1", datos());
    seNego(r, "cerrada");
  });

  it("una obra de otra empresa no se encuentra", async () => {
    // Esta es la comprobacion que `motivoSiObraCerrada` NO hace por si sola:
    // responde null igual si la obra esta abierta que si no existe.
    estado.obra = null;
    const r = await crearNota(CON_TODO, "obra-1", datos());
    seNego(r, "Obra no encontrada");
  });

  it("sin titulo no se guarda", async () => {
    const r = await crearNota(CON_TODO, "obra-1", datos({ titulo: "   " }));
    seNego(r, "titulo");
  });

  it("sin cuerpo no se guarda", async () => {
    const r = await crearNota(CON_TODO, "obra-1", datos({ cuerpo: "" }));
    seNego(r, "contenido");
  });

  it("el camino bueno guarda la nota y deja rastro en la auditoria", async () => {
    const r = await crearNota(CON_TODO, "obra-1", datos());
    expect(r.ok).toBe(true);
    expect(estado.creados).toHaveLength(1);
    expect(estado.creados[0]).toMatchObject({
      companyId: "empresa-1",
      projectId: "obra-1",
      categoria: "OPERATIVO",
    });
    expect(estado.auditorias).toHaveLength(1);
    expect(estado.auditorias[0]).toMatchObject({
      entidad: "Nota",
      accion: "CREATE",
    });
  });

  it("con fecha de recordatorio la guarda como fecha, no como texto", async () => {
    await crearNota(
      CON_TODO,
      "obra-1",
      datos({ fechaRecordatorio: "2026-09-01" }),
    );
    const guardada = estado.creados[0]!["fechaRecordatorio"] as Date;
    expect(guardada).toBeInstanceOf(Date);
    expect(guardada.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("crearNota -> listarNotas: la ronda completa", () => {
  it("una nota recien creada con fecha pasada sale vencida, y con fecha futura no", async () => {
    await crearNota(
      CON_TODO,
      "obra-1",
      datos({ titulo: "Pago pendiente", fechaRecordatorio: "2020-01-01" }),
    );
    await crearNota(
      CON_TODO,
      "obra-1",
      datos({ titulo: "Revisar contrato", fechaRecordatorio: "2099-01-01" }),
    );

    const lista = await listarNotas(CON_TODO, "obra-1");
    const porTitulo = new Map(lista!.map((n) => [n.titulo, n.vencida]));
    expect(porTitulo.get("Pago pendiente")).toBe(true);
    expect(porTitulo.get("Revisar contrato")).toBe(false);
  });
});

describe("editarNota", () => {
  it("con solo nota:crear no puede editar: hace falta nota:gestionar", async () => {
    estado.notas = [nota({ id: "n-1" })];
    const r = await editarNota(sesion(["nota:crear"]), "obra-1", "n-1", datos());
    seNego(r, "No tienes permiso");
  });

  it("una nota de otra obra no se encuentra", async () => {
    estado.notas = [nota({ id: "n-1", projectId: "obra-2" })];
    const r = await editarNota(CON_TODO, "obra-1", "n-1", datos());
    seNego(r, "Nota no encontrada");
  });

  it("el camino bueno reescribe los campos y guarda antes/despues", async () => {
    estado.notas = [nota({ id: "n-1", titulo: "Titulo viejo" })];
    const r = await editarNota(
      CON_TODO,
      "obra-1",
      "n-1",
      datos({ titulo: "Titulo nuevo" }),
    );
    expect(r.ok).toBe(true);
    expect(estado.notas[0]!.titulo).toBe("Titulo nuevo");
    expect(estado.auditorias[0]).toMatchObject({ entidad: "Nota", accion: "UPDATE" });
    const auditoria = estado.auditorias[0] as { antes: { titulo: string } };
    expect(auditoria.antes.titulo).toBe("Titulo viejo");
  });
});

describe("alternarAtendida", () => {
  it("con nota:crear (sin gestionar) puede atender y reabrir", async () => {
    estado.notas = [nota({ id: "n-1" })];
    const r = await alternarAtendida(sesion(["nota:crear"]), "obra-1", "n-1", true);
    expect(r.ok).toBe(true);
    expect(estado.notas[0]!.atendida).toBe(true);
    expect(estado.notas[0]!.atendidaAt).not.toBeNull();
    expect(estado.notas[0]!.atendidaPor).toBe("Quien Sea");
  });

  it("reabrir limpia atendidaAt y atendidaPor", async () => {
    estado.notas = [
      nota({
        id: "n-1",
        atendida: true,
        atendidaAt: new Date(),
        atendidaPor: "Alguien",
      }),
    ];
    await alternarAtendida(CON_TODO, "obra-1", "n-1", false);
    expect(estado.notas[0]!.atendida).toBe(false);
    expect(estado.notas[0]!.atendidaAt).toBeNull();
    expect(estado.notas[0]!.atendidaPor).toBeNull();
  });

  it("una nota que no existe no se puede atender", async () => {
    const r = await alternarAtendida(CON_TODO, "obra-1", "n-fantasma", true);
    seNego(r, "Nota no encontrada");
  });
});

describe("eliminarNota", () => {
  it("con solo nota:crear no puede borrar: hace falta nota:gestionar", async () => {
    estado.notas = [nota({ id: "n-1" })];
    const r = await eliminarNota(sesion(["nota:crear"]), "obra-1", "n-1");
    seNego(r, "No tienes permiso");
    expect(estado.notas).toHaveLength(1);
  });

  it("una nota que no existe no se puede borrar", async () => {
    const r = await eliminarNota(CON_TODO, "obra-1", "n-fantasma");
    seNego(r, "Nota no encontrada");
  });

  it("el camino bueno la borra y deja su snapshot en la auditoria", async () => {
    estado.notas = [nota({ id: "n-1", titulo: "A borrar" })];
    const r = await eliminarNota(CON_TODO, "obra-1", "n-1");
    expect(r.ok).toBe(true);
    expect(estado.notas).toHaveLength(0);
    const auditoria = estado.auditorias[0] as {
      entidad: string;
      accion: string;
      antes: { titulo: string };
    };
    expect(auditoria.entidad).toBe("Nota");
    expect(auditoria.accion).toBe("DELETE");
    expect(auditoria.antes.titulo).toBe("A borrar");
  });
});

/**
 * Solo las guardas: permiso, obra cerrada, nota/adjunto inexistente y
 * validacion de tipo/tamano. Todas devuelven ANTES de tocar el disco, asi
 * que no hace falta doblar `node:fs` -mismo alcance que tiene hoy
 * `evidencia.service.ts`, que tampoco tiene prueba propia del camino que sí
 * escribe un archivo-.
 */
describe("subirAdjuntoNota", () => {
  function archivo(
    tipo = "application/pdf",
    bytes = 10,
    nombre = "contrato.pdf",
  ): File {
    return new File([new Uint8Array(bytes)], nombre, { type: tipo });
  }

  it("con solo nota:crear no puede adjuntar: hace falta nota:gestionar", async () => {
    estado.notas = [nota({ id: "n-1" })];
    const r = await subirAdjuntoNota(
      sesion(["nota:crear"]),
      "obra-1",
      "n-1",
      archivo(),
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("No tienes permiso");
  });

  it("con la obra cerrada se niega, aunque tenga permiso", async () => {
    estado.notas = [nota({ id: "n-1" })];
    estado.cerrada = "La obra esta cerrada desde el 01/07/2026.";
    const r = await subirAdjuntoNota(CON_TODO, "obra-1", "n-1", archivo());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("cerrada");
  });

  it("una nota que no existe no admite adjuntos", async () => {
    const r = await subirAdjuntoNota(
      CON_TODO,
      "obra-1",
      "n-fantasma",
      archivo(),
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("Nota no encontrada");
  });

  it("rechaza un tipo que no es imagen ni PDF", async () => {
    estado.notas = [nota({ id: "n-1" })];
    const r = await subirAdjuntoNota(
      CON_TODO,
      "obra-1",
      "n-1",
      archivo("application/zip"),
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("PDF");
  });

  it("rechaza un archivo vacio", async () => {
    estado.notas = [nota({ id: "n-1" })];
    const r = await subirAdjuntoNota(
      CON_TODO,
      "obra-1",
      "n-1",
      archivo("application/pdf", 0),
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("vacío");
  });

  it("rechaza un archivo que pasa de 10 MB", async () => {
    estado.notas = [nota({ id: "n-1" })];
    const r = await subirAdjuntoNota(
      CON_TODO,
      "obra-1",
      "n-1",
      archivo("application/pdf", 10 * 1024 * 1024 + 1),
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("10 MB");
  });
});

describe("eliminarAdjuntoNota", () => {
  it("con solo nota:crear no puede borrar: hace falta nota:gestionar", async () => {
    const r = await eliminarAdjuntoNota(
      sesion(["nota:crear"]),
      "obra-1",
      "adj-1",
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("No tienes permiso");
  });

  it("con la obra cerrada se niega, aunque tenga permiso", async () => {
    estado.cerrada = "La obra esta cerrada desde el 01/07/2026.";
    const r = await eliminarAdjuntoNota(CON_TODO, "obra-1", "adj-1");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("cerrada");
  });

  it("un adjunto que no existe no se puede borrar", async () => {
    const r = await eliminarAdjuntoNota(CON_TODO, "obra-1", "adj-fantasma");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("Adjunto no encontrado");
  });
});
