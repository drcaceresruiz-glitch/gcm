import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResultadoAnalisisCronograma, TareaImportada } from "@/lib/msproject-xml";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Volver a cargar un corte que ya estaba.
 *
 * Antes, encontrar un corte con la misma `fechaCorte` bastaba para devolver
 * `yaEstaba: true` y no escribir. Era demasiado grueso: trataba igual "mismo
 * corte, mismo plan" —saltar, correcto— y "mismo corte, plan distinto", donde
 * el archivo se perdia en silencio. Y como no existe borrar una version
 * importada, eso dejaba sin salida el unico camino para corregir un corte.
 *
 * Lo que fijan estas pruebas:
 *
 *   1. Mismo plan sigue siendo un no-op, sin molestar a nadie.
 *   2. Plan distinto NO escribe: pide confirmacion y dice que se lleva por
 *      delante.
 *   3. El reemplazo conserva las tareas MANUAL, y la version y la fecha de
 *      corte no se mueven.
 *   4. Las puertas: linea base, corte que no es el vigente, UID negativos.
 */

interface FilaGuardada {
  uid: number;
  fila: number;
  codigo: string | null;
  nombre: string;
  nivel: number;
  esHito: boolean;
  esCritico: boolean;
  inicio: Date;
  fin: Date;
  duracionDias: string;
  porcentajePlaneado: string;
  porcentajeArchivo: string;
  holguraDias: string;
  holguraInferida: boolean;
  origen: "IMPORTADO" | "MANUAL";
}

const estado: {
  obra: { id: string; estado: string; archivadaEn: Date | null } | null;
  corte: {
    id: string;
    version: number;
    minutosPorDia: number;
    lineaBaseAt: Date | null;
    _count: { tareas: number; dependencias: number };
  } | null;
  ultimaVersion: number;
  guardadas: FilaGuardada[];
  dependencias: {
    tareaUid: number;
    predecesoraUid: number;
    tipo: string;
    desfaseDias: string;
  }[];
  avancesPorUid: Record<number, number>;
  mapeosPorUid: Record<number, number>;
  // Lo que se escribio, para poder afirmar que NO se escribio nada.
  borradasImportado: number;
  borradasDependencias: number;
  creadas: { uid: number }[];
  actualizado: Record<string, unknown> | null;
  auditoria: Record<string, unknown> | null;
  opcionesTx: { timeout?: number } | undefined;
} = {
  obra: { id: "obra", estado: "EN_EJECUCION", archivadaEn: null },
  corte: null,
  ultimaVersion: 1,
  guardadas: [],
  dependencias: [],
  avancesPorUid: {},
  mapeosPorUid: {},
  borradasImportado: 0,
  borradasDependencias: 0,
  creadas: [],
  actualizado: null,
  auditoria: null,
  opcionesTx: undefined,
};

vi.mock("@/lib/prisma", () => {
  const tareaCronograma = {
    /**
     * Dos consultas con la misma forma, distinguidas por lo que SELECCIONAN:
     * la de la huella pide los campos del plan; la del riesgo, solo uid,
     * nombre y origen.
     */
    findMany: (args: { select?: { fila?: boolean } }) =>
      Promise.resolve(
        args.select?.fila
          ? estado.guardadas.filter((t) => t.origen === "IMPORTADO")
          : estado.guardadas.map((t) => ({
              uid: t.uid,
              nombre: t.nombre,
              origen: t.origen,
            })),
      ),
    count: () =>
      Promise.resolve(estado.guardadas.filter((t) => t.origen === "MANUAL").length),
    deleteMany: () => {
      estado.borradasImportado += 1;
      return Promise.resolve({ count: 0 });
    },
    createMany: (args: { data: { uid: number }[] }) => {
      estado.creadas.push(...args.data);
      return Promise.resolve({ count: args.data.length });
    },
  };

  const dependenciaTarea = {
    findMany: () => Promise.resolve(estado.dependencias),
    deleteMany: () => {
      estado.borradasDependencias += 1;
      return Promise.resolve({ count: 0 });
    },
    createMany: (args: { data: unknown[] }) =>
      Promise.resolve({ count: args.data.length }),
  };

  const cronograma = {
    // Con `orderBy` es la consulta de "cual es la version vigente"; sin el, la
    // busqueda del corte por su fecha.
    findFirst: (args: { orderBy?: unknown }) =>
      Promise.resolve(
        args.orderBy ? { version: estado.ultimaVersion } : estado.corte,
      ),
    update: (args: { data: Record<string, unknown> }) => {
      estado.actualizado = args.data;
      return Promise.resolve({});
    },
  };

  const cliente = {
    project: { findFirst: () => Promise.resolve(estado.obra) },
    cronograma,
    tareaCronograma,
    dependenciaTarea,
    avanceTarea: {
      groupBy: (args: { where: { uid: { in: number[] } } }) =>
        Promise.resolve(
          args.where.uid.in
            .filter((u) => (estado.avancesPorUid[u] ?? 0) > 0)
            .map((u) => ({ uid: u, _count: estado.avancesPorUid[u] })),
        ),
    },
    mapeoTareaPartida: {
      groupBy: (args: { where: { uid: { in: number[] } } }) =>
        Promise.resolve(
          args.where.uid.in
            .filter((u) => (estado.mapeosPorUid[u] ?? 0) > 0)
            .map((u) => ({ uid: u, _count: estado.mapeosPorUid[u] })),
        ),
    },
    auditLog: {
      create: (args: { data: Record<string, unknown> }) => {
        estado.auditoria = args.data;
        return Promise.resolve({});
      },
    },
    $transaction: (
      fn: (tx: unknown) => Promise<unknown>,
      opciones?: { timeout?: number },
    ) => {
      estado.opcionesTx = opciones;
      return fn(cliente);
    },
  };

  return { prisma: cliente };
});

const { importarCronograma, reemplazarCronograma } = await import(
  "@/services/cronograma.service"
);

const sesion: SesionActiva = {
  userId: "u1",
  companyId: "e1",
  nombres: "Ada",
  apellidos: "Lovelace",
  role: "RESIDENTE",
  permisos: ["cronograma:importar"],
} as unknown as SesionActiva;

/** Las dos caras de la misma tarea, construidas a la vez para que coincidan. */
function par(over: Partial<TareaImportada> & { uid: number }) {
  const archivo: TareaImportada = {
    fila: over.uid,
    codigo: "4.4",
    nombre: "Excavacion manual",
    nivel: 3,
    esResumen: false,
    esHito: false,
    esCritico: true,
    inicio: "2026-08-03",
    fin: "2026-08-07",
    duracionDias: "5",
    porcentajePlaneado: "40",
    porcentajeArchivo: "35",
    holguraDias: "0",
    holguraInferida: false,
    ...over,
  };

  const guardada: FilaGuardada = {
    uid: archivo.uid,
    fila: archivo.fila,
    codigo: archivo.codigo,
    nombre: archivo.nombre,
    nivel: archivo.nivel,
    esHito: archivo.esHito,
    esCritico: archivo.esCritico,
    inicio: new Date(`${archivo.inicio}T00:00:00Z`),
    fin: new Date(`${archivo.fin}T00:00:00Z`),
    duracionDias: Number(archivo.duracionDias).toFixed(2),
    porcentajePlaneado: Number(archivo.porcentajePlaneado).toFixed(2),
    porcentajeArchivo: Number(archivo.porcentajeArchivo).toFixed(2),
    holguraDias: Number(archivo.holguraDias).toFixed(2),
    holguraInferida: archivo.holguraInferida,
    origen: "IMPORTADO",
  };

  return { archivo, guardada };
}

function analisisDe(tareas: TareaImportada[]): ResultadoAnalisisCronograma {
  return {
    tareas,
    dependencias: [],
    errores: [],
    nombreProyecto: "Obra de prueba",
    fechaCorte: "2026-08-15",
    minutosPorDia: 480,
    inicio: "2026-08-03",
    fin: "2026-09-30",
    duracionDias: "40",
    totalTareas: tareas.length,
    totalHitos: 0,
    totalResumen: 0,
    totalCriticas: 0,
    holgurasInferidas: 0,
    filasOmitidas: 0,
    dependenciasDescartadas: 0,
  };
}

/** Deja el corte cargado con estas filas, como si ya se hubiera importado. */
function corteCargadoCon(filas: FilaGuardada[], extra: Partial<typeof estado.corte> = {}) {
  estado.guardadas = filas;
  estado.corte = {
    id: "cro-1",
    version: 3,
    minutosPorDia: 480,
    lineaBaseAt: null,
    _count: { tareas: filas.length, dependencias: 0 },
    ...extra,
  };
  estado.ultimaVersion = estado.corte.version;
}

beforeEach(() => {
  estado.obra = { id: "obra", estado: "EN_EJECUCION", archivadaEn: null };
  estado.corte = null;
  estado.ultimaVersion = 1;
  estado.guardadas = [];
  estado.dependencias = [];
  estado.avancesPorUid = {};
  estado.mapeosPorUid = {};
  estado.borradasImportado = 0;
  estado.borradasDependencias = 0;
  estado.creadas = [];
  estado.actualizado = null;
  estado.auditoria = null;
  estado.opcionesTx = undefined;
});

describe("volver a cargar el mismo corte", () => {
  it("con el mismo plan no escribe nada y lo dice", async () => {
    const a = par({ uid: 1 });
    const b = par({ uid: 2 });
    corteCargadoCon([a.guardada, b.guardada]);

    const r = await importarCronograma(
      sesion,
      "obra",
      analisisDe([a.archivo, b.archivo]),
      "corte.xml",
    );

    expect(r).toMatchObject({ ok: true, yaEstaba: true, version: 3 });
    expect(estado.creadas).toHaveLength(0);
    expect(estado.borradasImportado).toBe(0);
  });

  it("con otro plan NO escribe: pide confirmacion", async () => {
    const a = par({ uid: 1 });
    corteCargadoCon([a.guardada]);

    const movida = par({ uid: 1, fin: "2026-08-12" });

    const r = await importarCronograma(
      sesion,
      "obra",
      analisisDe([movida.archivo]),
      "corte.xml",
    );

    expect(r).toMatchObject({ ok: true, requiereConfirmacion: true });
    expect(estado.creadas).toHaveLength(0);
    expect(estado.borradasImportado).toBe(0);
    expect(estado.actualizado).toBeNull();
  });

  /**
   * El aviso tiene que nombrar lo que no vuelve solo. Un "se reescriben 2
   * tareas" se lee como rutina.
   */
  it("el riesgo lista los UID que se quedan sin tarea, con su avance", async () => {
    const queda = par({ uid: 1 });
    const desaparece = par({ uid: 9, nombre: "Encofrado de losa" });
    corteCargadoCon([queda.guardada, desaparece.guardada]);
    estado.avancesPorUid = { 9: 4 };
    estado.mapeosPorUid = { 9: 2 };

    const r = await importarCronograma(
      sesion,
      "obra",
      // El archivo nuevo ya no trae el 9, y mueve el 1 para que haya cambio.
      analisisDe([par({ uid: 1, fin: "2026-08-12" }).archivo]),
      "corte.xml",
    );

    expect(r).toMatchObject({
      requiereConfirmacion: true,
      riesgo: {
        version: 3,
        fechaCorte: "2026-08-15",
        avancesHuerfanos: 4,
        mapeosHuerfanos: 2,
      },
    });

    const riesgo = (r as { riesgo: { uidsQueDesaparecen: { uid: number }[] } }).riesgo;
    expect(riesgo.uidsQueDesaparecen).toEqual([
      { uid: 9, nombre: "Encofrado de losa", avances: 4, mapeos: 2 },
    ]);
  });

  it("cuenta las manuales que se conservan y las que entran nuevas", async () => {
    const importada = par({ uid: 1 });
    const aMano = par({ uid: -1, nombre: "Vaciado" });
    aMano.guardada.origen = "MANUAL";
    corteCargadoCon([importada.guardada, aMano.guardada]);

    const r = await importarCronograma(
      sesion,
      "obra",
      analisisDe([par({ uid: 1, fin: "2026-08-12" }).archivo, par({ uid: 7 }).archivo]),
      "corte.xml",
    );

    expect(r).toMatchObject({
      riesgo: { tareasImportadas: 1, tareasManuales: 1, tareasNuevas: 1 },
    });
  });
});

describe("el reemplazo, ya confirmado", () => {
  it("reescribe el corte en su sitio y conserva las manuales", async () => {
    const importada = par({ uid: 1 });
    const aMano = par({ uid: -1, nombre: "Vaciado" });
    aMano.guardada.origen = "MANUAL";
    corteCargadoCon([importada.guardada, aMano.guardada]);

    const r = await reemplazarCronograma(
      sesion,
      "obra",
      analisisDe([par({ uid: 1, fin: "2026-08-12" }).archivo]),
      "corte-v2.xml",
    );

    expect(r).toMatchObject({ ok: true, version: 3, tareas: 1, conservadas: 1 });

    // Se borro lo IMPORTADO y las dependencias, y se reescribio.
    expect(estado.borradasImportado).toBe(1);
    expect(estado.borradasDependencias).toBe(1);
    expect(estado.creadas.map((t) => t.uid)).toEqual([1]);

    // Ni la version ni la fecha de corte se tocan: es lo que mantiene un solo
    // punto por corte en la curva S.
    expect(estado.actualizado).not.toHaveProperty("version");
    expect(estado.actualizado).not.toHaveProperty("fechaCorte");
    expect(estado.actualizado).toMatchObject({ archivo: "corte-v2.xml" });
  });

  it("queda anotado en el registro de actividad, una vez", async () => {
    const a = par({ uid: 1 });
    corteCargadoCon([a.guardada]);

    await reemplazarCronograma(
      sesion,
      "obra",
      analisisDe([par({ uid: 1, fin: "2026-08-12" }).archivo]),
      "corte-v2.xml",
    );

    expect(estado.auditoria).toMatchObject({
      entidad: "Cronograma",
      accion: "UPDATE",
      despues: { origen: "reemplazo-de-corte", version: 3 },
    });
  });

  /**
   * Borrar y reescribir el corte entero no cabe en los cinco segundos que
   * Prisma concede por defecto, que es lo que casi tumba la importacion de
   * presupuesto (C-5).
   */
  it("la transaccion lleva un tope de tiempo explicito", async () => {
    const a = par({ uid: 1 });
    corteCargadoCon([a.guardada]);

    await reemplazarCronograma(
      sesion,
      "obra",
      analisisDe([par({ uid: 1, fin: "2026-08-12" }).archivo]),
      "corte-v2.xml",
    );

    expect(estado.opcionesTx?.timeout).toBeGreaterThan(5000);
  });
});

describe("las puertas que no se pueden cruzar", () => {
  it("con la linea base fijada no se reemplaza", async () => {
    const a = par({ uid: 1 });
    corteCargadoCon([a.guardada], { lineaBaseAt: new Date("2026-08-01T00:00:00Z") });

    const r = await importarCronograma(
      sesion,
      "obra",
      analisisDe([par({ uid: 1, fin: "2026-08-12" }).archivo]),
      "corte.xml",
    );

    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("linea base");
    expect(estado.creadas).toHaveLength(0);
  });

  /**
   * Un archivo IDENTICO sobre una linea base fijada no es un error: no hay
   * nada que hacer. Se comprueba el plan antes que la puerta a proposito.
   */
  it("...pero el mismo plan sobre una linea base sigue siendo un no-op", async () => {
    const a = par({ uid: 1 });
    corteCargadoCon([a.guardada], { lineaBaseAt: new Date("2026-08-01T00:00:00Z") });

    const r = await importarCronograma(
      sesion,
      "obra",
      analisisDe([a.archivo]),
      "corte.xml",
    );

    expect(r).toMatchObject({ ok: true, yaEstaba: true });
  });

  it("solo se reemplaza el corte vigente, no uno anterior", async () => {
    const a = par({ uid: 1 });
    corteCargadoCon([a.guardada], { version: 2 });
    estado.ultimaVersion = 5;

    const r = await importarCronograma(
      sesion,
      "obra",
      analisisDe([par({ uid: 1, fin: "2026-08-12" }).archivo]),
      "corte.xml",
    );

    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("vigente");
  });

  /**
   * El espacio negativo es de las tareas escritas a mano, y el lector de MSPDI
   * admite UID negativos. Sin esta puerta, el reemplazo chocaria contra
   * `@@unique([cronogramaId, uid])` a mitad de escritura.
   */
  it("rechaza un archivo con UID negativos antes de tocar nada", async () => {
    const a = par({ uid: 1 });
    corteCargadoCon([a.guardada]);

    const r = await reemplazarCronograma(
      sesion,
      "obra",
      analisisDe([par({ uid: -3, nombre: "Colada" }).archivo]),
      "corte.xml",
    );

    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("-3");
    expect(estado.borradasImportado).toBe(0);
  });

  it("sin permiso no reemplaza", async () => {
    const a = par({ uid: 1 });
    corteCargadoCon([a.guardada]);

    const r = await reemplazarCronograma(
      { ...sesion, permisos: [] } as unknown as SesionActiva,
      "obra",
      analisisDe([par({ uid: 1, fin: "2026-08-12" }).archivo]),
      "corte.xml",
    );

    expect(r).toMatchObject({ ok: false });
    expect(estado.borradasImportado).toBe(0);
  });

  it("una obra de otra empresa no existe", async () => {
    const a = par({ uid: 1 });
    corteCargadoCon([a.guardada]);
    estado.obra = null;

    const r = await reemplazarCronograma(
      sesion,
      "obra",
      analisisDe([par({ uid: 1, fin: "2026-08-12" }).archivo]),
      "corte.xml",
    );

    expect(r).toMatchObject({ ok: false, error: "Obra no encontrada." });
    expect(estado.borradasImportado).toBe(0);
  });
});
