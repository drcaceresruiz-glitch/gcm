import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Escritura manual del cronograma.
 *
 * El primer diseno de esto lo tumbo una revision adversaria por UNA razon
 * estructural: el uid se reciclaba al borrar, y entonces el avance de la tarea
 * muerta se pegaba a la siguiente. Peor: el aviso de huerfanos se apagaba justo
 * en ese momento, porque el uid volvia a existir. El dato se corrompia y la
 * alarma se callaba a la vez.
 *
 * Estas pruebas fijan la correccion —un contador que solo baja— y las tres
 * puertas que la acompanan.
 */

interface FilaTarea {
  id: string;
  uid: number;
  origen: "IMPORTADO" | "MANUAL";
  nombre: string;
  fila?: number;
}

const estado: {
  obra: { id: string; ultimoUidManual: number } | null;
  vigente: { id: string; version: number; lineaBaseAt: Date | null } | null;
  tarea: FilaTarea | null;
  creada: Record<string, unknown> | null;
  cronogramaCreado: Record<string, unknown> | null;
  actualizada: Record<string, unknown> | null;
  borradaId: string | null;
  avances: number;
  mapeos: number;
  borrados: string[];
  /// Las tareas del cronograma, en orden de fila. Es de donde sale la EDT.
  orden: { uid: number; fila: number; nivel: number }[];
  corrimientos: Record<string, unknown>[];
} = {
  orden: [],
  corrimientos: [],
  obra: { id: "obra", ultimoUidManual: 0 },
  vigente: { id: "cro", version: 1, lineaBaseAt: null },
  tarea: null,
  creada: null,
  cronogramaCreado: null,
  actualizada: null,
  borradaId: null,
  avances: 0,
  mapeos: 0,
  borrados: [],
};

vi.mock("@/lib/prisma", () => {
  const tareaCronograma = {
    // Buscar POR UID es la comprobacion del padre; sin uid, es la tarea que se
    // esta editando o borrando.
    // Dos consultas distintas con la misma forma: la del padre pide solo el
    // `uid`; la de la tarea que se edita o borra pide `id` y `origen`. Se
    // distinguen por lo que SELECCIONAN, no por el filtro.
    findFirst: (args: { where?: { uid?: number }; select?: { id?: boolean } }) =>
      Promise.resolve(
        args.select?.id
          ? estado.tarea
          : (estado.orden.find((t) => t.uid === args.where?.uid) ?? null),
      ),
    // El recalculo de resumenes pide tambien fechas y `esResumen`; las pruebas
    // de jerarquia solo declaran uid/fila/nivel, asi que se completan aqui.
    findMany: () =>
      Promise.resolve(
        estado.orden.map((t) => ({
          esResumen: false,
          inicio: new Date("2026-08-17T00:00:00.000Z"),
          fin: new Date("2026-08-17T00:00:00.000Z"),
          ...t,
        })),
      ),
    updateMany: (args: { data: Record<string, unknown> }) => {
      estado.corrimientos.push(args.data);
      return Promise.resolve({ count: 0 });
    },
    create: (args: { data: Record<string, unknown> }) => {
      estado.creada = args.data;
      return Promise.resolve({ id: "t-nueva" });
    },
    update: (args: { data: Record<string, unknown> }) => {
      estado.actualizada = args.data;
      return Promise.resolve({});
    },
    delete: (args: { where: { id: string } }) => {
      estado.borradaId = args.where.id;
      return Promise.resolve({});
    },
  };

  const cliente = {
    project: {
      findFirst: () => Promise.resolve(estado.obra),
      update: (args: { data: { ultimoUidManual: { decrement: number } } }) => {
        estado.obra!.ultimoUidManual -= args.data.ultimoUidManual.decrement;
        return Promise.resolve({ ultimoUidManual: estado.obra!.ultimoUidManual });
      },
    },
    cronograma: {
      findFirst: () => Promise.resolve(estado.vigente),
      create: (args: { data: Record<string, unknown> }) => {
        estado.cronogramaCreado = args.data;
        return Promise.resolve({ id: "cro-nuevo" });
      },
    },
    tareaCronograma,
    avanceTarea: {
      count: () => Promise.resolve(estado.avances),
      deleteMany: () => {
        estado.borrados.push("avances");
        return Promise.resolve({ count: estado.avances });
      },
    },
    mapeoTareaPartida: {
      count: () => Promise.resolve(estado.mapeos),
      deleteMany: () => {
        estado.borrados.push("mapeos");
        return Promise.resolve({ count: estado.mapeos });
      },
    },
    dependenciaTarea: {
      deleteMany: () => {
        estado.borrados.push("dependencias");
        return Promise.resolve({ count: 0 });
      },
    },
    auditLog: { create: () => Promise.resolve({}) },
  };

  return {
    prisma: {
      ...cliente,
      $transaction: (fn: (tx: unknown) => unknown) => Promise.resolve(fn(cliente)),
    },
  };
});

vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: () => Promise.resolve(null),
}));

const { crearTareaManual, editarTareaManual, eliminarTareaManual } = await import(
  "@/services/cronograma-manual.service"
);

const sesion = {
  userId: "u1",
  companyId: "c1",
  role: "RESIDENTE",
  nombres: "Ana",
  apellidos: "Ruiz",
  email: "ana@obra.pe",
  permisos: ["cronograma:editar", "cronograma:eliminar"],
} as unknown as SesionActiva;

const tarea = {
  nombre: "Vaciado de zapatas",
  inicio: "2026-08-17",
  fin: "2026-08-19",
  duracionDias: "2",
};

beforeEach(() => {
  estado.obra = { id: "obra", ultimoUidManual: 0 };
  estado.vigente = { id: "cro", version: 1, lineaBaseAt: null };
  estado.tarea = null;
  estado.creada = null;
  estado.cronogramaCreado = null;
  estado.actualizada = null;
  estado.borradaId = null;
  estado.avances = 0;
  estado.mapeos = 0;
  estado.borrados = [];
  estado.orden = [];
  estado.corrimientos = [];
});

describe("crear una tarea a mano", () => {
  it("le da un uid negativo salido del contador de la obra", async () => {
    const r = await crearTareaManual(sesion, "obra", tarea);

    expect(r.ok).toBe(true);
    expect(r.ok === true && r.datos.uid).toBe(-1);
    expect(estado.creada?.["origen"]).toBe("MANUAL");
    expect(estado.creada?.["uid"]).toBe(-1);
  });

  /**
   * LA invariante. Tres altas y un borrado por medio no pueden devolver un uid
   * ya usado: el contador solo baja.
   */
  it("no reutiliza jamas un uid, ni despues de borrar", async () => {
    const primera = await crearTareaManual(sesion, "obra", tarea);
    const segunda = await crearTareaManual(sesion, "obra", tarea);

    // Se borra la segunda...
    estado.tarea = { id: "t2", uid: -2, origen: "MANUAL", nombre: "Vaciado" };
    await eliminarTareaManual(sesion, "obra", -2, true);

    // ...y la siguiente NO hereda su uid.
    const tercera = await crearTareaManual(sesion, "obra", tarea);

    expect(primera.ok === true && primera.datos.uid).toBe(-1);
    expect(segunda.ok === true && segunda.datos.uid).toBe(-2);
    expect(tercera.ok === true && tercera.datos.uid).toBe(-3);
  });

  it("crea el cronograma si la obra no tenia ninguno", async () => {
    estado.vigente = null;

    const r = await crearTareaManual(sesion, "obra", tarea);

    expect(r.ok).toBe(true);
    expect(estado.cronogramaCreado?.["origen"]).toBe("MANUAL");
    expect(estado.cronogramaCreado?.["archivo"]).toBeNull();
  });

  it("nace sin ruta critica, que no se inventa", async () => {
    await crearTareaManual(sesion, "obra", tarea);

    expect(estado.creada?.["esCritico"]).toBe(false);
    expect(estado.creada?.["holguraInferida"]).toBe(true);
  });

  it("rechaza una tarea que termina antes de empezar", async () => {
    const r = await crearTareaManual(sesion, "obra", {
      ...tarea,
      inicio: "2026-08-19",
      fin: "2026-08-17",
    });

    expect(r.ok).toBe(false);
    expect(estado.creada).toBeNull();
  });

  it("se niega con la linea base fijada", async () => {
    estado.vigente = { id: "cro", version: 3, lineaBaseAt: new Date("2026-08-01") };

    const r = await crearTareaManual(sesion, "obra", tarea);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("linea base");
    expect(estado.creada).toBeNull();
  });
});

describe("solo se tocan las tareas escritas a mano", () => {
  it("no deja editar una que vino de un archivo", async () => {
    estado.tarea = { id: "t1", uid: 42, origen: "IMPORTADO", nombre: "Excavacion" };

    const r = await editarTareaManual(sesion, "obra", 42, tarea);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("archivo");
    expect(estado.actualizada).toBeNull();
  });

  it("no deja borrar una que vino de un archivo", async () => {
    estado.tarea = { id: "t1", uid: 42, origen: "IMPORTADO", nombre: "Excavacion" };

    const r = await eliminarTareaManual(sesion, "obra", 42, true);

    expect(r.ok).toBe(false);
    expect(estado.borradaId).toBeNull();
  });

  it("edita la que si es manual", async () => {
    estado.tarea = { id: "t1", uid: -1, origen: "MANUAL", nombre: "Vaciado" };

    const r = await editarTareaManual(sesion, "obra", -1, {
      ...tarea,
      nombre: "Vaciado de zapatas Z-1",
    });

    expect(r.ok).toBe(true);
    expect(estado.actualizada?.["nombre"]).toBe("Vaciado de zapatas Z-1");
  });
});

describe("borrar avisa antes de destruir", () => {
  beforeEach(() => {
    estado.tarea = { id: "t1", uid: -1, origen: "MANUAL", nombre: "Vaciado" };
  });

  /**
   * Ni el avance ni el mapeo tienen clave foranea contra la tarea: la base no
   * protestaria y desaparecerian sin rastro. Por eso el borrado va en dos
   * pasos.
   */
  it("no borra a la primera si hay avance detras: lo cuenta", async () => {
    estado.avances = 3;

    const r = await eliminarTareaManual(sesion, "obra", -1);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("3 reporte");
    expect(estado.borradaId).toBeNull();
    expect(estado.borrados).toEqual([]);
  });

  it("borra cuando se confirma, y se lleva lo que colgaba", async () => {
    estado.avances = 3;
    estado.mapeos = 1;

    const r = await eliminarTareaManual(sesion, "obra", -1, true);

    expect(r.ok).toBe(true);
    expect(r.ok === true && r.datos.avances).toBe(3);
    expect(estado.borradaId).toBe("t1");
    expect(estado.borrados).toContain("avances");
    expect(estado.borrados).toContain("mapeos");
  });

  it("borra sin preguntar cuando no cuelga nada", async () => {
    const r = await eliminarTareaManual(sesion, "obra", -1);

    expect(r.ok).toBe(true);
    expect(estado.borradaId).toBe("t1");
  });
});


/**
 * La EDT: capitulos, subcapitulos y paquetes de trabajo.
 *
 * En el cronograma la jerarquia NO sale de un `parentId` —no existe—: sale del
 * campo `nivel` MAS el orden del documento, que es como la exporta MS Project.
 * Una tarea pertenece a la ultima anterior de nivel menor. Por eso elegir
 * padre se traduce en dos cosas a la vez, y las dos tienen que cuadrar.
 */
describe("la jerarquia de una EDT tecleada", () => {
  it("sin padre, la tarea va al primer nivel y al final", async () => {
    estado.orden = [
      { uid: -1, fila: 1, nivel: 1 },
      { uid: -2, fila: 2, nivel: 2 },
    ];

    await crearTareaManual(sesion, "obra", tarea);

    expect(estado.creada?.["nivel"]).toBe(1);
    expect(estado.creada?.["fila"]).toBe(3);
  });

  it("con padre, hereda su nivel mas uno", async () => {
    estado.orden = [{ uid: -1, fila: 1, nivel: 1 }];

    await crearTareaManual(sesion, "obra", { ...tarea, padreUid: -1 });

    expect(estado.creada?.["nivel"]).toBe(2);
    expect(estado.creada?.["fila"]).toBe(2);
  });

  /**
   * Lo que de verdad hace que la EDT se sostenga: la fila nueva entra DETRAS
   * de todo lo que ya cuelga del padre. Ponerla al final la sacaria del grupo
   * aunque su nivel dijera otra cosa, porque la pertenencia la da el orden.
   */
  it("entra detras de la ultima descendiente del padre, no al final", async () => {
    estado.orden = [
      { uid: -1, fila: 1, nivel: 1 }, // CAPITULO I      <- el padre
      { uid: -2, fila: 2, nivel: 2 }, //   tarea suya
      { uid: -3, fila: 3, nivel: 3 }, //     subtarea suya
      { uid: -4, fila: 4, nivel: 1 }, // CAPITULO II     <- ya es otra rama
    ];

    await crearTareaManual(sesion, "obra", { ...tarea, padreUid: -1 });

    // Detras de la fila 3, que es la ultima del capitulo I.
    expect(estado.creada?.["fila"]).toBe(4);
    expect(estado.creada?.["nivel"]).toBe(2);
    // Y lo que venia detras se corre para hacerle sitio.
    expect(estado.corrimientos).toContainEqual({ fila: { increment: 1 } });
  });

  it("marca al padre como tarea resumen", async () => {
    estado.orden = [{ uid: -1, fila: 1, nivel: 1 }];

    await crearTareaManual(sesion, "obra", { ...tarea, padreUid: -1 });

    expect(estado.corrimientos).toContainEqual({ esResumen: true });
  });

  it("se niega si el padre elegido no existe", async () => {
    estado.orden = [{ uid: -1, fila: 1, nivel: 1 }];

    const r = await crearTareaManual(sesion, "obra", { ...tarea, padreUid: -99 });

    expect(r.ok).toBe(false);
    expect(estado.creada).toBeNull();
  });
});

describe("borrar una tarea que agrupa a otras", () => {
  /**
   * Al desaparecer la madre, sus hijas conservan su nivel y pasan a colgar de
   * lo que quede delante. No da ningun error: reorganiza la EDT sola.
   */
  it("se niega mientras tenga tareas dentro", async () => {
    estado.tarea = { id: "t1", uid: -1, origen: "MANUAL", nombre: "CAPITULO I" };
    estado.orden = [
      { uid: -1, fila: 1, nivel: 1 },
      { uid: -2, fila: 2, nivel: 2 },
      { uid: -3, fila: 3, nivel: 3 },
      { uid: -4, fila: 4, nivel: 1 },
    ];

    const r = await eliminarTareaManual(sesion, "obra", -1, true);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("2 tarea");
    expect(estado.borradaId).toBeNull();
  });

  it("borra la hoja, que no agrupa a nadie", async () => {
    estado.tarea = { id: "t3", uid: -3, origen: "MANUAL", nombre: "Paquete" };
    estado.orden = [
      { uid: -1, fila: 1, nivel: 1 },
      { uid: -2, fila: 2, nivel: 2 },
      { uid: -3, fila: 3, nivel: 3 },
      { uid: -4, fila: 4, nivel: 1 },
    ];

    const r = await eliminarTareaManual(sesion, "obra", -3);

    expect(r.ok).toBe(true);
    expect(estado.borradaId).toBe("t3");
  });
});
