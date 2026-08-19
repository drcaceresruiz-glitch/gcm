import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * QUE NINGUNA ESCRITURA DE EMPRESA SE ESCAPE DEL CONGELADO.
 *
 * Las escrituras de OBRA estan cubiertas de oficio: todas pasan por
 * `motivoSiObraCerrada`, que ya trae el estado de la empresa en la misma
 * consulta. Las de EMPRESA no tienen ese embudo —crear un usuario o un
 * contratista no toca ninguna obra— asi que cada una llama a la guarda a
 * mano, y lo que se hace a mano se olvida.
 *
 * Esta prueba lee el CODIGO como texto, igual que las del catalogo leen
 * `schema.prisma`. Es tosco a proposito: el modo de fallo que vigila es que
 * alguien anada una funcion nueva de alta de usuarios y nadie se entere hasta
 * que una migracion salga con una referencia rota, semanas despues y en otra
 * instalacion.
 *
 * Las tres tablas que obligan son las que VIAJAN en el archivo: `users`,
 * `proveedores`, `formas_pago_plantillas` y `company_permissions`. Lo que no
 * viaja —remitente de correo, emisor de SMS— no necesita la guarda, porque
 * cambiarlo no puede descuadrar nada de lo que sale.
 */

/// Fichero -> funciones que escriben en algo que viaja en la migracion.
const ESCRITURAS: Readonly<Record<string, readonly string[]>> = {
  "usuarios.service.ts": [
    "crearUsuario",
    "editarUsuario",
    "cambiarEstadoUsuario",
    "resetearClave",
    "desactivarDosFactoresUsuario",
    "eliminarUsuario",
  ],
  "proveedores.service.ts": [
    "crearProveedor",
    "editarProveedor",
    "cambiarEstadoProveedor",
  ],
  "proveedores-excel.service.ts": ["importarProveedores"],
  "formas-pago.service.ts": ["guardarFormaPago", "cambiarEstadoFormaPago"],
  "permisos.service.ts": ["guardarCambios"],
};

const GUARDA = "motivoSiEmpresaEnMigracion";

function fuente(fichero: string): string {
  return readFileSync(
    join(process.cwd(), "src", "services", fichero),
    "utf8",
  );
}

/**
 * El cuerpo de una funcion exportada, hasta la siguiente declaracion.
 *
 * No es un analizador de verdad y no hace falta que lo sea: todas estas
 * funciones estan al primer nivel del modulo, asi que la siguiente linea que
 * empieza en la columna cero cierra la anterior.
 */
function cuerpo(texto: string, nombre: string): string {
  const inicio = texto.indexOf(`export async function ${nombre}(`);
  if (inicio === -1) return "";
  const resto = texto.slice(inicio + 1);
  const fin = resto.search(/\nexport (async )?function |\nexport const /);
  return fin === -1 ? resto : resto.slice(0, fin);
}

describe("toda escritura de empresa respeta el congelado", () => {
  for (const [fichero, funciones] of Object.entries(ESCRITURAS)) {
    for (const nombre of funciones) {
      it(`${fichero} > ${nombre}`, () => {
        const texto = cuerpo(fuente(fichero), nombre);

        expect(
          texto.length,
          `no se encontro ${nombre} en ${fichero}: ¿se renombro?`,
        ).toBeGreaterThan(0);

        expect(
          texto.includes(GUARDA),
          `${nombre} escribe algo que viaja en la migracion y no llama a ${GUARDA}`,
        ).toBe(true);
      });
    }
  }

  /**
   * Y ANTES DE ESCRIBIR, no despues. Una guarda puesta al final comprobaria
   * el congelado con la fila ya creada: el error llegaria a la pantalla y el
   * dato se habria quedado.
   */
  it("la guarda va antes de la primera escritura, no despues", () => {
    for (const [fichero, funciones] of Object.entries(ESCRITURAS)) {
      const texto = fuente(fichero);
      for (const nombre of funciones) {
        const c = cuerpo(texto, nombre);
        const guarda = c.indexOf(GUARDA);
        // La primera escritura del cuerpo, sea por `prisma` o dentro de una
        // transaccion (`tx.`), que es como escriben los servicios de usuario.
        const escritura = c.search(
          /\b(prisma|tx)\.\w+\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\b/,
        );
        if (escritura === -1) continue;
        expect(
          guarda,
          `${fichero} > ${nombre}: la guarda esta despues de la primera escritura`,
        ).toBeLessThan(escritura);
      }
    }
  });
});
