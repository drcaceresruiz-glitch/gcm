import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TABLAS, EXCLUIDAS } from "@/lib/respaldo-esquema";
import {
  TABLAS_EMPRESA,
  TABLAS_MIGRACION,
  EXCLUIDAS_MIGRACION,
  tablaDeMigracion,
} from "@/lib/respaldo-empresa-esquema";

/**
 * El catalogo de la migracion de una constructora entera.
 *
 * Igual que el del respaldo de obra, esto se compara contra
 * `prisma/schema.prisma` leido como TEXTO: el modo de fallo de una migracion
 * es llegar a la instalacion nueva sin una tabla y no enterarse hasta que
 * alguien la echa en falta semanas despues. Comparar convierte ese olvido en
 * un build en rojo.
 */

/** Los nombres de tabla (`@@map`) que declara el esquema. */
function tablasDelEsquema(): Set<string> {
  const texto = readFileSync(
    join(process.cwd(), "prisma", "schema.prisma"),
    "utf8",
  );
  const nombres = new Set<string>();
  for (const linea of texto.split(/\r?\n/)) {
    const mapa = linea.match(/@@map\("(\w+)"\)/);
    if (mapa) nombres.add(mapa[1]!);
  }
  return nombres;
}

const ESQUEMA = tablasDelEsquema();

describe("el catalogo de migracion y el esquema no pueden divergir", () => {
  it("toda tabla del catalogo existe en el esquema", () => {
    for (const t of TABLAS_MIGRACION) {
      expect(ESQUEMA.has(t.tabla), `no existe la tabla ${t.tabla}`).toBe(true);
    }
  });

  it("toda tabla excluida existe tambien, o la exclusion sobra", () => {
    for (const tabla of Object.keys(EXCLUIDAS_MIGRACION)) {
      expect(ESQUEMA.has(tabla), `se excluye ${tabla}, que ya no existe`).toBe(
        true,
      );
    }
  });

  /**
   * LA PRUEBA QUE MAS IMPORTA. Cada tabla del esquema tiene que estar en el
   * catalogo o excluida CON SU MOTIVO. Si alguien anade una tabla y no pasa
   * por aqui, la migracion la deja atras en silencio.
   */
  it("ninguna tabla del esquema se queda sin decidir", () => {
    const enCatalogo = new Set(TABLAS_MIGRACION.map((t) => t.tabla));
    const excluidas = new Set([
      ...Object.keys(EXCLUIDAS),
      ...Object.keys(EXCLUIDAS_MIGRACION),
    ]);

    const sinDecidir = [...ESQUEMA].filter(
      (t) => !enCatalogo.has(t) && !excluidas.has(t),
    );

    expect(
      sinDecidir,
      `estas tablas no viajan ni estan excluidas con motivo: ${sinDecidir.join(", ")}`,
    ).toEqual([]);
  });
});

describe("la forma del catalogo de migracion", () => {
  it("la empresa va ANTES que la obra: es su cimiento", () => {
    const primeras = TABLAS_MIGRACION.slice(0, TABLAS_EMPRESA.length).map(
      (t) => t.tabla,
    );
    expect(primeras).toEqual(TABLAS_EMPRESA.map((t) => t.tabla));
  });

  it("lleva todas las tablas de obra, sin perder ninguna", () => {
    const enMigracion = new Set(TABLAS_MIGRACION.map((t) => t.tabla));
    for (const t of TABLAS) {
      expect(enMigracion.has(t.tabla), t.tabla).toBe(true);
    }
  });

  /**
   * En el respaldo de obra, `proveedorId` apunta «a la empresa» y se remapea
   * contra lo que exista en destino. Aqui el proveedor viaja dentro, asi que
   * tiene que ser una referencia mas del archivo: si se quedara como externa,
   * el importador buscaria fuera algo que trae en la mano.
   */
  it("no queda ni una referencia externa: todas se resolvieron dentro", () => {
    for (const t of TABLAS_MIGRACION) {
      expect(t.externas ?? [], t.tabla).toEqual([]);
    }
  });

  it("las que eran externas ahora apuntan a una tabla del archivo", () => {
    const enMigracion = new Set(TABLAS_MIGRACION.map((t) => t.tabla));

    // `proveedor_partidas` tenia `proveedorId` como externa; ahora es interna.
    const partidas = tablaDeMigracion("proveedor_partidas")!;
    const aProveedores = partidas.refs.find((r) => r.campo === "proveedorId");
    expect(aProveedores?.a).toBe("proveedores");

    // Y toda referencia, venga de donde venga, tiene que apuntar a una tabla
    // que de verdad viaja: si no, el remapeo se quedaria sin destino.
    for (const t of TABLAS_MIGRACION) {
      for (const r of t.refs) {
        expect(enMigracion.has(r.a), `${t.tabla}.${r.campo} -> ${r.a}`).toBe(
          true,
        );
      }
    }
  });

  it("no hay tablas repetidas", () => {
    const nombres = TABLAS_MIGRACION.map((t) => t.tabla);
    expect(new Set(nombres).size).toBe(nombres.length);
  });
});
