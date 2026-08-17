import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";
import { sumarHojas } from "@/lib/jerarquia-partidas";

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
  tipo?: "CAPITULO" | "PARTIDA";
  parcial?: string | null;
  modalidad?: "PRECIOS_UNITARIOS" | "SUMA_ALZADA" | "ALCANCE";
  nivel?: number;
  descripcion?: string;
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
  /// Las filas del mapeo tarea-partida de la obra.
  mapeos: { id: string; codigoPartida: string }[];
  /// Lo que la agrupacion escribio sobre las partidas elegidas.
  vaciadas: Record<string, unknown>[];
} = {
  mapeos: [],
  vaciadas: [],
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
    updateMany: (args: { data: Record<string, unknown> }) => {
      estado.vaciadas.push(args.data);
      return Promise.resolve({ count: 0 });
    },
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
      proveedorPartida: sujecion("proveedor"),
      // Sin revision, el presupuesto esta abierto. Las pruebas de renumeracion
      // la encienden para comprobar que entonces se niega.
      baseline: { findFirst: () => Promise.resolve(estado.revision) },
      mapeoTareaPartida: {
        findMany: () => Promise.resolve(estado.mapeos),
        update: () => Promise.resolve({}),
        count: () => Promise.resolve(estado.sujeciones["mapeo"] ?? 0),
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

const {
  actualizarPartida,
  crearPartida,
  eliminarPartida,
  renumerarPartidas,
  agruparEnSumaAlzada,
} = await import("@/services/partidas.service");

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
  estado.mapeos = [];
  estado.vaciadas = [];
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


/**
 * Las guardas que salieron de la revision adversaria.
 *
 * Las tres tapan agujeros que MUEVEN DINERO sin dar ningun error, y las tres
 * se descubrieron atacando la primera version de la renumeracion. Sin estas
 * pruebas, el siguiente que toque el fichero las vuelve a abrir.
 */
describe("lo que la renumeracion tiene que negarse a hacer", () => {
  /**
   * El caso que cegaba la red entera.
   *
   * Se teclea "3.02" antes de que exista "3": `codigoPadre` devuelve null y la
   * fila nace en la raiz. Al crear "3" despues, el codigo dice que "3.02"
   * cuelga de el, pero su `parentId` sigue en null. Los dos arboles discrepan
   * sin que nadie los haya editado, y renumerar con esa discrepancia movia el
   * costo directo de 400 a 1400 con la red dando el visto bueno.
   */
  it("se niega cuando el arbol que se ve y el que dice el codigo discrepan", async () => {
    estado.existentes = [
      { id: "a", codigoPartida: "3.02", orden: 1, parentId: null, tipo: "PARTIDA", parcial: "400.00" },
      { id: "b", codigoPartida: "3", orden: 2, parentId: null, tipo: "PARTIDA", parcial: "1000.00" },
      { id: "c", codigoPartida: "3.01", orden: 3, parentId: "b", tipo: "CAPITULO", parcial: "7.00" },
    ];

    const r = await renumerarPartidas(sesion, "obra");

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("3.02");
    expect(estado.escritos).toEqual([]);
  });

  /**
   * Un capitulo con importe propio no puede contar: la aplicacion lo anula en
   * las seis llamadas que reparten el costo directo. Si la red no lo anulara,
   * sumaria un arbol distinto del que se lee en pantalla.
   */
  it("renumera igual con un capitulo que lleva importe, sin contarlo", async () => {
    estado.existentes = [
      { id: "c2", codigoPartida: "2.0", orden: 10, parentId: null, tipo: "CAPITULO", parcial: "999.00" },
      { id: "p1", codigoPartida: "2.1", orden: 11, parentId: "c2", tipo: "PARTIDA", parcial: "400.00" },
    ];

    const r = await renumerarPartidas(sesion, "obra");

    expect(r.ok).toBe(true);
    expect(estado.escritos.filter((c) => !c.startsWith("#"))).toEqual(["1.0", "1.1"]);
  });

  /**
   * Un mapeo que apunta a una partida borrada se resucitaria sobre otra: el
   * avance de esa tarea empezaria a valorizar contra dinero que nunca cubrio.
   */
  it("se niega si el cronograma sigue enlazado a una partida que ya no existe", async () => {
    estado.existentes = [
      { id: "c2", codigoPartida: "2.0", orden: 10, parentId: null, tipo: "CAPITULO" },
      { id: "p1", codigoPartida: "2.1", orden: 11, parentId: "c2", tipo: "PARTIDA", parcial: "400.00" },
    ];
    estado.mapeos = [{ id: "m1", codigoPartida: "9.9" }];

    const r = await renumerarPartidas(sesion, "obra");

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("9.9");
    expect(estado.escritos).toEqual([]);
  });

  it("arrastra el mapeo cuando esta sano", async () => {
    estado.existentes = [
      { id: "c2", codigoPartida: "2.0", orden: 10, parentId: null, tipo: "CAPITULO" },
      { id: "p1", codigoPartida: "2.1", orden: 11, parentId: "c2", tipo: "PARTIDA", parcial: "400.00" },
    ];
    estado.mapeos = [{ id: "m1", codigoPartida: "2.1" }];

    const r = await renumerarPartidas(sesion, "obra");

    expect(r.ok).toBe(true);
  });
});


/**
 * Agrupar varias partidas en un solo precio cerrado.
 *
 * El dinero pasa de N filas a una: las elegidas quedan como ALCANCE, sin
 * cifras propias. Lo unico que no puede pasar es que ese dinero se cuente dos
 * veces, o que deje colgado un compromiso que apuntaba a una de ellas.
 */
describe("agrupar a suma alzada", () => {
  function capituloConDos() {
    estado.existentes = [
      {
        id: "cap",
        codigoPartida: "3.0",
        orden: 10,
        parentId: null,
        tipo: "CAPITULO",
        nivel: 0,
        descripcion: "INSTALACIONES",
      },
      {
        id: "a",
        codigoPartida: "3.1",
        orden: 11,
        parentId: "cap",
        tipo: "PARTIDA",
        modalidad: "PRECIOS_UNITARIOS",
        nivel: 1,
        descripcion: "Tuberia",
        parcial: "1200.00",
      },
      {
        id: "b",
        codigoPartida: "3.2",
        orden: 12,
        parentId: "cap",
        tipo: "PARTIDA",
        modalidad: "PRECIOS_UNITARIOS",
        nivel: 1,
        descripcion: "Accesorios",
        parcial: "800.50",
      },
    ];
  }

  const grupo = { partidaIds: ["a", "b"], descripcion: "Instalacion completa" };

  it("crea la partida con la suma y vacia las agrupadas", async () => {
    capituloConDos();

    const r = await agruparEnSumaAlzada(sesion, "obra", grupo);

    expect(r.ok).toBe(true);
    expect(r.ok === true && r.datos.suma).toBe("2000.50");
    expect(r.ok === true && r.datos.importe).toBe("2000.50");
    // Nace dentro del mismo capitulo, con el siguiente codigo libre.
    expect(estado.creada?.["codigoPartida"]).toBe("3.3");
    expect(estado.creada?.["modalidad"]).toBe("SUMA_ALZADA");
    expect(estado.creada?.["parcial"]).toBe("2000.50");

    // Y las elegidas se quedan SIN cifras: es lo que impide contarlas dos
    // veces, porque `aportantes` solo cuenta a quien tiene importe.
    const vaciado = estado.vaciadas.find((d) => "modalidad" in d);
    expect(vaciado).toMatchObject({
      modalidad: "ALCANCE",
      parcial: null,
      metrado: null,
      precioUnitario: null,
    });
  });

  it("acepta un importe pactado distinto de la suma, y lo distingue", async () => {
    capituloConDos();

    const r = await agruparEnSumaAlzada(sesion, "obra", {
      ...grupo,
      importe: "1900",
    });

    expect(r.ok).toBe(true);
    expect(r.ok === true && r.datos.importe).toBe("1900.00");
    // La suma se devuelve aparte para que la pantalla pueda decir cuanto
    // entro o salio del presupuesto.
    expect(r.ok === true && r.datos.suma).toBe("2000.50");
  });

  it("se niega con partidas de capitulos distintos", async () => {
    capituloConDos();
    estado.existentes.push({
      id: "otra",
      codigoPartida: "4.1",
      orden: 20,
      parentId: "cap2",
      tipo: "PARTIDA",
      modalidad: "PRECIOS_UNITARIOS",
      nivel: 1,
      descripcion: "De otro capitulo",
      parcial: "50.00",
    });

    const r = await agruparEnSumaAlzada(sesion, "obra", {
      ...grupo,
      partidaIds: ["a", "otra"],
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("otro capitulo");
    expect(estado.creada).toBeNull();
  });

  /**
   * La unica via por la que agrupar podria INFLAR el presupuesto: si una
   * elegida tiene hijas costeadas, vaciarla no vacia su dinero —lo siguen
   * aportando ellas— y la partida nueva lo sumaria otra vez.
   */
  it("se niega si alguna elegida tiene partidas dentro", async () => {
    capituloConDos();
    estado.existentes.push({
      id: "hija",
      codigoPartida: "3.1.1",
      orden: 13,
      parentId: "a",
      tipo: "PARTIDA",
      modalidad: "PRECIOS_UNITARIOS",
      nivel: 2,
      descripcion: "Dentro de la 3.1",
      parcial: "300.00",
    });

    const r = await agruparEnSumaAlzada(sesion, "obra", grupo);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("tiene partidas dentro");
    expect(estado.creada).toBeNull();
  });

  it("se niega si alguna esta enlazada con el cronograma", async () => {
    capituloConDos();
    estado.sujeciones = { mapeo: 1 };

    const r = await agruparEnSumaAlzada(sesion, "obra", grupo);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("cronograma");
    expect(estado.creada).toBeNull();
  });

  it("se niega si alguna tiene una orden de compra imputada", async () => {
    capituloConDos();
    estado.sujeciones = { orden: 1 };

    const r = await agruparEnSumaAlzada(sesion, "obra", grupo);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("orden de compra");
  });

  it("se niega con una revision viva", async () => {
    capituloConDos();
    estado.revision = { version: 1, aprobadaAt: new Date() };

    const r = await agruparEnSumaAlzada(sesion, "obra", grupo);

    expect(r.ok).toBe(false);
    expect(estado.creada).toBeNull();
  });

  it("se niega con menos de dos partidas", async () => {
    capituloConDos();

    const r = await agruparEnSumaAlzada(sesion, "obra", {
      ...grupo,
      partidaIds: ["a"],
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("al menos dos");
  });

  it("se niega si alguna ya es alcance de otra", async () => {
    capituloConDos();
    estado.existentes[1]!.modalidad = "ALCANCE";

    const r = await agruparEnSumaAlzada(sesion, "obra", grupo);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("ya es alcance");
  });
});


/**
 * El agujero que destapo la revision adversaria, y que tumbo la premisa.
 *
 * La funcion razonaba: «no se toca ni un codigo, luego el reparto no cambia».
 * Falso: no se MODIFICA ninguno, pero se CREA uno, y crear un codigo cambia de
 * quien cuelgan las filas que ya estaban.
 */
describe("agrupar no puede hacer desaparecer el importe que acaba de cerrar", () => {
  /**
   * Un capitulo "3.0" con "3.1", "3.2" y una huerfana "3.3.1".
   *
   * La huerfana no es rebuscada: es lo que deja el importador cuando el Excel
   * trae las hijas sin su cabecera —"en CRIOCORD estan 11.11.02 a 11.11.19
   * pero no la cabecera 11.11", dice `jerarquia-partidas`—. Su `parentId`
   * apunta al capitulo porque `codigoPadre` sube hasta encontrarlo, asi que
   * los dos arboles COINCIDEN: el dato esta perfectamente sano.
   */
  function conHuerfana() {
    estado.existentes = [
      { id: "cap", codigoPartida: "3.0", orden: 10, parentId: null, tipo: "CAPITULO", nivel: 0, descripcion: "INSTALACIONES" },
      { id: "a", codigoPartida: "3.1", orden: 11, parentId: "cap", tipo: "PARTIDA", modalidad: "PRECIOS_UNITARIOS", nivel: 1, descripcion: "Tuberia", parcial: "1200.00" },
      { id: "b", codigoPartida: "3.2", orden: 12, parentId: "cap", tipo: "PARTIDA", modalidad: "PRECIOS_UNITARIOS", nivel: 1, descripcion: "Accesorios", parcial: "800.50" },
      { id: "h", codigoPartida: "3.3.1", orden: 13, parentId: "cap", tipo: "PARTIDA", modalidad: "PRECIOS_UNITARIOS", nivel: 2, descripcion: "Sin cabecera 3.3", parcial: "500.00" },
    ];
  }

  it("se niega cuando el codigo nuevo quedaria por encima de una costeada", async () => {
    conHuerfana();

    const r = await agruparEnSumaAlzada(sesion, "obra", {
      partidaIds: ["a", "b"],
      descripcion: "Instalacion completa",
    });

    // A la nueva le tocaria "3.3", que dejaria a "3.3.1" por debajo: la nueva
    // quedaria CUBIERTA y sus 2.000,50 saldrian del costo directo.
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("3.3.1");
    expect(estado.creada).toBeNull();
  });

  /**
   * Y la comprobacion que de verdad protege, hecha con las funciones puras:
   * asi se ve el dinero evaporandose, sin depender de los mensajes.
   */
  it("la aritmetica que lo demuestra", () => {
    const antes = sumarHojas([
      { codigo: "3.0", parcial: null },
      { codigo: "3.1", parcial: "1200.00" },
      { codigo: "3.2", parcial: "800.50" },
      { codigo: "3.3.1", parcial: "500.00" },
    ]);

    const despuesSiSeHubieraHecho = sumarHojas([
      { codigo: "3.0", parcial: null },
      { codigo: "3.1", parcial: null },
      { codigo: "3.2", parcial: null },
      { codigo: "3.3", parcial: "2000.50" },
      { codigo: "3.3.1", parcial: "500.00" },
    ]);

    expect(antes).toBe("2500.50");
    // 2.000,50 desaparecidos: "3.3" queda cubierta por "3.3.1".
    expect(despuesSiSeHubieraHecho).toBe("500.00");
  });

  it("se niega si el capitulo elegido no es un capitulo", async () => {
    estado.existentes = [
      { id: "cap", codigoPartida: "3.1", orden: 10, parentId: null, tipo: "PARTIDA", modalidad: "SUMA_ALZADA", nivel: 0, descripcion: "Partida con importe", parcial: "9000.00" },
      { id: "a", codigoPartida: "3.1.1", orden: 11, parentId: "cap", tipo: "PARTIDA", modalidad: "PRECIOS_UNITARIOS", nivel: 1, descripcion: "Dentro", parcial: "100.00" },
      { id: "b", codigoPartida: "3.1.2", orden: 12, parentId: "cap", tipo: "PARTIDA", modalidad: "PRECIOS_UNITARIOS", nivel: 1, descripcion: "Dentro tambien", parcial: "200.00" },
    ];

    const r = await agruparEnSumaAlzada(sesion, "obra", {
      partidaIds: ["a", "b"],
      descripcion: "Agrupadas bajo una partida",
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("no es un ");
    expect(estado.creada).toBeNull();
  });

  it("se niega si alguna esta asignada a un proveedor", async () => {
    estado.existentes = [
      { id: "cap", codigoPartida: "3.0", orden: 10, parentId: null, tipo: "CAPITULO", nivel: 0, descripcion: "INSTALACIONES" },
      { id: "a", codigoPartida: "3.1", orden: 11, parentId: "cap", tipo: "PARTIDA", modalidad: "PRECIOS_UNITARIOS", nivel: 1, descripcion: "Tuberia", parcial: "1200.00" },
      { id: "b", codigoPartida: "3.2", orden: 12, parentId: "cap", tipo: "PARTIDA", modalidad: "PRECIOS_UNITARIOS", nivel: 1, descripcion: "Accesorios", parcial: "800.50" },
    ];
    estado.sujeciones = { proveedor: 1 };

    const r = await agruparEnSumaAlzada(sesion, "obra", {
      partidaIds: ["a", "b"],
      descripcion: "Instalacion completa",
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("proveedor");
  });
});


/**
 * Crear un codigo cambia de quien cuelgan las filas que YA estaban.
 *
 * Es el mismo agujero que se tapo al agrupar, en la puerta de al lado: la
 * jerarquia sale del TEXTO del codigo, asi que teclear "11.11" en una obra que
 * tiene "11.11.02".."11.11.19" no anade una fila mas, pone una cabecera encima
 * de dieciocho partidas costeadas.
 *
 * Los dos sentidos NO son lo mismo y por eso se tratan distinto.
 */
describe("crear un codigo que cambia el reparto", () => {
  function conHuerfanas() {
    estado.existentes = [
      { id: "cap", codigoPartida: "11", orden: 1, parentId: null, tipo: "CAPITULO" },
      { id: "h1", codigoPartida: "11.11.02", orden: 2, parentId: "cap", tipo: "PARTIDA", parcial: "300.00" },
      { id: "h2", codigoPartida: "11.11.03", orden: 3, parentId: "cap", tipo: "PARTIDA", parcial: "200.00" },
    ];
  }

  /**
   * El sentido que SIEMPRE es un error: el importe recien tecleado no cuenta.
   */
  it("rechaza el codigo que quedaria por encima de partidas costeadas", async () => {
    conHuerfanas();

    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "11.11",
      descripcion: "Cabecera con precio",
      tipo: "PARTIDA",
      modalidad: "SUMA_ALZADA",
      parcial: "5000",
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("11.11.02");
    expect(estado.creada).toBeNull();
  });

  /**
   * El sentido que SI es el comportamiento pactado: la nueva detalla a una que
   * ya estaba, y esa cede el importe. No se bloquea —romperia uso legitimo—,
   * se avisa, porque el total de la obra cambia sin que nadie lo pida.
   */
  it("crea y AVISA cuando la nueva hace que otra deje de contar", async () => {
    estado.existentes = [
      { id: "cap", codigoPartida: "7", orden: 1, parentId: null, tipo: "CAPITULO" },
      { id: "g", codigoPartida: "7.09.00", orden: 2, parentId: "cap", tipo: "PARTIDA", parcial: "779.10" },
    ];

    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "7.09.01",
      descripcion: "Detalle del grupo",
      tipo: "PARTIDA",
      modalidad: "SUMA_ALZADA",
      parcial: "500",
    });

    expect(r.ok).toBe(true);
    expect(estado.creada).not.toBeNull();
    // Se creo, y se cuenta lo que ha pasado con el dinero.
    expect(r.ok === true && r.datos.aviso).toContain("7.09.00");
    expect(r.ok === true && r.datos.aviso).toContain("779.10");
  });

  it("no avisa de nada cuando el reparto no cambia", async () => {
    estado.existentes = [
      { id: "cap", codigoPartida: "2.0", orden: 1, parentId: null, tipo: "CAPITULO" },
      { id: "p", codigoPartida: "2.1", orden: 2, parentId: "cap", tipo: "PARTIDA", parcial: "100.00" },
    ];

    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "2.2",
      descripcion: "Otra partida normal",
      tipo: "PARTIDA",
      modalidad: "PRECIOS_UNITARIOS",
      metrado: "2",
      precioUnitario: "50",
    });

    expect(r.ok).toBe(true);
    expect(r.ok === true && r.datos.aviso).toBeUndefined();
  });

  /**
   * Un capitulo no lleva importe, asi que crear uno encima de partidas
   * costeadas no esconde ningun precio: no se rechaza.
   */
  it("deja crear un capitulo por encima, que no lleva importe", async () => {
    conHuerfanas();

    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "11.11",
      descripcion: "CABECERA DEL GRUPO",
      tipo: "CAPITULO",
    });

    expect(r.ok).toBe(true);
  });
});


/**
 * El agujero que la revision adversaria encontro EN LA RED, no en el codigo
 * viejo.
 *
 * La primera version miraba solo quien DEJA de contar. El caso contrario se
 * colaba entero: crear un capitulo terminado en ceros —sin una sola cifra—
 * desvia la cadena de padres, porque `codigoPadre` prefiere la
 * hermana-cabecera al recorte del ultimo segmento. Una partida que estaba
 * cubierta se descubre y VUELVE a contar.
 */
describe("crear un capitulo puede descubrir dinero que estaba cubierto", () => {
  it("avisa cuando una partida cubierta vuelve a contar", async () => {
    estado.existentes = [
      { id: "cap", codigoPartida: "1", orden: 1, parentId: null, tipo: "CAPITULO" },
      { id: "a", codigoPartida: "1.3", orden: 2, parentId: "cap", tipo: "PARTIDA", parcial: "10496.50" },
      { id: "b", codigoPartida: "1.3.1", orden: 3, parentId: "a", tipo: "PARTIDA", parcial: "6000.00" },
    ];

    // Un capitulo SIN cifras: la rama de rechazo ni se evaluaba, porque exige
    // un importe positivo en la fila nueva.
    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "1.3.0",
      descripcion: "CABECERA DEL GRUPO",
      tipo: "CAPITULO",
    });

    expect(r.ok).toBe(true);
    // Antes contaba solo 1.3.1 (6000). Ahora 1.3 se descubre: 16496.50.
    expect(r.ok === true && r.datos.aviso).toContain("1.3");
    expect(r.ok === true && r.datos.aviso).toContain("6000.00");
    expect(r.ok === true && r.datos.aviso).toContain("16496.50");
  });

  /**
   * El mismo mecanismo por la otra convencion: la que documenta
   * `quienSeQuedaLaNumeracion`, con "4" y "4.0" peleandose la numeracion.
   */
  it("avisa tambien en la forma 4 / 4.0 de los presupuestos importados", async () => {
    estado.existentes = [
      { id: "a", codigoPartida: "4", orden: 1, parentId: null, tipo: "PARTIDA", parcial: "20000.00" },
      { id: "b", codigoPartida: "4.01", orden: 2, parentId: "a", tipo: "PARTIDA", parcial: "5000.00" },
    ];

    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "4.0",
      descripcion: "CAPITULO IV",
      tipo: "CAPITULO",
    });

    expect(r.ok).toBe(true);
    expect(r.ok === true && r.datos.aviso).toContain("25000.00");
  });

  it("sigue sin avisar cuando el costo directo solo sube lo que aporta la nueva", async () => {
    estado.existentes = [
      { id: "cap", codigoPartida: "2.0", orden: 1, parentId: null, tipo: "CAPITULO" },
      { id: "p", codigoPartida: "2.1", orden: 2, parentId: "cap", tipo: "PARTIDA", parcial: "100.00" },
    ];

    const r = await crearPartida(sesion, "obra", {
      codigoPartida: "2.2",
      descripcion: "Otra normal",
      tipo: "PARTIDA",
      modalidad: "PRECIOS_UNITARIOS",
      metrado: "2",
      precioUnitario: "50",
    });

    expect(r.ok).toBe(true);
    expect(r.ok === true && r.datos.aviso).toBeUndefined();
  });
});
