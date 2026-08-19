import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TABLAS, EXCLUIDAS } from "@/lib/respaldo-esquema";
import {
  TABLAS_EMPRESA,
  TABLAS_MIGRACION,
  EXCLUIDAS_MIGRACION,
  filtroPorEmpresa,
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

interface CamposTabla {
  campos: string[];
  /// Los que llevan `?`. Importa para el filtro: una columna opcional es una
  /// por la que hay filas que NO se alcanzan navegando desde ella.
  opcionales: Set<string>;
}

/** Cada tabla (`@@map`) del esquema, con los campos que declara. */
function camposPorTabla(): Map<string, CamposTabla> {
  const texto = readFileSync(
    join(process.cwd(), "prisma", "schema.prisma"),
    "utf8",
  );
  const tablas = new Map<string, CamposTabla>();
  let actual: CamposTabla = { campos: [], opcionales: new Set() };

  for (const linea of texto.split(/\r?\n/)) {
    if (/^model\s+\w+\s*\{/.test(linea)) {
      actual = { campos: [], opcionales: new Set() };
      continue;
    }
    const campo = linea.match(/^\s{2}(\w+)\s+\w+(\?)?/);
    if (campo) {
      actual.campos.push(campo[1]!);
      if (campo[2]) actual.opcionales.add(campo[1]!);
    }

    const mapa = linea.match(/@@map\("(\w+)"\)/);
    if (mapa) tablas.set(mapa[1]!, actual);
  }
  return tablas;
}

const CAMPOS = camposPorTabla();
const ESQUEMA = new Set(CAMPOS.keys());

function campos(tabla: string): string[] {
  return CAMPOS.get(tabla)?.campos ?? [];
}

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

/**
 * EL FILTRO. Aqui viven los dos fallos caros de una migracion, y los dos son
 * silenciosos: leer de MAS —llevarse filas de otra constructora en el mismo
 * archivo— y leer de MENOS —dejar filas atras y descubrirlo en la instalacion
 * nueva, cuando ya no hay a quien preguntar—.
 */
describe("el filtro de migracion no puede leer de otra empresa", () => {
  const EMPRESA = "empresa-1";
  const OBRAS = ["obra-1", "obra-2"];

  /**
   * El filtro, aplanado a la lista de saltos que da hasta anclar.
   *
   * Para en cuanto llega al ancla y NO se mete en lo que hay debajo: el valor
   * de `projectId` es `{ in: [...] }`, que es la forma de comparar y no otro
   * salto del camino.
   */
  const ANCLAS = new Set(["companyId", "projectId"]);

  function claves(filtro: Record<string, unknown>): string[] {
    const dentro: string[] = [];
    let actual: unknown = filtro;
    while (actual && typeof actual === "object") {
      const entradas = Object.entries(actual as Record<string, unknown>);
      if (entradas.length !== 1) break;
      const [clave, valor] = entradas[0]!;
      dentro.push(clave);
      if (ANCLAS.has(clave)) break;
      actual = valor;
    }
    return dentro;
  }

  it("ninguna tabla se queda sin anclar", () => {
    for (const t of TABLAS_MIGRACION) {
      const filtro = filtroPorEmpresa(t.tabla, EMPRESA, OBRAS);
      expect(Object.keys(filtro).length, `${t.tabla} sin filtro`).toBeGreaterThan(0);
    }
  });

  /**
   * O ancla por `companyId`, o termina en `projectId`. No hay tercera forma
   * de estar dentro de una empresa, y cualquier otra cosa seria un filtro que
   * no acota nada.
   */
  it("toda tabla ancla por companyId o desemboca en projectId", () => {
    for (const t of TABLAS_MIGRACION) {
      const camino = claves(filtroPorEmpresa(t.tabla, EMPRESA, OBRAS));
      const ultima = camino[camino.length - 1];
      expect(
        camino[0] === "companyId" || ultima === "projectId",
        `${t.tabla} ancla en ${camino.join(".")}`,
      ).toBe(true);
    }
  });

  it("la que ancla por companyId tiene esa columna de verdad", () => {
    for (const t of TABLAS_MIGRACION) {
      const filtro = filtroPorEmpresa(t.tabla, EMPRESA, OBRAS);
      if (!("companyId" in filtro)) continue;
      expect(
        campos(t.tabla),
        `${t.tabla} se filtra por companyId y no la tiene`,
      ).toContain("companyId");
    }
  });

  /**
   * LA QUE MAS CUESTA VER, Y LA QUE MAS CUESTA SI FALLA.
   *
   * Una tabla con `projectId` OPCIONAL tiene filas sin obra, y a esas no las
   * alcanza ningun `IN` de obras: no darian error, no viajarian, y faltarian
   * en destino. Si ademas lleva `companyId`, hay que anclar por ahi.
   *
   * Hoy no hay ninguna en el catalogo —las que tienen `projectId` opcional
   * (`mensajes_sms`, `mensajes_contratista`, `audit_logs`) estan todas
   * excluidas con su motivo— y esta prueba existe para el dia que alguien
   * anada la primera.
   */
  it("ninguna tabla con projectId opcional se filtra por la obra", () => {
    for (const t of TABLAS_MIGRACION) {
      const { opcionales } = CAMPOS.get(t.tabla) ?? { opcionales: new Set() };
      if (!opcionales.has("projectId")) continue;
      const filtro = filtroPorEmpresa(t.tabla, EMPRESA, OBRAS);
      expect(
        "companyId" in filtro,
        `${t.tabla} tiene projectId opcional y se filtra por ${claves(filtro).join(".")}: ` +
          "sus filas sin obra se quedarian atras sin dar error",
      ).toBe(true);
    }
  });

  /**
   * `ordenes_compra` TIENE `companyId` y aun asi se ancla por la obra, a
   * proposito. Su `projectId` es obligatorio, asi que las dos formas alcanzan
   * las mismas filas; anclar por la obra ademas garantiza que todo lo que
   * viaja apunta a una obra que tambien viaja. Anclarla por `companyId`
   * dejaria entrar una orden cuya obra se quedo fuera, y esa llegaria a
   * destino con la referencia rota.
   */
  it("ordenes_compra se ancla por la obra aunque tenga companyId", () => {
    expect(campos("ordenes_compra")).toContain("companyId");
    expect(CAMPOS.get("ordenes_compra")!.opcionales.has("projectId")).toBe(false);
    expect(claves(filtroPorEmpresa("ordenes_compra", EMPRESA, OBRAS))).toEqual([
      "projectId",
    ]);
  });

  it("sigue el MISMO camino que el respaldo de obra en las tablas hondas", () => {
    // `comprobantes_pago` cuelga del pago y el pago del encargo. Si el camino
    // se copiara en vez de compartirse, este es el que se quedaria corto.
    expect(claves(filtroPorEmpresa("comprobantes_pago", EMPRESA, OBRAS))).toEqual([
      "pago",
      "encargo",
      "projectId",
    ]);
  });

  it("una empresa sin obras no arrastra nada de nadie", () => {
    const filtro = filtroPorEmpresa("wbs_items", EMPRESA, []);
    expect(filtro).toEqual({ projectId: { in: [] } });
  });
});
