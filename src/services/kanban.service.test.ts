import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * `kanbanDeObra`: el flujo del Last Planner en cinco columnas.
 *
 * Lo que hay que sostener aqui no son las cifras —el analisis de
 * restricciones y el PPC ya tienen sus pruebas— sino **que cada tarea salga
 * en UNA sola columna**. Un tablero que cuenta dos veces el mismo trabajo es
 * peor que no tener tablero: se planifica sobre el.
 */

const estado: {
  matriz: Record<string, unknown> | null;
  planesAbiertos: Record<string, unknown>[];
  planCerrado: Record<string, unknown> | null;
  /// Cuantas veces se pregunto por compromisos. 0 = no se pregunto.
  consultasPts: number;
} = {
  matriz: null,
  planesAbiertos: [],
  planCerrado: null,
  consultasPts: 0,
};

vi.mock("@/services/lookahead.service", () => ({
  obtenerLookahead: () => Promise.resolve(estado.matriz),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    planSemanal: {
      findMany: () => {
        estado.consultasPts += 1;
        return Promise.resolve(estado.planesAbiertos);
      },
      findFirst: () => Promise.resolve(estado.planCerrado),
    },
  },
}));

const { kanbanDeObra } = await import("@/services/kanban.service");

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
    // `null` es «alcanza todas las obras de su empresa». Sin este campo la
    // sesion no es valida: la lista vacia y el null son cosas opuestas.
    obrasAsignadas: null,
    nombres: "Ana",
    apellidos: "Quispe",
    email: "ana@constructora.pe",
  } as unknown as SesionActiva;
}

const COMPLETA = sesion(["lookahead:leer", "plan_semanal:leer"]);

/// Una fila de la matriz, con los siete flujos vacios.
function fila(cambios: Record<string, unknown> = {}) {
  return {
    uid: 10,
    codigo: "01.01",
    nombre: "MUROS EJE 3-4",
    inicio: new Date("2026-08-17T00:00:00.000Z"),
    fin: new Date("2026-08-21T00:00:00.000Z"),
    faseBloque: "FASE 2",
    zona: "PISO 3",
    fase: "LISTA",
    lookaheadTaskId: "lt-1",
    restricciones: [],
    comprometida: [],
    ...cambios,
  };
}

function matriz(filas: Record<string, unknown>[]) {
  return { filas, semanas: 3 };
}

function compromiso(cambios: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    uid: 10,
    descripcion: "MUROS EJE 3-4",
    zona: "PISO 3",
    lookaheadTaskId: "lt-1",
    cumplido: null,
    causa: null,
    enEjecucionAt: null,
    cantidadPlan: "200.0000",
    cantidadEjec: "120.0000",
    unidad: "m2",
    proveedor: { razonSocial: "CONSTRUCTORA XYZ" },
    ...cambios,
  };
}

function columna(r: { columnas: { clave: string; tarjetas: unknown[] }[] }, clave: string) {
  return r.columnas.find((c) => c.clave === clave)?.tarjetas ?? [];
}

beforeEach(() => {
  estado.matriz = matriz([]);
  estado.planesAbiertos = [];
  estado.planCerrado = null;
  estado.consultasPts = 0;
});

describe("kanbanDeObra: quien lo ve", () => {
  it("sin permiso de Lookahead no hay tablero", async () => {
    // La matriz ya devuelve null sin permiso; el Kanban se apoya en ella en
    // vez de repetir la comprobacion y arriesgarse a que difieran.
    estado.matriz = null;

    const r = await kanbanDeObra(sesion([]), "obra-1");
    expect(r).toBeNull();
  });

  it("con Lookahead pero sin Plan semanal, las dos ultimas columnas van vacias", async () => {
    // Y NO se consulta el PTS: quien no puede leerlo no dispara la consulta.
    estado.matriz = matriz([fila()]);
    estado.planesAbiertos = [
      { id: "p-1", numero: 3, compromisos: [compromiso()] },
    ];

    const r = await kanbanDeObra(sesion(["lookahead:leer"]), "obra-1");

    expect(columna(r!, "COMPROMETIDA")).toHaveLength(0);
    expect(columna(r!, "CERRADA")).toHaveLength(0);
    expect(estado.consultasPts).toBe(0);
    // La tarea sigue viendose en su columna de analisis.
    expect(columna(r!, "LISTA")).toHaveLength(1);
  });
});

describe("kanbanDeObra: cada tarea en UNA sola columna", () => {
  it("clasifica por fase de analisis las que aun no se comprometieron", async () => {
    estado.matriz = matriz([
      fila({ uid: 1, fase: "SIN_ANALIZAR", lookaheadTaskId: "lt-1" }),
      fila({ uid: 2, fase: "CON_PENDIENTES", lookaheadTaskId: "lt-2" }),
      fila({ uid: 3, fase: "LISTA", lookaheadTaskId: "lt-3" }),
    ]);

    const r = await kanbanDeObra(COMPLETA, "obra-1");

    expect(columna(r!, "SIN_ANALIZAR")).toHaveLength(1);
    expect(columna(r!, "CON_RESTRICCIONES")).toHaveLength(1);
    expect(columna(r!, "LISTA")).toHaveLength(1);
  });

  it("una tarea LISTA ya comprometida sale solo en COMPROMETIDA", async () => {
    // ESTE es el caso que duplicaria el trabajo: la tarea sigue estando lista
    // en la matriz, y ademas ya tiene su compromiso. Si apareciera en las dos
    // columnas, el tablero contaria dos veces el mismo muro.
    estado.matriz = matriz([fila({ fase: "LISTA", lookaheadTaskId: "lt-1" })]);
    estado.planesAbiertos = [
      { id: "p-1", numero: 3, compromisos: [compromiso({ lookaheadTaskId: "lt-1" })] },
    ];

    const r = await kanbanDeObra(COMPLETA, "obra-1");

    expect(columna(r!, "LISTA")).toHaveLength(0);
    expect(columna(r!, "COMPROMETIDA")).toHaveLength(1);
  });

  it("una tarea ya evaluada sale solo en CERRADA", async () => {
    estado.matriz = matriz([fila({ fase: "LISTA", lookaheadTaskId: "lt-1" })]);
    estado.planCerrado = {
      id: "p-0",
      numero: 2,
      compromisos: [compromiso({ lookaheadTaskId: "lt-1", cumplido: true })],
    };

    const r = await kanbanDeObra(COMPLETA, "obra-1");

    expect(columna(r!, "LISTA")).toHaveLength(0);
    expect(columna(r!, "CERRADA")).toHaveLength(1);
  });
});

describe("kanbanDeObra: lo que lleva la tarjeta", () => {
  it("solo son bloqueo las restricciones que existen y siguen abiertas", async () => {
    // Una celda con `id: null` significa que ese flujo NO APLICA a la tarea,
    // no que este pendiente: pintarla como bloqueo llenaria el tablero de
    // rojo falso. Y una resuelta ya no frena nada.
    estado.matriz = matriz([
      fila({
        fase: "CON_PENDIENTES",
        restricciones: [
          { id: null, tipo: "SEGURIDAD", resuelta: false, fechaCompromiso: null, promesa: "sin-asignar" },
          { id: "r-1", tipo: "MATERIALES", resuelta: false, fechaCompromiso: null, promesa: "vencida" },
          { id: "r-2", tipo: "EQUIPOS", resuelta: true, fechaCompromiso: null, promesa: "liberada" },
        ],
      }),
    ]);

    const [t] = columna(
      (await kanbanDeObra(COMPLETA, "obra-1"))!,
      "CON_RESTRICCIONES",
    ) as { bloqueos: { tipo: string; vencida: boolean }[] }[];

    expect(t?.bloqueos).toHaveLength(1);
    expect(t?.bloqueos[0]).toMatchObject({ tipo: "MATERIALES", vencida: true });
  });

  it("un compromiso sin tarea del Lookahead se marca como libre", async () => {
    // Se prometio sin pasar por el analisis de restricciones. No es un error
    // —a veces hay que hacerlo— pero tiene que verse.
    estado.planesAbiertos = [
      {
        id: "p-1",
        numero: 3,
        compromisos: [compromiso({ id: "c-9", lookaheadTaskId: null })],
      },
    ];

    const [t] = columna((await kanbanDeObra(COMPLETA, "obra-1"))!, "COMPROMETIDA") as {
      libre: boolean;
      proveedor: string | null;
      cantidadPlan: string | null;
    }[];

    expect(t?.libre).toBe(true);
    expect(t?.proveedor).toBe("CONSTRUCTORA XYZ");
    // Los decimales viajan como texto hasta la pantalla, sin perder centimos.
    expect(t?.cantidadPlan).toBe("200.0000");
  });

  it("la columna CERRADA trae el resultado y la causa", async () => {
    estado.planCerrado = {
      id: "p-0",
      numero: 2,
      compromisos: [
        compromiso({ id: "c-2", lookaheadTaskId: "lt-9", cumplido: false, causa: "MANO_OBRA" }),
      ],
    };

    const [t] = columna((await kanbanDeObra(COMPLETA, "obra-1"))!, "CERRADA") as {
      cumplido: boolean | null;
      causa: string | null;
      semana: number | null;
    }[];

    expect(t).toMatchObject({ cumplido: false, causa: "MANO_OBRA", semana: 2 });
  });

  it("sin ninguna semana cerrada, la ultima columna queda vacia", async () => {
    estado.planCerrado = null;
    const r = await kanbanDeObra(COMPLETA, "obra-1");

    expect(columna(r!, "CERRADA")).toHaveLength(0);
    expect(r!.semanaCerrada).toBeNull();
  });

  it("devuelve las seis columnas siempre, aunque no haya nada", async () => {
    // El tablero no cambia de forma segun los datos: cinco columnas fijas.
    // Si desaparecieran las vacias, la lectura de izquierda a derecha —que es
    // lo unico que aporta un Kanban— cambiaria cada semana.
    const r = await kanbanDeObra(COMPLETA, "obra-1");

    expect(r!.columnas.map((c) => c.clave)).toEqual([
      "SIN_ANALIZAR",
      "CON_RESTRICCIONES",
      "LISTA",
      "COMPROMETIDA",
      "EN_EJECUCION",
      "CERRADA",
    ]);
  });
});

describe("kanbanDeObra: la columna EN EJECUCION", () => {
  it("un compromiso con la fecha sellada sale en EN_EJECUCION", async () => {
    // El dato es EXPLICITO: lo marca alguien en obra. No se deduce de la
    // cantidad ejecutada, porque un cero no distingue «empezo sin avance
    // medible» de «no ha empezado».
    estado.planesAbiertos = [
      {
        id: "p-1",
        numero: 3,
        compromisos: [
          compromiso({ id: "c-1", enEjecucionAt: new Date("2026-08-18T10:00:00Z") }),
        ],
      },
    ];

    const r = await kanbanDeObra(COMPLETA, "obra-1");

    expect(columna(r!, "EN_EJECUCION")).toHaveLength(1);
    expect(columna(r!, "COMPROMETIDA")).toHaveLength(0);
  });

  it("sin sellar se queda en COMPROMETIDA", async () => {
    // El reverso: sin esto, un servicio que mandara todo a EN_EJECUCION
    // pasaria la prueba de arriba.
    estado.planesAbiertos = [
      { id: "p-1", numero: 3, compromisos: [compromiso({ id: "c-2" })] },
    ];

    const r = await kanbanDeObra(COMPLETA, "obra-1");

    expect(columna(r!, "COMPROMETIDA")).toHaveLength(1);
    expect(columna(r!, "EN_EJECUCION")).toHaveLength(0);
  });

  it("la tarjeta lleva el id del compromiso, para poder moverla", async () => {
    // Sin id no hay boton: la tarjeta seria de solo lectura y la columna
    // nunca se llenaria.
    estado.planesAbiertos = [
      { id: "p-1", numero: 3, compromisos: [compromiso({ id: "c-9" })] },
    ];

    const [t] = columna((await kanbanDeObra(COMPLETA, "obra-1"))!, "COMPROMETIDA") as {
      compromisoId: string | null;
      enEjecucion: boolean;
    }[];

    expect(t?.compromisoId).toBe("c-9");
    expect(t?.enEjecucion).toBe(false);
  });
});
