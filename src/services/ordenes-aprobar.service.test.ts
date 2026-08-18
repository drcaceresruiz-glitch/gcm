import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SesionActiva } from "@/services/sesion.service";

/**
 * `aprobarOrden`: el paso que convierte una orden en COMPROMETIDO real.
 *
 * Es el gemelo de `aprobarMovimiento`, con una diferencia de fondo: esto SI
 * se deshace. Una orden aprobada se anula, porque cancelar un pedido a un
 * proveedor es corriente.
 *
 * Las dos invariantes que cuida:
 *
 * 1. **El reparto suma el IMPUTABLE, que no siempre es el neto.** Con
 *    retencion de renta el imputable es el TOTAL: lo retenido se paga igual,
 *    solo que a SUNAT. Cuadrar contra el neto dejaria fuera un 8% de dinero
 *    realmente comprometido.
 * 2. **Las lineas con dinero suman el subtotal**, sin contar las agrupadoras
 *    (que solo repiten el total de su bloque y duplicarian el gasto).
 *
 * Va en archivo aparte de `ordenes.service.test.ts` porque casi todo ocurre
 * dentro de la transaccion y el doble es mucho mayor.
 */

const estado: {
  orden: Record<string, unknown> | null;
  cerrada: string | null;
  /// El `where` del cierre. Ahi tiene que estar el estado BORRADOR.
  condicionCierre: Record<string, unknown> | null;
  aprobado: Record<string, unknown> | null;
  /// Cuantas filas cambia el cierre. 0 simula que otro se adelanto.
  filasQueCambian: number;
  /// Lo que queda escrito en el historial.
  registro: Record<string, unknown> | null;
} = {
  orden: null,
  cerrada: null,
  condicionCierre: null,
  aprobado: null,
  filasQueCambian: 1,
  registro: null,
};

vi.mock("@/services/obra-abierta", () => ({
  motivoSiObraCerrada: () => Promise.resolve(estado.cerrada),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    ordenCompra: {
      findFirst: () => Promise.resolve(estado.orden),
      // El cierre es un `updateMany` CONDICIONADO al estado BORRADOR, no un
      // `update` por id: es lo que hace que dos pulsaciones a la vez no
      // aprueben dos veces (la segunda no encuentra fila que cambiar).
      updateMany: (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        estado.condicionCierre = args.where;
        estado.aprobado = args.data;
        return Promise.resolve({ count: estado.filasQueCambian });
      },
    },
    auditLog: {
      create: (args: { data: Record<string, unknown> }) => {
        estado.registro = args.data;
        return Promise.resolve({});
      },
    },
  };

  return {
    prisma: {
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
      // FUERA de la transaccion: la guarda de obra cerrada recibe el id de la
      // ORDEN, asi que primero remonta a la obra. Si la orden no existe
      // devuelve null a proposito, para que sea la operacion la que hable con
      // su propio mensaje.
      ordenCompra: {
        findFirst: () =>
          Promise.resolve(estado.orden ? { projectId: "obra-1" } : null),
      },
    },
  };
});

const { aprobarOrden } = await import("@/services/ordenes.service");

function sesion(permisos: string[]): SesionActiva {
  return {
    userId: "u-1",
    companyId: "empresa-1",
    role: "ADMIN",
    permisos,
    nombres: "Ana",
    apellidos: "Quispe",
    email: "ana@constructora.pe",
  } as unknown as SesionActiva;
}

const CON_PERMISO = sesion(["orden:aprobar"]);

/**
 * Una orden en borrador, lista para aprobar: con IGV, sin detalle de lineas
 * y con el reparto cuadrado contra el neto.
 *
 * Los importes van como texto porque el servicio los lee con `.toString()`,
 * igual que haria con los `Decimal` de Prisma.
 */
function orden(cambios: Record<string, unknown> = {}) {
  return {
    id: "oc-1",
    projectId: "obra-1",
    numero: "OC-00119",
    estado: "BORRADOR",
    subtotal: "29000.00",
    tipoImpuesto: "IGV",
    neto: "29000.00",
    total: "34220.00",
    lineas: [],
    imputaciones: [{ importe: "29000.00" }],
    ...cambios,
  };
}

beforeEach(() => {
  estado.orden = orden();
  estado.cerrada = null;
  estado.condicionCierre = null;
  estado.aprobado = null;
  estado.filasQueCambian = 1;
  estado.registro = null;
});

/** Toda negativa tiene que dejar la orden SIN aprobar y sin historial. */
function seNego(r: { ok: boolean; error?: string }, trozo: string) {
  expect(r.ok).toBe(false);
  expect(!r.ok && r.error).toContain(trozo);
  expect(estado.aprobado).toBeNull();
  expect(estado.registro).toBeNull();
}

describe("aprobarOrden: quien puede y que se puede aprobar", () => {
  it("sin el permiso de aprobar, no aprueba nada", async () => {
    // Aprobar es un permiso PROPIO: quien redacta la orden no la aprueba
    // solo por haberla redactado.
    const r = await aprobarOrden(sesion(["orden:crear"]), "oc-1");
    seNego(r, "No tienes permiso para aprobar");
  });

  it("una orden de otra empresa no se encuentra", async () => {
    estado.orden = null;
    const r = await aprobarOrden(CON_PERMISO, "oc-1");
    seNego(r, "Orden no encontrada");
  });

  it("aprobar dos veces se rechaza diciendo el numero", async () => {
    // Sin esto, la segunda aprobacion volveria a comprometer el mismo dinero
    // contra las mismas partidas.
    estado.orden = orden({ estado: "APROBADA" });
    const r = await aprobarOrden(CON_PERMISO, "oc-1");
    seNego(r, "OC-00119 ya estaba aprobada");
  });

  it("una orden anulada no se reaprueba: se registra otra", async () => {
    // Anular no es borrar. La orden sigue ahi con su motivo, y resucitarla
    // borraria la razon por la que se cancelo.
    estado.orden = orden({ estado: "ANULADA" });
    const r = await aprobarOrden(CON_PERMISO, "oc-1");
    seNego(r, "esta anulada");
  });

  it("con la obra cerrada no se aprueba", async () => {
    estado.cerrada = "La obra esta cerrada desde el 01/07/2026.";
    const r = await aprobarOrden(CON_PERMISO, "oc-1");
    seNego(r, "cerrada desde");
  });
});

describe("aprobarOrden: el reparto suma el IMPUTABLE, no siempre el neto", () => {
  it("con IGV se reparte el neto, porque el IGV se recupera", async () => {
    // El IGV que factura el proveedor es credito fiscal, no costo de obra.
    // Repartir el total inflaria la obra con dinero que vuelve.
    estado.orden = orden({
      tipoImpuesto: "IGV",
      neto: "29000.00",
      total: "34220.00",
      imputaciones: [{ importe: "29000.00" }],
    });

    const r = await aprobarOrden(CON_PERMISO, "oc-1");
    expect(r.ok).toBe(true);
  });

  it("con retencion de renta se reparte el TOTAL, y repartir el neto se rechaza", async () => {
    // ESTA es la regla del modulo. En la OC 00119 real: 29,000 limpios para
    // el proveedor salen de un total de 31,521.74 con 2,521.74 retenidos.
    // Esos 2,521.74 se pagan igual, solo que a SUNAT, asi que son dinero
    // comprometido. Cuadrar contra el neto los dejaria fuera.
    estado.orden = orden({
      tipoImpuesto: "RENTA",
      neto: "29000.00",
      total: "31521.74",
      subtotal: "29000.00",
      imputaciones: [{ importe: "29000.00" }],
    });

    const r = await aprobarOrden(CON_PERMISO, "oc-1");
    seNego(r, "hay que repartir 31521.74");
  });

  it("con retencion, repartiendo el total, se aprueba", async () => {
    // El reverso del anterior: el mismo caso bien repartido pasa. Sin esta
    // pareja, un servicio que rechazara SIEMPRE las ordenes con retencion
    // pasaria la prueba de arriba.
    estado.orden = orden({
      tipoImpuesto: "RENTA",
      neto: "29000.00",
      total: "31521.74",
      subtotal: "29000.00",
      imputaciones: [{ importe: "31521.74" }],
    });

    const r = await aprobarOrden(CON_PERMISO, "oc-1");
    expect(r.ok).toBe(true);
  });

  it("un reparto que no cuadra dice cuanto sobra o falta", async () => {
    // Repartido entre varias partidas, el descuadre no se ve a ojo: el
    // mensaje tiene que traer la diferencia.
    estado.orden = orden({
      imputaciones: [{ importe: "20000.00" }, { importe: "8000.00" }],
    });

    const r = await aprobarOrden(CON_PERMISO, "oc-1");
    seNego(r, "difiere en -1000.00");
  });
});

describe("aprobarOrden: las lineas con dinero suman el subtotal", () => {
  it("una linea agrupadora no suma: solo repite el total de su bloque", async () => {
    // El proveedor escribe "PARTIDA 1 ..... 29,000" y debajo el desglose. Si
    // el agrupador contara, el gasto saldria por el doble.
    estado.orden = orden({
      lineas: [
        { esAgrupador: true, importe: "29000.00" },
        { esAgrupador: false, importe: "20000.00" },
        { esAgrupador: false, importe: "9000.00" },
      ],
    });

    const r = await aprobarOrden(CON_PERMISO, "oc-1");
    expect(r.ok).toBe(true);
  });

  it("si un agrupador no esta marcado, las lineas no cuadran y lo dice", async () => {
    // El mismo desglose de arriba con el agrupador sin marcar: suma el doble.
    // Es el error tipico al teclear una orden, y el mensaje apunta a el.
    estado.orden = orden({
      lineas: [
        { esAgrupador: false, importe: "29000.00" },
        { esAgrupador: false, importe: "20000.00" },
        { esAgrupador: false, importe: "9000.00" },
      ],
    });

    const r = await aprobarOrden(CON_PERMISO, "oc-1");
    seNego(r, "Las lineas suman 58000.00 y el subtotal dice 29000.00");
  });

  it("una orden historica sin detalle se aprueba: entra por cabecera", async () => {
    // Las ordenes cargadas de antes no tienen lineas. Exigirselas cerraria
    // la puerta a todo el historico.
    estado.orden = orden({ lineas: [] });

    const r = await aprobarOrden(CON_PERMISO, "oc-1");
    expect(r.ok).toBe(true);
  });
});

describe("aprobarOrden: dos pulsaciones no aprueban dos veces", () => {
  it("el cierre exige que la fila siga en BORRADOR", async () => {
    // No basta con haber leido el estado al principio: entre la lectura y la
    // escritura cabe otra aprobacion. La condicion viaja EN el update.
    await aprobarOrden(CON_PERMISO, "oc-1");
    expect(estado.condicionCierre).toMatchObject({ estado: "BORRADOR" });
  });

  it("si otro se adelanto y no queda fila que cambiar, no se da por aprobada", async () => {
    estado.filasQueCambian = 0;
    const r = await aprobarOrden(CON_PERMISO, "oc-1");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("ya estaba aprobada");
  });
});

describe("aprobarOrden: lo que queda escrito", () => {
  it("el camino bueno deja la orden APROBADA, con fecha y con quien la aprobo", async () => {
    // Sin este caso, una funcion que rechazara todo pasaria las doce
    // negativas de arriba en verde.
    const r = await aprobarOrden(CON_PERMISO, "oc-1");

    expect(r.ok).toBe(true);
    expect(r.ok && r.numero).toBe("OC-00119");
    expect(estado.aprobado).toMatchObject({
      estado: "APROBADA",
      aprobadaPor: "Ana Quispe (ana@constructora.pe)",
    });
    expect(estado.aprobado?.aprobadaAt).toBeInstanceOf(Date);
  });

  it("el historial anota el IMPUTABLE como comprometido, no el neto", async () => {
    // Con retencion, anotar el neto subestimaba el apunte un 8%. No afecta a
    // ninguna cifra de control —esas salen de `OrdenImputacion`— pero un
    // historial que no cuadra con la realidad no sirve para auditar.
    estado.orden = orden({
      tipoImpuesto: "RENTA",
      neto: "29000.00",
      total: "31521.74",
      subtotal: "29000.00",
      imputaciones: [{ importe: "31521.74" }],
    });

    await aprobarOrden(CON_PERMISO, "oc-1");

    expect(estado.registro).toMatchObject({
      entidad: "OrdenCompra",
      accion: "APPROVE",
      despues: expect.objectContaining({
        comprometido: "31521.74",
        neto: "29000.00",
      }),
    });
  });
});
