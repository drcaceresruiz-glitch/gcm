import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SesionActiva } from "@/services/sesion.service";
import type { Permiso } from "@/lib/rbac";
import { SinPermisoError } from "@/lib/errores";

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
const lookahead = await import("@/services/lookahead.service");
const planSemanal = await import("@/services/plan-semanal.service");
const cronograma = await import("@/services/cronograma.service");
const movimientos = await import("@/services/movimientos.service");
const encargos = await import("@/services/encargos.service");
const proveedores = await import("@/services/proveedores.service");
const usuarios = await import("@/services/usuarios.service");
const causaRaiz = await import("@/services/causa-raiz.service");
const meta = await import("@/services/meta.service");
const deducciones = await import("@/services/deducciones.service");
const tablero = await import("@/services/tablero-semanal.service");
const galeria = await import("@/services/galeria.service");

/**
 * El alcance por defecto es `null` —sin restriccion— porque lo que audita
 * este archivo es la frontera ENTRE empresas. La capa de dentro, el alcance
 * por obra, tiene su propio bloque al final.
 */
function sesion(
  companyId: string,
  permisos: Permiso[],
  obrasAsignadas: string[] | null = null,
): SesionActiva {
  return {
    sesionId: "s1",
    userId: "u1",
    companyId,
    role: "RESIDENTE",
    permisos,
    obrasAsignadas,
    nombres: "Ana",
    apellidos: "Perez",
    email: "ana@ejemplo.pe",
    mustChangePassword: false,
    esOperador: false,
    rolReal: "RESIDENTE",
    previsualizacionHabilitada: false,
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

  // Se traga el error a proposito. Con el doble vacio hay servicios que lanzan
  // con toda la razon —no hay linea base aprobada, no hay cronograma vigente—,
  // y lo que se audita aqui no es lo que devuelven sino lo que le PIDIERON a
  // la base antes de rendirse. La exigencia de que haya al menos una consulta
  // sigue impidiendo que esto se pase por alto en silencio.
  await correr().catch(() => undefined);

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

  it("el error de permiso es la clase compartida, no una copia local", async () => {
    // Estuvo declarada TRES veces, con el mismo nombre y el mismo cuerpo, en
    // obras, perfil y usuarios. Nadie la capturaba por tipo, asi que no
    // fallaba nada; pero el dia que alguien escriba un `instanceof`
    // importandola de uno de los tres, dejaria pasar las de los otros dos en
    // silencio. Si vuelve a declararse en local, esta prueba lo dice.
    await expect(listarObras(sesion(MIA, []))).rejects.toBeInstanceOf(
      SinPermisoError,
    );
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

describe("lookahead", () => {
  // Recibe el id de la obra desde la peticion, igual que ordenes.
  const obraAjena = "obra-de-la-empresa-B";

  beforeEach(() => {
    llamadas.length = 0;
  });

  it("la ventana de una obra ajena se pide acotada a mi empresa", async () => {
    await exigeFiltroDeEmpresa(() =>
      lookahead.obtenerLookahead(sesion(MIA, ["lookahead:leer"]), obraAjena),
    );
  });

  it("la demora por flujo va acotada", async () => {
    await exigeFiltroDeEmpresa(() =>
      lookahead.demoraDeLiberacion(sesion(MIA, ["lookahead:leer"]), obraAjena),
    );
  });

  it("la tasa de liberacion va acotada", async () => {
    // Recorre TODAS las restricciones de la obra, no solo las de la ventana:
    // si el filtro se olvidara, contaria las promesas de otra empresa.
    await exigeFiltroDeEmpresa(() =>
      lookahead.tasaDeLiberacionDeObra(sesion(MIA, ["lookahead:leer"]), obraAjena),
    );
  });

  it("sin permiso, la tasa no toca la base", async () => {
    await exigeNiTocarLaBase(() =>
      lookahead.tasaDeLiberacionDeObra(sesion(MIA, []), obraAjena),
    );
  });

  it("sincronizar la ventana va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      lookahead.sincronizarLookahead(
        sesion(MIA, ["lookahead:gestionar", "lookahead:leer"]),
        obraAjena,
      ),
    );
  });

  it("sin permiso no se toca la base", async () => {
    await exigeNiTocarLaBase(() =>
      lookahead.obtenerLookahead(sesion(MIA, []), obraAjena),
    );
    await exigeNiTocarLaBase(() =>
      lookahead.demoraDeLiberacion(sesion(MIA, []), obraAjena),
    );
  });
});

describe("plan semanal", () => {
  const obraAjena = "obra-de-la-empresa-B";
  const planAjeno = "plan-de-la-empresa-B";
  const leer: Permiso[] = ["plan_semanal:leer"];

  beforeEach(() => {
    llamadas.length = 0;
  });

  it("listar las semanas de una obra ajena va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      planSemanal.listarPlanesSemanales(sesion(MIA, leer), obraAjena),
    );
  });

  it("abrir un plan ajeno va acotado", async () => {
    // Aqui llegan DOS identificadores de la peticion —la obra y el plan—, y
    // ninguno de los dos puede bastar por si mismo para alcanzar el dato.
    await exigeFiltroDeEmpresa(() =>
      planSemanal.obtenerPlanSemanal(sesion(MIA, leer), obraAjena, planAjeno),
    );
  });

  it("el corte de Last Planner va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      planSemanal.lastPlannerAlCorte(
        sesion(MIA, leer),
        obraAjena,
        new Date("2026-08-14T00:00:00.000Z"),
      ),
    );
  });

  it("reabrir un plan ajeno va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      planSemanal.reabrirPlanSemanal(
        sesion(MIA, ["plan_semanal:gestionar"]),
        obraAjena,
        planAjeno,
      ),
    );
  });

  it("sin permiso no se toca la base", async () => {
    await exigeNiTocarLaBase(() =>
      planSemanal.listarPlanesSemanales(sesion(MIA, []), obraAjena),
    );
    await exigeNiTocarLaBase(() =>
      planSemanal.obtenerPlanSemanal(sesion(MIA, []), obraAjena, planAjeno),
    );
  });
});

describe("cronograma", () => {
  const obraAjena = "obra-de-la-empresa-B";
  const leer: Permiso[] = ["cronograma:leer"];

  beforeEach(() => {
    llamadas.length = 0;
  });

  it("el cronograma de una obra ajena va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      cronograma.obtenerCronograma(sesion(MIA, leer), obraAjena),
    );
  });

  it("el historial de cortes va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      cronograma.historialCronogramas(sesion(MIA, leer), obraAjena),
    );
  });

  it("la linea base va acotada", async () => {
    await exigeFiltroDeEmpresa(() =>
      cronograma.lineaBaseCronograma(sesion(MIA, leer), obraAjena),
    );
  });

  it("fijar la linea base con dos ids ajenos va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      cronograma.marcarLineaBase(
        sesion(MIA, ["cronograma:linea_base"]),
        obraAjena,
        "cronograma-de-la-empresa-B",
      ),
    );
  });

  it("sin permiso no se toca la base", async () => {
    await exigeNiTocarLaBase(() =>
      cronograma.obtenerCronograma(sesion(MIA, []), obraAjena),
    );
  });
});

describe("movimientos presupuestales", () => {
  const obraAjena = "obra-de-la-empresa-B";
  // Estas dos reciben SOLO el id del movimiento: no hay obra en la peticion
  // que acompane, asi que el filtro por empresa es lo unico que separa el
  // presupuesto de una constructora del de otra.
  const movAjeno = "movimiento-de-la-empresa-B";

  beforeEach(() => {
    llamadas.length = 0;
  });

  it("el presupuesto vigente de una obra ajena va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      movimientos.obtenerPresupuestoVigente(
        sesion(MIA, ["movimiento:leer"]),
        obraAjena,
      ),
    );
  });

  it("listar movimientos va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      movimientos.listarMovimientos(sesion(MIA, ["movimiento:leer"]), obraAjena),
    );
  });

  it("aprobar un movimiento ajeno va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      movimientos.aprobarMovimiento(sesion(MIA, ["movimiento:aprobar"]), movAjeno),
    );
  });

  it("eliminar un borrador ajeno va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      movimientos.eliminarBorrador(sesion(MIA, ["movimiento:crear"]), movAjeno),
    );
  });

  it("sin permiso no se toca la base", async () => {
    await exigeNiTocarLaBase(() =>
      movimientos.aprobarMovimiento(sesion(MIA, []), movAjeno),
    );
  });
});

describe("encargos", () => {
  const obraAjena = "obra-de-la-empresa-B";
  const leer: Permiso[] = ["encargo:leer"];

  beforeEach(() => {
    llamadas.length = 0;
  });

  it("listar los encargos de una obra ajena va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      encargos.listarEncargos(sesion(MIA, leer), obraAjena),
    );
  });

  it("abrir un encargo ajeno va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      encargos.obtenerEncargo(
        sesion(MIA, leer),
        obraAjena,
        "encargo-de-la-empresa-B",
      ),
    );
  });

  it("las partidas asignables van acotadas", async () => {
    await exigeFiltroDeEmpresa(() =>
      encargos.partidasAsignables(sesion(MIA, leer), obraAjena),
    );
  });

  it("sin permiso no se toca la base", async () => {
    await exigeNiTocarLaBase(() =>
      encargos.listarEncargos(sesion(MIA, []), obraAjena),
    );
  });
});

describe("proveedores", () => {
  // El catalogo es de la EMPRESA, no de una obra: aqui no hay id de obra que
  // valga, y el unico limite es la sesion.
  const proveedorAjeno = "proveedor-de-la-empresa-B";

  beforeEach(() => {
    llamadas.length = 0;
  });

  it("el catalogo sale acotado a mi empresa", async () => {
    await exigeFiltroDeEmpresa(() =>
      proveedores.listarProveedores(sesion(MIA, ["proveedor:leer"])),
    );
  });

  it("la lista paginada va acotada", async () => {
    await exigeFiltroDeEmpresa(() =>
      proveedores.listarProveedoresPagina(sesion(MIA, ["proveedor:leer"])),
    );
  });

  it("dar de baja un proveedor ajeno va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      proveedores.cambiarEstadoProveedor(
        sesion(MIA, ["proveedor:editar"]),
        proveedorAjeno,
        false,
      ),
    );
  });

  it("sin permiso no se toca la base", async () => {
    await exigeNiTocarLaBase(() =>
      proveedores.listarProveedores(sesion(MIA, [])),
    );
  });
});

describe("usuarios", () => {
  // La mas delicada de las cinco: reciben el id del USUARIO desde la
  // peticion. Alcanzar uno de otra empresa no seria ver un dato ajeno, seria
  // poder desactivarlo o resetearle la clave.
  const usuarioAjeno = "usuario-de-la-empresa-B";

  beforeEach(() => {
    llamadas.length = 0;
  });

  it("listar usuarios sale acotado a mi empresa", async () => {
    await exigeFiltroDeEmpresa(() =>
      usuarios.listarUsuarios(sesion(MIA, ["usuario:leer"])),
    );
  });

  it("desactivar un usuario ajeno va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      usuarios.cambiarEstadoUsuario(
        sesion(MIA, ["usuario:desactivar"]),
        usuarioAjeno,
        false,
      ),
    );
  });

  it("resetear la clave de un usuario ajeno va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      usuarios.resetearClave(sesion(MIA, ["usuario:resetear_clave"]), usuarioAjeno),
    );
  });

  it("eliminar un usuario ajeno va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      usuarios.eliminarUsuario(sesion(MIA, ["usuario:desactivar"]), usuarioAjeno),
    );
  });

  it("sin permiso no se toca la base", async () => {
    await exigeNiTocarLaBase(() => usuarios.listarUsuarios(sesion(MIA, [])));
    await exigeNiTocarLaBase(() =>
      usuarios.resetearClave(sesion(MIA, []), usuarioAjeno),
    );
  });
});

describe("analisis de causa raiz", () => {
  const obraAjena = "obra-de-la-empresa-B";
  const analisisAjeno = "analisis-de-la-empresa-B";
  const leer: Permiso[] = ["plan_semanal:leer"];
  const gestionar: Permiso[] = ["plan_semanal:gestionar"];

  beforeEach(() => {
    llamadas.length = 0;
  });

  it("listar los analisis de una obra ajena va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      causaRaiz.listarAnalisis(sesion(MIA, leer), obraAjena),
    );
  });

  it("las causas que piden analisis van acotadas", async () => {
    await exigeFiltroDeEmpresa(() =>
      causaRaiz.causasParaAnalizar(sesion(MIA, leer), obraAjena),
    );
  });

  it("abrir un analisis en una obra ajena va acotado", async () => {
    // El texto tiene que ser valido: si no, la funcion se va por el error de
    // validacion antes de tocar la base y la prueba no demostraria nada.
    await exigeFiltroDeEmpresa(() =>
      causaRaiz.abrirAnalisis(sesion(MIA, gestionar), obraAjena, {
        causa: "MATERIALES",
        porQue: "El proveedor entrega los viernes",
        accion: "Adelantar el pedido al lunes anterior",
      }),
    );
  });

  it("cerrar un analisis ajeno va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      causaRaiz.cerrarAnalisis(sesion(MIA, gestionar), analisisAjeno),
    );
  });

  it("sin permiso no se toca la base", async () => {
    await exigeNiTocarLaBase(() =>
      causaRaiz.listarAnalisis(sesion(MIA, []), obraAjena),
    );
    await exigeNiTocarLaBase(() =>
      causaRaiz.cerrarAnalisis(sesion(MIA, []), analisisAjeno),
    );
  });
});


/**
 * El presupuesto meta expone el MARGEN de la obra, que es el dato mas
 * sensible que guarda la aplicacion: no solo hay que aislarlo por empresa,
 * es que ensenarselo a quien no toca es peor que ensenarle el presupuesto.
 */
describe("presupuesto meta", () => {
  const obraAjena = "OBRA-DE-EMPRESA-B";
  const metaAjena = "META-DE-EMPRESA-B";

  const leer: Permiso[] = ["meta:leer"];
  const crear: Permiso[] = ["meta:crear"];
  const aprobar: Permiso[] = ["meta:aprobar"];

  /// Una meta minima pero VALIDA: con items vacios la funcion se iria por el
  /// error de validacion antes de tocar la base y no demostraria nada.
  const datos = {
    modo: "PARTIDA" as const,
    fechaMeta: "2026-08-15",
    mesesPlazo: "8",
    items: [
      {
        codigoRef: "1.1",
        descripcion: "Concreto",
        tipo: "PARTIDA" as const,
        parcial: "45000.00",
        porcentajeRecargo: null,
      },
    ],
    gastosGenerales: [],
  };

  beforeEach(() => {
    llamadas.length = 0;
  });

  it("listar las metas de una obra ajena va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      meta.listarMetas(sesion(MIA, leer), obraAjena),
    );
  });

  it("comparar contra el contractual en una obra ajena va acotado", async () => {
    // Con los DOS permisos: la bolsa es la diferencia entre la meta y el
    // contractual, asi que sin `movimiento:leer` la funcion se niega antes de
    // consultar nada y esta prueba no demostraria nada -que es justo el falso
    // verde contra el que avisa `exigeFiltroDeEmpresa`-.
    await exigeFiltroDeEmpresa(() =>
      meta.compararConContractual(
        sesion(MIA, ["meta:leer", "movimiento:leer"]),
        obraAjena,
      ),
    );
  });

  /**
   * Las deducciones de costos propios ensenan la misma materia que la meta -el
   * margen- y ademas la MUEVEN. Aqui se comprueba lo de siempre: que todo lo
   * que consultan va acotado a la empresa de la sesion, tambien cuando llegan
   * a una linea por su id.
   */
  it("listar las deducciones de una obra ajena va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      deducciones.deduccionesDeLaMeta(sesion(MIA, leer), obraAjena),
    );
  });

  it("pedir una deduccion sobre una linea ajena va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      deducciones.solicitarDeduccion(
        sesion(MIA, ["deduccion:solicitar"]),
        obraAjena,
        {
          metaItemId: "ITEM-DE-EMPRESA-B",
          importe: "1000.00",
          motivo: "x",
        },
      ),
    );
  });

  it("firmar una deduccion ajena va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      deducciones.resolverDeduccion(
        sesion(MIA, ["deduccion:aprobar"]),
        obraAjena,
        "DEDUCCION-DE-EMPRESA-B",
        { aprobar: true },
      ),
    );
  });

  it("crear una meta en una obra ajena va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      meta.crearMeta(sesion(MIA, crear), obraAjena, datos),
    );
  });

  it("aprobar una meta ajena va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      meta.aprobarMeta(sesion(MIA, aprobar), metaAjena),
    );
  });

  it("eliminar un borrador ajeno va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      meta.eliminarBorrador(sesion(MIA, crear), metaAjena),
    );
  });

  it("sin permiso no se toca la base", async () => {
    await exigeNiTocarLaBase(() => meta.listarMetas(sesion(MIA, []), obraAjena));
    await exigeNiTocarLaBase(() =>
      meta.compararConContractual(sesion(MIA, []), obraAjena),
    );
    await exigeNiTocarLaBase(() =>
      meta.crearMeta(sesion(MIA, []), obraAjena, datos),
    );
    await exigeNiTocarLaBase(() => meta.aprobarMeta(sesion(MIA, []), metaAjena));
    await exigeNiTocarLaBase(() =>
      meta.eliminarBorrador(sesion(MIA, []), metaAjena),
    );
  });

  it("leer la meta no basta para crearla ni para aprobarla", async () => {
    // El residente ve la bolsa y arma la meta, pero congelarla es otro acto:
    // quien ejecuta contra la meta no deberia poder rebajarla.
    await exigeNiTocarLaBase(() =>
      meta.aprobarMeta(sesion(MIA, [...leer, ...crear]), metaAjena),
    );
  });
});


describe("tablero semanal", () => {
  const obraAjena = "OBRA-DE-EMPRESA-B";
  const planAjeno = "PLAN-DE-EMPRESA-B";

  beforeEach(() => {
    llamadas.length = 0;
  });

  it("el tablero de una semana ajena va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      tablero.obtenerTablero(sesion(MIA, ["plan_semanal:leer"]), obraAjena, planAjeno),
    );
  });

  it("sin permiso no toca la base", async () => {
    await exigeNiTocarLaBase(() =>
      tablero.obtenerTablero(sesion(MIA, []), obraAjena, planAjeno),
    );
  });
});


describe("galeria", () => {
  const obraAjena = "OBRA-DE-EMPRESA-B";
  const fotoAjena = "FOTO-DE-EMPRESA-B";

  beforeEach(() => {
    llamadas.length = 0;
  });

  it("la galeria de una obra ajena va acotada", async () => {
    await exigeFiltroDeEmpresa(() =>
      galeria.listarGaleria(sesion(MIA, ["galeria:leer"]), obraAjena),
    );
  });

  it("el archivo de una foto ajena va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      galeria.archivoGaleria(sesion(MIA, ["galeria:leer"]), fotoAjena),
    );
  });

  it("marcar visible una foto ajena va acotado", async () => {
    await exigeFiltroDeEmpresa(() =>
      galeria.marcarVisibleCliente(
        sesion(MIA, ["galeria:publicar"]),
        fotoAjena,
        true,
      ),
    );
  });

  it("sin permiso no toca la base", async () => {
    await exigeNiTocarLaBase(() =>
      galeria.listarGaleria(sesion(MIA, []), obraAjena),
    );
  });
});

/**
 * ---------------------------------------------------------------------------
 * La capa de DENTRO: el alcance por obra.
 *
 * Lo de arriba defiende la frontera entre constructoras. Esto defiende la de
 * dentro de una: un residente no ve —ni escribe en— las obras que no
 * gestiona, aunque sean de su propia empresa.
 *
 * Se prueban los DOS embudos, que son los que hacen que ninguna pantalla
 * pueda saltarselo:
 *
 *   - `obtenerObra`, por la que pasa el layout de `/obras/[id]` y con el las
 *     mas de cincuenta pantallas de dentro;
 *   - `motivoSiObraCerrada`, por la que pasan las escrituras de treinta
 *     servicios.
 *
 * Y se prueba que ninguno de los dos CONSULTA cuando deniega. No es una
 * optimizacion: si contestaran distinto segun la obra exista o no, probar
 * identificadores seria una forma de averiguar que obras tiene la empresa.
 * ---------------------------------------------------------------------------
 */

const { obtenerObra } = await import("@/services/obras.service");
const { motivoSiObraCerrada } = await import("@/services/obra-abierta");

/// Una obra de MI empresa que NO me han asignado. Es el caso entero.
const OBRA_MIA_AJENA = "obra-de-un-companero";
const OBRA_ASIGNADA = "obra-que-llevo-yo";

describe("alcance por obra", () => {
  beforeEach(() => {
    llamadas.length = 0;
  });

  describe("obtenerObra", () => {
    it("sin restriccion la busca, y acotada a la empresa", async () => {
      await exigeFiltroDeEmpresa(() =>
        obtenerObra(sesion(MIA, ["obra:leer"]), OBRA_MIA_AJENA),
      );
    });

    it("con la obra asignada, la busca", async () => {
      await exigeFiltroDeEmpresa(() =>
        obtenerObra(sesion(MIA, ["obra:leer"], [OBRA_ASIGNADA]), OBRA_ASIGNADA),
      );
    });

    /**
     * El corazon de P0: la obra es de mi empresa —el filtro de arriba la
     * dejaria pasar— y aun asi no se abre.
     */
    it("una obra de mi empresa que no me han asignado NO se abre", async () => {
      const s = sesion(MIA, ["obra:leer"], [OBRA_ASIGNADA]);
      expect(await obtenerObra(s, OBRA_MIA_AJENA)).toBeNull();
    });

    it("y al denegar no consulta nada: no confirma si existe", async () => {
      await exigeNiTocarLaBase(() =>
        obtenerObra(sesion(MIA, ["obra:leer"], [OBRA_ASIGNADA]), OBRA_MIA_AJENA),
      );
    });

    /**
     * La distincion de la que depende todo. Sin asignaciones NO se alcanza
     * nada; escrito con un `if (!lista.length)` pasaria justo lo contrario y
     * el agujero seguiria abierto para cada usuario recien creado.
     */
    it("sin ninguna asignacion no se abre ninguna obra", async () => {
      const s = sesion(MIA, ["obra:leer"], []);
      expect(await obtenerObra(s, OBRA_ASIGNADA)).toBeNull();
    });
  });

  describe("motivoSiObraCerrada (la guarda de escritura)", () => {
    it("da motivo para una obra que no me han asignado", async () => {
      const s = sesion(MIA, ["partida:editar"], [OBRA_ASIGNADA]);
      expect(await motivoSiObraCerrada(s, OBRA_MIA_AJENA)).toBe(
        "No tienes acceso a esta obra.",
      );
    });

    it("y lo da sin consultar: la puerta esta antes de la base", async () => {
      await exigeNiTocarLaBase(() =>
        motivoSiObraCerrada(
          sesion(MIA, ["partida:editar"], [OBRA_ASIGNADA]),
          OBRA_MIA_AJENA,
        ),
      );
    });

    it("con la obra asignada sigue su camino normal y consulta acotado", async () => {
      await exigeFiltroDeEmpresa(() =>
        motivoSiObraCerrada(
          sesion(MIA, ["partida:editar"], [OBRA_ASIGNADA]),
          OBRA_ASIGNADA,
        ),
      );
    });
  });

  describe("listarObras", () => {
    /**
     * El filtro va en el `where` y no despues: si se filtrara en memoria, el
     * total y la paginacion contarian obras que la pagina no ensena.
     */
    it("acota la consulta a las obras asignadas", async () => {
      llamadas.length = 0;
      await listarObras(
        sesion(MIA, ["obra:leer"], [OBRA_ASIGNADA]),
      ).catch(() => undefined);

      const sobreObras = llamadas.filter((l) => l.modelo === "project");
      expect(sobreObras.length).toBeGreaterThan(0);

      for (const c of sobreObras) {
        const where = c.args?.where as { id?: { in?: string[] } } | undefined;
        expect(where?.id?.in).toEqual([OBRA_ASIGNADA]);
      }
    });

    it("sin restriccion no acota por identificador", async () => {
      llamadas.length = 0;
      await listarObras(sesion(MIA, ["obra:leer"])).catch(() => undefined);

      const sobreObras = llamadas.filter((l) => l.modelo === "project");
      expect(sobreObras.length).toBeGreaterThan(0);

      for (const c of sobreObras) {
        const where = c.args?.where as { id?: unknown } | undefined;
        expect(where?.id).toBeUndefined();
      }
    });
  });
});

/**
 * Las partidas, que son el dinero, y el unico servicio que NO pasa por
 * ninguno de los dos embudos.
 *
 * `partidas.service` resuelve la obra por su cuenta y comprueba el estado con
 * `motivoNoAdmiteCambios`, asi que la guarda de `motivoSiObraCerrada` no le
 * alcanza. Se le puso a mano, y esto es lo que avisa el dia que alguien la
 * quite creyendo que sobra porque «ya lo cubre la guarda general».
 */
describe("alcance por obra: partidas", () => {
  beforeEach(() => {
    llamadas.length = 0;
  });

  type Nueva = Parameters<typeof partidas.crearPartida>[2];
  const NUEVA = { codigoPartida: "1.1", descripcion: "Excavacion" } as Nueva;

  it("no crea una partida en una obra de mi empresa que no llevo", async () => {
    const s = sesion(MIA, ["partida:crear"], [OBRA_ASIGNADA]);
    const r = await partidas.crearPartida(s, OBRA_MIA_AJENA, NUEVA);

    expect(r).toEqual({ ok: false, error: "No tienes acceso a esta obra." });
  });

  it("y ni siquiera consulta para negarlo", async () => {
    await exigeNiTocarLaBase(() =>
      partidas.crearPartida(
        sesion(MIA, ["partida:crear"], [OBRA_ASIGNADA]),
        OBRA_MIA_AJENA,
        NUEVA,
      ),
    );
  });

  /**
   * Editar y borrar no reciben `obraId` sino el id de la PARTIDA, asi que la
   * guarda no puede ser un `if`: va dentro del `where`, colgando de `project`.
   * Aqui se comprueba que ese filtro viaja de verdad a la base.
   */
  it("al editar por id de partida, la consulta acota la obra", async () => {
    llamadas.length = 0;
    await partidas
      .actualizarPartida(
        sesion(MIA, ["partida:editar"], [OBRA_ASIGNADA]),
        "partida-de-otra-obra",
        {},
      )
      .catch(() => undefined);

    const sobrePartidas = llamadas.filter((l) => l.modelo === "wbsItem");
    expect(sobrePartidas.length).toBeGreaterThan(0);

    const where = sobrePartidas[0]?.args?.where as
      | { project?: { id?: { in?: string[] } } }
      | undefined;
    expect(where?.project?.id?.in).toEqual([OBRA_ASIGNADA]);
  });
});
