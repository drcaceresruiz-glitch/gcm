import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * LO QUE SUMA LA BASE DE DATOS NO SE COMPARA SIN PASAR POR `lib/decimal`.
 *
 * GCM no le pide las cuentas del dinero a la base: `lib/decimal` opera con
 * enteros grandes sobre texto y por eso es exacto con cualquier motor. La
 * excepcion son los `_sum` de Prisma, que suma el motor —y ahi si entra su
 * aritmetica—. Hoy son once y todos acaban en `sumar` o `restar`, que
 * redondean a dos decimales ANTES de cualquier comparacion; por eso el error
 * flotante muere antes de llegar a un `if`.
 *
 * Eso no lo sostiene nada mas que la costumbre de quien los escribio. Esta
 * prueba lo sostiene.
 *
 * POR QUE IMPORTA AHORA. Medido el 19/08 (`docs/instalable.md`, seccion E):
 * en SQLite —el motor de la version instalable— un `DECIMAL` se guarda como
 * coma flotante, y pedirle `0.10 + 0.20` devuelve 0.30000000000000004. Con
 * `sumar` delante eso es "0.30" y no pasa nada. Sin `sumar` delante, un
 * `esNegativo` de una diferencia que deberia ser cero da true, y una partida
 * queda marcada como sobregirada sin estarlo: descuadra SIN DAR ERROR, que es
 * el modo de fallo caracteristico de este sistema.
 *
 * Es tosca a proposito, como `empresa-congelada.test.ts`: lee el codigo como
 * texto. Lo que vigila no es un calculo, es una costumbre que se olvida.
 *
 * LO QUE NO CUBRE, y conviene saberlo: sigue un solo salto de nombre (la
 * variable que recibe el `_sum`, y la que recibe un `.get()` de ese mapa). Un
 * valor que cruce tres funciones se le escapa. Cubre la forma en que esto se
 * rompe de verdad —alguien anade una comparacion junto al `_sum` que ya
 * estaba— y no pretende ser un analizador.
 */

/// Los que normalizan: dejan el valor en la escala correcta.
const NORMALIZADORES = ["sumar", "restar", "multiplicar", "dividir"];

/// Los que deciden. Un flotante que llega aqui cambia una decision.
const COMPARADORES = ["esPositivo", "esNegativo", "esCero"];

/**
 * Ficheros donde HOY se le pide una suma de dinero a la base, con el motivo.
 *
 * La lista existe para que un `_sum` nuevo en un fichero nuevo obligue a
 * pasar por aqui y decidirlo, en vez de aparecer sin que nadie lo mire.
 */
const AGREGADOS_DE_DINERO: Readonly<Record<string, string>> = {
  "services/tablero.service.ts": "comprometido de la obra y sobregiro por partida",
  "services/gerencia.service.ts": "movimientos por obra en el tablero del gerente",
  "services/presupuesto-obra.ts": "los ajustes aprobados sobre la linea base",
  "services/ordenes.service.ts": "las ordenes sueltas del comprometido",
  "services/obras.service.ts": "comprometido y sobregiro, de toda la cartera",
  "services/movimientos.service.ts": "los ajustes ya aprobados sobre cada partida",
};

const RAIZ = join(process.cwd(), "src");

/**
 * Los campos `Decimal` del esquema, leidos del esquema y no escritos a mano.
 *
 * Asi un campo de dinero nuevo entra en la vigilancia el dia que se crea, sin
 * que nadie tenga que acordarse de anadirlo aqui.
 */
function camposDecimales(): ReadonlySet<string> {
  const esquema = readFileSync(
    join(process.cwd(), "prisma", "schema.prisma"),
    "utf8",
  );
  // Dos espacios exactos: es como Prisma indenta los campos de un modelo, y
  // evita confundir un `Decimal` que aparezca dentro de un comentario.
  const campos = [...esquema.matchAll(/^ {2}(\w+)\s+Decimal\b/gm)].map(
    (m) => m[1]!,
  );
  return new Set(campos);
}

/** Todos los .ts/.tsx de `src`, menos las propias pruebas. */
function fuentes(dir = RAIZ, encontrados: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const camino = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      fuentes(camino, encontrados);
    } else if (
      /\.tsx?$/.test(entrada.name) &&
      !/\.test\.tsx?$/.test(entrada.name)
    ) {
      encontrados.push(camino);
    }
  }
  return encontrados;
}

/** "C:\...\src\services\obras.service.ts" -> "services/obras.service.ts" */
function relativo(camino: string): string {
  return camino.slice(RAIZ.length + 1).replace(/\\/g, "/");
}

/** Los argumentos de cada llamada a `nombre(`, con los parentesis contados. */
function argumentosDe(texto: string, nombre: string): string[] {
  const encontrados: string[] = [];
  const patron = new RegExp(`\\b${nombre}\\(`, "g");

  for (const m of texto.matchAll(patron)) {
    let nivel = 1;
    let i = m.index + m[0].length;
    const desde = i;
    while (i < texto.length && nivel > 0) {
      if (texto[i] === "(") nivel++;
      else if (texto[i] === ")") nivel--;
      i++;
    }
    encontrados.push(texto.slice(desde, i - 1));
  }
  return encontrados;
}

/** true si la expresion ya viene normalizada por `lib/decimal`. */
function estaNormalizada(expresion: string): boolean {
  const limpia = expresion.trim();
  return NORMALIZADORES.some((f) => limpia.startsWith(`${f}(`));
}

/**
 * Los nombres del fichero que llevan dentro un valor sumado por la base.
 *
 * Dos pasadas: la variable que recibe el `_sum`, y la que recibe un `.get()`
 * de un mapa contaminado. Es el salto que dan hoy `movimientos.service.ts` y
 * `presupuesto-obra.ts`, y llega hasta donde llegan.
 */
function contaminados(texto: string, campos: ReadonlySet<string>): Set<string> {
  const sucios = new Set<string>();
  const asignaciones = [...texto.matchAll(/\bconst\s+(\w+)\s*=\s*([^;]*);/g)];

  const traeSuma = (expresion: string): boolean =>
    [...expresion.matchAll(/\._sum\.(\w+)/g)].some((m) => campos.has(m[1]!));

  for (const [, nombre, expresion] of asignaciones) {
    if (traeSuma(expresion!) && !estaNormalizada(expresion!)) sucios.add(nombre!);
  }

  for (const [, nombre, expresion] of asignaciones) {
    if (estaNormalizada(expresion!)) continue;
    const hereda = [...sucios].some((s) => expresion!.includes(`${s}.get(`));
    if (hereda) sucios.add(nombre!);
  }

  return sucios;
}

const CAMPOS = camposDecimales();

/** Fichero -> texto, solo de los que suman dinero en la base. */
const CON_SUMAS = new Map<string, string>();
for (const camino of fuentes()) {
  const texto = readFileSync(camino, "utf8");
  const pedidas = [...texto.matchAll(/_sum:\s*\{\s*(\w+)\s*:/g)].map(
    (m) => m[1]!,
  );
  const leidas = [...texto.matchAll(/\._sum\.(\w+)/g)].map((m) => m[1]!);
  if ([...pedidas, ...leidas].some((c) => CAMPOS.has(c))) {
    CON_SUMAS.set(relativo(camino), texto);
  }
}

describe("el dinero que suma la base pasa por lib/decimal", () => {
  it("el esquema y el barrido dan senal (si no, la prueba no comprueba nada)", () => {
    expect(CAMPOS.size).toBeGreaterThan(20);
    expect(CAMPOS.has("importe")).toBe(true);
    expect(CAMPOS.has("montoContratado")).toBe(true);
    expect(CON_SUMAS.size).toBeGreaterThan(0);
  });

  it("solo estos ficheros le piden sumas de dinero a la base", () => {
    for (const fichero of CON_SUMAS.keys()) {
      expect(
        AGREGADOS_DE_DINERO[fichero],
        `${fichero} suma dinero en la base y no esta en AGREGADOS_DE_DINERO. ` +
          `Anadelo con su motivo, y comprueba que el resultado pasa por ` +
          `${NORMALIZADORES.join(" o ")} antes de compararse con nada.`,
      ).toBeDefined();
    }
  });

  it("la lista no se queda con ficheros que ya no suman nada", () => {
    for (const fichero of Object.keys(AGREGADOS_DE_DINERO)) {
      expect(
        CON_SUMAS.has(fichero),
        `${fichero} esta en AGREGADOS_DE_DINERO y ya no suma dinero en la base: quitalo.`,
      ).toBe(true);
    }
  });
});

describe("ningun Decimal sumado por la base decide nada en crudo", () => {
  for (const [fichero, texto] of CON_SUMAS) {
    /**
     * A TEXTO EN LA FRONTERA. El `Decimal` de Prisma no es un numero: en
     * SQLite llega respaldado por un flotante, y `Number(...)` o un `+` lo
     * meterian en la coma flotante justo donde este sistema no la admite.
     */
    it(`${fichero}: el _sum sale a texto`, () => {
      for (const m of texto.matchAll(/\._sum\.(\w+)([\s\S]{0,14})/g)) {
        if (!CAMPOS.has(m[1]!)) continue;
        expect(
          /^\??\.toString\(\)/.test(m[2]!.trimStart()),
          `${fichero}: "_sum.${m[1]}" no sale a texto con .toString(). ` +
            `Un Decimal en crudo arrastra el flotante del motor.`,
        ).toBe(true);
      }
    });

    it(`${fichero}: nada sumado por la base llega a un comparador`, () => {
      const sucios = contaminados(texto, CAMPOS);

      for (const comparador of COMPARADORES) {
        for (const argumento of argumentosDe(texto, comparador)) {
          const raiz = argumento.trim().split(/[.\s[(]/)[0] ?? "";
          const culpable = argumento.includes("._sum.")
            ? "un _sum sin normalizar"
            : sucios.has(raiz)
              ? `"${raiz}", que viene de un _sum`
              : null;

          expect(
            culpable,
            `${fichero}: ${comparador}(${argumento.trim()}) decide sobre ` +
              `${culpable}. Pasalo antes por ${NORMALIZADORES.join(" o ")}: ` +
              `redondean a la escala buena y matan el error del motor.`,
          ).toBeNull();
        }
      }
    });
  }
});

describe("ni a una igualdad literal", () => {
  /**
   * `descuadreDelReparto` compara con `=== "0.00"` a proposito: distingue
   * "cuadra" de "no es un numero", que `esCero` no distingue. Funciona porque
   * su entrada ya paso por `sumar`, y "0.00" es entonces la unica forma
   * posible del cero. Comparar asi un `_sum` en crudo seria otra cosa: en
   * SQLite el mismo cero puede llegar como "0", como "0.0000000001" o como
   * "-0.00", y las tres fallarian la igualdad sin que nadie se entere.
   */
  for (const [fichero, texto] of CON_SUMAS) {
    it(`${fichero}: sin igualdades sobre lo que sumo la base`, () => {
      const sucios = contaminados(texto, CAMPOS);

      texto.split("\n").forEach((linea, i) => {
        if (!linea.includes("===") && !linea.includes("!==")) return;

        const culpable = linea.includes("._sum.")
          ? "un _sum"
          : ([...sucios].find((s) =>
              new RegExp(`\\b${s}\\s*[!=]==|[!=]==\\s*${s}\\b`).test(linea),
            ) ?? null);

        expect(
          culpable,
          `${fichero}:${i + 1} compara por igualdad con ${culpable}, que ` +
            `viene de la base sin normalizar. Pasalo por ` +
            `${NORMALIZADORES.join(" o ")}: solo asi "0.00" es el unico cero.`,
        ).toBeNull();
      });
    });
  }
});

/**
 * Y NUNCA UNA MEDIA. `sumar` puede recuperar la escala de una suma; una media
 * ya trae la division hecha por el motor, en coma flotante y sin resto, y no
 * hay forma de recomponerla. Hoy no hay ninguna: que siga sin haberla.
 */
it("no se le pide a la base la media de un importe", () => {
  for (const camino of fuentes()) {
    const texto = readFileSync(camino, "utf8");
    for (const m of texto.matchAll(/_avg:\s*\{\s*(\w+)\s*:/g)) {
      expect(
        CAMPOS.has(m[1]!),
        `${relativo(camino)}: _avg sobre "${m[1]}" deja el promedio en coma ` +
          `flotante y sin resto. Trae los importes y promedia con lib/decimal.`,
      ).toBe(false);
    }
  }
});
