import { describe, it, expect, vi, beforeEach } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * Corregir un encargo (`editarEncargo`) y cambiarle el estado
 * (`cambiarEstadoEncargo`).
 *
 * El alta y la valorizacion ya estaban cubiertas; estas dos son las que
 * MODIFICAN un reparto que ya existe, y ahi hay dos cosas que cuidar:
 *
 *  - **El frente sigue sin poder pasar del 100 %** al editar, y ademas hay que
 *    EXCLUIRSE a uno mismo del recuento: si el propio encargo contara, subir
 *    su fraccion del 60 al 70 se leeria como 130 y se rechazaria solo.
 *  - **El estado mueve dinero.** «Comprometido» son los encargos VIGENTES, asi
 *    que anular uno lo saca de la cuenta de la obra. Es el modo de fallo de la
 *    casa: una fila que cambia de naturaleza y deja de contar.
 *
 * Prisma doblado, sin base.
 */

interface FilaWbs {
  id: string;
  codigoPartida: string;
  /// Lo que ya tienen asignado OTROS encargos vigentes.
  encargos: { fraccion: string }[];
}

const estado: {
  encargo: { id: string; estado: string } | null;
  partidas: FilaWbs[];
  cerrada: string | null;
  /// El `where` con el que se pidieron los encargos ya asignados. Es lo unico
  /// observable del filtro desde el doble: la exclusion vive DENTRO de la
  /// consulta, asi que no se puede comprobar por su resultado.
  filtroEncargos: Record<string, unknown> | null;
  /// Lo escrito sobre el encargo al editar.
  actualizado: Record<string, unknown> | null;
  /// Cuantas veces se vaciaron sus partidas (editar reemplaza).
  partidasBorradas: number;
  /// Los `updateMany` de cambiar estado.
  cambios: { where: Record<string, unknown>; data: Record<string, unknown> }[];
  /// Cuantas filas dice la base que toco el ultimo `updateMany`.
  filasQueTocaria: number;
  /// Cuantas valorizaciones tiene el encargo. Es lo que decide si se puede
  /// anular.
  avances: number;
  /// El `where` con el que se contaron. La regla decide con ese numero, asi
  /// que si el recuento no estuviera acotado por empresa, decidiria con datos
  /// ajenos.
  filtroAvances: Record<string, unknown> | null;
  apuntes: Record<string, unknown>[];
} = {
  encargo: { id: "enc-1", estado: "VIGENTE" },
  partidas: [],
  cerrada: null,
  filtroEncargos: null,
  actualizado: null,
  partidasBorradas: 0,
  cambios: [],
  filasQueTocaria: 1,
  avances: 0,
  filtroAvances: null,
  apuntes: [],
};

vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: () => Promise.resolve(estado.cerrada),
}));

vi.mock("@/lib/prisma", () => {
  const auditLog = {
    create: (args: { data: Record<string, unknown> }) => {
      estado.apuntes.push(args.data);
      return Promise.resolve({});
    },
  };

  const tx = {
    encargoPartida: {
      deleteMany: () => {
        estado.partidasBorradas += 1;
        return Promise.resolve({ count: 1 });
      },
    },
    encargoProveedor: {
      update: (args: { data: Record<string, unknown> }) => {
        estado.actualizado = args.data;
        return Promise.resolve({});
      },
    },
    auditLog,
  };

  return {
    prisma: {
      encargoProveedor: {
        findFirst: () => Promise.resolve(estado.encargo),
        updateMany: (args: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          estado.cambios.push(args);
          return Promise.resolve({ count: estado.filasQueTocaria });
        },
      },
      valorizacionEncargo: {
        count: (args: { where: Record<string, unknown> }) => {
          estado.filtroAvances = args.where;
          return Promise.resolve(estado.avances);
        },
      },
      wbsItem: {
        findMany: (args: {
          where: { id: { in: string[] } };
          select?: { encargos?: { where?: { encargo?: Record<string, unknown> } } };
        }) => {
          estado.filtroEncargos = args.select?.encargos?.where?.encargo ?? null;
          return Promise.resolve(
            estado.partidas.filter((p) => args.where.id.in.includes(p.id)),
          );
        },
      },
      auditLog,
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    },
  };
});

const { editarEncargo, cambiarEstadoEncargo } = await import(
  "@/services/encargos.service"
);

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
    // `null` es «alcanza todas las obras de su empresa». Sin este campo la
    // sesion no es valida: la lista vacia y el null son cosas opuestas.
    obrasAsignadas: null,
    nombres: "Ana",
    apellidos: "Quispe",
  } as unknown as SesionActiva;
}

const GESTOR = sesion(["encargo:gestionar"]);
/// Puede reconocer avance pero NO repartir el trabajo. Son permisos distintos
/// a proposito: valorizar es de obra, gestionar es de oficina.
const SOLO_VALORIZA = sesion(["encargo:valorizar"]);

const DATOS = {
  proveedorId: "prov-1",
  descripcion: "Estructuras del bloque B",
  montoContratado: "50000.00",
  partidas: [{ wbsItemId: "w-1", fraccion: "70" }],
};

beforeEach(() => {
  estado.encargo = { id: "enc-1", estado: "VIGENTE" };
  estado.partidas = [{ id: "w-1", codigoPartida: "01.01", encargos: [] }];
  estado.cerrada = null;
  estado.filtroEncargos = null;
  estado.actualizado = null;
  estado.partidasBorradas = 0;
  estado.cambios = [];
  estado.filasQueTocaria = 1;
  estado.avances = 0;
  estado.filtroAvances = null;
  estado.apuntes = [];
});

describe("editar un encargo: las puertas", () => {
  it("quien solo valoriza no puede editarlo", async () => {
    const r = await editarEncargo(SOLO_VALORIZA, "obra-1", "enc-1", DATOS);

    expect(r).toEqual({
      ok: false,
      error: "No tienes permiso para gestionar encargos.",
    });
    expect(estado.actualizado).toBeNull();
  });

  it("con la obra cerrada tampoco", async () => {
    estado.cerrada = "La obra esta cerrada.";
    const r = await editarEncargo(GESTOR, "obra-1", "enc-1", DATOS);

    expect(r).toEqual({ ok: false, error: "La obra esta cerrada." });
    expect(estado.actualizado).toBeNull();
  });

  it("un monto negativo no pasa", async () => {
    const r = await editarEncargo(GESTOR, "obra-1", "enc-1", {
      ...DATOS,
      montoContratado: "-1",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no negativo");
    expect(estado.actualizado).toBeNull();
  });

  it("un encargo sin partidas deja de cubrir nada", async () => {
    const r = await editarEncargo(GESTOR, "obra-1", "enc-1", {
      ...DATOS,
      partidas: [],
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("al menos una partida");
  });

  it("uno que no existe lo dice", async () => {
    estado.encargo = null;
    const r = await editarEncargo(GESTOR, "obra-1", "enc-1", DATOS);

    expect(r).toEqual({ ok: false, error: "Encargo no encontrado." });
  });

  /// Un encargo anulado ya no reparte trabajo: editarlo lo devolveria a la
  /// vida por la puerta de atras, sin pasar por reabrirlo.
  it("uno ANULADO no se edita", async () => {
    estado.encargo = { id: "enc-1", estado: "ANULADO" };
    const r = await editarEncargo(GESTOR, "obra-1", "enc-1", DATOS);

    expect(r).toEqual({ ok: false, error: "Un encargo anulado no se edita." });
    expect(estado.actualizado).toBeNull();
  });
});

describe("editar un encargo: el frente", () => {
  it("no deja pasar del 100 % contando lo de otros proveedores", async () => {
    estado.partidas = [
      { id: "w-1", codigoPartida: "01.01", encargos: [{ fraccion: "40" }] },
    ];

    // 40 de otro + 70 de este = 110.
    const r = await editarEncargo(GESTOR, "obra-1", "enc-1", DATOS);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("01.01");
    expect(estado.actualizado).toBeNull();
  });

  /**
   * LA REGLA PROPIA DE EDITAR: el encargo se excluye a si mismo del recuento.
   *
   * Sin eso, subir su propia fraccion del 60 al 70 sumaria 130 y se
   * rechazaria solo. La exclusion vive DENTRO del `where` de la consulta, asi
   * que desde el doble no se puede observar por el resultado: lo unico
   * observable es que el servicio la PIDA.
   */
  it("y se excluye a si mismo al contar lo ya asignado", async () => {
    await editarEncargo(GESTOR, "obra-1", "enc-1", DATOS);

    expect(estado.filtroEncargos).toEqual({
      estado: "VIGENTE",
      id: { not: "enc-1" },
    });
  });

  it("el camino bueno: reemplaza las partidas y guarda la cabecera", async () => {
    const r = await editarEncargo(GESTOR, "obra-1", "enc-1", {
      ...DATOS,
      montoContratado: "51,500.50",
    });

    expect(r).toEqual({ ok: true, id: "enc-1" });
    // Editar REEMPLAZA el frente: primero se vacia y luego se recrea.
    expect(estado.partidasBorradas).toBe(1);
    expect(estado.actualizado).toMatchObject({
      descripcion: "Estructuras del bloque B",
      montoContratado: "51500.50",
    });
  });
});

describe("cambiar el estado de un encargo", () => {
  it("quien solo valoriza no puede", async () => {
    const r = await cambiarEstadoEncargo(
      SOLO_VALORIZA,
      "obra-1",
      "enc-1",
      "ANULADO",
    );

    expect(r).toEqual({
      ok: false,
      error: "No tienes permiso para gestionar encargos.",
    });
    expect(estado.cambios).toEqual([]);
  });

  it("con la obra cerrada tampoco", async () => {
    estado.cerrada = "La obra esta cerrada.";
    const r = await cambiarEstadoEncargo(GESTOR, "obra-1", "enc-1", "CERRADO");

    expect(r).toEqual({ ok: false, error: "La obra esta cerrada." });
    expect(estado.cambios).toEqual([]);
  });

  /**
   * El cambio va acotado por obra Y por empresa dentro del propio `where`, no
   * leyendo antes: es lo que impide cambiar el estado de un encargo de otra
   * constructora acertando su id. Que no toque ninguna fila ES la negativa.
   */
  it("uno de otra obra o de otra empresa no se encuentra", async () => {
    estado.filasQueTocaria = 0;

    const r = await cambiarEstadoEncargo(GESTOR, "obra-1", "ajeno", "ANULADO");

    expect(r).toEqual({ ok: false, error: "Encargo no encontrado." });
    expect(estado.apuntes).toEqual([]);
    expect(estado.cambios[0]?.where).toMatchObject({
      id: "ajeno",
      projectId: "obra-1",
      project: { companyId: "empresa-1" },
    });
  });

  it("el camino bueno: cambia y deja constancia del estado nuevo", async () => {
    const r = await cambiarEstadoEncargo(GESTOR, "obra-1", "enc-1", "CERRADO");

    expect(r).toEqual({ ok: true, id: "enc-1" });
    expect(estado.cambios[0]?.data).toEqual({ estado: "CERRADO" });
    expect(estado.apuntes[0]).toMatchObject({
      entidad: "EncargoProveedor",
      accion: "UPDATE",
      despues: { estado: "CERRADO" },
    });
  });

  /**
   * LO INICIADO NO SE ANULA (regla del usuario, 19/08).
   *
   * Anular es decir «esto nunca fue». Un encargo con avance reconocido SI fue:
   * sacarlo del comprometido —«Comprometido» son los VIGENTES— dejaria sus
   * valorizaciones, y los pagos que cuelgan de ellas, apuntando a un contrato
   * que dice que no existio.
   *
   * Cierra la simetria que el modulo ya tenia por los otros dos lados: un
   * anulado no se edita y un anulado no se valoriza.
   */
  it("uno con avance reconocido NO se anula, y manda a cerrarlo", async () => {
    estado.avances = 3;

    const r = await cambiarEstadoEncargo(GESTOR, "obra-1", "enc-1", "ANULADO");

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("3 valorización(es)");
      expect(r.error).toContain("Ciérralo");
    }
    // Y no se toco: la negativa llega antes de escribir.
    expect(estado.cambios).toEqual([]);
    expect(estado.apuntes).toEqual([]);
  });

  /// La otra direccion, sin la cual un servicio que rechazara TODAS las
  /// anulaciones quedaria en verde.
  it("pero uno sin avance si se anula", async () => {
    estado.avances = 0;

    const r = await cambiarEstadoEncargo(GESTOR, "obra-1", "enc-1", "ANULADO");

    expect(r.ok).toBe(true);
    expect(estado.cambios[0]?.data).toEqual({ estado: "ANULADO" });
  });

  /// Y CERRAR es justo la salida que ofrece el mensaje: tiene que funcionar
  /// con avance, o el consejo mandaria a una puerta cerrada.
  it("y con avance SI se puede cerrar, que es lo que el mensaje propone", async () => {
    estado.avances = 3;

    const r = await cambiarEstadoEncargo(GESTOR, "obra-1", "enc-1", "CERRADO");

    expect(r.ok).toBe(true);
    expect(estado.cambios[0]?.data).toEqual({ estado: "CERRADO" });
  });

  /**
   * El recuento va acotado por obra Y empresa dentro de su propio `where`. Sin
   * eso, el id de un encargo de otra constructora contaria cero avances y la
   * regla lo dejaria anular — comprobando la propiedad justo despues, pero
   * habiendo decidido con datos ajenos.
   */
  it("y ese recuento no mira los avances de otra empresa", async () => {
    estado.avances = 1;
    await cambiarEstadoEncargo(GESTOR, "obra-1", "enc-1", "ANULADO");

    expect(estado.filtroAvances).toEqual({
      encargoId: "enc-1",
      encargo: {
        projectId: "obra-1",
        project: { companyId: "empresa-1" },
      },
    });
  });
});
