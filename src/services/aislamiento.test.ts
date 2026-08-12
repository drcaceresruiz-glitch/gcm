import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SesionActiva } from "@/services/sesion.service";
import type { Permiso } from "@/lib/rbac";

/**
 * El aislamiento entre empresas, que es la frontera que sostiene el producto.
 *
 * El README declara que `src/services/` es «donde se verifican permisos y se
 * filtra por empresa», y la regla 4 dice que ese filtro «es lo que impide que
 * un cliente vea obras de otro». No habia ninguna prueba que lo defendiera:
 * no porque fallara, sino porque nada avisaria el dia que fallara.
 *
 * Aqui NO hay base de datos. Se sustituye Prisma por un doble que apunta con
 * que argumentos se le llama, y se comprueba UNA propiedad, la que sostiene el
 * multiempresa:
 *
 *   toda consulta lleva el `companyId` DE LA SESION, nunca uno de la peticion.
 *
 * Es una prueba de contrato, no de integracion: no dice que la base devuelva
 * lo correcto —eso lo garantiza el motor—, dice que nunca se le pide de mas.
 *
 * Van los tres servicios que exponen DINERO en el mismo archivo, y no uno por
 * servicio, porque el doble de Prisma es el mismo y repartirlo en tres copias
 * garantizaria que se separen en cuanto alguien toque una.
 */

interface Llamada {
  modelo: string;
  metodo: string;
  args: { where?: unknown } | undefined;
}

const llamadas: Llamada[] = [];

vi.mock("@/lib/prisma", () => {
  const apuntar = (modelo: string, metodo: string) => (args?: unknown) => {
    llamadas.push({ modelo, metodo, args: args as Llamada["args"] });

    // Cada metodo devuelve lo que su llamador espera en el caso vacio, para
    // que el codigo siga su camino normal en vez de romperse por el doble:
    // un `findFirst` que devolviera `[]` seria «encontrado» y llevaria a
    // ramas que en produccion no se recorren.
    if (metodo === "count") return Promise.resolve(0);
    if (metodo === "findFirst" || metodo === "findUnique") {
      return Promise.resolve(null);
    }
    if (metodo === "aggregate") return Promise.resolve({});
    if (metodo.startsWith("find") || metodo === "groupBy") {
      return Promise.resolve([]);
    }
    return Promise.resolve({});
  };

  const modeloFalso = (modelo: string) =>
    new Proxy({}, { get: (_o, metodo: string) => apuntar(modelo, metodo) });

  const prisma = new Proxy(
    {},
    {
      get: (_objetivo, clave: string) => {
        // Una transaccion corre con el mismo doble: lo que interese apuntar
        // dentro de ella se apunta igual.
        if (clave === "$transaction") {
          return (arg: unknown) =>
            typeof arg === "function"
              ? (arg as (tx: unknown) => unknown)(prisma)
              : Promise.resolve([]);
        }
        if (clave === "$queryRaw" || clave === "$executeRaw") {
          return () => Promise.resolve([]);
        }
        return modeloFalso(clave);
      },
    },
  );

  return { prisma };
});

const { listarObras } = await import("@/services/obras.service");
const ordenes = await import("@/services/ordenes.service");
const partidas = await import("@/services/partidas.service");

function sesion(companyId: string, permisos: Permiso[]): SesionActiva {
  return {
    sesionId: "s1",
    userId: "u1",
    companyId,
    role: "RESIDENTE",
    permisos,
    nombres: "Ana",
    apellidos: "Perez",
    email: "ana@ejemplo.pe",
    mustChangePassword: false,
    esOperador: false,
  };
}

/**
 * Si el `where` nombra a esta empresa, este donde este.
 *
 * Se busca en profundidad a proposito: unos servicios filtran con
 * `{ companyId }` directo y otros por la relacion —`{ project: { companyId } }`—,
 * y las dos formas son correctas. Lo que no puede pasar es que no aparezca.
 */
function mencionaEmpresa(valor: unknown, companyId: string): boolean {
  if (valor === companyId) return true;
  if (Array.isArray(valor)) {
    return valor.some((v) => mencionaEmpresa(v, companyId));
  }
  if (valor !== null && typeof valor === "object") {
    return Object.values(valor).some((v) => mencionaEmpresa(v, companyId));
  }
  return false;
}

/** Los `where` que se le pidieron a la base, de todos los modelos. */
const consultas = () => llamadas.filter((l) => l.args?.where !== undefined);

/// La empresa de la sesion, y la ajena cuyos identificadores se intentan colar.
const MIA = "EMPRESA-A";
const AJENA = "EMPRESA-B";

/**
 * Comprueba lo mismo para cualquier funcion: que consulto, y que todo lo que
 * consulto iba acotado a la empresa de la sesion.
 *
 * Exige que haya AL MENOS una consulta: una funcion que se fuera por una rama
 * temprana pasaria la prueba sin haber demostrado nada, y ese falso verde es
 * peor que no tener prueba.
 */
async function exigeFiltroDeEmpresa(correr: () => Promise<unknown>) {
  llamadas.length = 0;
  await correr();

  const hechas = consultas();
  expect(hechas.length).toBeGreaterThan(0);
  for (const c of hechas) {
    expect({
      modelo: c.modelo,
      metodo: c.metodo,
      filtraPorMiEmpresa: mencionaEmpresa(c.args?.where, MIA),
    }).toEqual({
      modelo: c.modelo,
      metodo: c.metodo,
      filtraPorMiEmpresa: true,
    });
  }
}

/** Sin permiso no se toca la base: la puerta esta antes de la consulta. */
async function exigeNiTocarLaBase(correr: () => Promise<unknown>) {
  llamadas.length = 0;
  await correr().catch(() => undefined);
  expect(llamadas).toEqual([]);
}

describe("obras", () => {
  beforeEach(() => {
    llamadas.length = 0;
  });

  it("sin permiso no llega a consultar nada", async () => {
    await exigeNiTocarLaBase(() => listarObras(sesion(MIA, [])));
  });

  it("toda consulta lleva el companyId de la sesion", async () => {
    await exigeFiltroDeEmpresa(() => listarObras(sesion(MIA, ["obra:leer"])));
  });

  it("dos empresas distintas no comparten filtro", async () => {
    await listarObras(sesion(AJENA, ["obra:leer"]));
    expect(consultas().length).toBeGreaterThan(0);
    for (const c of consultas()) {
      expect(mencionaEmpresa(c.args?.where, AJENA)).toBe(true);
      expect(mencionaEmpresa(c.args?.where, MIA)).toBe(false);
    }
  });

  it("un filtro de la peticion no puede cambiar de empresa", async () => {
    // El texto libre entra tal cual a proposito: lo que se comprueba es que,
    // por muy raro que venga, el companyId sigue saliendo de la sesion.
    await exigeFiltroDeEmpresa(() =>
      listarObras(sesion(MIA, ["obra:leer"]), { q: AJENA }),
    );
  });
});

describe("ordenes de compra", () => {
  // Todas reciben el id de la obra DESDE LA PETICION, que es justo por donde
  // se colaria una obra de otra empresa si el filtro no estuviera.
  const obraAjena = "obra-de-la-empresa-B";
  const leer: Permiso[] = ["orden:leer"];

  beforeEach(() => {
    llamadas.length = 0;
  });

  it("el comprometido de una obra ajena se pide acotado a mi empresa", async () => {
    await exigeFiltroDeEmpresa(() =>
      ordenes.obtenerComprometido(sesion(MIA, leer), obraAjena),
    );
  });

  it("contar ordenes de una obra ajena tambien va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      ordenes.contarOrdenesDeObra(sesion(MIA, leer), obraAjena),
    );
  });

  it("listar proveedores con ordenes va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      ordenes.listarProveedoresConOrdenes(sesion(MIA, leer), obraAjena),
    );
  });

  it("listar ordenes va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      ordenes.listarOrdenes(sesion(MIA, leer), obraAjena),
    );
  });

  it("sin orden:leer no se toca la base", async () => {
    await exigeNiTocarLaBase(() =>
      ordenes.contarOrdenesDeObra(sesion(MIA, []), obraAjena),
    );
    await exigeNiTocarLaBase(() =>
      ordenes.obtenerComprometido(sesion(MIA, []), obraAjena),
    );
  });
});

describe("partidas", () => {
  // Estas reciben el id de la PARTIDA, no el de la obra: si la busqueda no
  // fuera por empresa, bastaria un id ajeno para editar el presupuesto de
  // otra constructora.
  const partidaAjena = "partida-de-la-empresa-B";

  beforeEach(() => {
    llamadas.length = 0;
  });

  it("editar una partida ajena se busca acotado a mi empresa", async () => {
    await exigeFiltroDeEmpresa(() =>
      partidas.actualizarPartida(sesion(MIA, ["partida:editar"]), partidaAjena, {
        descripcion: "intento",
      }),
    );
  });

  it("eliminar una partida ajena se busca acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      partidas.eliminarPartida(sesion(MIA, ["partida:eliminar"]), partidaAjena),
    );
  });

  it("sin permiso no se toca la base", async () => {
    await exigeNiTocarLaBase(() =>
      partidas.actualizarPartida(sesion(MIA, []), partidaAjena, {
        descripcion: "intento",
      }),
    );
    await exigeNiTocarLaBase(() =>
      partidas.eliminarPartida(sesion(MIA, []), partidaAjena),
    );
  });
});
