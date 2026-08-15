import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ninguna variable de color puede usarse sin estar definida.
 *
 * Esta prueba existe por un fallo concreto: `var(--color-marca)` se uso en
 * cuatro componentes creyendo que existia —sus tres companeros de estado,
 * exito, alerta y peligro, si se llaman sin numero— cuando la marca solo
 * estaba definida en pasos (`--color-marca-600`).
 *
 * Una variable inexistente NO da error. El navegador descarta la declaracion
 * y sigue. Si lo descartado es el fondo de un boton con texto blanco, el
 * boton se vuelve invisible pero conserva su hueco: parece que la pantalla no
 * tiene boton. Asi se perdio el de anadir partida, que era la unica forma de
 * teclear un presupuesto sin importar un Excel, y nadie se entero hasta que
 * un usuario lo dijo.
 *
 * Se comprueban solo las `--color-*` a proposito: son las que pintan, las que
 * fallan mudas, y las que estan todas en `globals.css`. Otras variables de
 * espaciado o de medida se definen a veces en el propio componente.
 */

const RAIZ = join(process.cwd(), "src");
const CSS = join(RAIZ, "app", "globals.css");

function archivos(dir: string, ext: string[]): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p, ext);
    return ext.some((e) => n.endsWith(e)) ? [p] : [];
  });
}

/** Lo que `globals.css` deja disponible. */
function definidas(): Set<string> {
  const css = readFileSync(CSS, "utf8");
  const nombres = new Set<string>();
  for (const m of css.matchAll(/^\s*(--color-[\w-]+)\s*:/gm)) {
    if (m[1]) nombres.add(m[1]);
  }
  return nombres;
}

/** Lo que los componentes piden, con el archivo donde lo piden. */
function usadas(): Map<string, string[]> {
  const encontradas = new Map<string, string[]>();
  for (const f of archivos(RAIZ, [".tsx", ".ts"])) {
    if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
    const texto = readFileSync(f, "utf8");
    for (const m of texto.matchAll(/var\(\s*(--color-[\w-]+)\s*[,)]/g)) {
      const variable = m[1];
      if (!variable) continue;
      const previo = encontradas.get(variable) ?? [];
      const corto = f.slice(RAIZ.length + 1);
      if (!previo.includes(corto)) previo.push(corto);
      encontradas.set(variable, previo);
    }
  }
  return encontradas;
}

describe("variables de color", () => {
  it("todas las que se usan estan definidas en globals.css", () => {
    const hay = definidas();
    const huerfanas = [...usadas().entries()]
      .filter(([v]) => !hay.has(v))
      .map(([v, ficheros]) => `${v} (en ${ficheros.join(", ")})`);

    expect(huerfanas).toEqual([]);
  });

  /** El caso exacto que rompio el boton, fijado para que no vuelva. */
  it("la marca existe tambien sin numero", () => {
    expect(definidas().has("--color-marca")).toBe(true);
  });
});
