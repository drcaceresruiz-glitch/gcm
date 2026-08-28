import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * EL OTRO LADO DEL AISLAMIENTO: las funciones que se gatean con
 * `sesion.esOperador` en vez de con `sesion.companyId`.
 *
 * `aislamiento.test.ts` exige que TODO `where` mencione el `companyId` DE
 * LA SESION, y por eso no puede cubrir estas funciones: a proposito NO
 * filtran por el `companyId` de quien pregunta —que es el del operador,
 * no el de la empresa que mira—, sino por un `empresaId` que llega
 * explicito como parametro. Es una frontera distinta, con su propia
 * prueba.
 *
 * Misma tecnica que `empresa-congelada.test.ts`: lee el codigo como
 * texto, tosca a proposito. Pero en DOS direcciones, no una:
 *
 *   1. Cada funcion REGISTRADA aqui de verdad comprueba `esOperador`
 *      ANTES de tocar la base —igual que exige `empresa-congelada.test.ts`
 *      con su guarda—.
 *   2. NINGUNA funcion de `src/services/` que compruebe `esOperador` se
 *      queda sin registrar. `empresa-congelada.test.ts` no hace esta
 *      segunda comprobacion —confia en que la lista este completa—, y el
 *      modo de fallo real de una lista a mano es justo el olvido: alguien
 *      anade una funcion de operador nueva, la prueba de la primera
 *      direccion nunca la menciona porque nunca se escribio para ella, y
 *      queda sin cubrir en silencio. Esta segunda direccion es la que lo
 *      impide: escanea TODO `src/services/` y compara contra el
 *      registro.
 */

const SERVICIOS_DIR = join(process.cwd(), "src", "services");

/// Fichero -> funciones esOperador ya conocidas y auditadas. Añadir una
/// funcion de operador nueva sin sumarla aqui pone roja la prueba de
/// completitud de mas abajo, no la deja pasar en silencio.
const FUNCIONES: Readonly<Record<string, readonly string[]>> = {
  "operador.service.ts": [
    "altaConstructora",
    "listarConstructoras",
    "detalleConstructora",
    "editarConstructora",
    "editarLicenciaConstructora",
    "alternarConstructora",
  ],
  "empresa-borrado.service.ts": ["motivoSiNoSePuedeBorrar"],
  /// Los datos crudos de una obra para una investigacion: la radiografia mas
  /// completa que existe de como trabaja una constructora. Ni el
  /// administrador de la empresa entra aqui.
  "investigacion.service.ts": [
    "datosDelEstudio",
    "fijarPuntoDeInterrupcion",
    "marcarOrigenDeSemana",
    "resumenDelEstudio",
  ],
  "soporte.service.ts": [
    "hiloDeSoportePorOperador",
    "escribirSoportePorOperador",
    "contadorSoportePorEmpresa",
  ],
};

function fuente(fichero: string): string {
  return readFileSync(join(SERVICIOS_DIR, fichero), "utf8");
}

/**
 * El cuerpo de una funcion exportada, hasta la siguiente declaracion.
 *
 * No es un analizador de verdad y no hace falta que lo sea: todas estas
 * funciones estan al primer nivel del modulo, asi que la siguiente linea
 * que empieza en la columna cero cierra la anterior. Mismo helper que
 * `empresa-congelada.test.ts`, redefinido aqui: son diez lineas, y
 * compartirlo entre dos pruebas de contrato distintas acoplaria una a la
 * otra sin necesidad.
 */
function cuerpo(texto: string, nombre: string): string {
  const inicio = texto.indexOf(`export async function ${nombre}(`);
  if (inicio === -1) return "";
  const resto = texto.slice(inicio + 1);
  const fin = resto.search(/\nexport (async )?function |\nexport const /);
  return fin === -1 ? resto : resto.slice(0, fin);
}

describe("cada funcion registrada de verdad comprueba esOperador", () => {
  for (const [fichero, funciones] of Object.entries(FUNCIONES)) {
    for (const nombre of funciones) {
      it(`${fichero} > ${nombre}`, () => {
        const texto = cuerpo(fuente(fichero), nombre);

        expect(
          texto.length,
          `no se encontro ${nombre} en ${fichero}: ¿se renombró?`,
        ).toBeGreaterThan(0);

        expect(
          texto.includes("sesion.esOperador"),
          `${nombre} está registrada como función de operador y no comprueba sesion.esOperador`,
        ).toBe(true);
      });
    }
  }

  /**
   * Y ANTES DE LA PRIMERA CONSULTA, no despues. Una comprobacion puesta al
   * final dejaria que una consulta previa ya hubiera tocado la base con
   * un `empresaId` sin verificar que quien pregunta puede verlo.
   */
  it("la comprobación va antes de la primera consulta, no después", () => {
    for (const [fichero, funciones] of Object.entries(FUNCIONES)) {
      const texto = fuente(fichero);
      for (const nombre of funciones) {
        const c = cuerpo(texto, nombre);
        const guarda = c.indexOf("sesion.esOperador");
        const consulta = c.search(
          /\b(prisma|tx)\.\w+\.(find\w*|create\w*|update\w*|delete\w*|upsert|count|groupBy|aggregate)\b/,
        );
        if (consulta === -1) continue;

        expect(guarda, `${fichero} > ${nombre}: sin comprobación`).toBeGreaterThanOrEqual(0);
        expect(
          guarda,
          `${fichero} > ${nombre}: la comprobación de esOperador está después de la primera consulta`,
        ).toBeLessThan(consulta);
      }
    }
  });
});

describe("ninguna función esOperador se queda sin registrar", () => {
  it("todo archivo de src/services/ que menciona sesion.esOperador está en FUNCIONES, con todas sus funciones", () => {
    const ficheros = readdirSync(SERVICIOS_DIR).filter((f) =>
      f.endsWith(".service.ts"),
    );

    const sinRegistrar: string[] = [];

    for (const fichero of ficheros) {
      const texto = fuente(fichero);
      if (!texto.includes("sesion.esOperador")) continue;

      const registradas = new Set(FUNCIONES[fichero] ?? []);
      const regex = /export async function (\w+)\(/g;
      const coincidencias = [...texto.matchAll(regex)];

      for (let i = 0; i < coincidencias.length; i++) {
        const nombre = coincidencias[i]![1]!;
        const inicio = coincidencias[i]!.index!;
        const fin = coincidencias[i + 1]?.index ?? texto.length;
        const cuerpoFn = texto.slice(inicio, fin);

        if (cuerpoFn.includes("sesion.esOperador") && !registradas.has(nombre)) {
          sinRegistrar.push(`${fichero} > ${nombre}`);
        }
      }
    }

    expect(
      sinRegistrar,
      "estas funciones comprueban esOperador y no están en el registro de este archivo",
    ).toEqual([]);
  });
});
