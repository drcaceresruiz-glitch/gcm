import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Que ningun dato de una linea de meta se pierda por el camino.
 *
 * ESTA PRUEBA EXISTE PORQUE YA PASO DOS VECES, y las dos con el mismo sintoma:
 * ninguno. No hubo error, no hubo pantalla rota; simplemente el dato llegaba
 * del Excel, se copiaba en el mapeo y se caia al escribir, y la meta guardaba
 * una cifra creible y equivocada.
 *
 *   - El `porcentajeRecargo`: el importador lo leia y el mapeo de la accion no
 *     lo copiaba. Se descubrio tarde.
 *   - El `parcialCotizado`, el 28/08/2026: el importador lo calculaba, el
 *     mapeo lo copiaba, y `EntradaItemMeta` no lo declaraba. La meta guardaba
 *     el importe ya ajustado y, al cambiar un porcentaje desde la pantalla, el
 *     factor nuevo se encadenaba sobre el viejo.
 *
 * La cura de entonces fue declarar los campos OBLIGATORIOS para que `tsc`
 * señalara a quien los olvidara. Funciona para lo que ya esta declarado, y no
 * protege del caso que de verdad se repite: **anadir una columna al modelo y no
 * llevarla hasta la escritura**. De eso protege esto.
 *
 * Se lee el FUENTE en vez de importar los modulos porque lo que hay que
 * comparar es la forma del codigo -que campos se declaran y cuales se escriben-
 * y ninguna de las dos cosas es un valor en tiempo de ejecucion. Es la misma
 * tecnica que `respaldo-esquema.test.ts` y el guardian del manual.
 */

const raiz = join(process.cwd());
const schema = readFileSync(join(raiz, "prisma", "schema.prisma"), "utf8");
const metaService = readFileSync(join(raiz, "src", "services", "meta.service.ts"), "utf8");

/** Los campos de datos del modelo: sin id, sin claves, sin relaciones. */
function camposDelModelo(): string[] {
  const i = schema.indexOf("model PresupuestoMetaItem {");
  const j = schema.indexOf("\n}", i);
  const cuerpo = schema.slice(i, j);

  /*
   * Es campo de DATOS si no es una relacion, y una relacion se reconoce por su
   * tipo: el nombre de otro modelo. Un ENUM tambien empieza por mayuscula y SI
   * es un dato —`tipo` lo es—, asi que filtrar por la mayuscula a secas dejaba
   * fuera campos de verdad y la prueba se creia completa sin serlo.
   */
  const modelos = new Set(
    [...schema.matchAll(/^model\s+([A-Za-z0-9_]+)\s*\{/gm)].map((m) => m[1]!),
  );

  const campos: string[] = [];
  for (const linea of cuerpo.split("\n")) {
    const m = /^\s{2}([a-zA-Z][a-zA-Z0-9]*)\s+([A-Za-z0-9_]+)/.exec(linea);
    if (!m) continue;
    const [, nombre, tipo] = m;
    if (modelos.has(tipo!) || linea.includes("@relation")) continue;
    campos.push(nombre!);
  }
  return campos;
}

/**
 * Campos que NO viajan desde el Excel, con su razon.
 *
 * `null` no vale: una exencion sin explicar es una excusa. Anadir una columna
 * al modelo obliga a pasar por aqui, y ese es el punto: la pregunta «¿y esto
 * quien lo escribe?» deja de depender de que alguien se acuerde.
 */
const NO_VIENEN_DEL_EXCEL: Record<string, string> = {
  id: "lo pone la base",
  presupuestoMetaId: "la meta a la que pertenece; lo pone `crearMeta` al crearla",
  orden: "la posicion en el documento; la calcula `crearMeta` recorriendo las filas",
  tipo: "capitulo o partida; se decide al clasificar, no se copia",
  createdAt: "lo pone la base",
  updatedAt: "lo pone la base",
};

describe("una linea de meta no pierde datos por el camino", () => {
  it("todo campo del modelo se escribe, o esta declarado como que no viene del Excel", () => {
    const i = metaService.indexOf("export interface EntradaItemMeta");
    expect(i, "no se encontro EntradaItemMeta").toBeGreaterThan(-1);

    /*
     * La escritura: el `createMany` de las lineas.
     *
     * Se ancla en el nombre del modelo y no en una de sus claves: la primera
     * version de esta prueba busco `presupuestoMetaId: meta.id`, cogio otra
     * aparicion anterior del archivo y dio por perdidos siete campos que si
     * se escribian. El instrumento tambien miente.
     */
    const j = metaService.indexOf("presupuestoMetaItem.createMany");
    expect(j, "no se encontro la escritura de las lineas").toBeGreaterThan(-1);
    const escritura = metaService.slice(j, metaService.indexOf("});", j));

    const faltan: string[] = [];
    for (const campo of camposDelModelo()) {
      if (campo in NO_VIENEN_DEL_EXCEL) continue;
      // Se escribe si aparece como clave del objeto que se guarda.
      if (new RegExp(`\\b${campo}\\s*:`).test(escritura)) continue;
      faltan.push(campo);
    }

    expect(
      faltan,
      "Estos campos de `PresupuestoMetaItem` no se escriben al crear la meta " +
        "ni estan declarados en NO_VIENEN_DEL_EXCEL. Si el dato llega del " +
        "Excel, propagalo hasta `crearMeta`; si no llega, dilo ahi con su " +
        "razon. Ya se perdieron dos campos asi, y el sintoma no fue un error: " +
        "fue una cifra creible y equivocada.",
    ).toEqual([]);
  });

  it("no quedan exenciones de campos que ya no existen", () => {
    // Al retirar una columna, su exencion se queda huerfana y nadie se entera.
    const delModelo = new Set([...camposDelModelo(), "createdAt", "updatedAt"]);

    for (const campo of Object.keys(NO_VIENEN_DEL_EXCEL)) {
      expect(delModelo.has(campo), `sobra la exencion de ${campo}`).toBe(true);
    }
  });

  it("cada exencion dice POR QUE, que es lo que la distingue de un olvido", () => {
    for (const [campo, razon] of Object.entries(NO_VIENEN_DEL_EXCEL)) {
      expect(razon.length, `la exencion de ${campo} no explica nada`).toBeGreaterThan(10);
    }
  });
});
