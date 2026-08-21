import { describe, it, expect } from "vitest";

import { planSincronizacion, type TareaExistente } from "./sincronizar-edt";
import type { FilaEdt } from "./edt-desde-presupuesto";

/**
 * La EDT sale del presupuesto, pero el presupuesto sigue vivo. Esto fija que
 * la reconciliacion no destruya nada, no toque lo tecleado a mano, y deje el
 * conjunto enlazado igual al de las partidas que llevan el dinero.
 */

function edt(...filas: [string, string, number, boolean][]): FilaEdt[] {
  return filas.map(([codigo, nombre, nivel, esResumen], i) => ({
    codigo,
    nombre,
    nivel,
    fila: i + 1,
    esResumen,
    inicio: null,
    fin: null,
  }));
}

function tarea(
  uid: number,
  codigo: string | null,
  nombre: string,
  nivel: number,
  fila: number,
  esResumen = false,
): TareaExistente {
  return { uid, codigo, nombre, nivel, fila, esResumen };
}

describe("planSincronizacion", () => {
  it("sin cambios en el presupuesto no propone nada", () => {
    const objetivo = edt(["1.0", "ESTRUCTURAS", 1, true], ["1.1", "Zapatas", 2, false]);
    const hay = [tarea(-1, "1.0", "ESTRUCTURAS", 1, 1, true), tarea(-2, "1.1", "Zapatas", 2, 2)];

    const plan = planSincronizacion(objetivo, hay);

    expect(plan.altas).toEqual([]);
    expect(plan.cambios).toEqual([]);
    expect(plan.sobrantes).toEqual([]);
    expect(plan.enlacesDeseados).toEqual(["1.1"]);
  });

  it("una partida nueva entra en su sitio y recoloca a las de detras", () => {
    const objetivo = edt(
      ["1.0", "ESTRUCTURAS", 1, true],
      ["1.1", "Zapatas", 2, false],
      ["1.2", "Columnas", 2, false],
    );
    // "1.2" no existe todavia, y "1.1" estaba en la fila 2.
    const hay = [tarea(-1, "1.0", "ESTRUCTURAS", 1, 1, true), tarea(-2, "1.1", "Zapatas", 2, 2)];

    const plan = planSincronizacion(objetivo, hay);

    expect(plan.altas.map((a) => [a.codigo, a.fila])).toEqual([["1.2", 3]]);
    expect(plan.cambios).toEqual([]);
  });

  it("una partida insertada en medio recoloca a las siguientes", () => {
    const objetivo = edt(
      ["1.0", "ESTRUCTURAS", 1, true],
      ["1.1", "Zapatas", 2, false],
      ["1.2", "Columnas", 2, false],
    );
    // "1.2" ya existia pero estaba antes que "1.1".
    const hay = [
      tarea(-1, "1.0", "ESTRUCTURAS", 1, 1, true),
      tarea(-3, "1.2", "Columnas", 2, 2),
      tarea(-2, "1.1", "Zapatas", 2, 3),
    ];

    const plan = planSincronizacion(objetivo, hay);

    expect(plan.altas).toEqual([]);
    expect(plan.cambios).toEqual([
      { uid: -2, fila: 2 },
      { uid: -3, fila: 3 },
    ]);
  });

  /**
   * El caso que decide el dinero. Una partida costeada gana subpartidas que
   * ahora lo cubren: pasa de paquete a capitulo, deja de llevar importe y por
   * tanto deja de valorizar. Su enlace TIENE que desaparecer, o su avance y el
   * de sus hijas contarian dos veces el mismo dinero.
   */
  it("la partida que gana subpartidas deja de estar enlazada", () => {
    const objetivo = edt(
      ["4.0", "CAPITULO IV", 1, true],
      ["4.1", "Concreto en zapatas", 2, true],
      ["4.1.1", "Encofrado", 3, false],
      ["4.1.2", "Vaciado", 3, false],
    );
    // Antes "4.1" era hoja y llevaba el dinero.
    const hay = [
      tarea(-1, "4.0", "CAPITULO IV", 1, 1, true),
      tarea(-2, "4.1", "Concreto en zapatas", 2, 2, false),
    ];

    const plan = planSincronizacion(objetivo, hay);

    expect(plan.cambios).toContainEqual({ uid: -2, esResumen: true });
    expect(plan.enlacesDeseados).toEqual(["4.1.1", "4.1.2"]);
    expect(plan.enlacesDeseados).not.toContain("4.1");
  });

  it("y al reves: la que se queda sin subpartidas vuelve a llevar el dinero", () => {
    const objetivo = edt(["4.0", "CAPITULO IV", 1, true], ["4.1", "Concreto", 2, false]);
    const hay = [
      tarea(-1, "4.0", "CAPITULO IV", 1, 1, true),
      tarea(-2, "4.1", "Concreto", 2, 2, true),
    ];

    const plan = planSincronizacion(objetivo, hay);

    expect(plan.cambios).toContainEqual({ uid: -2, esResumen: false });
    expect(plan.enlacesDeseados).toEqual(["4.1"]);
  });

  it("el cambio de nombre de una partida llega a su tarea", () => {
    const objetivo = edt(["1.1", "Concreto f'c=280", 1, false]);
    const hay = [tarea(-1, "1.1", "Concreto f'c=210", 1, 1)];

    expect(planSincronizacion(objetivo, hay).cambios).toEqual([
      { uid: -1, nombre: "Concreto f'c=280" },
    ]);
  });

  /**
   * Regla 2: lo que se tecleo a mano no sale del presupuesto y no se toca.
   * Solo se corre al final para no partir la lectura de la EDT viva.
   */
  it("no borra ni reescribe lo tecleado a mano", () => {
    const objetivo = edt(["1.0", "ESTRUCTURAS", 1, true], ["1.1", "Zapatas", 2, false]);
    const hay = [
      tarea(-1, "1.0", "ESTRUCTURAS", 1, 1, true),
      tarea(-2, "1.1", "Zapatas", 2, 2),
      tarea(-9, null, "Movilizacion de equipos", 1, 3),
    ];

    const plan = planSincronizacion(objetivo, hay);

    expect(plan.sobrantes.map((s) => s.uid)).toEqual([-9]);
    // Ya estaba en la fila 3, que es la que le toca: no se toca.
    expect(plan.cambios).toEqual([]);
  });

  /**
   * NO SE BORRA NADA. Una tarea cuya partida ya no esta se informa, no se
   * destruye: lleva colgados avance, enlaces, lookahead y fotos, todos
   * anclados al uid sin clave ajena.
   */
  it("la tarea cuya partida ya no existe se informa, no se borra", () => {
    const objetivo = edt(["1.0", "ESTRUCTURAS", 1, true], ["1.1", "Zapatas", 2, false]);
    const hay = [
      tarea(-1, "1.0", "ESTRUCTURAS", 1, 1, true),
      tarea(-2, "1.1", "Zapatas", 2, 2),
      tarea(-3, "1.9", "Partida que se borro", 2, 3),
    ];

    const plan = planSincronizacion(objetivo, hay);

    expect(plan.sobrantes.map((s) => s.codigo)).toEqual(["1.9"]);
    expect(plan.enlacesDeseados).not.toContain("1.9");
  });

  it("una obra sin cronograma todavia es todo altas", () => {
    const objetivo = edt(["1.0", "ESTRUCTURAS", 1, true], ["1.1", "Zapatas", 2, false]);

    const plan = planSincronizacion(objetivo, []);

    expect(plan.altas.map((a) => a.codigo)).toEqual(["1.0", "1.1"]);
    expect(plan.cambios).toEqual([]);
    expect(plan.sobrantes).toEqual([]);
  });

  it("las filas quedan contiguas y sin repetir", () => {
    const objetivo = edt(
      ["1.0", "ESTRUCTURAS", 1, true],
      ["1.1", "Zapatas", 2, false],
      ["1.2", "Columnas", 2, false],
    );
    const hay = [
      tarea(-1, "1.0", "ESTRUCTURAS", 1, 5, true),
      tarea(-2, "1.1", "Zapatas", 2, 9),
      tarea(-9, null, "Movilizacion", 1, 2),
    ];

    const plan = planSincronizacion(objetivo, hay);

    const finales = [
      ...plan.altas.map((a) => a.fila),
      ...plan.cambios.filter((c) => c.fila !== undefined).map((c) => c.fila!),
      // La que no cambia conserva la suya.
    ];
    expect(new Set(finales).size).toBe(finales.length);
    expect([...finales].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });
});

/**
 * EL BLOQUE DE SOBRANTES NO PUEDE TOCAR A LA EDT.
 *
 * Lo encontro una prueba contra la base real, no el razonamiento: al anadir
 * una partida al capitulo, la ultima fila de la EDT salio marcada como
 * RESUMEN. El culpable era el bloque de detras: una subpartida sobrante
 * conservaba su nivel 3 y, al quedar justo despues de una partida de nivel 2,
 * la convertia en resumen por orden de documento. Y esa partida llevaba
 * dinero y estaba enlazada: una partida costeada marcada como resumen queda
 * fuera de la valorizacion en nueve sitios, sin dar ningun error.
 */
describe("el bloque de sobrantes no se traga la ultima fila de la EDT", () => {
  it("la sobrante profunda sube a raiz y deja en paz a la de delante", () => {
    const objetivo = edt(
      ["2.0", "INSTALACIONES", 1, true],
      ["2.3", "Pozo a tierra", 2, false],
      ["2.4", "Tablero adicional", 2, false],
    );
    // "2.3.1" fue subpartida de "2.3" y ya no esta en el presupuesto.
    const hay = [
      tarea(-1, "2.0", "INSTALACIONES", 1, 1, true),
      tarea(-2, "2.3", "Pozo a tierra", 2, 2),
      tarea(-3, "2.3.1", "Excavacion", 3, 3),
    ];

    const plan = planSincronizacion(objetivo, hay);

    // Sube a raiz: si se quedara en 3, la fila anterior —"2.4", que lleva
    // dinero— pasaria a resumen y se caeria de la valorizacion.
    expect(plan.cambios).toContainEqual({ uid: -3, fila: 4, nivel: 1 });

    // Y la comprobacion de verdad: reconstruido el documento final, ninguna
    // fila de la EDT queda con una siguiente que cuelgue mas adentro.
    const finales = [
      ...objetivo.map((f) => ({ fila: f.fila, nivel: f.nivel, deLaEdt: true })),
      { fila: 4, nivel: 1, deLaEdt: false },
    ].sort((a, b) => a.fila - b.fila);

    const ultimaDeLaEdt = finales.find((f) => f.fila === objetivo.length)!;
    const primeraSuelta = finales.find((f) => f.fila === objetivo.length + 1)!;
    expect(primeraSuelta.nivel).toBeLessThanOrEqual(ultimaDeLaEdt.nivel);
  });

  it("varias sobrantes conservan entre ellas quien colgaba de quien", () => {
    const objetivo = edt(["1.0", "ESTRUCTURAS", 1, true], ["1.1", "Zapatas", 2, false]);
    const hay = [
      tarea(-1, "1.0", "ESTRUCTURAS", 1, 1, true),
      tarea(-2, "1.1", "Zapatas", 2, 2),
      tarea(-7, "9.1", "Madre que se fue", 2, 3),
      tarea(-8, "9.1.1", "Hija que se fue", 3, 4),
    ];

    const plan = planSincronizacion(objetivo, hay);

    // El salto es el mismo para las dos: 2 -> 1 y 3 -> 2. Las filas ya eran
    // las que les tocaban, asi que solo cambia el nivel.
    expect(plan.cambios).toContainEqual({ uid: -7, nivel: 1 });
    expect(plan.cambios).toContainEqual({ uid: -8, nivel: 2 });
  });

  it("lo tecleado a mano que ya estaba a raiz no se toca", () => {
    const objetivo = edt(["1.0", "ESTRUCTURAS", 1, true], ["1.1", "Zapatas", 2, false]);
    const hay = [
      tarea(-1, "1.0", "ESTRUCTURAS", 1, 1, true),
      tarea(-2, "1.1", "Zapatas", 2, 2),
      tarea(-9, null, "Movilizacion", 1, 3),
    ];

    expect(planSincronizacion(objetivo, hay).cambios).toEqual([]);
  });
});

/**
 * LOS HITOS ANCLADOS.
 *
 * Un hito es un acontecimiento —«fin de estructuras»—, no trabajo. Se ancla a
 * una partida para no irse al final del documento cada vez que el presupuesto
 * cambia, y su sitio es DETRAS DE TODA la rama de esa partida: colarlo en la
 * fila siguiente le robaria las hijas al capitulo, porque en un cronograma la
 * jerarquia sale del nivel mas el orden del documento.
 */
describe("los hitos anclados a una partida", () => {
  const OBRA = edt(
    ["1.0", "ESTRUCTURAS", 1, true],
    ["1.1", "Zapatas", 2, false],
    ["1.2", "Columnas", 2, false],
    ["2.0", "INSTALACIONES", 1, true],
    ["2.1", "Pozo a tierra", 2, false],
  );

  it("anclado a un capitulo, va DETRAS de toda su rama y a su mismo nivel", () => {
    const hay = [
      tarea(-1, "1.0", "ESTRUCTURAS", 1, 1, true),
      tarea(-2, "1.1", "Zapatas", 2, 2),
      tarea(-3, "1.2", "Columnas", 2, 3),
      tarea(-4, "2.0", "INSTALACIONES", 1, 4, true),
      tarea(-5, "2.1", "Pozo a tierra", 2, 5),
      tarea(-90, null, "Fin de estructuras", 1, 6),
    ];

    const plan = planSincronizacion(OBRA, hay, [{ uid: -90, anclaCodigo: "1.0" }]);

    // Detras de 1.2, que es la ultima de la rama de 1.0. El nivel ya era 1
    // —el del capitulo— y por eso no aparece: el plan solo trae lo que cambia.
    expect(plan.cambios).toContainEqual({ uid: -90, fila: 4 });

    // Y las de detras se corren para dejarle sitio.
    expect(plan.cambios).toContainEqual({ uid: -4, fila: 5 });
    expect(plan.cambios).toContainEqual({ uid: -5, fila: 6 });

    // No es una sobrante: tiene su sitio en el documento.
    expect(plan.sobrantes.map((s) => s.uid)).not.toContain(-90);
  });

  /**
   * La comprobacion que de verdad importa: el capitulo NO puede dejar de ser
   * resumen. Si el hito se colara justo detras de «1.0» al mismo nivel, sus
   * partidas pasarian a colgar del hito.
   */
  it("el capitulo conserva sus partidas dentro", () => {
    const hay = [
      tarea(-1, "1.0", "ESTRUCTURAS", 1, 1, true),
      tarea(-2, "1.1", "Zapatas", 2, 2),
      tarea(-3, "1.2", "Columnas", 2, 3),
      tarea(-4, "2.0", "INSTALACIONES", 1, 4, true),
      tarea(-5, "2.1", "Pozo a tierra", 2, 5),
      tarea(-90, null, "Fin de estructuras", 1, 6),
    ];

    const plan = planSincronizacion(OBRA, hay, [{ uid: -90, anclaCodigo: "1.0" }]);
    const filaFinal = new Map<number, number>();
    const nivelFinal = new Map<number, number>();
    for (const t of hay) {
      filaFinal.set(t.uid, t.fila);
      nivelFinal.set(t.uid, t.nivel);
    }
    for (const c of plan.cambios) {
      if (c.fila !== undefined) filaFinal.set(c.uid, c.fila);
      if (c.nivel !== undefined) nivelFinal.set(c.uid, c.nivel);
    }

    const orden = [...filaFinal.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([uid]) => ({ uid, nivel: nivelFinal.get(uid)! }));

    // 1.0 sigue teniendo a 1.1 y 1.2 colgando: la siguiente cuelga mas adentro.
    expect(orden.map((o) => o.uid)).toEqual([-1, -2, -3, -90, -4, -5]);
    expect(orden[1]!.nivel).toBeGreaterThan(orden[0]!.nivel);
    // Y el hito no se lleva nada dentro: el que le sigue no cuelga de el.
    expect(orden[4]!.nivel).toBeLessThanOrEqual(orden[3]!.nivel);
  });

  it("anclado a una partida hoja, va justo detras y como hermana", () => {
    const hay = [
      tarea(-1, "1.0", "ESTRUCTURAS", 1, 1, true),
      tarea(-2, "1.1", "Zapatas", 2, 2),
      tarea(-3, "1.2", "Columnas", 2, 3),
      tarea(-4, "2.0", "INSTALACIONES", 1, 4, true),
      tarea(-5, "2.1", "Pozo a tierra", 2, 5),
      tarea(-91, null, "Zapatas recibidas", 2, 6),
    ];

    const plan = planSincronizacion(OBRA, hay, [{ uid: -91, anclaCodigo: "1.1" }]);

    // Detras de 1.1 y a su mismo nivel: hermana, no hija. Si fuera nivel 3,
    // convertiria a 1.1 en resumen y esa partida lleva dinero. El nivel 2 ya
    // lo tenia, asi que solo cambia la fila.
    expect(plan.cambios).toContainEqual({ uid: -91, fila: 3 });
  });

  it("si su ancla desaparece del presupuesto, el hito cae al final", () => {
    const hay = [
      tarea(-1, "1.0", "ESTRUCTURAS", 1, 1, true),
      tarea(-2, "1.1", "Zapatas", 2, 2),
      tarea(-3, "1.2", "Columnas", 2, 3),
      tarea(-4, "2.0", "INSTALACIONES", 1, 4, true),
      tarea(-5, "2.1", "Pozo a tierra", 2, 5),
      tarea(-92, null, "Hito huerfano", 2, 6),
    ];

    const plan = planSincronizacion(OBRA, hay, [{ uid: -92, anclaCodigo: "9.9" }]);

    expect(plan.sobrantes.map((s) => s.uid)).toContain(-92);
    // Ya estaba en la fila 6, la ultima; solo sube a raiz para no tragarse la
    // fila de delante.
    expect(plan.cambios).toContainEqual({ uid: -92, nivel: 1 });
  });

  it("un hito sin ancla vive al final, sin estorbar", () => {
    const hay = [
      tarea(-1, "1.0", "ESTRUCTURAS", 1, 1, true),
      tarea(-2, "1.1", "Zapatas", 2, 2),
      tarea(-3, "1.2", "Columnas", 2, 3),
      tarea(-4, "2.0", "INSTALACIONES", 1, 4, true),
      tarea(-5, "2.1", "Pozo a tierra", 2, 5),
      tarea(-93, null, "Entrega del terreno", 1, 6),
    ];

    const plan = planSincronizacion(OBRA, hay, [{ uid: -93, anclaCodigo: null }]);

    expect(plan.sobrantes.map((s) => s.uid)).toContain(-93);
    // Ya estaba en su sitio y a raiz: no se toca.
    expect(plan.cambios).toEqual([]);
  });

  it("dos hitos en el mismo ancla conservan su orden", () => {
    const hay = [
      tarea(-1, "1.0", "ESTRUCTURAS", 1, 1, true),
      tarea(-2, "1.1", "Zapatas", 2, 2),
      tarea(-3, "1.2", "Columnas", 2, 3),
      tarea(-4, "2.0", "INSTALACIONES", 1, 4, true),
      tarea(-5, "2.1", "Pozo a tierra", 2, 5),
      tarea(-94, null, "Vaciado terminado", 1, 6),
      tarea(-95, null, "Acta firmada", 1, 7),
    ];

    const plan = planSincronizacion(OBRA, hay, [
      { uid: -94, anclaCodigo: "1.0" },
      { uid: -95, anclaCodigo: "1.0" },
    ]);

    expect(plan.cambios).toContainEqual({ uid: -94, fila: 4 });
    expect(plan.cambios).toContainEqual({ uid: -95, fila: 5 });
  });
});


/**
 * LA CABECERA DE LA OBRA, QUE ACABABA SIENDO UNA TAREA.
 *
 * La plantilla oficial de cronograma encabeza el documento con la obra —nivel
 * 1, sin codigo— y el presupuesto no tiene esa fila. Antes caia en sobrantes,
 * se iba al final y alli, sin nada colgando por debajo, la regla del orden la
 * degradaba a hoja: salia en el Lookahead, se podia comprometer en el Plan
 * Semanal y entraba en el denominador del avance ponderado. Paso en una obra
 * real.
 */
describe("planSincronizacion: la cabecera de la obra", () => {
  const OBJETIVO = edt(["1.0", "ESTRUCTURAS", 1, true], ["1.1", "Zapatas", 2, false]);

  it("hunde la EDT un nivel para que la cabecera siga conteniendo todo", () => {
    const hay = [
      tarea(-1, null, "EDIFICIO LOS ROBLES", 1, 1, true),
      tarea(-2, "1.0", "ESTRUCTURAS", 2, 2, true),
      tarea(-3, "1.1", "Zapatas", 3, 3),
    ];

    const plan = planSincronizacion(OBJETIVO, hay);

    // Todo sigue en su sitio: la EDT ya venia hundida bajo la cabecera.
    expect(plan.cambios).toEqual([]);
    expect(plan.altas).toEqual([]);
    // Y NO es un sobrante, que es de donde venia todo el mal.
    expect(plan.sobrantes).toEqual([]);
  });

  it("no la destierra al final ni la convierte en hoja", () => {
    // Como queda un cronograma recien importado, con la EDT a nivel 1 y 2.
    const hay = [
      tarea(-1, null, "EDIFICIO LOS ROBLES", 1, 1, true),
      tarea(-2, "1.0", "ESTRUCTURAS", 1, 2, true),
      tarea(-3, "1.1", "Zapatas", 2, 3),
    ];

    const plan = planSincronizacion(OBJETIVO, hay);

    expect(plan.sobrantes).toEqual([]);
    // La cabecera se queda en la fila 1; la EDT baja un nivel.
    expect(plan.cambios.find((c) => c.uid === -1)).toBeUndefined();
    expect(plan.cambios).toContainEqual({ uid: -2, nivel: 2 });
    expect(plan.cambios).toContainEqual({ uid: -3, nivel: 3 });
  });

  it("le devuelve la marca de resumen si llega mal puesta", () => {
    const hay = [
      // Degradada por una version anterior, pero todavia encabezando.
      tarea(-1, null, "EDIFICIO LOS ROBLES", 1, 1, false),
      tarea(-2, "1.0", "ESTRUCTURAS", 2, 2, true),
      tarea(-3, "1.1", "Zapatas", 3, 3),
    ];

    const plan = planSincronizacion(OBJETIVO, hay);

    expect(plan.cambios).toContainEqual({ uid: -1, esResumen: true });
  });

  /**
   * Una tarea escrita a mano en la raiz tambien es de nivel 1 y puede no
   * llevar codigo. Tomarla por cabecera le haria tragarse el cronograma.
   */
  it("una suelta de nivel 1 que NO encabeza sigue siendo sobrante", () => {
    const hay = [
      tarea(-2, "1.0", "ESTRUCTURAS", 1, 1, true),
      tarea(-3, "1.1", "Zapatas", 2, 2),
      tarea(-9, null, "Reunion de arranque", 1, 3),
    ];

    const plan = planSincronizacion(OBJETIVO, hay);

    expect(plan.sobrantes.map((s) => s.uid)).toEqual([-9]);
    // Y la EDT NO se hunde: sin cabecera, los capitulos son la raiz.
    expect(plan.cambios.filter((c) => c.nivel !== undefined)).toEqual([]);
  });

  it("un cronograma sin cabecera se comporta como siempre", () => {
    const hay = [
      tarea(-2, "1.0", "ESTRUCTURAS", 1, 1, true),
      tarea(-3, "1.1", "Zapatas", 2, 2),
    ];

    expect(planSincronizacion(OBJETIVO, hay).cambios).toEqual([]);
  });
});
