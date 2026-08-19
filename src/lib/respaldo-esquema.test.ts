import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  TABLAS,
  ORDEN_BORRADO,
  EXCLUIDAS,
  RELACION_A_LA_OBRA,
  filtroPorObra,
  tablaDelRespaldo,
} from "@/lib/respaldo-esquema";

/**
 * Estas pruebas leen `prisma/schema.prisma` como TEXTO.
 *
 * No es rebuscado: el modo de fallo de un respaldo es perder datos en
 * silencio, y ese silencio empieza el dia que alguien anade una columna y no
 * la anade aqui. Comparar contra el esquema convierte ese olvido en un build
 * en rojo, que es la unica forma de que se vea.
 */

interface ModeloEsquema {
  /// El nombre del MODELO en Prisma. `tabla` se lo come `@@map`, y para
  /// resolver una relacion hace falta saber a que modelo apunta.
  modelo: string;
  tabla: string;
  decimales: Record<string, number>;
  fechas: string[];
  campos: string[];
  /**
   * Campo de relacion -> MODELO al que apunta (`pago` -> `PagoEncargo`).
   *
   * Hace falta para poder SEGUIR un camino de dos saltos como el de
   * `comprobantes_pago`. Sin esto, la prueba solo sabria comprobar el primer
   * paso y el resto del camino quedaria sin vigilar, que es justo donde un
   * error borraria filas de otras obras.
   */
  relaciones: Record<string, string>;
}

function leerEsquema(): Map<string, ModeloEsquema> {
  const texto = readFileSync(
    join(process.cwd(), "prisma", "schema.prisma"),
    "utf8",
  );
  const modelos = new Map<string, ModeloEsquema>();
  let actual: ModeloEsquema | null = null;

  for (const linea of texto.split(/\r?\n/)) {
    const abre = linea.match(/^model\s+(\w+)\s*\{/);
    if (abre) {
      actual = {
        modelo: abre[1]!,
        tabla: abre[1]!,
        decimales: {},
        fechas: [],
        campos: [],
        relaciones: {},
      };
      continue;
    }
    if (!actual) continue;

    const mapea = linea.match(/@@map\("([^"]+)"\)/);
    if (mapea) actual.tabla = mapea[1]!;

    // El atributo puede ir despues de un @default, asi que no se ancla al tipo.
    const decimal = linea.match(
      /^\s*(\w+)\s+Decimal\??\s+.*@db\.Decimal\(\d+,\s*(\d+)\)/,
    );
    if (decimal) actual.decimales[decimal[1]!] = Number(decimal[2]);

    const fecha = linea.match(/^\s*(\w+)\s+DateTime\??\s+.*@db\.Date\b/);
    if (fecha) actual.fechas.push(fecha[1]!);

    const campo = linea.match(/^\s{2}(\w+)\s+\w/);
    if (campo) actual.campos.push(campo[1]!);

    // Un campo de relacion: `pago PagoEncargo @relation(...)`. El tipo empieza
    // por mayuscula, que es lo que lo distingue de `String`/`Int`/`DateTime`
    // —esos tambien la tienen— asi que se exige ademas el `@relation`.
    const relacion = linea.match(/^\s{2}(\w+)\s+([A-Z]\w*)\??\s+.*@relation/);
    if (relacion) actual.relaciones[relacion[1]!] = relacion[2]!;

    if (linea.startsWith("}")) {
      modelos.set(actual.tabla, actual);
      actual = null;
    }
  }
  return modelos;
}

const ESQUEMA = leerEsquema();

describe("el catalogo del respaldo y el esquema no pueden divergir", () => {
  it("toda tabla del catalogo existe en el esquema", () => {
    for (const t of TABLAS) {
      expect(ESQUEMA.has(t.tabla), `no existe la tabla ${t.tabla}`).toBe(true);
    }
  });

  it("declara TODAS las columnas de importe, con su escala exacta", () => {
    // Es la prueba que mas importa: un Decimal sin declarar viajaria como
    // numero de JSON y perderia precision, que en esta aplicacion es dinero.
    for (const t of TABLAS) {
      const real = ESQUEMA.get(t.tabla)!.decimales;
      const declaradas = t.decimales ?? {};
      expect(
        Object.keys(declaradas).sort(),
        `columnas Decimal de ${t.tabla}`,
      ).toEqual(Object.keys(real).sort());
      for (const [col, escala] of Object.entries(real)) {
        expect(declaradas[col], `escala de ${t.tabla}.${col}`).toBe(escala);
      }
    }
  });

  it("declara TODAS las columnas que son dia de calendario", () => {
    // Una `@db.Date` escrita como instante se reconstruye en otra zona
    // horaria y cambia de dia. `fechaCorte` es la clave de la cadencia
    // semanal entera: un dia de desfase la parte.
    for (const t of TABLAS) {
      const real = [...ESQUEMA.get(t.tabla)!.fechas].sort();
      expect([...(t.fechas ?? [])].sort(), `fechas de ${t.tabla}`).toEqual(real);
    }
  });

  it("los campos que dice remapear existen de verdad", () => {
    for (const t of TABLAS) {
      const campos = ESQUEMA.get(t.tabla)!.campos;
      for (const r of t.refs) {
        expect(campos, `${t.tabla}.${r.campo}`).toContain(r.campo);
        expect(
          tablaDelRespaldo(r.a),
          `${t.tabla}.${r.campo} apunta a ${r.a}, que no esta en el catalogo`,
        ).toBeDefined();
      }
      for (const e of t.externas ?? []) {
        expect(campos, `${t.tabla}.${e.campo}`).toContain(e.campo);
      }
    }
  });

  it("ninguna tabla con projectId se queda fuera sin decirlo", () => {
    // O viaja en el respaldo, o esta en la lista de excluidas CON su motivo.
    // El olvido —ni una cosa ni la otra— es lo que esta prueba impide.
    for (const [tabla, modelo] of ESQUEMA) {
      if (!modelo.campos.includes("projectId")) continue;
      const dentro = TABLAS.some((t) => t.tabla === tabla);
      const fuera = tabla in EXCLUIDAS;
      expect(
        dentro || fuera,
        `${tabla} tiene projectId y no esta ni en TABLAS ni en EXCLUIDAS`,
      ).toBe(true);
      expect(dentro && fuera, `${tabla} esta en las dos listas`).toBe(false);
    }
  });

  it("cada exclusion explica por que", () => {
    // Una lista de exclusiones sin motivos es una lista de olvidos con
    // aspecto de decision.
    for (const [tabla, motivo] of Object.entries(EXCLUIDAS)) {
      expect(motivo.length, `motivo de ${tabla}`).toBeGreaterThan(40);
    }
  });
});

describe("el orden de las tablas", () => {
  it("resuelve las claves foraneas de una sola pasada", () => {
    // Cada referencia apunta a una tabla YA insertada, o a la propia tabla
    // (autorreferencia, que se resuelve ordenando las filas por nivel).
    const posicion = new Map(TABLAS.map((t, i) => [t.tabla, i]));
    for (const [i, t] of TABLAS.entries()) {
      for (const r of t.refs) {
        const destino = posicion.get(r.a)!;
        expect(
          destino <= i,
          `${t.tabla}.${r.campo} necesita ${r.a}, que va despues`,
        ).toBe(true);
      }
    }
  });

  it("empieza por la obra: nada puede insertarse antes", () => {
    expect(TABLAS[0]!.tabla).toBe("projects");
  });

  it("y el borrado es el inverso exacto", () => {
    // Dos consumidores de UNA constante. Si algun dia se escriben por
    // separado, volveran a divergir.
    expect(ORDEN_BORRADO.map((t) => t.tabla)).toEqual(
      TABLAS.map((t) => t.tabla).reverse(),
    );
  });

  it("no hay tablas repetidas", () => {
    const nombres = TABLAS.map((t) => t.tabla);
    expect(new Set(nombres).size).toBe(nombres.length);
  });
});

describe("como se acota cada tabla a una obra", () => {
  it("toda tabla sabe llegar a la obra", () => {
    // O tiene `projectId`, o declara por que relacion se llega. Una que no
    // tuviera ninguna de las dos cosas se borraria ENTERA, de todas las obras
    // de todas las empresas: es el peor fallo posible de esta funcionalidad.
    for (const t of TABLAS) {
      if (t.tabla === "projects") continue;
      const directa = ESQUEMA.get(t.tabla)!.campos.includes("projectId");
      const porRelacion = t.tabla in RELACION_A_LA_OBRA;
      expect(
        directa || porRelacion,
        `${t.tabla} no sabe llegar a la obra`,
      ).toBe(true);
    }
  });

  it("y el filtro nunca sale vacio", () => {
    // Un `where` vacio en un deleteMany borra la tabla entera.
    for (const t of TABLAS) {
      const filtro = filtroPorObra(t.tabla, "obra-1");
      expect(Object.keys(filtro).length, `filtro de ${t.tabla}`).toBeGreaterThan(0);
    }
  });

  /**
   * El camino se RECORRE entero, salto a salto.
   *
   * Antes solo se comprobaba el primer paso, porque todos los caminos tenian
   * uno solo. Con `comprobantes_pago` —que cuelga del pago, y el pago del
   * encargo— un camino mal escrito en el segundo salto daria un `where` que
   * Prisma rechaza, y el borrado fallaria en produccion. O peor: si apuntara a
   * otra relacion valida, borraria filas de otra obra.
   */
  it("cada salto del camino existe, y el ultimo llega a projectId", () => {
    const porModelo = new Map(
      [...ESQUEMA.values()].map((m) => [m.modelo, m]),
    );

    for (const [tabla, relacion] of Object.entries(RELACION_A_LA_OBRA)) {
      const camino = typeof relacion === "string" ? [relacion] : relacion;
      let actual = ESQUEMA.get(tabla)!;

      for (const paso of camino) {
        expect(actual.campos, `${actual.tabla}.${paso} no existe`).toContain(
          paso,
        );
        const destino = actual.relaciones[paso];
        expect(destino, `${actual.tabla}.${paso} no es una relacion`).toBeDefined();
        actual = porModelo.get(destino!)!;
        expect(actual, `${destino} no es un modelo`).toBeDefined();
      }

      expect(
        actual.campos,
        `el camino de ${tabla} acaba en ${actual.tabla}, que no tiene projectId`,
      ).toContain("projectId");
    }
  });

  it("las cuatro formas de filtrar son las esperadas", () => {
    expect(filtroPorObra("projects", "o1")).toEqual({ id: "o1" });
    expect(filtroPorObra("wbs_items", "o1")).toEqual({ projectId: "o1" });
    expect(filtroPorObra("orden_lineas", "o1")).toEqual({
      ordenCompra: { projectId: "o1" },
    });
    // Dos saltos: el comprobante cuelga del pago y el pago del encargo.
    expect(filtroPorObra("comprobantes_pago", "o1")).toEqual({
      pago: { encargo: { projectId: "o1" } },
    });
  });
});
