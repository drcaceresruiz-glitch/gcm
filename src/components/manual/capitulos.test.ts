import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CAPITULOS, capituloPorSlug } from "./capitulos";

/**
 * El indice del manual.
 *
 * Poca cosa que probar en un texto, pero lo que hay importa: un slug
 * repetido taparia un capitulo en silencio —`capituloPorSlug` devolveria
 * siempre el primero— y el enlace del indice llevaria a otro texto sin que
 * nada fallara.
 */
describe("el indice del manual", () => {
  it("no hay dos capitulos con el mismo slug", () => {
    const slugs = CAPITULOS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("cada capitulo dice su pregunta y para quien es", () => {
    for (const c of CAPITULOS) {
      expect(c.pregunta.length, c.slug).toBeGreaterThan(0);
      expect(c.paraQuien.length, c.slug).toBeGreaterThan(0);
      expect(c.resumen.length, c.slug).toBeGreaterThan(0);
    }
  });

  it("capituloPorSlug encuentra los que hay y calla con los que no", () => {
    expect(capituloPorSlug("dinero")?.titulo).toContain("encargos");
    expect(capituloPorSlug("no-existe")).toBeNull();
  });

  /**
   * `scripts/humo.ts` lleva "empezar" CABLEADO como valor del tramo
   * [capitulo]: es el unico capitulo que la prueba de humo abre de verdad. Si
   * se renombra o se retira, la ruta se seguiria listando y la pantalla del
   * capitulo dejaria de ejercitarse en silencio.
   */
  it("sigue existiendo el capitulo que abre la prueba de humo", () => {
    expect(capituloPorSlug("empezar")).not.toBeNull();
  });

  /**
   * La guia de campo va la SEGUNDA, detras de «empezar». El orden del indice
   * es el del trabajo real, y quien esta en obra tiene que tropezarse con su
   * capitulo antes que con el presupuesto o el cronograma.
   */
  it("la guia de campo va justo detras de empezar", () => {
    expect(CAPITULOS.map((c) => c.slug).slice(0, 2)).toEqual([
      "empezar",
      "en-obra",
    ]);
  });
});

/**
 * Que el manual siga contando el sistema que HAY.
 *
 * La doctrina del propio manual, en la cabecera de `capitulos.tsx`, dice que
 * «el menu de la obra ya es el indice del manual». Nadie lo comprobaba, y el
 * 20/08 se vio lo que cuesta: la propuesta al cliente existio como pantalla
 * del menu sin capitulo, y dos recorridos siguieron mandando a una pantalla
 * borrada mientras la bateria entera pasaba en verde. Un manual no se puede
 * probar entero -es prosa-, pero SI se puede probar esa promesa.
 *
 * Se lee el fuente del layout en vez de importarlo porque el riel se construye
 * con la sesion y los permisos delante: no hay lista estatica que importar. Es
 * la misma tecnica que el guardian de caminos de `siguiente-paso.test.ts`.
 */


/**
 * Que capitulo cuenta cada seccion del menu.
 *
 * `null` = esta seccion no tiene capitulo propio A PROPOSITO, y al lado va la
 * razon: un null sin explicar es una excusa, no una decision.
 *
 * Anadir una pantalla al menu obliga a pasar por aqui. Ese es el punto: la
 * pregunta «y esto donde se explica» deja de depender de que alguien se
 * acuerde.
 */
const CAPITULO_DE_LA_SECCION: Record<string, string | null> = {
  // Los rotulos de grupo del riel. No son pantallas, asi que no les toca
  // capitulo; van aqui igual para que anadir un grupo nuevo tambien obligue a
  // pasar por esta lista. «tablero» es las dos cosas -grupo y seccion- y le
  // basta con una entrada.
  plan: null,
  ejecucion: null,
  compras: null,
  investigacion: null,

  /*
   * Los datos crudos para una investigacion NO tienen capitulo, y no es un
   * olvido. El manual lo lee todo el mundo, y esta pantalla solo existe para
   * quien opera GCM: un capitulo sobre exportar la obra entera en CSV le
   * diria a cada residente que hay una puerta que no puede abrir. La pantalla
   * se explica a si misma, que es donde hace falta.
   */
  investigacionDatos: null,

  tablero: "indicadores",
  meta: "meta",
  presupuesto: "presupuesto",
  // Congelar la linea base es el ULTIMO PASO del recorrido del presupuesto,
  // no un tema aparte: se explica alli, donde se llega a el.
  revisiones: null,
  propuesta: "propuesta",
  cronograma: "cronograma",
  lookahead: "lookahead",
  planSemanal: "plan-semanal",
  avance: "parte-del-dia",
  notas: "notas",
  kanban: "kanban",
  galeria: "galeria",
  personal: "personal",
  // Asignar el equipo es un paso del ALTA, no del trabajo diario: vive en el
  // capitulo de empezar y en el anclaje de continuidad.
  equipo: null,
  movimientos: "movimientos",
  // Proveedores y ordenes son dos caras de lo mismo -a quien se le pide y que
  // se le pide-, y el capitulo las cuenta juntas.
  proveedores: "dinero",
  valorizaciones: "valorizaciones",
  ordenes: "dinero",
};

describe("el manual y el menu de la obra cuadran", () => {
  const layout = readFileSync(
    join(process.cwd(), "src/app/(dashboard)/obras/[id]/layout.tsx"),
    "utf8",
  );

  const claves = [...layout.matchAll(/clave: "([^"]+)"/g)].flatMap((m) =>
    m[1] === undefined ? [] : [m[1]],
  );

  const slugs = CAPITULOS.map((c) => c.slug);

  // Sin esto, el dia que cambie la forma de declarar una seccion el `it.each`
  // se queda sin casos y la bateria pasa sin comprobar nada.
  it("encuentra las secciones del riel", () => {
    expect(claves.length).toBeGreaterThan(10);
  });

  it.each([...new Set(claves)])(
    "la seccion %s dice en que capitulo se explica",
    (clave) => {
      expect(Object.keys(CAPITULO_DE_LA_SECCION)).toContain(clave);
    },
  );

  it("cada capitulo al que apunta una seccion existe de verdad", () => {
    // Renombrar o retirar un capitulo deja el mapa apuntando al vacio, y el
    // indice no avisa: `capituloPorSlug` devuelve null y ya.
    const apuntados = Object.values(CAPITULO_DE_LA_SECCION).filter(
      (s): s is string => s !== null,
    );

    for (const slug of apuntados) expect(slugs).toContain(slug);
  });

  it("no quedan exenciones de pantallas que ya no estan", () => {
    // Al reves que la anterior: al retirar una seccion del menu, su entrada
    // aqui se queda huerfana y nadie se entera.
    for (const clave of Object.keys(CAPITULO_DE_LA_SECCION)) {
      expect(claves).toContain(clave);
    }
  });
});
