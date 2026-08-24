import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  siguientePaso,
  type EstadoAlta,
  type PuedeHacer,
  type AvisosVivos,
} from "./siguiente-paso";

/**
 * El anclaje de continuidad de la obra.
 *
 * Lo que hay que vigilar aqui no es el texto sino EL ORDEN y las puertas: un
 * paso que se cuela por delante de otro convierte el anclaje en ruido, y un
 * paso propuesto a quien no puede darlo es peor todavia —no se quita ni
 * haciendo la tarea—.
 */

const ALTA_COMPLETA: EstadoAlta = {
  presupuesto: true,
  meta: true,
  cronograma: true,
  equipo: true,
  lineaBase: true,
  equipoAsignable: true,
};

const TODO: PuedeHacer = {
  presupuesto: true,
  cronograma: true,
  equipo: true,
  lineaBase: true,
  lookahead: true,
  planSemanal: true,
  adendas: true,
  deducciones: true,
};

const NADA: PuedeHacer = {
  presupuesto: false,
  cronograma: false,
  equipo: false,
  lineaBase: false,
  lookahead: false,
  planSemanal: false,
  adendas: false,
  deducciones: false,
};

const EN_PAZ: AvisosVivos = {
  restriccionesVencidas: 0,
  semanasSinCerrar: 0,
  adendasPorFirmar: 0,
  deduccionesPorFirmar: 0,
};

describe("el paso siguiente de la obra", () => {
  it("con la obra al dia y sin nada vencido, no sugiere nada", () => {
    expect(siguientePaso(ALTA_COMPLETA, TODO, EN_PAZ)).toBeNull();
  });

  /**
   * EL ORDEN DEL ALTA, Y LO DIJO EL USUARIO MIRANDO LA PANTALLA: «¿cómo me va
   * a pedir que cargue el cronograma si aún no se ha congelado el presupuesto,
   * si aún no se ha terminado de definir?».
   *
   * Tenia razon, y GCM ademas se contradecia a si mismo: el riel de la obra
   * ordena Meta, Presupuesto, Revisiones y DESPUES Cronograma, y el manual da
   * por hecho que ese riel es el indice. Este anclaje pedia el cronograma
   * antes de congelar nada.
   *
   * Y no es estetica: la EDT del cronograma se GENERA desde las partidas.
   * Planificar sobre un presupuesto que todavia se toca es planificar sobre
   * algo que va a cambiar.
   */
  it("recorre el alta en el orden del riel: meta, contractual, congelar, cronograma, equipo", () => {
    const estado: EstadoAlta = {
      presupuesto: false,
      meta: false,
      cronograma: false,
      equipo: false,
      lineaBase: false,
      equipoAsignable: true,
    };
    const vistos: string[] = [];

    for (const paso of [
      "meta",
      "presupuesto",
      "lineaBase",
      "cronograma",
      "equipo",
    ] as const) {
      const siguiente = siguientePaso(estado, TODO, EN_PAZ);
      vistos.push(siguiente!.clave);
      estado[paso] = true;
    }

    expect(vistos).toEqual([
      "alta-presupuesto",
      "alta-contractual",
      "alta-linea-base",
      "alta-cronograma",
      "alta-equipo",
    ]);
    // Y al terminar el alta ya no queda nada que sugerir.
    expect(siguientePaso(estado, TODO, EN_PAZ)).toBeNull();
  });

  it("el cronograma NO se pide antes de congelar el presupuesto", () => {
    // El caso exacto de la captura: partidas cargadas, revision en BORRADOR,
    // y el anclaje pidiendo el cronograma.
    const sinCongelar: EstadoAlta = {
      ...ALTA_COMPLETA,
      lineaBase: false,
      cronograma: false,
    };

    expect(siguientePaso(sinCongelar, TODO, EN_PAZ)?.clave).toBe(
      "alta-linea-base",
    );
  });

  /**
   * EL AGUJERO QUE NO SE VEIA. La condicion era `!alta.presupuesto`, o sea que
   * la meta SOLO se pedia mientras no hubiera partidas. Quien cargaba el
   * contractual directamente -por Excel, que es como entra una obra nueva- se
   * quedaba con el presupuesto hecho y la meta sin hacer, y el anclaje no se
   * lo volvia a mencionar NUNCA.
   *
   * Sin meta no hay bolsa: ni margen, ni aviso cuando se acaba, ni deduccion
   * de costos propios que pedir. Media obra sin control economico, en
   * silencio.
   */
  it("pide la meta aunque el contractual ya exista", () => {
    const conContractualSinMeta: EstadoAlta = {
      ...ALTA_COMPLETA,
      meta: false,
    };

    const paso = siguientePaso(conContractualSinMeta, TODO, EN_PAZ);
    expect(paso?.clave).toBe("alta-presupuesto");
    expect(paso?.consecuencia).toContain("bolsa");
  });

  it("y entonces no ofrece generar un contractual que ya existe", () => {
    const conContractual: EstadoAlta = { ...ALTA_COMPLETA, meta: false };
    expect(siguientePaso(conContractual, TODO, EN_PAZ)?.despues).toBeUndefined();

    // Sin ninguno de los dos, el segundo tramo si se ofrece: quien llega nuevo
    // carga la meta y se queda sin saber que aun falta generar el contractual.
    const sinNinguno: EstadoAlta = {
      ...ALTA_COMPLETA,
      meta: false,
      presupuesto: false,
    };
    expect(siguientePaso(sinNinguno, TODO, EN_PAZ)?.despues?.camino).toBe(
      "/contractual",
    );
  });

  it("no propone un paso a quien no puede darlo", () => {
    const sinNada: EstadoAlta = {
      presupuesto: false,
      meta: false,
      cronograma: false,
      equipo: false,
      lineaBase: false,
      equipoAsignable: true,
    };

    expect(siguientePaso(sinNada, NADA, EN_PAZ)).toBeNull();
  });

  /**
   * Quien solo puede asignar equipo ve SU paso, no el primero de la lista.
   * Sin esto, el anclaje se quedaria mudo para media plantilla.
   */
  it("salta los pasos que no puede dar y ofrece el que si", () => {
    const sinNada: EstadoAlta = {
      presupuesto: false,
      meta: false,
      cronograma: false,
      equipo: false,
      lineaBase: false,
      equipoAsignable: true,
    };

    const paso = siguientePaso(
      sinNada,
      { ...NADA, equipo: true },
      EN_PAZ,
    );

    expect(paso?.clave).toBe("alta-equipo");
  });

  it("no propone asignar equipo si no hay a quien asignar", () => {
    // Empresa de solo administradores: nadie asignable, porque un ADMIN ya ve
    // todas las obras. Empujar a «asignar equipo» seria pedir un paso que la
    // pantalla no puede completar.
    const sinAsignables: EstadoAlta = {
      ...ALTA_COMPLETA,
      equipo: false,
      equipoAsignable: false,
    };
    expect(siguientePaso(sinAsignables, TODO, EN_PAZ)).toBeNull();
  });

  /**
   * LA ADENDA PENDIENTE TIENE A DOS PERSONAS PARADAS A LA VEZ, y ninguna se
   * entera. El residente no puede pagarle al contratista por encima de lo
   * firmado -el pago se rechaza-, y gerencia mira un comprometido que no
   * cuenta ese dinero. Todo por una firma que no esta en ninguna bandeja.
   */
  it("una adenda sin firmar manda sobre lo que solo esta vencido", () => {
    const paso = siguientePaso(ALTA_COMPLETA, TODO, {
      restriccionesVencidas: 5,
      semanasSinCerrar: 2,
      adendasPorFirmar: 1,
      deduccionesPorFirmar: 0,
    });

    expect(paso?.clave).toBe("adendas-por-firmar");
    expect(paso?.titulo).toBe("1 adicional espera tu firma");
    // Bloqueante y no sugerencia: no se puede aplazar con «Ahora no». Lo que
    // se aplaza deja de verse, y esto tiene a otro esperando.
    expect(paso?.gravedad).toBe("bloqueante");
  });

  /**
   * A quien no puede firmar no se le propone que firme: seria un aviso que no
   * se puede quitar haciendo la tarea. El residente que la registro la ve en
   * la insignia del menu de Proveedores, que informa sin pedir nada.
   */
  it("a quien no puede firmar no se le propone", () => {
    const soloResidente: PuedeHacer = { ...TODO, adendas: false };
    const paso = siguientePaso(ALTA_COMPLETA, soloResidente, {
      restriccionesVencidas: 1,
      semanasSinCerrar: 0,
      adendasPorFirmar: 3,
      deduccionesPorFirmar: 0,
    });

    // Pasa de largo al siguiente escalon en vez de callarse: lo vencido sigue
    // estando ahi.
    expect(paso?.clave).toBe("restricciones-vencidas");
  });

  it("el alta manda sobre la firma: sin presupuesto, primero el presupuesto", () => {
    const paso = siguientePaso(
      { ...ALTA_COMPLETA, presupuesto: false, meta: false },
      TODO,
      { ...EN_PAZ, adendasPorFirmar: 2 },
    );

    expect(paso?.clave).toBe("alta-presupuesto");
  });

  /**
   * LA DEDUCCION VA DETRAS DE LA ADENDA, y no al mismo nivel. La adenda tiene
   * a alguien BLOQUEADO -sin ella no se le puede pagar al contratista-; la
   * deduccion no bloquea nada, lo que hay es alguien esperando una respuesta.
   */
  it("la adenda manda sobre la deduccion", () => {
    const paso = siguientePaso(ALTA_COMPLETA, TODO, {
      ...EN_PAZ,
      adendasPorFirmar: 1,
      deduccionesPorFirmar: 3,
    });

    expect(paso?.clave).toBe("adendas-por-firmar");
  });

  it("sin adendas, la deduccion sale y se puede aplazar", () => {
    const paso = siguientePaso(ALTA_COMPLETA, TODO, {
      ...EN_PAZ,
      deduccionesPorFirmar: 1,
    });

    expect(paso?.clave).toBe("deducciones-por-firmar");
    expect(paso?.titulo).toBe("1 deducción espera tu firma");
    // Sugerencia y no bloqueante: se puede decir «Ahora no». Sigue en la
    // bandeja de gerencia y en la insignia de Meta, que es donde no se pierde.
    expect(paso?.gravedad).toBe("sugerencia");
  });

  it("las dos firmas son permisos distintos", () => {
    // Una empresa puede repartirlas en dos personas: a quien solo firma
    // deducciones no se le propone la adenda, y al reves.
    const soloDeducciones: PuedeHacer = { ...TODO, adendas: false };
    const paso = siguientePaso(ALTA_COMPLETA, soloDeducciones, {
      ...EN_PAZ,
      adendasPorFirmar: 2,
      deduccionesPorFirmar: 1,
    });

    expect(paso?.clave).toBe("deducciones-por-firmar");
  });

  it("con el alta hecha, recuerda lo que vencio", () => {
    const paso = siguientePaso(ALTA_COMPLETA, TODO, {
      restriccionesVencidas: 3,
      semanasSinCerrar: 1,
      adendasPorFirmar: 0,
      deduccionesPorFirmar: 0,
    });

    expect(paso?.clave).toBe("restricciones-vencidas");
    expect(paso?.titulo).toContain("3 restricciones");
  });

  it("singular y plural, que se leen en la cabecera de cada pantalla", () => {
    const una = siguientePaso(ALTA_COMPLETA, TODO, {
      restriccionesVencidas: 1,
      semanasSinCerrar: 0,
      adendasPorFirmar: 0,
      deduccionesPorFirmar: 0,
    });
    expect(una?.titulo).toBe("1 restricción con la fecha ya pasada");

    const semana = siguientePaso(ALTA_COMPLETA, TODO, {
      restriccionesVencidas: 0,
      semanasSinCerrar: 1,
      adendasPorFirmar: 0,
      deduccionesPorFirmar: 0,
    });
    expect(semana?.titulo).toBe("1 semana sin cerrar con el corte ya pasado");
  });

  /**
   * El anclaje se esconde cuando ya estas en la pantalla del paso, y eso lo
   * decide comparando `camino`. Uno vacio seria prefijo de TODAS las rutas de
   * la obra y el anclaje no aparecería nunca.
   */
  it("ningun paso tiene el camino vacio", () => {
    const casos: PasoPosible[] = [
      [{ ...ALTA_COMPLETA, presupuesto: false }, EN_PAZ],
      [{ ...ALTA_COMPLETA, cronograma: false }, EN_PAZ],
      [{ ...ALTA_COMPLETA, equipo: false }, EN_PAZ],
      [{ ...ALTA_COMPLETA, lineaBase: false }, EN_PAZ],
      [ALTA_COMPLETA, { ...EN_PAZ, adendasPorFirmar: 1 }],
      [ALTA_COMPLETA, { ...EN_PAZ, deduccionesPorFirmar: 1 }],
      [ALTA_COMPLETA, { ...EN_PAZ, restriccionesVencidas: 1 }],
      [ALTA_COMPLETA, { ...EN_PAZ, semanasSinCerrar: 1 }],
    ];

    for (const [alta, avisos] of casos) {
      const paso = siguientePaso(alta, TODO, avisos);
      expect(paso, JSON.stringify(alta)).not.toBeNull();
      expect(paso!.camino.startsWith("/"), paso!.clave).toBe(true);
    }
  });
});

type PasoPosible = [EstadoAlta, AvisosVivos];

/**
 * Que cada camino sugerido lleve a una pantalla que existe.
 *
 * `camino` es TEXTO. Si se borra una pantalla, ni el typecheck ni el resto
 * de las pruebas se enteran de que el boton quedo apuntando al vacio: el
 * anclaje sigue compilando y sigue pintandose igual de bien.
 *
 * Paso de verdad. Al retirar la importacion vieja del contractual se borro
 * /obras/[id]/importar, y el aviso "Cargar el presupuesto" siguio llevando
 * alli: en produccion el boton principal de una obra sin presupuesto abria
 * un "Aqui no hay nada".
 *
 * Se lee el fuente en vez de llamar a `siguientePaso` a proposito: las
 * ramas dependen de permisos y de avisos, y enumerarlas a mano invita a
 * olvidarse justo la que se acaba de anadir. Asi entra el fichero entero.
 */
describe("los caminos del anclaje existen como pantalla", () => {
  const RAIZ = join(process.cwd(), "src/app/(dashboard)/obras/[id]");

  const caminos = [
    ...readFileSync(join(process.cwd(), "src/lib/siguiente-paso.ts"), "utf8")
      .matchAll(/camino: "([^"]+)"/g),
  ]
    // El grupo existe siempre que el patron case: el filtro esta para que
    // lo sepa TypeScript, no porque pueda faltar.
    .flatMap((m) => (m[1] === undefined ? [] : [m[1]]));

  // Sin esto, el dia que cambie la forma de escribir `camino` el `it.each`
  // se quedaria sin casos y la bateria pasaria sin comprobar nada.
  it("encuentra caminos que revisar", () => {
    expect(caminos.length).toBeGreaterThan(4);
  });

  it.each(caminos)("%s tiene su pantalla", (camino) => {
    const pagina = join(RAIZ, camino, "page.tsx");
    expect(existsSync(pagina), `no existe ${pagina}`).toBe(true);
  });
});

/**
 * El presupuesto entra en DOS tramos.
 *
 * Primero el real, con la plantilla, y de el se genera el contractual. Antes
 * el aviso era un solo boton y llevaba a una pantalla que ya no existe; al
 * repuntarlo, con un solo tramo quien cargaba la meta veia desaparecer el
 * aviso y se quedaba sin saber que el contractual seguia sin existir.
 */
describe("el alta del presupuesto, en dos tramos", () => {
  const sinNada: EstadoAlta = { ...ALTA_COMPLETA, presupuesto: false, meta: false };
  const conMeta: EstadoAlta = { ...ALTA_COMPLETA, presupuesto: false, meta: true };

  it("sin nada, manda al real y ANUNCIA el segundo tramo", () => {
    const paso = siguientePaso(sinNada, TODO, EN_PAZ);

    expect(paso?.camino).toBe("/meta");
    expect(paso?.despues?.camino).toBe("/contractual");
  });

  it("con el real ya cargado, pide solo el contractual", () => {
    // Y sin `despues`: no queda ningun tramo por anunciar.
    const paso = siguientePaso(conMeta, TODO, EN_PAZ);

    expect(paso?.camino).toBe("/contractual");
    expect(paso?.despues).toBeUndefined();
  });

  it("a quien no puede cargarlo no se le propone ninguno de los dos", () => {
    expect(siguientePaso(sinNada, NADA, EN_PAZ)).toBeNull();
    expect(siguientePaso(conMeta, NADA, EN_PAZ)).toBeNull();
  });
});
