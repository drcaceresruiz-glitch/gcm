import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * NINGUN `select` NOMBRA UN CAMPO QUE NO EXISTE.
 *
 * Es el fallo que mas caro ha salido en este proyecto y el unico que se cuela
 * por todas las redes a la vez. El 18/08 hubo tres el mismo dia —`Project.nombre`
 * en vez de `nombreObra`, `Cronograma.vigente` que no existe— y uno llevaba
 * veinticuatro horas tumbando una pantalla en produccion.
 *
 * POR QUE NO LO VE NADA DE LO QUE YA HAY:
 *
 * - **`tsc` no lo ve**: el `select` de Prisma en este proyecto no rechaza
 *   claves desconocidas (comprobado con un experimento, ver `scripts/humo.ts`).
 * - **Las pruebas de servicio tampoco**: Prisma va doblado, y un doble
 *   devuelve lo que le pidan sin mirar el `select`.
 * - **La prueba de humo solo a medias**: abre PAGINAS con GET. Todo lo que se
 *   escribe desde un formulario —server actions— queda fuera, y ahi viven las
 *   consultas mas delicadas.
 *
 * Prisma solo valida la consulta cuando la EJECUTA. Esta prueba la valida sin
 * ejecutarla: lee el codigo como texto y compara cada clave contra
 * `schema.prisma`.
 *
 * ES TOSCA A PROPOSITO, como `dinero-desde-la-base` y `empresa-congelada`. No
 * es un analizador: mira las claves de PRIMER NIVEL de cada `select` cuyo
 * modelo puede resolver, y **se calla en cuanto duda**. Prefiere dejar pasar
 * algo antes que dar un falso positivo, porque una prueba que grita en falso
 * acaba desactivada.
 */

const RAIZ = join(process.cwd(), "src");
const ESQUEMA = join(process.cwd(), "prisma", "schema.prisma");

/**
 * Modelo (por su nombre de delegado, en minuscula inicial) -> sus campos.
 *
 * Se lee del esquema y no de una lista escrita a mano: un campo nuevo entra en
 * la vigilancia el dia que se crea. Cuentan como campos tanto las columnas
 * como las relaciones, porque las dos son claves validas de un `select`.
 */
function camposPorModelo(): Map<string, Set<string>> {
  const texto = readFileSync(ESQUEMA, "utf8");
  const modelos = new Map<string, Set<string>>();

  let actual: Set<string> | null = null;
  for (const linea of texto.split("\n")) {
    const abre = /^model\s+(\w+)\s*\{/.exec(linea);
    if (abre) {
      actual = new Set<string>();
      // `WbsItem` -> `wbsItem`, que es como se llama el delegado de Prisma.
      const delegado = abre[1]![0]!.toLowerCase() + abre[1]!.slice(1);
      modelos.set(delegado, actual);
      continue;
    }
    if (linea.startsWith("}")) {
      actual = null;
      continue;
    }
    if (!actual) continue;

    // Dos espacios exactos y un nombre: asi indenta Prisma los campos. Se
    // salta lo que empieza por `@@` (indices) y los comentarios.
    const campo = /^ {2}(\w+)\s+\S/.exec(linea);
    if (campo) actual.add(campo[1]!);
  }

  return modelos;
}

/// `_count` y compania: claves de Prisma que no son campos del modelo.
const CLAVES_DE_PRISMA = new Set(["_count", "_sum", "_avg", "_min", "_max"]);

/** Los `.ts`/`.tsx` de `src`, menos las propias pruebas. */
function ficheros(dir: string, salida: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "generated") ficheros(ruta, salida);
    } else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) {
      salida.push(ruta);
    }
  }
  return salida;
}

/** El bloque `{...}` que empieza en `abre`, equilibrando llaves. */
function bloque(texto: string, abre: number): string | null {
  let nivel = 0;
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === "{") nivel++;
    else if (texto[i] === "}") {
      nivel--;
      if (nivel === 0) return texto.slice(abre + 1, i);
    }
  }
  return null;
}

/** Las claves de PRIMER nivel de un bloque de objeto. */
function clavesDePrimerNivel(cuerpo: string): string[] {
  const claves: string[] = [];
  let nivel = 0;
  let i = 0;

  while (i < cuerpo.length) {
    const c = cuerpo[i]!;
    if (c === "{" || c === "[" || c === "(") nivel++;
    else if (c === "}" || c === "]" || c === ")") nivel--;
    else if (nivel === 0) {
      const m = /^(\w+)\s*:/.exec(cuerpo.slice(i));
      // Solo si empieza clave: detras de un separador o al principio.
      const antes = cuerpo.slice(0, i).trimEnd();
      if (m && (antes === "" || antes.endsWith(",") || antes.endsWith("{"))) {
        claves.push(m[1]!);
        i += m[0].length;
        continue;
      }
    }
    i++;
  }

  return claves;
}

interface Hallazgo {
  fichero: string;
  modelo: string;
  campo: string;
}

/**
 * Cada `prisma.X.metodo({ ... select: { ... } })` con una clave desconocida.
 *
 * Se resuelve el modelo por el nombre del delegado (`prisma.wbsItem.` o
 * `tx.wbsItem.`). Si el modelo no esta en el esquema —una variable que se
 * llama igual, un delegado dinamico— se ignora: aqui no se adivina.
 */
function selectsSospechosos(): Hallazgo[] {
  const modelos = camposPorModelo();
  return ficheros(RAIZ).flatMap((ruta) =>
    enUnTexto(readFileSync(ruta, "utf8"), modelos, relative(process.cwd(), ruta)),
  );
}

/**
 * El lector, sobre UN texto.
 *
 * Separado de los ficheros para poder darle de comer un caso malo escrito a
 * mano: sin eso, la prueba de arriba pasaria igual si el lector estuviera roto
 * y no encontrara nunca nada.
 */
function enUnTexto(
  texto: string,
  modelos: Map<string, Set<string>>,
  fichero: string,
): Hallazgo[] {
  const malos: Hallazgo[] = [];

  {
    const llamada = /\b(?:prisma|tx)\.(\w+)\.\w+\(/g;

    for (const m of texto.matchAll(llamada)) {
      const campos = modelos.get(m[1]!);
      if (!campos) continue;

      const args = bloque(texto, texto.indexOf("{", m.index + m[0].length - 1));
      if (args === null) continue;

      // El `select` de PRIMER nivel de los argumentos. Los que van dentro de
      // una relacion pertenecen a otro modelo y aqui no se miran.
      for (const trozo of [args]) {
        const pos = posicionDeClaveRaiz(trozo, "select");
        if (pos === null) continue;

        /**
         * Solo si el `select` es un objeto ESCRITO AHI MISMO.
         *
         * Cuando vale una constante —`select: CAMPOS_RESUMEN`, que es como se
         * comparten los campos de una ficha— aqui no hay nada que leer. La
         * primera version buscaba «la siguiente llave» y se traia la de OTRA
         * llamada del mismo fichero: cuatro falsos positivos, todos `where` y
         * `orderBy`. Callarse es lo correcto; inventar, no.
         */
        const resto = trozo.slice(pos + "select:".length).trimStart();
        if (!resto.startsWith("{")) continue;

        const cuerpo = bloque(trozo, trozo.indexOf("{", pos));
        if (cuerpo === null) continue;

        for (const clave of clavesDePrimerNivel(cuerpo)) {
          if (CLAVES_DE_PRISMA.has(clave)) continue;
          if (!campos.has(clave)) {
            malos.push({ fichero, modelo: m[1]!, campo: clave });
          }
        }
      }
    }
  }

  return malos;
}

/** Donde empieza `clave:` en el primer nivel de este cuerpo, o null. */
function posicionDeClaveRaiz(cuerpo: string, clave: string): number | null {
  let nivel = 0;
  for (let i = 0; i < cuerpo.length; i++) {
    const c = cuerpo[i]!;
    if (c === "{" || c === "[" || c === "(") nivel++;
    else if (c === "}" || c === "]" || c === ")") nivel--;
    else if (nivel === 0 && cuerpo.startsWith(`${clave}:`, i)) {
      const antes = cuerpo.slice(0, i).trimEnd();
      if (antes === "" || antes.endsWith(",") || antes.endsWith("{")) return i;
    }
  }
  return null;
}

describe("los select apuntan a campos que existen", () => {
  it("ninguna consulta nombra un campo que el esquema no tiene", () => {
    const malos = selectsSospechosos();

    expect(
      malos.map((m) => `${m.fichero}: prisma.${m.modelo} -> "${m.campo}"`),
    ).toEqual([]);
  });

  /**
   * Los dos controles de la casa, aplicados a un analizador: si el lector se
   * rompiera y no encontrara NADA, la prueba de arriba pasaria vacia para
   * siempre. Esto comprueba que de verdad esta leyendo el codigo.
   */
  it("y el lector encuentra los modelos y los campos del esquema", () => {
    const modelos = camposPorModelo();

    expect(modelos.size).toBeGreaterThan(40);
    expect(modelos.get("project")?.has("nombreObra")).toBe(true);
    // El campo que provoco uno de los fallos de produccion NO existe.
    expect(modelos.get("project")?.has("nombre")).toBe(false);
    expect(modelos.get("cronograma")?.has("vigente")).toBe(false);
  });

  /**
   * EL CONTROL QUE IMPORTA: darle de comer los fallos de verdad.
   *
   * Los tres del 18/08, escritos aqui a mano. Sin esto, un lector roto que no
   * encontrara nunca nada dejaria la prueba de arriba en verde para siempre —y
   * en verde por la peor de las razones—.
   */
  it("caza los tres fallos que costaron un dia de produccion", () => {
    const modelos = camposPorModelo();
    const malo = `
      await prisma.project.findFirst({
        where: { id },
        select: { id: true, nombre: true },
      });
      const c = await prisma.cronograma.findFirst({
        select: { vigente: true, version: true },
      });
      await tx.wbsItem.findMany({ select: { codigoPartida: true, inventado: true } });
    `;

    expect(
      enUnTexto(malo, modelos, "inventado.ts").map((h) => `${h.modelo}.${h.campo}`),
    ).toEqual(["project.nombre", "cronograma.vigente", "wbsItem.inventado"]);
  });

  /// Y lo que NO debe cazar, que es la mitad que hace utilizable un
  /// analizador: relaciones anidadas, `_count`, y un `select` que vale una
  /// constante en vez de un objeto.
  it("y se calla con lo que no puede saber", () => {
    const modelos = camposPorModelo();
    const bueno = `
      await prisma.project.findFirst({
        select: {
          nombreObra: true,
          wbsItems: { where: { tipo: "PARTIDA" }, select: { codigoPartida: true } },
          _count: { select: { wbsItems: true } },
        },
      });
      await prisma.proveedor.findMany({ where: {}, select: CAMPOS_RESUMEN, orderBy: {} });
    `;

    expect(enUnTexto(bueno, modelos, "bueno.ts")).toEqual([]);
  });

  it("y sabe distinguir un campo bueno de uno inventado", () => {
    const campos = camposPorModelo().get("ordenCompra");

    expect(campos?.has("numero")).toBe(true);
    expect(campos?.has("proveedor")).toBe(true); // una relacion tambien vale
    expect(campos?.has("no_existe_este_campo")).toBe(false);
  });
});
