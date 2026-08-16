import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Las dos reglas del presupuesto que, al fallar, no dan error: descuadran.
 *
 * Aqui NO hay base de datos, igual que en `aislamiento.test.ts`: se sustituye
 * Prisma por un doble al que se le dice que devolver. Lo que se comprueba no
 * es que la base guarde bien —eso lo garantiza el motor—, sino que el servicio
 * se niegue antes de llegar a ella.
 */

interface Fila {
  id: string;
  codigoPartida: string;
  orden: number;
  parentId: string | null;
}

const estado: {
  partida: Record<string, unknown> | null;
  existentes: Fila[];
  creada: Record<string, unknown> | null;
  /// Cuantas filas sujetan a la partida por cada relacion `Restrict`.
  sujeciones: Record<string, number>;
  borrada: string | null;
  /// La revision del presupuesto, si la hay: congelada o en borrador.
  revision: { version: number; aprobadaAt: Date | null } | null;
  /// Codigos escritos por la renumeracion, en orden.
  escritos: string[];
} = {
  partida: null,
  existentes: [],
  creada: null,
  sujeciones: {},
  borrada: null,
  revision: null,
  escritos: [],
};

vi.mock("@/lib/prisma", () => {
  const wbsItem = {
    findFirst: () => Promise.resolve(estado.partida),
    findMany: () => Promise.resolve(estado.existentes),
    update: (args: { data: Record<string, unknown> }) => {
      const codigo = args.data["codigoPartida"];
      if (typeof codigo === "string") estado.escritos.push(codigo);
      return Promise.resolve({});
    },
    updateMany: () => Promise.resolve({ count: 0 }),
    create: (args: { data: Record<string, unknown> }) => {
      estado.creada = args.data;
      return Promise.resolve({ id: "nueva" });
    },
    count: () => Promise.resolve(estado.sujeciones["hijas"] ?? 0),
    delete: (args: { where: { id: string } }) => {
      estado.borrada = args.where.id;
      return Promise.resolve({});
    },
  };

  // Las cuatro relaciones `Restrict` que tambien sujetan a una partida. Sin
  // ellas en el doble, la prueba del borrado no podria distinguir el mensaje
  // del choque contra la clave ajena.
  const sujecion = (clave: string) => ({
    count: () => Promise.resolve(estado.sujeciones[clave] ?? 0),
  });

  return {
    prisma: {
      wbsItem,
      ordenImputacion: sujecion("orden"),
      encargoPartida: sujecion("encargo"),
      movimientoLinea: sujecion("movimiento"),
      metaItemPartida: sujecion("meta"),
      // Sin revision, el presupuesto esta abierto. Las pruebas de renumeracion
      // la encienden para comprobar que entonces se niega.
      baseline: { findFirst: () => Promise.resolve(estado.revision) },
      mapeoTareaPartida: {
        findMany: () => Promise.resolve([]),
        update: () => Promise.resolve({}),
      },
      project: { findFirst: () => Promise.resolve({ id: "obra", estado: "PLANIFICACION", archivadaEn: null }) },
      auditLog: { create: () => Promise.resolve({}) },
      $transaction: (fn: (tx: unknown) => unknown) =>
        Promise.resolve(
          fn({
            wbsItem,
            mapeoTareaPartida: { update: () => Promise.resolve({}) },
          }),
        ),
    },
  };
});

const { actualizarPartida, crearPartida, eliminarPartida, renumerarPartidas } =
  await import("@/services/partidas.service");

const sesion = {
  userId: "u1",
  companyId: "c1",
  role: "RESIDENTE",
  permisos: ["partida:editar", "partida:crear", "partida:eliminar"],
} as unknown as SesionActiva;

beforeEach(() => {
  estado.partida = null;
  estado.existentes = [];
  estado.creada = null;
  estado.sujeciones = {};
  estado.borrada = null;
  estado.revision = null;
  estado.escritos = [];
});

function partidaAlcance() {
  estado.partida = {
    id: "p1",
    projectId: "obra",
    codigoPartida: "3.1",
    descripcion: "Tabiqueria incluida",
    unidad: null,
    metrado: null,
    precioUnitario: null,
    parcial: null,
    tipo: "PARTIDA",
    modalidad: "ALCANCE",
    project: { estado: "PLANIFICACION", archivadaEn: null },
  };
}

/**
 * Por que esto importa tanto: `aportantes` hace que cualquier importe positivo
 * CUBRA a sus ancestros. Un alcance con importe no suma de mas —eso seria
 * benigno—, sino que borra del costo directo el precio cerrado de su partida
 * padre. El descuadre aparece lejos del sitio donde se causo.
 */
describe("una fila de alcance no lleva cifras propias", () => {
  it("rechaza el importe", async () => {
    partidaAlcance();
    const r = await actualizarPartida(sesion, "p1", { parcial: "1500.00" });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("no lleva cifras propias");
  });

  it("rechaza tambien el metrado y el precio", async () => {
    partidaAlcance();
    expect((await actualizarPartida(sesion, "p1", { metrado: "10" })).ok).toBe(false);
    expect((await actualizarPartida(sesion, "p1", { precioUnitario: "5" })).ok).toBe(false);
  });

  /** Vaciar si se admite: es la forma de corregir una fila que ya traia cifras. */
  it("deja vaciarlas", async () => {
    partidaAlcance();
    expect((await actualizarPartida(sesion, "p1", { parcial: null })).ok).toBe(true);
  });

  it("sigue dejando cambiar lo que si es suyo", async () => {
    partidaAlcance();
    expect((await actualizarPartida(sesion, "p1", { descripcion: "Otra cosa" })).ok).toBe(true);
  });
});

describe("un capitulo no tiene modalidad", () => {
  it("la rechaza, porque su importe es la suma de lo que cuelga", async () => {
    estado.partida = {
      id: "c1",
      projectId: "obra",
      codigoPartida: "3.0",
      descripcion: "INSTALACIONES ELECTRICAS",
      unidad: null,
      metrado: null,
      precioUnitario: null,
      parcial: null,
      tipo: "CAPITULO",
      modalidad: "PRECIOS_UNITARIOS",
      project: { estado: "PLANIFICACION", archivadaEn: null },
    };

    const r = await actualizarPartida(sesion, "c1", { modalidad: "SUMA_ALZADA" });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("Un capitulo no tiene modalidad");
  });
});

/**
 * El fallo que motivo todo esto: `orden = padre.orden + 1` metia cada fila
 * nueva LA PRIMERA de su capitulo, asi que teclear 2.1, 2.2 y 2.3 seguidas las
 * dejaba al reves. Nadie escribe un presupuesto de abajo arriba.
 */
describe("las hermanas salen en el orden en que se teclean", () => {
  it("coloca la nueva detras de la ultima hermana, no detras del padre", async () => {
    estado.existentes = [
      { id: "cap", codigoPartida: "2.0", orden: 10, parentId: null },
      { id: "a", codigoPartida: "2.1", orden: 11, parentId: "cap" },
      { id: "b", codigoPartida: "2.2", orden: 12, parentId: "cap" },
    ];

    await crearPartida(sesion, "obra", {
      codigoPartida: "2.3",
      descripcion: "Tercera",
      tipo: "PARTIDA",
      metrado: "1",
      precioUnitario: "1",
    });

    // Detras de la 2.2 (orden 12), no detras del capitulo (orden 10).
    expect(estado.creada?.["orden"]).toBe(13);
  });

  it("la primera hija de un capitulo vacio va justo detras de el", async () => {
    estado.existentes = [{ id: "cap", codigoPartida: "4.0", orden: 20, parentId: null }];

    await crearPartida(sesion, "obra", {
      codigoPartida: "4.1",
      descripcion: "Primera",
      tipo: "PARTIDA",
      metrado: "1",
      precioUnitario: "1",
    });

    expect(estado.creada?.["orden"]).toBe(21);
  });
});

/**
 * El capitulo elegido y el que dice el codigo tienen que coincidir. No se
 * escoge uno de los dos: en esta app los subtotales salen del `parentId` y el
 * total de la obra del codigo, asi que dejarlos apuntando a sitios distintos
 * descuadra el presupuesto en una pantalla y no en la otra.
 */
describe("elegir el capitulo del que cuelga", () => {
  const capitulos: Fila[] = [
    { id: "cap2", codigoPartida: "2.0", orden: 10, parentId: null },
    { id: "cap4", codigoPartida: "4.0", orden: 20, parentId: null },
  ];

  function conTipos(filas: Fila[]) {
    estado.existentes = filas.map((f) => ({
      ...f,
      tipo: f.codigoPartida.endsWith(".0") ? "CAPITULO" : "PARTIDA",
    })) as unknown as Fila[];
  }

  it("acepta el codigo que de verdad cuelga del capitulo elegido", async () => {
    conTipos(capitulos);

    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "4.1",
      descripcion: "Pintura",
      tipo: "PARTIDA",
      parentId: "cap4",
      metrado: "1",
      precioUnitario: "1",
    });

    expect(r.ok).toBe(true);
    expect(estado.creada?.["parentId"]).toBe("cap4");
  });

  /** El caso de la captura: se crea el capitulo 4.0 y se teclea 2.1. */
  it("rechaza el codigo que cuelga de otro capitulo", async () => {
    conTipos(capitulos);

    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "2.1",
      descripcion: "Pintura",
      tipo: "PARTIDA",
      parentId: "cap4",
      metrado: "1",
      precioUnitario: "1",
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("no cuelga de");
  });

  it("rechaza colgar de una partida, que borraria el importe de esa partida", async () => {
    conTipos([...capitulos, { id: "p", codigoPartida: "4.1", orden: 21, parentId: "cap4" }]);

    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "4.1.1",
      descripcion: "Detalle",
      tipo: "PARTIDA",
      parentId: "p",
      metrado: "1",
      precioUnitario: "1",
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("no es un capitulo");
  });
});

/**
 * La modalidad al CREAR, no despues.
 *
 * Faltaba entera: toda partida nacia a precios unitarios y habia que
 * corregirla en la tabla. Y no era solo un paso de mas: al crearla el importe
 * salia de metrado x precio, asi que una suma alzada nacia con una cifra que
 * nadie habia pactado.
 */
describe("crear una partida a suma alzada", () => {
  it("toma el importe cerrado y NO lo multiplica", async () => {
    estado.existentes = [];

    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "3.1",
      descripcion: "Puesta a tierra",
      tipo: "PARTIDA",
      modalidad: "SUMA_ALZADA",
      unidad: "glb",
      // El metrado es referencial: si se multiplicara saldrian 5000.
      metrado: "2",
      parcial: "2500.00",
    });

    expect(r.ok).toBe(true);
    expect(estado.creada?.["modalidad"]).toBe("SUMA_ALZADA");
    expect(estado.creada?.["parcial"]).toBe("2500.00");
    expect(estado.creada?.["metrado"]).toBe("2.0000");
  });

  it("exige el importe: sin el, la partida no vale nada y nadie avisaria", async () => {
    estado.existentes = [];

    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "3.1",
      descripcion: "Puesta a tierra",
      tipo: "PARTIDA",
      modalidad: "SUMA_ALZADA",
      metrado: "1",
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("importe cerrado");
  });

  it("a precios unitarios sigue saliendo de multiplicar", async () => {
    estado.existentes = [];

    await crearPartida(sesion, "obra", {
      codigoPartida: "3.1",
      descripcion: "Concreto",
      tipo: "PARTIDA",
      modalidad: "PRECIOS_UNITARIOS",
      metrado: "12.5",
      precioUnitario: "385",
    });

    expect(estado.creada?.["parcial"]).toBe("4812.50");
  });

  it("un capitulo sigue sin admitir modalidad ni importe", async () => {
    estado.existentes = [];

    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "5.0",
      descripcion: "ACABADOS",
      tipo: "CAPITULO",
      modalidad: "SUMA_ALZADA",
      parcial: "100",
    });

    expect(r.ok).toBe(false);
  });
});


/**
 * Lo que la base rechaza y el servicio dejaba pasar.
 *
 * Las tres roturas de esta tanda comparten desenlace: la excepcion subia sin
 * que nadie la recogiera, la Server Action se rechazaba y salia la pantalla
 * generica de Next. Un presupuesto de cientos de filas quedaba inservible por
 * un cero de mas. Lo que se fija aqui es que el servicio se NIEGUE antes, con
 * un motivo que se pueda leer.
 */
describe("los limites de las columnas", () => {
  const nueva = {
    codigoPartida: "1.1",
    descripcion: "Concreto",
    tipo: "PARTIDA" as const,
    modalidad: "PRECIOS_UNITARIOS" as const,
  };

  it("rechaza un codigo mas largo que su columna, en vez de recortarlo", async () => {
    // 35 caracteres, y pasa el regex de forma sin problema.
    const largo = "01.02.03.04.05.06.07.08.09.10.11.12";
    expect(largo).toMatch(/^\d+(\.\d+)*$/);

    const r = await crearPartida(sesion, "obra", { ...nueva, codigoPartida: largo });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("32");
    // Recortarlo seria peor que rechazarlo: el codigo decide de quien cuelga.
    expect(estado.creada).toBeNull();
  });

  it("rechaza un metrado con mas digitos enteros de los que caben", async () => {
    const r = await crearPartida(sesion, "obra", {
      ...nueva,
      metrado: "99999999999",
      precioUnitario: "10",
    });

    expect(r.ok).toBe(false);
    expect(estado.creada).toBeNull();
  });

  /**
   * El caso que ninguna validacion por campo detecta: los dos operandos caben
   * y su producto no. La cifra imposible la fabrica el servidor.
   */
  it("rechaza el importe cuando no cabe, aunque metrado y precio si quepan", async () => {
    const r = await crearPartida(sesion, "obra", {
      ...nueva,
      metrado: "9999999999",
      precioUnitario: "1000",
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("importe");
    expect(estado.creada).toBeNull();
  });

  it("deja pasar las cifras normales", async () => {
    const r = await crearPartida(sesion, "obra", {
      ...nueva,
      metrado: "120",
      precioUnitario: "8.50",
    });

    expect(r.ok).toBe(true);
    expect(estado.creada?.["parcial"]).toBe("1020.00");
  });
});

describe("borrar una partida sujeta por otra cosa", () => {
  function partidaSuelta() {
    estado.partida = {
      id: "p1",
      projectId: "obra",
      codigoPartida: "4.1",
      descripcion: "Excavacion",
      tipo: "PARTIDA",
      modalidad: "PRECIOS_UNITARIOS",
      unidad: "m3",
      metrado: null,
      precioUnitario: null,
      parcial: null,
      project: { id: "obra", estado: "PLANIFICACION", archivadaEn: null },
    };
  }

  it("borra la que no sujeta nadie", async () => {
    partidaSuelta();

    const r = await eliminarPartida(sesion, "p1");

    expect(r.ok).toBe(true);
    expect(estado.borrada).toBe("p1");
  });

  it.each([
    ["orden", "orden de compra"],
    ["encargo", "encargo"],
    ["movimiento", "movimiento"],
    ["meta", "meta"],
  ])("se niega y explica cuando la sujeta %s", async (clave, texto) => {
    partidaSuelta();
    estado.sujeciones = { [clave]: 1 };

    const r = await eliminarPartida(sesion, "p1");

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain(texto);
    // Lo que importa: NO se intento borrar. Antes se intentaba, chocaba contra
    // la clave ajena y la pantalla se caia sin decir por que.
    expect(estado.borrada).toBeNull();
  });
});


/**
 * Renumerar es lo mas delicado del presupuesto.
 *
 * El codigo es la llave con la que el cronograma y las revisiones senalan a
 * cada partida, y ademas de el sale la jerarquia que reparte el costo directo.
 * Lo que se fija aqui son las dos guardas que no se pueden perder: que no se
 * renumera con una revision viva, y que se escribe en DOS FASES.
 */
describe("cerrar los huecos de la numeracion", () => {
  function conHueco() {
    estado.existentes = [
      { id: "c2", codigoPartida: "2.0", orden: 10, parentId: null },
      { id: "p1", codigoPartida: "2.1", orden: 11, parentId: "c2" },
      { id: "c3", codigoPartida: "3.0", orden: 20, parentId: null },
    ];
  }

  it("renumera y deja la numeracion seguida", async () => {
    conHueco();

    const r = await renumerarPartidas(sesion, "obra");

    expect(r.ok).toBe(true);
    expect(r.ok === true && r.datos.cambiadas).toBe(3);
  });

  /**
   * Dos fases, porque MariaDB no tiene restricciones diferidas: al cerrar el
   * hueco, el 3.0 pasa a 2.0 mientras el 2.0 todavia existe, y el indice unico
   * revienta a mitad de camino. Primero se escribe a un codigo imposible.
   */
  it("escribe primero codigos imposibles y despues los definitivos", async () => {
    conHueco();

    await renumerarPartidas(sesion, "obra");

    const temporales = estado.escritos.filter((c) => c.startsWith("#"));
    const definitivos = estado.escritos.filter((c) => !c.startsWith("#"));

    expect(temporales).toHaveLength(3);
    expect(definitivos).toEqual(["1.0", "1.1", "2.0"]);
    // Y en ese orden: ningun definitivo antes de que salgan todos los viejos.
    expect(estado.escritos.slice(0, 3).every((c) => c.startsWith("#"))).toBe(true);
  });

  it("se niega con el presupuesto congelado", async () => {
    conHueco();
    estado.revision = { version: 2, aprobadaAt: new Date() };

    const r = await renumerarPartidas(sesion, "obra");

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("congelado");
    expect(estado.escritos).toEqual([]);
  });

  /**
   * El borrador es el fallo silencioso mas caro: si se aprobara despues, cada
   * partida quedaria con base 0,00 y el presupuesto vigente mentiria entero.
   */
  it("se niega tambien con una revision en borrador", async () => {
    conHueco();
    estado.revision = { version: 3, aprobadaAt: null };

    const r = await renumerarPartidas(sesion, "obra");

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("borrador");
    expect(estado.escritos).toEqual([]);
  });

  it("no toca nada cuando no hay huecos", async () => {
    estado.existentes = [
      { id: "c1", codigoPartida: "1.0", orden: 0, parentId: null },
      { id: "p1", codigoPartida: "1.1", orden: 1, parentId: "c1" },
    ];

    const r = await renumerarPartidas(sesion, "obra");

    expect(r.ok === true && r.datos.cambiadas).toBe(0);
    expect(estado.escritos).toEqual([]);
  });
});
