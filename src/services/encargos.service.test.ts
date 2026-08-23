import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Las guardas de `crearEncargo`, que es donde se reparte el trabajo de la
 * obra entre contratistas.
 *
 * Sin base de datos: Prisma doblado, como en `partidas`, `movimientos` y
 * `ordenes`. Se comprueba que el servicio se NIEGUE antes de escribir.
 *
 * La invariante del modulo es la del frente: una partida se puede fraccionar
 * entre varios proveedores, pero la suma de las fracciones VIGENTES no puede
 * pasar del 100 %. Si se pasa, la obra queda contratada por encima de lo que
 * hay que hacer y nadie se entera hasta valorizar.
 */

interface FilaWbs {
  id: string;
  codigoPartida: string;
  /// Lo que YA tienen asignado otros encargos vigentes, en porcentaje.
  encargos: { fraccion: string }[];
}

const estado: {
  obra: { id: string } | null;
  proveedor: { id: string; tipoImpuesto: string } | null;
  /// Solo aparecen aqui las que la consulta deja ver: son de ESTA obra, de
  /// esta empresa, y de tipo PARTIDA. Vaciarlo simula cualquiera de las tres.
  partidas: FilaWbs[];
  cerrada: string | null;
  creados: Record<string, unknown>[];
  /// El `where` con el que el servicio pidio los encargos ya asignados. Es
  /// lo unico observable del filtro por estado desde aqui.
  filtroEncargos: Record<string, unknown> | null;
  /**
   * El encargo que se va a valorizar, o null si no es de esta obra/empresa.
   *
   * Lleva `montoContratado` y `adendas` porque el corte CONGELA su importe, y
   * lo congela contra el vigente: sin esos dos campos el doble no se parece a
   * lo que devuelve Prisma y las pruebas fallarian por algo que no es lo que
   * comprueban.
   */
  encargo: {
    id: string;
    estado: string;
    montoContratado: { toString: () => string };
    adendas: { importe: { toString: () => string } }[];
  } | null;
  /// Los cortes escritos. Append-only: aqui solo se puede acumular.
  valorizaciones: Record<string, unknown>[];
  /// Freno para provocar el solape: si esta puesta, el calculo del correlativo
  /// espera aqui. Asi dos altas pueden LEER el maximo antes de que ninguna
  /// escriba, que es exactamente la carrera que la unicidad tiene que atrapar.
  puerta: Promise<void> | null;
} = {
  obra: { id: "obra-1" },
  proveedor: { id: "prov-1", tipoImpuesto: "IGV" },
  partidas: [],
  cerrada: null,
  creados: [],
  filtroEncargos: null,
  encargo: {
    id: "enc-1",
    estado: "VIGENTE",
    montoContratado: { toString: () => "50000.00" },
    adendas: [],
  },
  valorizaciones: [],
  puerta: null,
};

/**
 * Un rechazo con la FORMA del de Prisma al violar una unicidad.
 *
 * Se le pone `code` y nada mas: el servicio lo mira por forma, no con
 * `instanceof`, porque con el adaptador de MariaDB el error viene envuelto.
 */
function choqueDeUnicidad(indice: string): Error {
  return Object.assign(new Error(`Unique constraint failed on ${indice}`), {
    code: "P2002",
  });
}

vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: () => Promise.resolve(estado.cerrada),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    encargoProveedor: {
      aggregate: () => Promise.resolve({ _max: { numero: 3 } }),
      create: (args: { data: Record<string, unknown> }) => {
        estado.creados.push(args.data);
        return Promise.resolve({ id: "encargo-nuevo" });
      },
    },
    // Sin `update` a proposito: si algun dia alguien cambiara el corte por un
    // `update` sobre el anterior, esto reventaria en vez de sobrescribir en
    // silencio.
    //
    // `aggregate` y `create` NO devuelven una respuesta fija: implementan de
    // verdad el filtro y las dos unicidades sobre `estado.valorizaciones`. Un
    // doble que contestara siempre lo mismo daria por buenos los dos fallos
    // que estas pruebas existen para cazar —cruzar los alcances de las series
    // y el numero repetido—, porque ninguno de los dos se ve en el argumento:
    // se ven en el RESULTADO.
    valorizacionEncargo: {
      aggregate: async (args: {
        where: Record<string, unknown>;
        _max: Record<string, boolean>;
      }) => {
        if (estado.puerta) await estado.puerta;

        // El `where` se aplica tal cual llega: si el servicio filtrara por el
        // campo equivocado, aqui saldrian otras filas y el numero cambiaria.
        const dentro = estado.valorizaciones.filter((v) =>
          Object.entries(args.where).every(([campo, valor]) => v[campo] === valor),
        );
        const campo = Object.keys(args._max)[0]!;
        const numeros = dentro
          .map((v) => Number(v[campo]))
          .filter((n) => Number.isFinite(n));

        return {
          _max: { [campo]: numeros.length > 0 ? Math.max(...numeros) : null },
        };
      },
      create: (args: { data: Record<string, unknown> }) => {
        const d = args.data;

        // Las dos unicidades del esquema, por separado: importa CUAL choca.
        if (
          estado.valorizaciones.some(
            (v) =>
              v["projectId"] === d["projectId"] && v["numeroObra"] === d["numeroObra"],
          )
        ) {
          return Promise.reject(
            choqueDeUnicidad("valorizaciones_encargo_projectId_numeroObra_key"),
          );
        }
        if (
          estado.valorizaciones.some(
            (v) =>
              v["encargoId"] === d["encargoId"] &&
              v["numeroEncargo"] === d["numeroEncargo"],
          )
        ) {
          return Promise.reject(
            choqueDeUnicidad("valorizaciones_encargo_encargoId_numeroEncargo_key"),
          );
        }

        estado.valorizaciones.push(d);
        return Promise.resolve({ id: `val-${estado.valorizaciones.length}` });
      },
    },
    auditLog: { create: () => Promise.resolve({}) },
  };

  return {
    prisma: {
      project: { findFirst: () => Promise.resolve(estado.obra) },
      // Devuelve el encargo PEDIDO, no siempre el mismo: hace falta para
      // valorizar dos encargos distintos de la misma obra. `estado.encargo` a
      // null sigue significando "no es de esta obra o de esta empresa".
      encargoProveedor: {
        findFirst: (args: { where: { id: string } }) =>
          Promise.resolve(
            estado.encargo ? { ...estado.encargo, id: args.where.id } : null,
          ),
      },
      proveedor: { findFirst: () => Promise.resolve(estado.proveedor) },
      wbsItem: {
        findMany: (args: {
          where: { id: { in: string[] } };
          select?: { encargos?: { where?: { encargo?: Record<string, unknown> } } };
        }) => {
          estado.filtroEncargos = args.select?.encargos?.where?.encargo ?? null;
          return Promise.resolve(
            estado.partidas.filter((p) => args.where.id.in.includes(p.id)),
          );
        },
      },
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    },
  };
});

const { crearEncargo, valorizarEncargo } = await import(
  "@/services/encargos.service"
);

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
    nombre: "Quien sea",
  } as unknown as SesionActiva;
}

const CON_PERMISO = sesion(["encargo:gestionar"]);

/** Encargo valido: una partida libre, entera. */
function encargo(cambios: Record<string, unknown> = {}) {
  return {
    proveedorId: "prov-1",
    descripcion: "Encofrado y vaciado de zapatas",
    montoContratado: "25000.00",
    partidas: [{ wbsItemId: "p-1", fraccion: "100" }],
    ...cambios,
  };
}

/** Una partida de la obra con lo que ya tenga asignado. */
function partida(id: string, yaAsignado: string[] = []): FilaWbs {
  return {
    id,
    codigoPartida: `01.01.${id.slice(-1).padStart(2, "0")}`,
    encargos: yaAsignado.map((fraccion) => ({ fraccion })),
  };
}

beforeEach(() => {
  estado.obra = { id: "obra-1" };
  estado.proveedor = { id: "prov-1", tipoImpuesto: "IGV" };
  estado.partidas = [partida("p-1")];
  estado.cerrada = null;
  estado.creados = [];
  estado.filtroEncargos = null;
  estado.encargo = {
    id: "enc-1",
    estado: "VIGENTE",
    montoContratado: { toString: () => "50000.00" },
    adendas: [],
  };
  estado.valorizaciones = [];
  estado.puerta = null;
});

function seNego(r: { ok: boolean; error?: string }, trozo: string) {
  expect(r.ok).toBe(false);
  expect(!r.ok && r.error).toContain(trozo);
  expect(estado.creados).toHaveLength(0);
}

describe("crearEncargo: el camino bueno", () => {
  it("un encargo sobre una partida libre se guarda y numera por obra", async () => {
    // Sin esta, una funcion que rechazara todo pasaria las demas.
    const r = await crearEncargo(CON_PERMISO, "obra-1", encargo());
    expect(r.ok).toBe(true);
    expect(estado.creados).toHaveLength(1);
    // El correlativo sale del maximo de la obra, no de un contador global.
    expect(estado.creados[0]).toMatchObject({ numero: 4 });
  });
});

describe("crearEncargo: una partida no se contrata dos veces", () => {
  it("fraccionar entre proveedores es valido mientras no se pase del 100", async () => {
    // El caso legitimo: 60 % ya dado a otro, se contrata el 40 % restante.
    estado.partidas = [partida("p-1", ["60"])];
    const r = await crearEncargo(
      CON_PERMISO,
      "obra-1",
      encargo({ partidas: [{ wbsItemId: "p-1", fraccion: "40" }] }),
    );
    expect(r.ok).toBe(true);
  });

  it("pasarse del 100 % entre proveedores se rechaza nombrando la partida", async () => {
    // ESTA es la invariante. Si se rompe, la obra queda contratada por
    // encima de lo que hay que ejecutar y no se nota hasta valorizar.
    estado.partidas = [partida("p-1", ["60"])];
    const r = await crearEncargo(
      CON_PERMISO,
      "obra-1",
      encargo({ partidas: [{ wbsItemId: "p-1", fraccion: "50" }] }),
    );
    seNego(r, "por encima del 100");
  });

  it("al sumar lo ya asignado pide SOLO los encargos vigentes", async () => {
    // No se puede comprobar filtrando en el doble —seria el doble
    // demostrandose a si mismo—, asi que se comprueba lo que SI es
    // observable: que la consulta pida `estado: "VIGENTE"`. Si alguien lo
    // quitara, un encargo anulado seguiria ocupando la partida y nadie
    // podria recontratarla. `tsc` no ve este tipo de cambio.
    await crearEncargo(CON_PERMISO, "obra-1", encargo());
    expect(estado.filtroEncargos).toMatchObject({ estado: "VIGENTE" });
  });

  it("la misma partida dos veces en el mismo encargo se rechaza", async () => {
    // Sin esto, 60 + 60 dentro del mismo encargo pasaria la comprobacion del
    // frente, que mira los OTROS encargos.
    const r = await crearEncargo(
      CON_PERMISO,
      "obra-1",
      encargo({
        partidas: [
          { wbsItemId: "p-1", fraccion: "60" },
          { wbsItemId: "p-1", fraccion: "60" },
        ],
      }),
    );
    seNego(r, "dos veces en el mismo encargo");
  });
});

describe("crearEncargo: que se puede encargar y a quien", () => {
  it("un capitulo no se encarga: la consulta solo trae partidas", async () => {
    // `verificarFrente` filtra por tipo PARTIDA. Un capitulo no aparece, y
    // para el servicio no esta en el presupuesto.
    estado.partidas = [];
    const r = await crearEncargo(CON_PERMISO, "obra-1", encargo());
    seNego(r, "no esta en el presupuesto de esta obra");
  });

  it("un proveedor de otra empresa no vale", async () => {
    estado.proveedor = null;
    const r = await crearEncargo(CON_PERMISO, "obra-1", encargo());
    seNego(r, "no es de tu empresa");
  });

  it("una obra de otra empresa no se encuentra", async () => {
    estado.obra = null;
    const r = await crearEncargo(CON_PERMISO, "obra-1", encargo());
    seNego(r, "Obra no encontrada");
  });
});

describe("crearEncargo: quien puede, cuando, y que llega", () => {
  it("sin el permiso de gestionar encargos, no crea nada", async () => {
    const r = await crearEncargo(sesion([]), "obra-1", encargo());
    seNego(r, "No tienes permiso");
  });

  it("con la obra cerrada se niega, aunque tenga permiso", async () => {
    estado.cerrada = "La obra esta cerrada desde el 01/07/2026.";
    const r = await crearEncargo(CON_PERMISO, "obra-1", encargo());
    seNego(r, "cerrada");
  });

  it("sin descripcion no se guarda", async () => {
    const r = await crearEncargo(
      CON_PERMISO,
      "obra-1",
      encargo({ descripcion: "   " }),
    );
    seNego(r, "necesita una descripcion");
  });

  it("un monto negativo se rechaza", async () => {
    const r = await crearEncargo(
      CON_PERMISO,
      "obra-1",
      encargo({ montoContratado: "-1000.00" }),
    );
    seNego(r, "no negativo");
  });

  it("un encargo sin ninguna partida no encarga nada", async () => {
    const r = await crearEncargo(CON_PERMISO, "obra-1", encargo({ partidas: [] }));
    seNego(r, "al menos una partida");
  });

  it("una fraccion de cero no reparte nada y se rechaza", async () => {
    const r = await crearEncargo(
      CON_PERMISO,
      "obra-1",
      encargo({ partidas: [{ wbsItemId: "p-1", fraccion: "0" }] }),
    );
    seNego(r, "entre 0 y 100");
  });

  it("una fraccion mayor que 100 se rechaza", async () => {
    const r = await crearEncargo(
      CON_PERMISO,
      "obra-1",
      encargo({ partidas: [{ wbsItemId: "p-1", fraccion: "120" }] }),
    );
    seNego(r, "entre 0 y 100");
  });
});

/**
 * `valorizarEncargo`: el corte de avance del contratista. Es contra esto que
 * se le paga, asi que un corte de mas o de menos es dinero de verdad.
 *
 * Es append-only por diseño: cada corte es una fila nueva y NO sobrescribe al
 * anterior. Perder eso borraria el historial de lo ya reconocido.
 */

/** Corte valido al que cada prueba cambia solo lo que examina. */
function corte(cambios: Record<string, unknown> = {}) {
  return { fecha: "2026-08-18", porcentaje: "45", ...cambios };
}

function noValorizo(r: { ok: boolean; error?: string }, trozo: string) {
  expect(r.ok).toBe(false);
  expect(!r.ok && r.error).toContain(trozo);
  expect(estado.valorizaciones).toHaveLength(0);
}

describe("valorizarEncargo: el camino bueno y el historial", () => {
  it("un corte valido se guarda con el porcentaje a tres decimales", async () => {
    const r = await valorizarEncargo(
      sesion(["encargo:valorizar"]),
      "obra-1",
      "enc-1",
      corte(),
    );
    expect(r.ok).toBe(true);
    expect(estado.valorizaciones).toHaveLength(1);
    expect(estado.valorizaciones[0]).toMatchObject({
      encargoId: "enc-1",
      porcentaje: "45.000",
    });
  });

  it("dos cortes seguidos se acumulan: el segundo no pisa al primero", async () => {
    // Append-only. Si esto se rompiera, el historial de lo reconocido
    // desapareceria y solo quedaria la ultima cifra, sin rastro de la
    // anterior ni de quien la puso.
    const quien = sesion(["encargo:valorizar"]);
    await valorizarEncargo(quien, "obra-1", "enc-1", corte({ porcentaje: "30" }));
    await valorizarEncargo(quien, "obra-1", "enc-1", corte({ porcentaje: "55" }));
    expect(estado.valorizaciones).toHaveLength(2);
    expect(estado.valorizaciones.map((v) => v["porcentaje"])).toEqual([
      "30.000",
      "55.000",
    ]);
  });
});

describe("valorizarEncargo: el rango del avance", () => {
  it("acepta el 0 %: un corte sin avance tambien es un hecho", async () => {
    // Aqui el 0 SI vale, al reves que la fraccion de un encargo. Registrar
    // que el contratista no avanzo esta semana es informacion, y ademas es
    // lo que sostiene el indicador de cumplimiento.
    const r = await valorizarEncargo(
      sesion(["encargo:valorizar"]),
      "obra-1",
      "enc-1",
      corte({ porcentaje: "0" }),
    );
    expect(r.ok).toBe(true);
    expect(estado.valorizaciones).toHaveLength(1);
  });

  it("acepta el 100 %: el encargo terminado", async () => {
    const r = await valorizarEncargo(
      sesion(["encargo:valorizar"]),
      "obra-1",
      "enc-1",
      corte({ porcentaje: "100" }),
    );
    expect(r.ok).toBe(true);
  });

  it("mas del 100 % se rechaza: no se paga por encima de lo contratado", async () => {
    const r = await valorizarEncargo(
      sesion(["encargo:valorizar"]),
      "obra-1",
      "enc-1",
      corte({ porcentaje: "110" }),
    );
    noValorizo(r, "entre 0 y 100");
  });

  it("un avance negativo se rechaza", async () => {
    const r = await valorizarEncargo(
      sesion(["encargo:valorizar"]),
      "obra-1",
      "enc-1",
      corte({ porcentaje: "-5" }),
    );
    noValorizo(r, "entre 0 y 100");
  });

  it("un porcentaje que no es un numero se rechaza", async () => {
    const r = await valorizarEncargo(
      sesion(["encargo:valorizar"]),
      "obra-1",
      "enc-1",
      corte({ porcentaje: "casi la mitad" }),
    );
    noValorizo(r, "entre 0 y 100");
  });

  it("sin fecha de corte no se valoriza: un avance sin fecha no situa nada", async () => {
    const r = await valorizarEncargo(
      sesion(["encargo:valorizar"]),
      "obra-1",
      "enc-1",
      corte({ fecha: "" }),
    );
    noValorizo(r, "fecha del corte");
  });
});

/**
 * Los DOS correlativos del corte, que es lo que la migracion
 * `20260821040000_dos_correlativos_de_valorizacion` vino a sostener.
 *
 * Son series INDEPENDIENTES y con alcances distintos: la de OBRA cuenta todas
 * las valorizaciones de la obra —es EL numero del papel, porque el documento lo
 * emite la obra— y la de ENCARGO cuenta las de ese contrato. Cruzar los
 * alcances no rompe nada visible: da numeros que PARECEN correlativos y no lo
 * son, y eso solo se ve el dia que hay que reclamar un documento por su numero.
 */
describe("valorizarEncargo: las dos series de correlativos", () => {
  const QUIEN = sesion(["encargo:valorizar"]);

  it("las dos series avanzan por separado", async () => {
    // Dos encargos de la MISMA obra, que es donde las series se separan: la de
    // obra sigue contando, la del encargo vuelve a empezar.
    await valorizarEncargo(QUIEN, "obra-1", "enc-1", corte());
    await valorizarEncargo(QUIEN, "obra-1", "enc-1", corte());
    await valorizarEncargo(QUIEN, "obra-1", "enc-2", corte());

    expect(
      estado.valorizaciones.map((v) => [v["numeroObra"], v["numeroEncargo"]]),
    ).toEqual([
      [1, 1],
      [2, 2],
      // La tercera de la obra, pero la PRIMERA de su contrato. Si alguien
      // cruzara los alcances saldria [1, 3], que es el fallo entero.
      [3, 1],
    ]);
  });

  it("cada serie mira su alcance: ni la obra ajena ni el encargo ajeno cuentan", async () => {
    // Cortes que ya existen y que NO son de esta obra ni de este encargo. Si
    // alguna de las dos consultas se dejara el filtro, el correlativo nuevo
    // saldria del 7 en vez del 1.
    estado.valorizaciones = [
      {
        projectId: "obra-2",
        encargoId: "enc-9",
        numeroObra: 7,
        numeroEncargo: 7,
      },
    ];

    await valorizarEncargo(QUIEN, "obra-1", "enc-1", corte());

    expect(estado.valorizaciones[1]).toMatchObject({
      projectId: "obra-1",
      numeroObra: 1,
      numeroEncargo: 1,
    });
  });

  it("el corte guarda la obra del encargo, no la que le manden", async () => {
    // `projectId` esta DESNORMALIZADO en la valorizacion, y solo por eso puede
    // existir la unicidad de la serie de obra. Se copia de la obra ya validada
    // al buscar el encargo: si se dejara de escribir, la unicidad amontonaria
    // todas las valorizaciones bajo el mismo hueco.
    await valorizarEncargo(QUIEN, "obra-1", "enc-1", corte());
    expect(estado.valorizaciones[0]).toMatchObject({ projectId: "obra-1" });
  });

  it("si otro se lleva el numero, se pide repetir y no se pierde el corte", async () => {
    // La carrera de verdad: dos personas valorizando en la misma obra al mismo
    // tiempo leen el mismo maximo y las dos van a por el mismo numero. La
    // `puerta` las retiene hasta que las dos han LEIDO, que es la unica forma
    // de provocarla sin depender del reloj.
    let abrir!: () => void;
    estado.puerta = new Promise<void>((resolver) => {
      abrir = resolver;
    });

    const a = valorizarEncargo(QUIEN, "obra-1", "enc-1", corte({ porcentaje: "30" }));
    const b = valorizarEncargo(QUIEN, "obra-1", "enc-2", corte({ porcentaje: "40" }));

    // Un turno de macrotarea: para cuando vuelve, las dos estan esperando en
    // la puerta y ninguna ha escrito.
    await new Promise((resolver) => setTimeout(resolver, 0));
    abrir();

    const salidas = await Promise.all([a, b]);
    const guardadas = salidas.filter((r) => r.ok);
    const rechazadas = salidas.filter((r) => !r.ok);

    // Una entra y la otra no. Cual de las dos depende de quien llegue antes al
    // create, y eso da igual: lo que importa es que no entren las dos con el
    // mismo numero y que a la rechazada se le diga que repita.
    expect(guardadas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
    expect(estado.valorizaciones).toHaveLength(1);
    expect(rechazadas[0]).toMatchObject({ ok: false });
    expect(!rechazadas[0]!.ok && rechazadas[0]!.error).toContain(
      "Vuelve a guardar",
    );
  });

  it("el choque de numero no se cuenta como dato malo", async () => {
    // Un P2002 es TRANSITORIO: al reintentar, el maximo ya es otro y el
    // siguiente numero esta libre. Si el mensaje sonara a error de datos, quien
    // valoriza se pondria a revisar la fecha y el porcentaje, que estan bien.
    let abrir!: () => void;
    estado.puerta = new Promise<void>((resolver) => {
      abrir = resolver;
    });

    const a = valorizarEncargo(QUIEN, "obra-1", "enc-1", corte());
    const b = valorizarEncargo(QUIEN, "obra-1", "enc-1", corte());
    await new Promise((resolver) => setTimeout(resolver, 0));
    abrir();

    const rechazada = (await Promise.all([a, b])).find((r) => !r.ok);
    const texto = rechazada && !rechazada.ok ? rechazada.error : "";
    expect(texto).toContain("el corte no se ha perdido");
    expect(texto).not.toContain("Vuelve a intentarlo en unos segundos");
  });
});

describe("valorizarEncargo: quien puede y sobre que", () => {
  it("valorizar pide su propio permiso, no el de gestionar encargos", async () => {
    // Son dos cosas distintas: repartir el trabajo es de oficina, reconocer
    // el avance es de obra. Quien solo gestiona encargos NO valoriza.
    const r = await valorizarEncargo(
      sesion(["encargo:gestionar"]),
      "obra-1",
      "enc-1",
      corte(),
    );
    noValorizo(r, "No tienes permiso para valorizar");
  });

  it("con la obra cerrada no se valoriza, aunque tenga permiso", async () => {
    estado.cerrada = "La obra esta cerrada desde el 01/07/2026.";
    const r = await valorizarEncargo(
      sesion(["encargo:valorizar"]),
      "obra-1",
      "enc-1",
      corte(),
    );
    noValorizo(r, "cerrada");
  });

  it("un encargo anulado no se valoriza", async () => {
    // Anulado quiere decir que ese contrato ya no rige. Reconocerle avance
    // seria reconocer trabajo contra algo que no existe.
    estado.encargo = {
      id: "enc-1",
      estado: "ANULADO",
      montoContratado: { toString: () => "50000.00" },
      adendas: [],
    };
    const r = await valorizarEncargo(
      sesion(["encargo:valorizar"]),
      "obra-1",
      "enc-1",
      corte(),
    );
    noValorizo(r, "anulado no se valoriza");
  });

  it("un encargo de otra obra o de otra empresa no se encuentra", async () => {
    // La consulta filtra por `projectId` y por `companyId`. Sin eso, se
    // podria valorizar el encargo de otra constructora sabiendo su id.
    estado.encargo = null;
    const r = await valorizarEncargo(
      sesion(["encargo:valorizar"]),
      "obra-1",
      "enc-1",
      corte(),
    );
    noValorizo(r, "Encargo no encontrado");
  });
});
