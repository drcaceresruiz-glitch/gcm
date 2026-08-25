import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * `semanaDeLaEmpresa`: el estado del ritual semanal en TODAS las obras, que
 * es lo que alimenta la franja «Esta semana» de la pagina de inicio.
 *
 * Lo que hay que sostener aqui no es aritmetica —el PPC ya tiene sus propias
 * pruebas en `lib/plan-semanal`— sino QUE SE PREGUNTA y a quien:
 *
 * - que las obras cerradas no entren (en una obra cerrada no hay nada que
 *   hacer esta semana, y un plan sin cerrar seria ruido permanente);
 * - que «no se puede saber» se diga con null y NUNCA con cero;
 * - que no se pida el historial entero para sacar un PPC de cada obra.
 */

const estado: {
  /// Planes ABIERTOS que devuelve la primera consulta.
  abiertos: Record<string, unknown>[];
  /// Lo que devuelve el agregado: la ultima fecha cerrada por obra.
  ultimasCerradas: { projectId: string; fecha: Date | null }[];
  /// Los planes cerrados que se piden DESPUES, por (obra, fecha).
  planesCerrados: Record<string, unknown>[];
  /// El `where` de cada consulta, para poder afirmar sobre lo que se pide.
  whereAbiertos: Record<string, unknown> | null;
  whereCerrados: Record<string, unknown> | null;
  /// Cuantas veces se fue a por planes cerrados. 0 = no se pregunto.
  consultasDeCerrados: number;
} = {
  abiertos: [],
  ultimasCerradas: [],
  planesCerrados: [],
  whereAbiertos: null,
  whereCerrados: null,
  consultasDeCerrados: 0,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    planSemanal: {
      // Las dos consultas son el mismo metodo con intenciones distintas; lo
      // unico que las separa es el `where`, igual que en el resto del modulo.
      findMany: (args: { where: Record<string, unknown> }) => {
        if ("OR" in args.where) {
          estado.consultasDeCerrados += 1;
          estado.whereCerrados = args.where;
          return Promise.resolve(estado.planesCerrados);
        }
        estado.whereAbiertos = args.where;
        return Promise.resolve(estado.abiertos);
      },
      groupBy: () =>
        Promise.resolve(
          estado.ultimasCerradas.map((u) => ({
            projectId: u.projectId,
            _max: { fechaCorte: u.fecha },
          })),
        ),
    },
  },
}));

const { semanaDeLaEmpresa } = await import("@/services/plan-semanal.service");

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

const CON_PERMISO = sesion(["plan_semanal:leer"]);

/**
 * Fechas de CALENDARIO, a medianoche UTC, que es como Prisma devuelve un
 * `@db.Date` y como las construye `hoy()`.
 *
 * La primera version restaba 24 h a `Date.now()` y la prueba de «vencida»
 * fallo: a las 23:10 en Peru (UTC-5), «ayer a esta hora» es hoy a las 04:10
 * UTC, o sea DESPUES de la medianoche de hoy. Es el desfase de un dia contra
 * el que avisa el comentario de `hoy()`, y el fallo estaba en el dato de la
 * prueba, no en el servicio: en la base no hay fechas de corte con hora.
 */
function dia(desplazamiento: number): Date {
  const ahora = new Date();
  return new Date(
    Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + desplazamiento),
  );
}
const ayer = () => dia(-1);
const manana = () => dia(1);

function planAbierto(cambios: Record<string, unknown> = {}) {
  return {
    id: "plan-1",
    numero: 7,
    fechaCorte: manana(),
    projectId: "obra-1",
    project: { nombreObra: "TORRE NORTE" },
    compromisos: [],
    ...cambios,
  };
}

beforeEach(() => {
  estado.abiertos = [];
  estado.ultimasCerradas = [];
  estado.planesCerrados = [];
  estado.whereAbiertos = null;
  estado.whereCerrados = null;
  estado.consultasDeCerrados = 0;
});

describe("semanaDeLaEmpresa: a quien se le pregunta", () => {
  it("sin el permiso de leer planes no devuelve nada, y ni consulta", async () => {
    // La franja simplemente no se pinta para quien no sigue el Last Planner.
    const r = await semanaDeLaEmpresa(sesion(["obra:leer"]));

    expect(r).toEqual([]);
    expect(estado.whereAbiertos).toBeNull();
  });

  it("solo mira las obras de la empresa de quien pregunta", async () => {
    // El aislamiento entre constructoras vive DENTRO de la consulta, asi que
    // lo unico observable desde el doble es que se pida.
    await semanaDeLaEmpresa(CON_PERMISO);

    expect(estado.whereAbiertos).toMatchObject({
      estado: "ABIERTO",
      project: { companyId: "empresa-1" },
    });
  });

  it("deja fuera las obras CERRADAS", async () => {
    // En una obra cerrada no hay nada que hacer esta semana. Si arrastraba un
    // plan sin cerrar, apareceria en la franja para siempre.
    await semanaDeLaEmpresa(CON_PERMISO);

    const proyecto = (estado.whereAbiertos as { project: Record<string, unknown> })
      .project;
    expect(proyecto).toMatchObject({ estado: { not: "CERRADA" } });
  });

  it("sin ninguna semana abierta no va a buscar historial", async () => {
    // Salir pronto importa: es la pagina mas visitada y el caso normal de una
    // constructora que aun no usa el Last Planner es no tener ningun plan.
    estado.abiertos = [];

    const r = await semanaDeLaEmpresa(CON_PERMISO);

    expect(r).toEqual([]);
    expect(estado.consultasDeCerrados).toBe(0);
  });
});

describe("semanaDeLaEmpresa: que se cuenta de la semana abierta", () => {
  it("cuenta los compromisos que siguen sin evaluar", async () => {
    // `cumplido === null` es «sin evaluar»; true y false ya estan juzgados.
    estado.abiertos = [
      planAbierto({
        compromisos: [
          { cumplido: null },
          { cumplido: null },
          { cumplido: true },
          { cumplido: false },
        ],
      }),
    ];

    const [fila] = await semanaDeLaEmpresa(CON_PERMISO);

    expect(fila).toMatchObject({
      obra: "TORRE NORTE",
      numero: 7,
      sinEvaluar: 2,
      total: 4,
    });
  });

  it("una semana cuyo corte ya paso sale marcada como vencida", async () => {
    // Es la fila que de verdad reclama algo: habia que cerrarla y no se hizo.
    estado.abiertos = [planAbierto({ fechaCorte: ayer() })];

    const [fila] = await semanaDeLaEmpresa(CON_PERMISO);
    expect(fila?.vencida).toBe(true);
  });

  it("una semana en curso NO esta vencida", async () => {
    // El reverso: sin esta, un servicio que marcara todo como vencido pasaria
    // la prueba de arriba y la franja gritaria siempre.
    estado.abiertos = [planAbierto({ fechaCorte: manana() })];

    const [fila] = await semanaDeLaEmpresa(CON_PERMISO);
    expect(fila?.vencida).toBe(false);
  });
});

describe("semanaDeLaEmpresa: el PPC de la ultima semana cerrada", () => {
  it("trae el PPC de la ultima cerrada de esa obra", async () => {
    estado.abiertos = [planAbierto()];
    estado.ultimasCerradas = [{ projectId: "obra-1", fecha: ayer() }];
    estado.planesCerrados = [
      {
        projectId: "obra-1",
        compromisos: [
          { cumplido: true, causa: null },
          { cumplido: true, causa: null },
          { cumplido: false, causa: "PRERREQUISITO" },
          { cumplido: false, causa: "MANO_OBRA" },
        ],
      },
    ];

    const [fila] = await semanaDeLaEmpresa(CON_PERMISO);
    expect(fila?.ppcAnterior).toBe(50);
  });

  it("sin ninguna semana cerrada, el PPC es null y no cero", async () => {
    // Cero se lee como «se incumple todo», que es lo contrario de «todavia no
    // hay con que medir». Es la regla ya fijada en los indicadores del
    // Lookahead, y aqui se sostiene igual.
    estado.abiertos = [planAbierto()];
    estado.ultimasCerradas = [];

    const [fila] = await semanaDeLaEmpresa(CON_PERMISO);
    expect(fila?.ppcAnterior).toBeNull();
  });

  it("una semana cerrada SIN compromisos tampoco da cero", async () => {
    // El otro camino al mismo error: la semana existe, pero no se comprometio
    // nada. No es un 0 % de cumplimiento; es que no hubo promesas.
    estado.abiertos = [planAbierto()];
    estado.ultimasCerradas = [{ projectId: "obra-1", fecha: ayer() }];
    estado.planesCerrados = [{ projectId: "obra-1", compromisos: [] }];

    const [fila] = await semanaDeLaEmpresa(CON_PERMISO);
    expect(fila?.ppcAnterior).toBeNull();
  });

  it("no arrastra el historial: pide SOLO el ultimo plan de cada obra", async () => {
    // La version ingenua —traer los cerrados y quedarse con el ultimo en
    // memoria— carga cincuenta semanas por obra con todos sus compromisos
    // para usar una. Lo observable es que la segunda consulta va acotada a
    // los pares (obra, fecha) que dio el agregado.
    estado.abiertos = [
      planAbierto(),
      planAbierto({ id: "plan-2", projectId: "obra-2" }),
    ];
    const corte = ayer();
    estado.ultimasCerradas = [
      { projectId: "obra-1", fecha: corte },
      { projectId: "obra-2", fecha: null },
    ];

    await semanaDeLaEmpresa(CON_PERMISO);

    // La obra sin ninguna semana cerrada no genera par: no se pide nada de
    // ella en vez de pedirle "todos sus planes".
    expect(estado.whereCerrados).toEqual({
      OR: [{ projectId: "obra-1", fechaCorte: corte }],
    });
  });

  it("cada obra lleva SU ppc, sin mezclarlos", async () => {
    // No hay PPC agregado de empresa a proposito: promediar una obra de tres
    // compromisos con otra de cuarenta trata igual lo que no lo es.
    estado.abiertos = [
      planAbierto(),
      planAbierto({ id: "plan-2", projectId: "obra-2", project: { nombreObra: "SUR" } }),
    ];
    estado.ultimasCerradas = [
      { projectId: "obra-1", fecha: ayer() },
      { projectId: "obra-2", fecha: ayer() },
    ];
    estado.planesCerrados = [
      {
        projectId: "obra-1",
        compromisos: [{ cumplido: true, causa: null }],
      },
      {
        projectId: "obra-2",
        compromisos: [
          { cumplido: false, causa: "PRERREQUISITO" },
          { cumplido: false, causa: "PRERREQUISITO" },
        ],
      },
    ];

    const filas = await semanaDeLaEmpresa(CON_PERMISO);

    expect(filas.map((f) => [f.obra, f.ppcAnterior])).toEqual([
      ["TORRE NORTE", 100],
      ["SUR", 0],
    ]);
  });
});
