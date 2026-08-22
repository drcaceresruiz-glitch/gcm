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
  encargosVigentes: [] as { projectId: string; _sum: { montoContratado: string } }[],
  imputacionesSueltas: [] as { importe: string; ordenCompra: { projectId: string } }[],
  wbsItems: [] as unknown[],
  restricciones: [] as unknown[],
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
      groupBy: async (args: unknown) => {
        llamadas.push({ modelo: "encargoProveedor", args });
        return datos.encargosVigentes;
      },
    },
    ordenImputacion: {
      findMany: async (args: unknown) => {
        llamadas.push({ modelo: "ordenImputacion", args });
        return datos.imputacionesSueltas;
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
  },
}));

const {
  adicionalesEnBorrador,
  semaforoDeCartera,
  sobregiroProyectadoDeCartera,
  comprasPendientesDeAprobar,
  restriccionesDeCartera,
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
  datos.wbsItems = [];
  datos.restricciones = [];
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
      { projectId: "obra-1", _sum: { montoContratado: "800.00" } },
      { projectId: "obra-2", _sum: { montoContratado: "500.00" } },
      { projectId: "obra-3", _sum: { montoContratado: "100.00" } },
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
    datos.encargosVigentes = [{ projectId: "obra-1", _sum: { montoContratado: "100.00" } }];
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
