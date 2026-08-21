import { describe, expect, it } from "vitest";
import {
  EDITABLES,
  INNEGOCIABLES,
  PERMISOS,
  permisosDe,
  puede,
  resolverPermisos,
} from "@/lib/rbac";

/**
 * Permisos efectivos por empresa.
 *
 * Lo que se prueba aqui no es la matriz —esa es una decision de producto que
 * cambia— sino la regla que la protege: que una excepcion no pueda conceder
 * lo que nunca debe ser configurable. Es la unica pieza del sistema que
 * decide quien firma un acto contractual.
 */

/**
 * «Los mismos permisos» es una cuestion de pertenencia, no de orden:
 * `resolverPermisos` normaliza al orden de PERMISOS a proposito, y de eso se
 * encarga su propia prueba mas abajo.
 */
function mismos(a: readonly string[], b: readonly string[]) {
  expect([...a].sort()).toEqual([...b].sort());
}

describe("resolverPermisos", () => {
  it("sin excepciones devuelve exactamente la plantilla del rol", () => {
    mismos(resolverPermisos("RESIDENTE"), permisosDe("RESIDENTE"));
    mismos(resolverPermisos("CONSULTOR"), permisosDe("CONSULTOR"));
  });

  it("concede un permiso que la plantilla no da", () => {
    expect(puede({ permisos: resolverPermisos("CONSULTOR") }, "movimiento:crear")).toBe(false);

    const permisos = resolverPermisos("CONSULTOR", [
      { permiso: "movimiento:crear", concedido: true },
    ]);

    expect(puede({ permisos }, "movimiento:crear")).toBe(true);
  });

  it("revoca un permiso que la plantilla si da", () => {
    expect(puede({ permisos: resolverPermisos("RESIDENTE") }, "partida:eliminar")).toBe(true);

    const permisos = resolverPermisos("RESIDENTE", [
      { permiso: "partida:eliminar", concedido: false },
    ]);

    expect(puede({ permisos }, "partida:eliminar")).toBe(false);
  });
});

describe("los innegociables no se pueden reconfigurar", () => {
  /**
   * La comprobacion que justifica que esta prueba exista. El servicio ya
   * rechaza guardar estas excepciones, pero una fila insertada a mano en la
   * base tampoco debe surtir efecto: son dos cierres independientes.
   */
  it("ignora una excepcion que CONCEDE un innegociable", () => {
    for (const permiso of INNEGOCIABLES) {
      const permisos = resolverPermisos("CONSULTOR", [
        { permiso, concedido: true },
      ]);

      expect(puede({ permisos }, permiso)).toBe(false);
    }
  });

  it("ignora una excepcion que REVOCA un innegociable al ADMIN", () => {
    for (const permiso of INNEGOCIABLES) {
      const permisos = resolverPermisos("ADMIN", [
        { permiso, concedido: false },
      ]);

      expect(puede({ permisos }, permiso)).toBe(true);
    }
  });

  it("aprobar y repartir permisos son innegociables", () => {
    expect(INNEGOCIABLES).toContain("linea_base:aprobar");
    expect(INNEGOCIABLES).toContain("movimiento:aprobar");
    expect(INNEGOCIABLES).toContain("permiso:editar");
  });

  it("EDITABLES es el resto, sin solaparse", () => {
    expect(EDITABLES).toHaveLength(PERMISOS.length - INNEGOCIABLES.length);
    for (const permiso of INNEGOCIABLES) {
      expect(EDITABLES).not.toContain(permiso);
    }
  });
});

/**
 * GERENTE se DERIVA de PERMISOS (`TODO_LO_QUE_SE_LEE`), no se enumera a
 * mano. Esta prueba fija la regla en si, no una lista: si algun dia se anade
 * un permiso de lectura nuevo, tiene que seguir cumpliendola sin que nadie
 * toque `MATRIZ.GERENTE`.
 */
describe("GERENTE: ve todo lo que se lee, administra y aprueba nada", () => {
  const permisos = permisosDe("GERENTE");

  it("tiene todo permiso que termina en :leer, salvo el innegociable", () => {
    for (const p of PERMISOS) {
      if (!p.endsWith(":leer")) continue;
      const debeTenerlo = !INNEGOCIABLES.includes(p);
      expect(permisos.includes(p), p).toBe(debeTenerlo);
    }
  });

  it("no tiene ningun permiso de crear, gestionar, aprobar, editar ni eliminar", () => {
    const sufijosDeEscritura = [
      ":crear",
      ":gestionar",
      ":aprobar",
      ":editar",
      ":eliminar",
      ":importar",
      ":publicar",
      ":registrar",
      ":valorizar",
      ":contactar",
      ":anular",
      ":restaurar",
      ":migrar",
      ":desactivar",
      ":resetear_clave",
      ":asignar_equipo",
      ":eliminar_cerrada",
      ":linea_base",
    ];
    for (const p of permisos) {
      const esEscritura = sufijosDeEscritura.some((s) => p.endsWith(s));
      expect(esEscritura, p).toBe(false);
    }
  });

  it("ve lo que CONSULTOR no ve, porque es interno y no el cliente", () => {
    for (const p of ["meta:leer", "nota:leer", "galeria:leer", "encargo:leer"]) {
      expect(permisosDe("CONSULTOR")).not.toContain(p);
      expect(permisos).toContain(p);
    }
  });
});

describe("filas que la base puede traer y el codigo ya no reconoce", () => {
  it("ignora un permiso que no existe, sin romper", () => {
    const permisos = resolverPermisos("RESIDENTE", [
      { permiso: "partida:teletransportar", concedido: true },
    ]);

    mismos(permisos, permisosDe("RESIDENTE"));
  });

  it("la ultima excepcion sobre el mismo permiso es la que manda", () => {
    const permisos = resolverPermisos("CONSULTOR", [
      { permiso: "obra:crear", concedido: true },
      { permiso: "obra:crear", concedido: false },
    ]);

    expect(puede({ permisos }, "obra:crear")).toBe(false);
  });

  it("devuelve los permisos en el orden de PERMISOS, no en el de llegada", () => {
    const permisos = resolverPermisos("ALMACENERO", [
      { permiso: "usuario:leer", concedido: true },
      { permiso: "empresa:leer", concedido: true },
    ]);

    const ordenados = [...permisos].sort(
      (a, b) => PERMISOS.indexOf(a) - PERMISOS.indexOf(b),
    );

    expect(permisos).toEqual(ordenados);
  });
});
