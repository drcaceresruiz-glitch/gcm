import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SesionActiva } from "@/services/sesion.service";
import type { Permiso } from "@/lib/rbac";

/**
 * La lectura de gerencia.
 *
 * Se defienden tres cosas: que solo la vea quien responde de toda la cartera,
 * que el importe salga de las LINEAS y no del total guardado —que en un
 * borrador puede ir por detras— y que el coste no crezca con el numero de
 * obras.
 *
 * Ampliado el 22 de agosto de 2026 con las tres secciones nuevas del
 * rediseno de `/gerencia` (sobregiro proyectado, compras/encargos sin
 * aprobar, restricciones de Lookahead vencidas) — mismo `llamadas`/`datos`
 * que ya defendia el coste de `semaforoDeCartera`/`adicionalesEnBorrador`,
 * extendido con los modelos que faltaban.
 */

interface Llamada {
  modelo: string;
  args: unknown;
}

const llamadas: Llamada[] = [];
const datos = {
  movimientos: [] as unknown[],
  lineas: [] as unknown[],
  obras: [] as unknown[],
  /// Cronograma vigente por obra. Sin entrada = la obra no tiene ninguno.
  cronogramas: {} as Record<string, unknown>,
  avances: [] as unknown[],
  ordenesCompra: [] as unknown[],
  /// Los encargos VIGENTES tal como los lee `comprometido.service.ts`: con
  /// sus adendas aprobadas y sus partidas, no ya agregados.
  encargosVigentes: [] as {
    projectId: string;
    montoContratado: string;
    adendas: { importe: string }[];
    partidas: unknown[];
  }[],
  /// Las ordenes sueltas aprobadas, agrupadas por partida.
  sueltasComprometido: [] as { wbsItemId: string; _sum: { importe: string } }[],
  imputacionesSueltas: [] as { importe: string; ordenCompra: { projectId: string } }[],
  wbsItems: [] as unknown[],
  restricciones: [] as unknown[],
  /// Adendas PENDIENTES, para la bandeja de firma.
  adendas: [] as unknown[],
  /// Deducciones de costos propios PENDIENTES, la otra mitad de la bandeja.
  deducciones: [] as unknown[],
  /// Encargos completos (fechasValorizacion/valorizaciones/pagos), para
  /// `valorizacionesDeCartera` -distinto del agregado `encargosVigentes`.
  encargosCompletos: [] as unknown[],
  /// `PlanSemanal` CERRADO, para `ppcDeLaUltimaCerrada` (llamada de verdad,
  /// no mockeada, desde `confiabilidadDeCartera`).
  planesSemanales: [] as {
    projectId: string;
    numero: number;
    fechaCorte: Date;
    compromisos: { cumplido: boolean | null; causa: null }[];
  }[],
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    movimientoPresupuestal: {
      findMany: async (args: unknown) => {
        llamadas.push({ modelo: "movimientoPresupuestal", args });
        return datos.movimientos;
      },
    },
    movimientoLinea: {
      groupBy: async (args: unknown) => {
        llamadas.push({ modelo: "movimientoLinea", args });
        return datos.lineas;
      },
    },
    project: {
      findMany: async (args: unknown) => {
        llamadas.push({ modelo: "project", args });
        return datos.obras;
      },
    },
    cronograma: {
      findFirst: async (args: unknown) => {
        llamadas.push({ modelo: "cronograma", args });
        const id = (args as { where: { projectId: string } }).where.projectId;
        return datos.cronogramas[id] ?? null;
      },
    },
    avanceTarea: {
      findMany: async (args: unknown) => {
        llamadas.push({ modelo: "avanceTarea", args });
        return datos.avances;
      },
    },
    ordenCompra: {
      findMany: async (args: unknown) => {
        llamadas.push({ modelo: "ordenCompra", args });
        return datos.ordenesCompra;
      },
    },
    encargoProveedor: {
      findMany: async (args: unknown) => {
        llamadas.push({ modelo: "encargoProveedor:findMany", args });
        // Dos lecturas distintas comparten el modelo: la del comprometido
        // pide `partidas` para repartir; la de valorizaciones, cadencia y
        // pagos. Se distinguen por el select en vez de por el orden, que es
        // lo que hacia fallar la prueba al cambiar el uno de sitio.
        const select = (args as { select?: Record<string, unknown> }).select;
        if (select?.partidas) return datos.encargosVigentes;
        return datos.encargosCompletos;
      },
    },
    planSemanal: {
      groupBy: async (args: unknown) => {
        llamadas.push({ modelo: "planSemanal:groupBy", args });
        const porObra = new Map<string, Date>();
        for (const p of datos.planesSemanales) {
          const actual = porObra.get(p.projectId);
          if (!actual || p.fechaCorte > actual) porObra.set(p.projectId, p.fechaCorte);
        }
        return [...porObra.entries()].map(([projectId, fechaCorte]) => ({
          projectId,
          _max: { fechaCorte },
        }));
      },
      findMany: async (args: unknown) => {
        llamadas.push({ modelo: "planSemanal:findMany", args });
        const pares = (
          args as { where: { OR: { projectId: string; fechaCorte: Date }[] } }
        ).where.OR;
        return datos.planesSemanales.filter((p) =>
          pares.some(
            (par) =>
              par.projectId === p.projectId &&
              par.fechaCorte.getTime() === p.fechaCorte.getTime(),
          ),
        );
      },
    },
    ordenImputacion: {
      findMany: async (args: unknown) => {
        llamadas.push({ modelo: "ordenImputacion", args });
        return datos.imputacionesSueltas;
      },
      groupBy: async (args: unknown) => {
        llamadas.push({ modelo: "ordenImputacion:groupBy", args });
        return datos.sueltasComprometido;
      },
    },
    wbsItem: {
      findMany: async (args: unknown) => {
        llamadas.push({ modelo: "wbsItem", args });
        return datos.wbsItems;
      },
    },
    restriccion: {
      findMany: async (args: unknown) => {
        llamadas.push({ modelo: "restriccion", args });
        return datos.restricciones;
      },
    },
    adendaEncargo: {
      findMany: async (args: unknown) => {
        llamadas.push({ modelo: "adendaEncargo", args });
        return datos.adendas;
      },
    },
    deduccionCostoPropio: {
      findMany: async (args: unknown) => {
        llamadas.push({ modelo: "deduccionCostoPropio", args });
        return datos.deducciones;
      },
    },
  },
}));

const {
  adicionalesEnBorrador,
  semaforoDeCartera,
  sobregiroProyectadoDeCartera,
  comprasPendientesDeAprobar,
  restriccionesDeCartera,
  evmDeCartera,
  confiabilidadDeCartera,
  valorizacionesDeCartera,
  adendasPorFirmar,
  MAX_ADENDAS_EN_BANDEJA,
  MAX_OBRAS_POR_CARGA,
  UMBRAL_SOBREGIRO_PROYECTADO_PUNTOS,
} = await import("@/services/gerencia.service");

function sesion(
  obrasAsignadas: string[] | null,
  permisos: Permiso[] = ["movimiento:leer"],
): SesionActiva {
  return {
    sesionId: "s1",
    userId: "u1",
    companyId: "emp-1",
    role: obrasAsignadas === null ? "ADMIN" : "RESIDENTE",
    permisos,
    obrasAsignadas,
    nombres: "Ana",
    apellidos: "Perez",
    email: "ana@ejemplo.pe",
    mustChangePassword: false,
    esOperador: false,
    rolReal: obrasAsignadas === null ? "ADMIN" : "RESIDENTE",
    previsualizacionHabilitada: false,
  };
}

/// Dos adicionales en una obra y uno en otra.
function conTresAdicionales() {
  datos.movimientos = [
    { id: "m1", projectId: "o1", project: { nombreObra: "TORRE A" } },
    { id: "m2", projectId: "o1", project: { nombreObra: "TORRE A" } },
    { id: "m3", projectId: "o2", project: { nombreObra: "COLEGIO B" } },
  ];
  datos.lineas = [
    { movimientoId: "m1", _sum: { importe: "1000.00" } },
    { movimientoId: "m2", _sum: { importe: "500.50" } },
    { movimientoId: "m3", _sum: { importe: "9000.00" } },
  ];
}

beforeEach(() => {
  llamadas.length = 0;
  datos.movimientos = [];
  datos.lineas = [];
  datos.obras = [];
  datos.cronogramas = {};
  datos.avances = [];
  datos.ordenesCompra = [];
  datos.encargosVigentes = [];
  datos.imputacionesSueltas = [];
  datos.sueltasComprometido = [];
  datos.adendas = [];
  datos.deducciones = [];
  datos.wbsItems = [];
  datos.restricciones = [];
  datos.encargosCompletos = [];
  datos.planesSemanales = [];
});

describe("adicionalesEnBorrador", () => {
  it("agrupa por obra y suma el impacto de la cartera", async () => {
    conTresAdicionales();

    const r = await adicionalesEnBorrador(sesion(null));

    expect(r?.cuantos).toBe(3);
    expect(r?.importe).toBe("10500.50");
    // Ordenado por impacto: primero lo que mas dinero mueve.
    expect(r?.porObra).toEqual([
      { obraId: "o2", obraNombre: "COLEGIO B", cuantos: 1, importe: "9000.00" },
      { obraId: "o1", obraNombre: "TORRE A", cuantos: 2, importe: "1500.50" },
    ]);
  });

  /**
   * La linea que traza el alcance por obra: quien lleva una obra no ve el
   * pendiente de las demas, aunque tenga permiso de movimientos.
   */
  it("no la ve quien no ve toda la cartera", async () => {
    conTresAdicionales();
    expect(await adicionalesEnBorrador(sesion(["o1"]))).toBeNull();
    // Y ni siquiera consulta.
    expect(llamadas).toEqual([]);
  });

  it("sin permiso de movimientos tampoco, y sin tocar la base", async () => {
    conTresAdicionales();
    expect(await adicionalesEnBorrador(sesion(null, []))).toBeNull();
    expect(llamadas).toEqual([]);
  });

  /**
   * El coste es lo que decide si esta pantalla puede existir: DOS consultas,
   * sean dos obras o cuarenta. Si alguien anade una por obra, esto falla.
   */
  it("cuesta dos consultas, no una por obra", async () => {
    conTresAdicionales();
    await adicionalesEnBorrador(sesion(null));
    expect(llamadas.map((l) => l.modelo)).toEqual([
      "movimientoPresupuestal",
      "movimientoLinea",
    ]);
  });

  it("pide solo ADICIONAL en BORRADOR y de la empresa de la sesion", async () => {
    conTresAdicionales();
    await adicionalesEnBorrador(sesion(null));

    const where = (llamadas[0]?.args as { where: Record<string, unknown> }).where;
    expect(where).toEqual({
      tipo: "ADICIONAL",
      estado: "BORRADOR",
      project: { companyId: "emp-1" },
    });
  });

  it("sin adicionales devuelve cero y no consulta las lineas", async () => {
    const r = await adicionalesEnBorrador(sesion(null));
    expect(r).toEqual({ porObra: [], importe: "0.00", cuantos: 0 });
    expect(llamadas).toHaveLength(1);
  });

  /**
   * Un movimiento sin lineas todavia —recien creado— cuenta como cero, no
   * rompe la suma ni desaparece de la lista: existe y alguien lo esta
   * redactando.
   */
  it("un borrador sin lineas suma cero y sigue contando", async () => {
    datos.movimientos = [
      { id: "m1", projectId: "o1", project: { nombreObra: "TORRE A" } },
    ];
    datos.lineas = [];

    const r = await adicionalesEnBorrador(sesion(null));
    expect(r?.cuantos).toBe(1);
    expect(r?.importe).toBe("0.00");
    expect(r?.porObra[0]?.importe).toBe("0.00");
  });
});

// ---------------------------------------------------------------------------
// El semaforo de partidas criticas
// ---------------------------------------------------------------------------

/// La fecha de corte del cronograma vigente de las pruebas.
const CORTE = new Date("2026-08-01T00:00:00Z");

function obra(id: string, sobre: Record<string, unknown> = {}) {
  return {
    id,
    nombreObra: `OBRA ${id.toUpperCase()}`,
    estado: "EN_EJECUCION",
    archivadaEn: null,
    diaCorteSemanal: 5,
    ...sobre,
  };
}

/**
 * Una fila de tarea tal como la devuelve el select estrecho. Los numericos
 * van como texto, igual que los devuelve una columna Decimal ya convertida:
 * al servicio solo le hace falta que tengan `toString()`.
 */
function tarea(uid: number, sobre: Record<string, unknown> = {}) {
  return {
    uid,
    fila: uid,
    codigo: `${uid}.0`,
    nombre: `Partida ${uid}`,
    nivel: 2,
    esResumen: false,
    esHito: false,
    esCritico: false,
    inicio: new Date("2026-01-01T00:00:00Z"),
    fin: new Date("2026-12-31T00:00:00Z"),
    sinProgramar: false,
    duracionDias: "10.00",
    porcentajePlaneado: "0.00",
    porcentajeArchivo: "0.00",
    ...sobre,
  };
}

function conCronograma(obraId: string, tareas: unknown[]) {
  datos.cronogramas[obraId] = { fechaCorte: CORTE, tareas };
}

describe("semaforoDeCartera", () => {
  it("no lo ve quien no ve toda la cartera, y ni consulta", async () => {
    datos.obras = [obra("o1")];
    expect(await semaforoDeCartera(sesion(["o1"], ["cronograma:leer"]))).toBeNull();
    expect(llamadas).toEqual([]);
  });

  it("sin permiso de cronograma tampoco, y sin tocar la base", async () => {
    datos.obras = [obra("o1")];
    expect(await semaforoDeCartera(sesion(null, []))).toBeNull();
    expect(llamadas).toEqual([]);
  });

  /**
   * La regla de coste del panel entero: una consulta de cronograma POR obra
   * —el select estrecho, nunca `obtenerCronograma`— y UNA de avances para
   * todo el lote. Si alguien anade una consulta mas por obra, esto falla.
   */
  it("cuesta una consulta de cronograma por obra y una de avances en total", async () => {
    datos.obras = [obra("o1"), obra("o2"), obra("o3")];
    conCronograma("o1", [tarea(1)]);
    conCronograma("o2", [tarea(1)]);
    conCronograma("o3", [tarea(1)]);

    await semaforoDeCartera(sesion(null, ["cronograma:leer"]));

    const porModelo = new Map<string, number>();
    for (const l of llamadas) {
      porModelo.set(l.modelo, (porModelo.get(l.modelo) ?? 0) + 1);
    }
    expect(Object.fromEntries(porModelo)).toEqual({
      project: 1,
      cronograma: 3,
      avanceTarea: 1,
    });

    // Y el cronograma que se pide es el VIGENTE: ultimo corte, ultima version.
    const cronograma = llamadas.find((l) => l.modelo === "cronograma");
    expect((cronograma?.args as { orderBy: unknown }).orderBy).toEqual([
      { fechaCorte: "desc" },
      { version: "desc" },
    ]);
  });

  it("con mas obras vivas que el tope, examina el tope y lo dice", async () => {
    datos.obras = Array.from({ length: MAX_OBRAS_POR_CARGA + 2 }, (_, i) =>
      obra(`o${i + 1}`),
    );

    const r = await semaforoDeCartera(sesion(null, ["cronograma:leer"]));

    const cronogramas = llamadas.filter((l) => l.modelo === "cronograma");
    expect(cronogramas).toHaveLength(MAX_OBRAS_POR_CARGA);
    expect(r?.obras).toHaveLength(MAX_OBRAS_POR_CARGA);
    // Lo que hace falta para que la pantalla pueda decir el recorte.
    expect(r?.obrasVivas).toBe(MAX_OBRAS_POR_CARGA + 2);
    expect(r?.tope).toBe(MAX_OBRAS_POR_CARGA);
  });

  it("una obra cerrada o archivada no se examina", async () => {
    datos.obras = [
      obra("viva"),
      obra("cerrada", { estado: "CERRADA" }),
      obra("foto", { archivadaEn: new Date("2026-05-01T00:00:00Z") }),
    ];

    const r = await semaforoDeCartera(sesion(null, ["cronograma:leer"]));

    expect(llamadas.filter((l) => l.modelo === "cronograma")).toHaveLength(1);
    expect(r?.obrasVivas).toBe(1);
    expect(r?.obras[0]?.obraId).toBe("viva");
  });

  /**
   * El filtro del panel: severidad ALTA y ademas ruta critica. Una vencida
   * con trabajo que no es critica es alta, pero ya se ve dentro de su obra;
   * aqui seria ruido.
   */
  it("solo ensena las partidas criticas de severidad alta", async () => {
    conCronograma("o1", [
      // Critica y atrasada: entra, con el motivo de la ruta critica.
      tarea(1, { esCritico: true, porcentajePlaneado: "50.00", porcentajeArchivo: "20.00" }),
      // Vencida con un 90% por hacer: severidad alta, pero NO critica.
      tarea(2, { fin: new Date("2026-07-01T00:00:00Z"), porcentajePlaneado: "10.00", porcentajeArchivo: "10.00" }),
      // Critica al dia: sin alerta.
      tarea(3, { esCritico: true, porcentajePlaneado: "30.00", porcentajeArchivo: "30.00" }),
    ]);
    datos.obras = [obra("o1")];

    const r = await semaforoDeCartera(sesion(null, ["cronograma:leer"]));

    expect(r?.criticasAtrasadas).toBe(1);
    expect(r?.obras[0]?.criticasAtrasadas).toBe(1);
    expect(r?.obras[0]?.partidas.map((p) => p.uid)).toEqual([1]);
    expect(r?.obras[0]?.partidas[0]?.motivo).toContain("ruta critica");
  });

  /**
   * El SPI es POR DURACION: media ponderada por los dias de cada partida,
   * no por el numero de partidas. Con el promedio simple saldria 0.75; los
   * resumenes, fuera de la cuenta.
   */
  it("pondera el SPI por duracion y deja fuera los resumenes", async () => {
    conCronograma("o1", [
      tarea(9, { esResumen: true, duracionDias: "100.00", porcentajePlaneado: "100.00", porcentajeArchivo: "100.00" }),
      tarea(1, { duracionDias: "10.00", porcentajePlaneado: "100.00", porcentajeArchivo: "50.00" }),
      tarea(2, { duracionDias: "90.00", porcentajePlaneado: "100.00", porcentajeArchivo: "100.00" }),
    ]);
    datos.obras = [obra("o1")];

    const r = await semaforoDeCartera(sesion(null, ["cronograma:leer"]));

    // real = (10·50 + 90·100) / 100 = 95; planeado = 100.
    expect(r?.obras[0]?.spiPorDuracion).toBe(0.95);
    expect(r?.obras[0]?.semaforo).toBe("ambar");
  });

  it("sin nada planeado el SPI calla en vez de inventarse", async () => {
    conCronograma("o1", [tarea(1, { porcentajeArchivo: "40.00" })]);
    datos.obras = [obra("o1")];

    const r = await semaforoDeCartera(sesion(null, ["cronograma:leer"]));

    expect(r?.obras[0]?.spiPorDuracion).toBeNull();
    expect(r?.obras[0]?.semaforo).toBeNull();
  });

  /**
   * La regla de `medirAvance`, defendida desde aqui: lo reportado en GCM
   * manda sobre el porcentaje que trajo el archivo. Sin la fusion, esta
   * critica saldria atrasada con un 0% que ya no es verdad.
   */
  it("el avance reportado desde obra manda sobre el archivo", async () => {
    conCronograma("o1", [
      tarea(1, { esCritico: true, porcentajePlaneado: "50.00", porcentajeArchivo: "0.00" }),
    ]);
    datos.avances = [
      {
        projectId: "o1",
        uid: 1,
        porcentaje: "50.00",
        fecha: new Date("2026-07-30T00:00:00Z"),
        createdAt: new Date("2026-07-30T08:00:00Z"),
        reportadoPor: "u1",
        nota: null,
      },
    ];
    datos.obras = [obra("o1")];

    const r = await semaforoDeCartera(sesion(null, ["cronograma:leer"]));

    expect(r?.obras[0]?.criticasAtrasadas).toBe(0);
    expect(r?.obras[0]?.spiPorDuracion).toBe(1);
    expect(r?.obras[0]?.semaforo).toBe("ambar");
  });

  /**
   * Una tarea sin programar no tiene plan: sus fechas son relleno. Ni
   * alerta —aunque este marcada critica y su fecha haya pasado— ni entra en
   * el SPI. Es lo que evita que una EDT recien generada pinte roja la obra.
   */
  it("las tareas sin programar ni alertan ni mueven el SPI", async () => {
    conCronograma("o1", [
      tarea(1, {
        sinProgramar: true,
        esCritico: true,
        fin: new Date("2026-02-01T00:00:00Z"),
        porcentajePlaneado: "80.00",
      }),
    ]);
    datos.obras = [obra("o1")];

    const r = await semaforoDeCartera(sesion(null, ["cronograma:leer"]));

    expect(r?.obras[0]?.criticasAtrasadas).toBe(0);
    expect(r?.obras[0]?.spiPorDuracion).toBeNull();
  });

  it("una obra sin cronograma sale con la mano vacia, no desaparece", async () => {
    datos.obras = [obra("o1")];

    const r = await semaforoDeCartera(sesion(null, ["cronograma:leer"]));

    expect(r?.obras).toEqual([
      {
        obraId: "o1",
        obraNombre: "OBRA O1",
        spiPorDuracion: null,
        semaforo: null,
        sinCronograma: true,
        criticasAtrasadas: 0,
        partidas: [],
      },
    ]);
  });

  it("la obra con mas criticas atrasadas va primero", async () => {
    conCronograma("sana", [
      tarea(1, { porcentajePlaneado: "50.00", porcentajeArchivo: "60.00" }),
    ]);
    conCronograma("tocada", [
      tarea(1, { esCritico: true, porcentajePlaneado: "50.00", porcentajeArchivo: "10.00" }),
    ]);
    datos.obras = [obra("sana"), obra("tocada")];

    const r = await semaforoDeCartera(sesion(null, ["cronograma:leer"]));

    expect(r?.obras.map((o) => o.obraId)).toEqual(["tocada", "sana"]);
    expect(r?.obrasEnRojo).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Compras/encargos sin aprobar
// ---------------------------------------------------------------------------

describe("comprasPendientesDeAprobar", () => {
  it("sin el permiso, no devuelve nada ni consulta", async () => {
    expect(await comprasPendientesDeAprobar(sesion(null, []))).toBeNull();
    expect(llamadas).toEqual([]);
  });

  it("no la ve quien no ve toda la cartera", async () => {
    expect(await comprasPendientesDeAprobar(sesion(["o1"], ["orden:leer"]))).toBeNull();
    expect(llamadas).toEqual([]);
  });

  it("sin ordenes en borrador, forma vacia", async () => {
    const r = await comprasPendientesDeAprobar(sesion(null, ["orden:leer"]));
    expect(r).toEqual({ porObra: [], importe: "0.00", cuantas: 0 });
  });

  it("agrega por obra y ordena por impacto, de mayor a menor", async () => {
    datos.ordenesCompra = [
      { id: "o-1", projectId: "obra-1", total: "500.00", project: { nombreObra: "Obra Uno" } },
      { id: "o-2", projectId: "obra-2", total: "2000.00", project: { nombreObra: "Obra Dos" } },
      { id: "o-3", projectId: "obra-1", total: "300.00", project: { nombreObra: "Obra Uno" } },
    ];

    const r = await comprasPendientesDeAprobar(sesion(null, ["orden:leer"]));
    expect(r?.cuantas).toBe(3);
    expect(r?.importe).toBe("2800.00");
    expect(r?.porObra).toEqual([
      { obraId: "obra-2", obraNombre: "Obra Dos", cuantas: 1, importe: "2000.00" },
      { obraId: "obra-1", obraNombre: "Obra Uno", cuantas: 2, importe: "800.00" },
    ]);
  });

  it("cuesta una sola consulta, sea cual sea el numero de ordenes", async () => {
    datos.ordenesCompra = [
      { id: "o-1", projectId: "obra-1", total: "500.00", project: { nombreObra: "Obra Uno" } },
    ];
    await comprasPendientesDeAprobar(sesion(null, ["orden:leer"]));
    expect(llamadas.map((l) => l.modelo)).toEqual(["ordenCompra"]);
  });
});

// ---------------------------------------------------------------------------
// Restricciones de Lookahead vencidas o por vencer
// ---------------------------------------------------------------------------

/** Un dia relativo a hoy, a medianoche UTC — igual que `hoy()`/`diasEntre`. */
function diasDesdeHoy(offset: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

describe("restriccionesDeCartera", () => {
  it("sin el permiso, no devuelve nada ni consulta", async () => {
    expect(await restriccionesDeCartera(sesion(null, []))).toBeNull();
    expect(llamadas).toEqual([]);
  });

  it("no la ve quien no ve toda la cartera", async () => {
    expect(
      await restriccionesDeCartera(sesion(["o1"], ["lookahead:leer"])),
    ).toBeNull();
    expect(llamadas).toEqual([]);
  });

  it("separa vencidas de por-vencer, y deja fuera lo que esta lejos", async () => {
    datos.restricciones = [
      {
        id: "r-vencida",
        tipo: "MATERIALES",
        detalle: "Falta cemento",
        fechaCompromiso: diasDesdeHoy(-3),
        tarea: { projectId: "obra-1", project: { nombreObra: "Obra Uno" } },
      },
      {
        id: "r-por-vencer",
        tipo: "INFORMACION",
        detalle: "Falta plano",
        fechaCompromiso: diasDesdeHoy(3),
        tarea: { projectId: "obra-2", project: { nombreObra: "Obra Dos" } },
      },
      {
        id: "r-lejos",
        tipo: "MATERIALES",
        detalle: "Sin urgencia",
        fechaCompromiso: diasDesdeHoy(30),
        tarea: { projectId: "obra-1", project: { nombreObra: "Obra Uno" } },
      },
    ];

    const r = await restriccionesDeCartera(sesion(null, ["lookahead:leer"]));
    expect(r?.totalVencidas).toBe(1);
    expect(r?.vencidas.map((x) => x.id)).toEqual(["r-vencida"]);
    expect(r?.porVencer.map((x) => x.id)).toEqual(["r-por-vencer"]);
    const idsVisibles = [...(r?.vencidas ?? []), ...(r?.porVencer ?? [])].map(
      (x) => x.id,
    );
    expect(idsVisibles).not.toContain("r-lejos");
  });
});

// ---------------------------------------------------------------------------
// Sobregiro proyectado
// ---------------------------------------------------------------------------

describe("sobregiroProyectadoDeCartera", () => {
  it("sin alguno de los permisos, no devuelve nada ni consulta", async () => {
    expect(
      await sobregiroProyectadoDeCartera(sesion(null, ["cronograma:leer"])),
    ).toBeNull();
    expect(llamadas).toEqual([]);

    expect(
      await sobregiroProyectadoDeCartera(
        sesion(null, ["orden:leer", "encargo:leer"]),
      ),
    ).toBeNull();
    expect(llamadas).toEqual([]);
  });

  it("no la ve quien no ve toda la cartera", async () => {
    expect(
      await sobregiroProyectadoDeCartera(
        sesion(["o1"], ["cronograma:leer", "orden:leer", "encargo:leer"]),
      ),
    ).toBeNull();
    expect(llamadas).toEqual([]);
  });

  it("por encima del umbral sale marcada; por debajo, no; sin presupuesto, sin dividir entre cero", async () => {
    datos.obras = [obra("obra-1"), obra("obra-2"), obra("obra-3")];

    // obra-1: avance fisico 50%, comprometido 800/1000 = 80% -> desviacion 30, EN RIESGO.
    conCronograma("obra-1", [
      tarea(1, { porcentajePlaneado: "50.00", porcentajeArchivo: "50.00" }),
    ]);
    // obra-2: avance fisico 52%, comprometido 500/1000 = 50% -> desviacion -2, no en riesgo.
    conCronograma("obra-2", [
      tarea(1, { porcentajePlaneado: "50.00", porcentajeArchivo: "52.00" }),
    ]);
    // obra-3: tiene cronograma, pero CERO presupuesto -> comprometidoPct null.
    conCronograma("obra-3", [
      tarea(1, { porcentajePlaneado: "40.00", porcentajeArchivo: "40.00" }),
    ]);

    datos.encargosVigentes = [
      { projectId: "obra-1", montoContratado: "800.00", adendas: [], partidas: [] },
      { projectId: "obra-2", montoContratado: "500.00", adendas: [], partidas: [] },
      { projectId: "obra-3", montoContratado: "100.00", adendas: [], partidas: [] },
    ];

    datos.wbsItems = [
      { projectId: "obra-1", codigoPartida: "01", tipo: "PARTIDA", parcial: "1000.00" },
      { projectId: "obra-2", codigoPartida: "01", tipo: "PARTIDA", parcial: "1000.00" },
      // obra-3 no tiene ninguna partida: presupuesto en cero.
    ];

    const r = await sobregiroProyectadoDeCartera(
      sesion(null, ["cronograma:leer", "orden:leer", "encargo:leer"]),
    );
    expect(r).not.toBeNull();

    const porId = new Map(r?.obras.map((o) => [o.obraId, o]));

    const uno = porId.get("obra-1")!;
    expect(uno.avanceFisicoPct).toBe(50);
    expect(uno.comprometidoPct).toBe(80);
    expect(uno.desviacionPuntos).toBe(30);
    expect(uno.enRiesgo).toBe(true);

    const dos = porId.get("obra-2")!;
    expect(dos.enRiesgo).toBe(false);
    expect(dos.desviacionPuntos).toBeCloseTo(-2, 5);

    const tres = porId.get("obra-3")!;
    expect(tres.comprometidoPct).toBeNull();
    expect(tres.desviacionPuntos).toBeNull();
    expect(tres.enRiesgo).toBe(false);

    expect(r?.obrasEnRiesgo).toBe(1);
    expect(UMBRAL_SOBREGIRO_PROYECTADO_PUNTOS).toBe(10);
  });

  /**
   * `semaforoDeCartera` y `sobregiroProyectadoDeCartera` piden ambas el
   * mismo lote via `loteConAvanceMedido`. Aqui SOLO se defiende que las dos
   * sigan dando resultados correctos al pedirse juntas -no que la consulta
   * se comparta-: el `cache()` de React memoiza por el scope de peticion
   * de un render de verdad (`AsyncLocalStorage` de Next.js), que este
   * entorno de pruebas —Node liso, sin servidor— no tiene. Fuera de un
   * request real, `cache()` no deduplica, asi que contar consultas aqui
   * daria un resultado que no dice nada del comportamiento en produccion.
   * Esa deduplicacion YA esta probada en produccion por el mismo patron en
   * `datosAlertasEmpresa` (`obras.service.ts`); verificarla de verdad para
   * este caso es cosa de `scripts/humo.ts` contra el servidor real, no de
   * una prueba unitaria.
   */
  it("pedidas juntas (misma sesion), las dos siguen dando el resultado correcto", async () => {
    datos.obras = [obra("obra-1")];
    conCronograma("obra-1", [tarea(1, { porcentajePlaneado: "50.00", porcentajeArchivo: "50.00" })]);
    datos.encargosVigentes = [
      { projectId: "obra-1", montoContratado: "100.00", adendas: [], partidas: [] },
    ];
    datos.wbsItems = [
      { projectId: "obra-1", codigoPartida: "01", tipo: "PARTIDA", parcial: "1000.00" },
    ];

    const permisos: Permiso[] = ["cronograma:leer", "orden:leer", "encargo:leer"];
    const misma = sesion(null, permisos);

    const [semaforo, sobregiro] = await Promise.all([
      semaforoDeCartera(misma),
      sobregiroProyectadoDeCartera(misma),
    ]);

    expect(semaforo?.obras[0]?.spiPorDuracion).toBe(1);
    expect(sobregiro?.obras[0]?.avanceFisicoPct).toBe(50);
    expect(sobregiro?.obras[0]?.comprometidoPct).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// EVM de cartera (proxy)
// ---------------------------------------------------------------------------

describe("evmDeCartera", () => {
  it("sin alguno de los permisos, no devuelve nada", async () => {
    expect(await evmDeCartera(sesion(null, ["cronograma:leer"]))).toBeNull();
    expect(await evmDeCartera(sesion(null, ["orden:leer"]))).toBeNull();
  });

  it("no la ve quien no ve toda la cartera", async () => {
    expect(
      await evmDeCartera(sesion(["o1"], ["cronograma:leer", "orden:leer"])),
    ).toBeNull();
  });

  it("calcula BAC/PV/EV/AC y el CPI cuando hay base para proyectar", async () => {
    datos.obras = [obra("obra-1")];
    // Planeado 50%, real 60%: PV = 500, EV = 600 sobre un BAC de 1000.
    conCronograma("obra-1", [
      tarea(1, { porcentajePlaneado: "50.00", porcentajeArchivo: "60.00" }),
    ]);
    datos.wbsItems = [
      { projectId: "obra-1", codigoPartida: "01", tipo: "PARTIDA", parcial: "1000.00" },
    ];
    // AC = 300: justo la mitad de EV (300 = 600*0.5), asi que SI hay base
    // para proyectar (el limite es "AC >= EV*0.5", no estrictamente mayor).
    datos.imputacionesSueltas = [
      { importe: "300.00", ordenCompra: { projectId: "obra-1" } },
    ];

    const r = await evmDeCartera(
      sesion(null, ["cronograma:leer", "orden:leer"]),
    );
    const m = r?.obras[0]?.metricas;

    expect(m?.bac).toBe("1000.00");
    expect(m?.pv).toBe("500.00");
    expect(m?.ev).toBe("600.00");
    expect(m?.ac).toBe("300.00");
    expect(m?.spi).toBe(1.2);
    expect(m?.cpi).toBe(2);
    expect(m?.motivoSinCosto).toBeNull();
  });

  it("sin ordenes aprobadas, explica el motivo en vez de inventar un CPI", async () => {
    datos.obras = [obra("obra-1")];
    conCronograma("obra-1", [
      tarea(1, { porcentajePlaneado: "50.00", porcentajeArchivo: "60.00" }),
    ]);
    datos.wbsItems = [
      { projectId: "obra-1", codigoPartida: "01", tipo: "PARTIDA", parcial: "1000.00" },
    ];
    datos.imputacionesSueltas = [];

    const r = await evmDeCartera(
      sesion(null, ["cronograma:leer", "orden:leer"]),
    );
    const m = r?.obras[0]?.metricas;

    expect(m?.ac).toBe("0.00");
    expect(m?.cpi).toBeNull();
    // "sin_gasto", no "sin_permiso": el permiso YA se comprobo al entrar a
    // la funcion, asi que null nunca debe llegar a `metricasEvm` aqui.
    expect(m?.motivoSinCosto).toBe("sin_gasto");
  });
});

// ---------------------------------------------------------------------------
// Confiabilidad de cartera (PPC)
// ---------------------------------------------------------------------------

describe("confiabilidadDeCartera", () => {
  it("sin el permiso, no devuelve nada", async () => {
    expect(await confiabilidadDeCartera(sesion(null, []))).toBeNull();
  });

  it("no la ve quien no ve toda la cartera", async () => {
    expect(
      await confiabilidadDeCartera(sesion(["o1"], ["plan_semanal:leer"])),
    ).toBeNull();
  });

  it("trae el PPC de la ultima semana cerrada, no un promedio", async () => {
    datos.obras = [obra("obra-1")];
    datos.planesSemanales = [
      {
        projectId: "obra-1",
        numero: 1,
        fechaCorte: new Date("2026-07-01"),
        compromisos: [{ cumplido: false, causa: null }], // 0% -no cuenta, es vieja
      },
      {
        projectId: "obra-1",
        numero: 2,
        fechaCorte: new Date("2026-07-08"),
        compromisos: [
          { cumplido: true, causa: null },
          { cumplido: true, causa: null },
          { cumplido: false, causa: null },
        ], // 66.67% -la ULTIMA, es la que debe contar
      },
    ];

    const r = await confiabilidadDeCartera(sesion(null, ["plan_semanal:leer"]));

    expect(r?.obrasSinPlanCerrado).toBe(0);
    expect(r?.obras[0]?.ultimo?.numero).toBe(2);
    expect(r?.obras[0]?.ultimo?.ppc).toBeCloseTo(66.67, 1);
    expect(r?.obras[0]?.banda).toBe("flojo");
  });

  it("una obra sin ninguna semana cerrada cuenta aparte, no desaparece", async () => {
    datos.obras = [obra("obra-1")];
    datos.planesSemanales = [];

    const r = await confiabilidadDeCartera(sesion(null, ["plan_semanal:leer"]));

    expect(r?.obrasSinPlanCerrado).toBe(1);
    expect(r?.obras[0]?.ultimo).toBeNull();
    expect(r?.obras[0]?.banda).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Valorizaciones de cartera
// ---------------------------------------------------------------------------

describe("valorizacionesDeCartera", () => {
  it("sin el permiso, no devuelve nada", async () => {
    expect(await valorizacionesDeCartera(sesion(null, []))).toBeNull();
  });

  it("no la ve quien no ve toda la cartera", async () => {
    expect(
      await valorizacionesDeCartera(sesion(["o1"], ["orden:leer"])),
    ).toBeNull();
  });

  it("separa vencida de pendiente, y deja fuera lo que ya esta pagado", async () => {
    datos.obras = [obra("obra-1")];
    datos.encargosCompletos = [
      // Vencida: fecha pactada ya paso, sin valorizacion que la cubra.
      {
        projectId: "obra-1",
        montoContratado: "1000.00",
        adendas: [],
        cadenciaDias: null,
        fechaInicio: null,
        createdAt: diasDesdeHoy(-60),
        fechasValorizacion: [{ fecha: diasDesdeHoy(-10) }],
        valorizaciones: [{ fecha: diasDesdeHoy(-40), porcentaje: "50.00" }],
        pagos: [],
      },
      // Pendiente: fecha pactada en el futuro, con saldo por pagar.
      {
        projectId: "obra-1",
        montoContratado: "1000.00",
        adendas: [],
        cadenciaDias: null,
        fechaInicio: null,
        createdAt: diasDesdeHoy(-30),
        fechasValorizacion: [{ fecha: diasDesdeHoy(10) }],
        valorizaciones: [{ fecha: diasDesdeHoy(-15), porcentaje: "30.00" }],
        pagos: [],
      },
      // Ya cobrado del todo: no debe contar ni como vencida ni pendiente.
      {
        projectId: "obra-1",
        montoContratado: "500.00",
        adendas: [],
        cadenciaDias: null,
        fechaInicio: null,
        createdAt: diasDesdeHoy(-30),
        fechasValorizacion: [{ fecha: diasDesdeHoy(-5) }],
        valorizaciones: [{ fecha: diasDesdeHoy(-5), porcentaje: "100.00" }],
        pagos: [{ monto: "500.00" }],
      },
    ];

    const r = await valorizacionesDeCartera(sesion(null, ["orden:leer"]));

    expect(r?.totalVencidas).toBe(1);
    expect(r?.obras[0]?.vencidas).toBe(1);
    expect(r?.obras[0]?.pendientes).toBe(1);
    // 500 (vencida, 50% de 1000, nada pagado) + 300 (pendiente, 30% de 1000).
    expect(r?.obras[0]?.porPagarTotal).toBe("800.00");
  });

  it("cuesta una sola consulta de encargos, no una por obra", async () => {
    datos.obras = [obra("obra-1"), obra("obra-2")];
    await valorizacionesDeCartera(sesion(null, ["orden:leer"]));
    expect(
      llamadas.filter((l) => l.modelo === "encargoProveedor:findMany"),
    ).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// La bandeja de firma
// ---------------------------------------------------------------------------

/**
 * LO QUE ESPERA LA FIRMA DE GERENCIA.
 *
 * El circuito de la adenda se diseño con dos firmas -el residente registra,
 * gerencia aprueba- y a la segunda le faltaba la bandeja: las adendas se
 * firman dentro del encargo, o sea a tres clics desde una obra concreta y a
 * ninguno si no sabes en cual mirar. Mientras tanto hay dos personas paradas:
 * al residente se le rechaza el pago por encima de lo firmado, y el
 * comprometido que mira el propio gerente no cuenta ese dinero.
 */
describe("adendasPorFirmar", () => {
  /**
   * Igual que `hoy()`: dia LOCAL llevado a medianoche UTC. El `diasDesdeHoy`
   * de mas arriba parte del dia UTC, y a partir de las 19:00 en Lima esos dos
   * dias ya no son el mismo -la prueba pasaba de dia y fallaba de noche-.
   */
  function haceDias(n: number): Date {
    const a = new Date();
    return new Date(Date.UTC(a.getFullYear(), a.getMonth(), a.getDate() - n));
  }

  function adenda(over: Record<string, unknown> = {}) {
    return {
      id: "ad-1",
      numero: 1,
      fecha: haceDias(3),
      importe: "8000.00",
      concepto: "Ampliacion de alcance en cimentacion",
      registradaPor: "Ana Perez",
      createdAt: haceDias(3),
      encargoId: "enc-1",
      projectId: "obra-1",
      project: { nombreObra: "Torre A" },
      encargo: { proveedor: { razonSocial: "Constructora Sur" } },
      ...over,
    };
  }

  it("no la ve quien no puede firmar: una bandeja de firma para quien no firma es una lista de cosas que no puede hacer", async () => {
    datos.adendas = [adenda()];
    expect(await adendasPorFirmar(sesion(null, ["encargo:leer"]))).toBeNull();
    // Y ni siquiera se pregunta.
    expect(llamadas.filter((l) => l.modelo === "adendaEncargo")).toHaveLength(0);
  });

  it("sin ninguna pendiente lo dice, no devuelve null", async () => {
    const r = await adendasPorFirmar(sesion(null, ["adenda:aprobar"]));

    expect(r).not.toBeNull();
    expect(r?.cuantas).toBe(0);
    expect(r?.importe).toBe("0.00");
    expect(r?.diasDeLaMasVieja).toBe(0);
  });

  it("trae la obra, el contratista y cuanto lleva esperando", async () => {
    datos.adendas = [adenda({ createdAt: haceDias(11) })];

    const r = await adendasPorFirmar(sesion(null, ["adenda:aprobar"]));
    const a = r?.adendas[0];

    expect(a?.obraNombre).toBe("Torre A");
    expect(a?.proveedor).toBe("Constructora Sur");
    expect(a?.registradaPor).toBe("Ana Perez");
    expect(a?.diasEsperando).toBe(11);
    expect(r?.diasDeLaMasVieja).toBe(11);
    // El enlace se arma en la pantalla con estos dos: obra y encargo.
    expect(a?.obraId).toBe("obra-1");
    expect(a?.encargoId).toBe("enc-1");
  });

  it("suma los importes CON SIGNO: un deductivo baja el total", async () => {
    datos.adendas = [
      adenda({ id: "a", importe: "8000.00" }),
      adenda({ id: "b", importe: "-12000.00" }),
    ];

    const r = await adendasPorFirmar(sesion(null, ["adenda:aprobar"]));
    expect(r?.importe).toBe("-4000.00");
    expect(r?.cuantas).toBe(2);
  });

  /**
   * Solo las PENDIENTES, y solo de esta empresa. Ninguna suma lo notaria si
   * alguien quita cualquiera de los dos filtros: saldria una bandeja con
   * adendas ya firmadas, o -mucho peor- con las de otra constructora.
   */
  it("pide solo PENDIENTES y solo de la empresa de la sesion", async () => {
    await adendasPorFirmar(sesion(null, ["adenda:aprobar"]));

    const c = llamadas.find((l) => l.modelo === "adendaEncargo");
    const donde = (
      c?.args as {
        where: { estado: string; project: { companyId: string } };
      }
    ).where;

    expect(donde.estado).toBe("PENDIENTE");
    expect(donde.project.companyId).toBe("emp-1");
  });

  /**
   * Por ANTIGUEDAD y no por importe, al reves que `adicionalesEnBorrador`.
   * Alli se mira exposicion -cuanto dinero hay pedido-; aqui es una cola de
   * trabajo, y lo que primero se pudre es lo que mas lleva esperando.
   */
  it("se ordena por antiguedad, y el corte no recorta el importe", async () => {
    datos.adendas = Array.from({ length: MAX_ADENDAS_EN_BANDEJA + 5 }, (_, i) =>
      adenda({ id: `a-${i}`, importe: "100.00" }),
    );

    const r = await adendasPorFirmar(sesion(null, ["adenda:aprobar"]));

    expect(r?.adendas).toHaveLength(MAX_ADENDAS_EN_BANDEJA);
    expect(r?.cuantas).toBe(MAX_ADENDAS_EN_BANDEJA + 5);
    // El titular cuenta TODAS, no solo las listadas: recortar la lista no
    // puede recortar la cifra.
    expect(r?.importe).toBe("2500.00");

    const orden = (llamadas.find((l) => l.modelo === "adendaEncargo")
      ?.args as { orderBy: { createdAt: string } }).orderBy;
    expect(orden.createdAt).toBe("asc");
  });
});

/**
 * LAS DEDUCCIONES SON LA OTRA MITAD DE LA BANDEJA.
 *
 * Van en la MISMA caja que las adendas porque para quien firma son la misma
 * tarea -algo que alguien pidio y espera-, y repartirlas en dos paneles
 * obligaria a mirar en dos sitios para saber si queda algo pendiente. Pero se
 * listan aparte y con su propio importe porque tiran del dinero en direcciones
 * opuestas: la adenda se lo lleva, la deduccion lo devuelve.
 */
describe("adendasPorFirmar: las deducciones de costos propios", () => {
  function haceDias(n: number): Date {
    const a = new Date();
    return new Date(Date.UTC(a.getFullYear(), a.getMonth(), a.getDate() - n));
  }

  function deduccion(over: Record<string, unknown> = {}) {
    return {
      id: "ded-1",
      numero: 1,
      importe: "8000.00",
      motivo: "El andamio se devuelve en octubre.",
      solicitadaPor: "Ana Perez",
      createdAt: haceDias(2),
      projectId: "obra-1",
      project: { nombreObra: "Torre A" },
      item: { descripcion: "Alquiler de andamios" },
      ...over,
    };
  }

  it("quien solo firma adendas no ve las deducciones, ni se consultan", async () => {
    datos.deducciones = [deduccion()];

    const r = await adendasPorFirmar(sesion(null, ["adenda:aprobar"]));

    expect(r?.deducciones).toEqual([]);
    expect(r?.cuantasDeducciones).toBe(0);
    expect(
      llamadas.filter((l) => l.modelo === "deduccionCostoPropio"),
    ).toHaveLength(0);
  });

  it("quien solo firma deducciones ve la bandeja, no un null", async () => {
    // Es un permiso distinto del de las adendas: una empresa puede repartir
    // las dos firmas en dos personas. Devolver null aqui esconderia la
    // pantalla entera a quien si tiene algo que firmar.
    datos.deducciones = [deduccion()];

    const r = await adendasPorFirmar(sesion(null, ["deduccion:aprobar"]));

    expect(r).not.toBeNull();
    expect(r?.cuantasDeducciones).toBe(1);
    expect(r?.deducciones[0]?.linea).toBe("Alquiler de andamios");
    expect(r?.deducciones[0]?.obraNombre).toBe("Torre A");
    // Y ninguna adenda: no puede firmarlas.
    expect(r?.adendas).toEqual([]);
    expect(llamadas.filter((l) => l.modelo === "adendaEncargo")).toHaveLength(0);
  });

  it("los dos importes van por separado: uno se lleva el dinero y el otro lo devuelve", async () => {
    const ambos = sesion(null, ["adenda:aprobar", "deduccion:aprobar"]);
    datos.adendas = [
      {
        id: "ad-1",
        numero: 1,
        fecha: haceDias(1),
        importe: "5000.00",
        concepto: "Refuerzo",
        registradaPor: "Ana",
        createdAt: haceDias(1),
        encargoId: "enc-1",
        projectId: "obra-1",
        project: { nombreObra: "Torre A" },
        encargo: { proveedor: { razonSocial: "Sur" } },
      },
    ];
    datos.deducciones = [deduccion({ importe: "8000.00" })];

    const r = await adendasPorFirmar(ambos);

    expect(r?.importe).toBe("5000.00");
    expect(r?.importeDeducciones).toBe("8000.00");
    // Sumarlos daria 13.000, que no significa nada: uno sube el gasto y el
    // otro lo baja.
    expect(r?.cuantas).toBe(1);
    expect(r?.cuantasDeducciones).toBe(1);
  });

  it("la mas antigua es la mas antigua DE LAS DOS listas", async () => {
    const ambos = sesion(null, ["adenda:aprobar", "deduccion:aprobar"]);
    datos.adendas = [
      {
        id: "ad-1",
        numero: 1,
        fecha: haceDias(2),
        importe: "5000.00",
        concepto: "Refuerzo",
        registradaPor: "Ana",
        createdAt: haceDias(2),
        encargoId: "enc-1",
        projectId: "obra-1",
        project: { nombreObra: "Torre A" },
        encargo: { proveedor: { razonSocial: "Sur" } },
      },
    ];
    datos.deducciones = [deduccion({ createdAt: haceDias(9) })];

    const r = await adendasPorFirmar(ambos);
    expect(r?.diasDeLaMasVieja).toBe(9);
  });

  it("pide solo PENDIENTES y solo de la empresa de la sesion", async () => {
    await adendasPorFirmar(sesion(null, ["deduccion:aprobar"]));

    const c = llamadas.find((l) => l.modelo === "deduccionCostoPropio");
    const donde = (
      c?.args as { where: { estado: string; project: { companyId: string } } }
    ).where;

    expect(donde.estado).toBe("PENDIENTE");
    expect(donde.project.companyId).toBe("emp-1");
  });
});
