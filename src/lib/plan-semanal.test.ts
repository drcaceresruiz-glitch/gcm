import { describe, it, expect } from "vitest";
import {
  ppcDePlan,
  paretoCausas,
  porcentajeARegistrar,
  tendenciaPpc,
  proximoCorte,
  rangoSemana,
  tareasDeLaSemana,
  restriccionDeTarea,
  sugerirCantidad,
  mapaPreservablePorUid,
  validarCantidadPlan,
  uidsDuplicados,
  avisoNumeracionSemana,
  semanasAContramano,
  causaQueMasFrena,
  cumplidosSinAvance,
  tareasTerminadas,
  arrastreDeIncumplidos,
  type CompromisoACerrar,
  type CompromisoPrevio,
  type CompromisoEvaluado,
  type TareaProgramada,
  type EnlacePredecesora,
} from "./plan-semanal";
import type { CausaNoCumplimiento } from "@/generated/prisma/enums";

const dc = (s: string) => new Date(`${s}T00:00:00Z`);

describe("porcentajeARegistrar", () => {
  it("NUNCA inventa un 100 cuando no hay porcentaje ni meta", () => {
    // ESTE es el fallo que falsificaba la curva S. Un compromiso venido del
    // Lookahead nace sin meta, la pantalla deja el campo vacio, y antes se
    // escribia 100: una tarea de tres semanas quedaba terminada por haber
    // cumplido el tramo de una.
    expect(
      porcentajeARegistrar({
        porcentajeReal: "",
        cumplido: true,
        metaPorcentaje: null,
      }),
    ).toBeNull();

    expect(
      porcentajeARegistrar({
        porcentajeReal: "   ",
        cumplido: true,
        metaPorcentaje: undefined,
      }),
    ).toBeNull();
  });

  it("lo que se teclea manda siempre", () => {
    expect(
      porcentajeARegistrar({
        porcentajeReal: "35",
        cumplido: true,
        metaPorcentaje: "80",
      }),
    ).toBe("35");
  });

  it("registra el avance aunque NO se haya cumplido", () => {
    // Se pudo avanzar sin llegar a la meta, y eso es informacion buena: el
    // PPC dira que no se cumplio y la curva S reflejara lo que si se hizo.
    expect(
      porcentajeARegistrar({
        porcentajeReal: "40",
        cumplido: false,
        metaPorcentaje: "80",
      }),
    ).toBe("40");
  });

  it("cumplir sin teclear nada registra la META pactada", () => {
    // Cumplir un compromiso es alcanzar lo que se prometio. Con meta si se
    // puede deducir; sin meta, no.
    expect(
      porcentajeARegistrar({
        porcentajeReal: "",
        cumplido: true,
        metaPorcentaje: "60",
      }),
    ).toBe("60");
  });

  it("no cumplido y sin teclear nada no registra nada", () => {
    expect(
      porcentajeARegistrar({
        porcentajeReal: "",
        cumplido: false,
        metaPorcentaje: "60",
      }),
    ).toBeNull();

    expect(
      porcentajeARegistrar({
        porcentajeReal: null,
        cumplido: null,
        metaPorcentaje: null,
      }),
    ).toBeNull();
  });

  it("una meta en blanco no cuenta como meta", () => {
    expect(
      porcentajeARegistrar({
        porcentajeReal: "",
        cumplido: true,
        metaPorcentaje: "  ",
      }),
    ).toBeNull();
  });
});

describe("ppcDePlan", () => {
  it("cumplidos entre el total, en %", () => {
    const c: CompromisoEvaluado[] = [
      { cumplido: true, causa: null },
      { cumplido: true, causa: null },
      { cumplido: true, causa: null },
      { cumplido: false, causa: "MATERIALES" },
    ];
    const r = ppcDePlan(c);
    expect(r.total).toBe(4);
    expect(r.cumplidos).toBe(3);
    expect(r.ppc).toBeCloseTo(75);
  });

  it("un compromiso sin evaluar cuenta como no cumplido", () => {
    const c: CompromisoEvaluado[] = [
      { cumplido: true, causa: null },
      { cumplido: null, causa: null },
    ];
    expect(ppcDePlan(c).ppc).toBeCloseTo(50);
  });

  it("sin compromisos, PPC null (no hay nada que medir)", () => {
    expect(ppcDePlan([]).ppc).toBeNull();
  });
});

describe("paretoCausas", () => {
  it("cuenta solo los no cumplidos con causa, de mayor a menor", () => {
    const c: CompromisoEvaluado[] = [
      { cumplido: false, causa: "MATERIALES" },
      { cumplido: false, causa: "MATERIALES" },
      { cumplido: false, causa: "CLIMA" },
      { cumplido: true, causa: null },
      { cumplido: false, causa: null }, // sin causa: no aporta
    ];
    const p = paretoCausas(c);
    expect(p).toEqual([
      { causa: "MATERIALES", conteo: 2 },
      { causa: "CLIMA", conteo: 1 },
    ]);
  });

  it("vacio si no hay fallos con causa", () => {
    expect(paretoCausas([{ cumplido: true, causa: null }])).toEqual([]);
  });
});

describe("tendenciaPpc", () => {
  it("ordena por fecha y descarta las semanas sin PPC", () => {
    const serie = tendenciaPpc([
      { fecha: dc("2026-08-14"), ppc: 80 },
      { fecha: dc("2026-08-07"), ppc: 60 },
      { fecha: dc("2026-08-21"), ppc: null },
    ]);
    expect(serie.map((p) => p.ppc)).toEqual([60, 80]);
  });
});

describe("proximoCorte", () => {
  it("devuelve hoy si hoy ya es el dia de corte", () => {
    const hoy = dc("2026-08-07");
    const dia = hoy.getUTCDay() === 0 ? 7 : hoy.getUTCDay();
    expect(proximoCorte(dia, hoy)).toEqual(hoy);
  });

  it("salta al proximo dia de corte", () => {
    const hoy = dc("2026-08-03");
    const dia = hoy.getUTCDay() === 0 ? 7 : hoy.getUTCDay();
    const siguiente = dia === 7 ? 1 : dia + 1;
    expect(proximoCorte(siguiente, hoy)).toEqual(dc("2026-08-04"));
  });
});

describe("avisoNumeracionSemana", () => {
  // El caso real de la primera obra: la Semana 3 cierra el 14/08 y la Semana 2
  // el 15/08, porque el correlativo es max(numero)+1 y no mira la fecha.
  const existentes = [
    { numero: 1, fechaCorte: dc("2026-08-07") },
    { numero: 2, fechaCorte: dc("2026-08-15") },
  ];

  it("calla cuando la semana nueva va detras de todas", () => {
    expect(avisoNumeracionSemana(dc("2026-08-22"), existentes)).toBeNull();
  });

  it("calla con la primera semana de la obra", () => {
    expect(avisoNumeracionSemana(dc("2026-08-07"), [])).toBeNull();
  });

  it("avisa cuando la fecha es anterior a una que ya existe", () => {
    const a = avisoNumeracionSemana(dc("2026-08-14"), existentes);
    expect(a).not.toBeNull();
    // Le tocara el 3 aunque cierre ANTES que la 2: eso es lo que hay que decir.
    expect(a?.numero).toBe(3);
    expect(a?.desordenadas.map((s) => s.numero)).toEqual([2]);
  });

  it("las lista de la mas proxima a la mas lejana", () => {
    const a = avisoNumeracionSemana(dc("2026-08-01"), [
      { numero: 1, fechaCorte: dc("2026-08-15") },
      { numero: 2, fechaCorte: dc("2026-08-07") },
    ]);
    expect(a?.desordenadas.map((s) => s.numero)).toEqual([2, 1]);
  });

  it("misma fecha no es anterior", () => {
    // El indice unico ya impide dos planes con el mismo corte; aqui solo se
    // comprueba que no se avise de un empate.
    expect(avisoNumeracionSemana(dc("2026-08-15"), existentes)).toBeNull();
  });
});

describe("cumplidosSinAvance", () => {
  const c = (campos: Partial<CompromisoACerrar> = {}): CompromisoACerrar => ({
    compromisoId: "c1",
    uid: 100,
    descripcion: "4.5 Curado de concreto",
    cumplido: true,
    porcentajeReal: null,
    metaPorcentaje: null,
    ...campos,
  });

  it("SENALA el cumplido sin porcentaje ni meta", () => {
    // El caso de CRIOCORD: la Semana 2 se cerro con cinco asi, el PPC dijo
    // 100% y la curva siguio marcando esas partidas al 0%.
    const r = cumplidosSinAvance([c()]);
    expect(r).toEqual([{ compromisoId: "c1", descripcion: "4.5 Curado de concreto" }]);
  });

  it("calla cuando hay porcentaje escrito o meta pactada", () => {
    // Con meta, `porcentajeARegistrar` registra la meta: cumplir es alcanzar
    // lo prometido, y eso SI mueve la curva.
    expect(cumplidosSinAvance([c({ porcentajeReal: "80" })])).toEqual([]);
    expect(cumplidosSinAvance([c({ metaPorcentaje: "60" })])).toEqual([]);
  });

  it("no señala lo NO cumplido: ahi lo que se exige es la causa", () => {
    // No registrar avance en algo que no se hizo es lo correcto, no un olvido.
    expect(cumplidosSinAvance([c({ cumplido: false })])).toEqual([]);
  });

  it("no señala las lineas libres: no hay tarea que mover", () => {
    expect(cumplidosSinAvance([c({ uid: null })])).toEqual([]);
  });

  it("un porcentaje en blanco no cuenta como escrito", () => {
    expect(cumplidosSinAvance([c({ porcentajeReal: "   " })])).toHaveLength(1);
  });
});

describe("causaQueMasFrena", () => {
  const f = (causa: CausaNoCumplimiento, conteo: number) => ({ causa, conteo });

  it("SE CALLA cuando todos los fallos son de la MISMA causa", () => {
    // El caso de CRIOCORD: «Prerrequisito · 3 veces · 100% de los 3». Con una
    // sola causa registrada, el 100% es una tautologia, no un hallazgo.
    expect(causaQueMasFrena([f("PRERREQUISITO", 3)])).toBeNull();
    // Ni siquiera con volumen: un Pareto compara, y no hay con que comparar.
    expect(causaQueMasFrena([f("PRERREQUISITO", 40)])).toBeNull();
  });

  it("se calla mientras haya pocos incumplimientos", () => {
    // Con cuatro, uno mas de cualquier otra causa cambia el titular entero.
    expect(
      causaQueMasFrena([f("PRERREQUISITO", 3), f("MATERIALES", 1)]),
    ).toBeNull();
  });

  it("habla cuando hay volumen y variedad", () => {
    const r = causaQueMasFrena([
      f("PRERREQUISITO", 6),
      f("MATERIALES", 3),
      f("MANO_OBRA", 1),
    ]);
    expect(r?.causa).toBe("PRERREQUISITO");
    expect(r?.veces).toBe(6);
    expect(r?.total).toBe(10);
    expect(r?.porcentaje).toBe(60);
  });

  it("sin causas no hay nada que decir", () => {
    expect(causaQueMasFrena([])).toBeNull();
  });
});

describe("tareasTerminadas y la ventana", () => {
  const av = (porcentaje: string) => ({ porcentaje });

  it("lo REPORTADO manda sobre el archivo, en los dos sentidos", () => {
    const t = tareasTerminadas(
      [
        // El archivo la daba por hecha, pero obra reporto 80: no esta acabada.
        { uid: 1, porcentajeArchivo: "100.00" },
        // El archivo decia 0 y obra reporto 100: si lo esta.
        { uid: 2, porcentajeArchivo: "0.00" },
        // Nadie reporto nunca: vale el archivo.
        { uid: 3, porcentajeArchivo: "100" },
        { uid: 4, porcentajeArchivo: "45.00" },
      ],
      new Map([
        [1, av("80.00")],
        [2, av("100.00")],
      ]),
    );
    expect([...t].sort()).toEqual([2, 3]);
  });

  it("UNA TAREA TERMINADA NO SE VUELVE A OFRECER", () => {
    // El caso de CRIOCORD: cinco tareas cumplidas y cerradas en la Semana 2
    // seguian saliendo en el Lookahead para comprometerlas en la Semana 3. En
    // lo que ya esta hecho no hay nada que preparar ni nada que prometer.
    const tareas = [
      {
        uid: 1, codigo: "4.5", nombre: "Curado de concreto",
        inicio: dc("2026-08-10"), fin: dc("2026-08-14"), esResumen: false,
      },
      {
        uid: 2, codigo: "5.1", nombre: "Transporte de estructuras",
        inicio: dc("2026-08-10"), fin: dc("2026-08-14"), esResumen: false,
      },
    ];

    // Sin el filtro salen las dos: es el comportamiento que fallaba.
    expect(
      tareasDeLaSemana(tareas, dc("2026-08-09"), dc("2026-08-15")).map((t) => t.uid),
    ).toEqual([1, 2]);

    expect(
      tareasDeLaSemana(
        tareas,
        dc("2026-08-09"),
        dc("2026-08-15"),
        new Set([1]),
      ).map((t) => t.uid),
    ).toEqual([2]);
  });
});

describe("semanasAContramano", () => {
  it("senala la que llego despues con fecha anterior", () => {
    // El caso real: Semana 2 el 15/08 y Semana 3 el 14/08. La que hay que
    // corregir es la 3, no la 2: la 2 ya estaba.
    const cruzadas = semanasAContramano([
      { numero: 1, fechaCorte: dc("2026-08-08") },
      { numero: 2, fechaCorte: dc("2026-08-15") },
      { numero: 3, fechaCorte: dc("2026-08-14") },
    ]);
    expect(cruzadas.map((s) => s.numero)).toEqual([3]);
  });

  it("calla cuando el orden de fechas sigue al de numeros", () => {
    expect(
      semanasAContramano([
        { numero: 1, fechaCorte: dc("2026-08-08") },
        { numero: 2, fechaCorte: dc("2026-08-15") },
        { numero: 3, fechaCorte: dc("2026-08-22") },
      ]),
    ).toEqual([]);
  });

  it("calla con una sola semana o con ninguna", () => {
    expect(semanasAContramano([])).toEqual([]);
    expect(semanasAContramano([{ numero: 1, fechaCorte: dc("2026-08-08") }])).toEqual([]);
  });
});

describe("arrastreDeIncumplidos", () => {
  const inc = (
    uid: number | null,
    numeroSemana: number,
    fecha: string,
    descripcion = `Tarea ${uid}`,
  ): CompromisoPrevio => ({
    uid,
    descripcion,
    numeroSemana,
    fechaCorte: dc(fecha),
    cumplido: false,
    causa: "PRERREQUISITO",
  });

  const hecho = (
    uid: number,
    numeroSemana: number,
    fecha: string,
  ): CompromisoPrevio => ({
    uid,
    descripcion: `Tarea ${uid}`,
    numeroSemana,
    fechaCorte: dc(fecha),
    cumplido: true,
    causa: null,
  });

  it("arrastra lo que se prometio, fallo y sigue sin hacerse", () => {
    const r = arrastreDeIncumplidos(
      [inc(10, 1, "2026-08-07")],
      new Map([[10, 30]]),
      new Set(),
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.uid).toBe(10);
    expect(r[0]?.veces).toBe(1);
    expect(r[0]?.avance).toBe(30);
  });

  it("NO arrastra lo que ya se termino", () => {
    // Se cumplio tarde, pero se cumplio. Recordarlo seria mentir sobre el
    // estado de la obra.
    const r = arrastreDeIncumplidos(
      [inc(10, 1, "2026-08-07")],
      new Map([[10, 100]]),
      new Set(),
    );
    expect(r).toEqual([]);
  });

  it("NO arrastra lo que ya esta en la semana que se planifica", () => {
    // El residente ya se acordo: proponerselo otra vez es ruido puro.
    const r = arrastreDeIncumplidos(
      [inc(10, 1, "2026-08-07")],
      new Map(),
      new Set([10]),
    );
    expect(r).toEqual([]);
  });

  it("ignora las lineas libres, que no se pueden seguir entre semanas", () => {
    // Lo unico que las identifica es un texto que se puede reescribir.
    const r = arrastreDeIncumplidos([inc(null, 1, "2026-08-07")], new Map(), new Set());
    expect(r).toEqual([]);
  });

  it("cuenta las veces que fallo y las pone primero", () => {
    // Lo que lleva tres semanas prometiendose es un bloqueo cronico; hay que
    // mirarlo antes que lo que fallo anteayer por primera vez.
    const r = arrastreDeIncumplidos(
      [
        inc(10, 1, "2026-08-07"),
        inc(10, 2, "2026-08-14"),
        inc(10, 3, "2026-08-21"),
        inc(20, 3, "2026-08-21"),
      ],
      new Map(),
      new Set(),
    );
    expect(r.map((a) => [a.uid, a.veces])).toEqual([
      [10, 3],
      [20, 1],
    ]);
  });

  it("«la ultima vez» se decide por FECHA, no por numero de semana", () => {
    // El correlativo puede ir a contramano del calendario: la Semana 3 puede
    // cerrar antes que la Semana 2.
    const r = arrastreDeIncumplidos(
      [
        inc(10, 3, "2026-08-14", "nombre viejo"),
        inc(10, 2, "2026-08-15", "nombre nuevo"),
      ],
      new Map(),
      new Set(),
    );
    expect(r[0]?.ultimaSemana).toBe(2);
    expect(r[0]?.descripcion).toBe("nombre nuevo");
  });

  it("se corta: una lista de cincuenta no se lee, se cierra", () => {
    const muchos = Array.from({ length: 40 }, (_, i) =>
      inc(i + 1, 1, "2026-08-07"),
    );
    expect(arrastreDeIncumplidos(muchos, new Map(), new Set(), 12)).toHaveLength(12);
  });

  it("NO arrastra lo que fallo una semana y se cumplio a la siguiente", () => {
    // Va avanzando: insistir sobre algo que ya se recupero es exactamente el
    // ruido que haria que nadie leyera esta lista.
    const r = arrastreDeIncumplidos(
      [inc(10, 1, "2026-08-07"), hecho(10, 2, "2026-08-14")],
      new Map([[10, 60]]),
      new Set(),
    );
    expect(r).toEqual([]);
  });

  it("SI arrastra lo que se cumplio una semana y volvio a fallar", () => {
    // Manda la ultima palabra, no el historial.
    const r = arrastreDeIncumplidos(
      [hecho(10, 1, "2026-08-07"), inc(10, 2, "2026-08-14")],
      new Map([[10, 60]]),
      new Set(),
    );
    expect(r.map((a) => a.uid)).toEqual([10]);
    expect(r[0]?.veces).toBe(1);
  });

  it("sin nada incumplido no arrastra nada", () => {
    expect(arrastreDeIncumplidos([], new Map(), new Set())).toEqual([]);
  });
});

describe("rangoSemana", () => {
  it("los 7 dias que terminan en el corte", () => {
    const { inicio, fin } = rangoSemana(dc("2026-08-07"));
    expect(fin).toEqual(dc("2026-08-07"));
    expect(inicio).toEqual(dc("2026-08-01"));
  });
});

describe("tareasDeLaSemana", () => {
  const t = (
    uid: number,
    codigo: string,
    ini: string,
    f: string,
    esResumen = false,
  ): TareaProgramada => ({
    uid,
    codigo,
    nombre: `T${uid}`,
    inicio: dc(ini),
    fin: dc(f),
    esResumen,
  });
  const ini = dc("2026-08-01");
  const fin = dc("2026-08-07");

  it("incluye las que solapan el rango, incluidos los bordes", () => {
    const tareas = [
      t(1, "1.1", "2026-08-02", "2026-08-05"), // dentro
      t(2, "1.2", "2026-07-28", "2026-08-02"), // empieza antes, entra
      t(3, "1.3", "2026-08-06", "2026-08-12"), // empieza dentro, sigue despues
      t(4, "1.4", "2026-08-01", "2026-08-01"), // borde inicio
      t(5, "1.5", "2026-08-07", "2026-08-07"), // borde fin
    ];
    expect(tareasDeLaSemana(tareas, ini, fin).map((x) => x.uid).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("excluye las que quedan fuera del rango", () => {
    const tareas = [
      t(10, "a", "2026-07-20", "2026-07-31"), // termina antes
      t(11, "b", "2026-08-08", "2026-08-10"), // empieza despues
    ];
    expect(tareasDeLaSemana(tareas, ini, fin)).toEqual([]);
  });

  it("excluye resumenes aunque solapen", () => {
    const tareas = [t(20, "R", "2026-08-01", "2026-08-07", true)];
    expect(tareasDeLaSemana(tareas, ini, fin)).toEqual([]);
  });

  it("ordena por inicio y luego por codigo", () => {
    const tareas = [
      t(1, "z", "2026-08-05", "2026-08-06"),
      t(2, "a", "2026-08-02", "2026-08-03"),
      t(3, "b", "2026-08-02", "2026-08-04"),
    ];
    expect(tareasDeLaSemana(tareas, ini, fin).map((x) => x.codigo)).toEqual(["a", "b", "z"]);
  });
});

describe("restriccionDeTarea", () => {
  const dep = (tareaUid: number, predecesoraUid: number, tipo: string): EnlacePredecesora => ({
    tareaUid,
    predecesoraUid,
    tipo,
  });

  it("sin predecesoras: libre", () => {
    expect(restriccionDeTarea(5, [], new Map()).libre).toBe(true);
  });

  it("FC con predecesora al 100%: libre", () => {
    const r = restriccionDeTarea(5, [dep(5, 4, "FC")], new Map([[4, 100]]));
    expect(r.libre).toBe(true);
  });

  it("FC con predecesora al 50%: con restriccion y motivo", () => {
    const r = restriccionDeTarea(
      5,
      [dep(5, 4, "FC")],
      new Map([[4, 50]]),
      new Map([[4, "2.1 Movilizacion"]]),
    );
    expect(r.libre).toBe(false);
    expect(r.motivo).toBe("2.1 Movilizacion al 50%");
  });

  it("CC restringe solo si la predecesora esta en 0", () => {
    expect(restriccionDeTarea(5, [dep(5, 4, "CC")], new Map([[4, 0]])).libre).toBe(false);
    expect(restriccionDeTarea(5, [dep(5, 4, "CC")], new Map([[4, 20]])).libre).toBe(true);
  });

  it("FF y CF no restringen el inicio (adelantar)", () => {
    expect(restriccionDeTarea(5, [dep(5, 4, "FF")], new Map([[4, 0]])).libre).toBe(true);
    expect(restriccionDeTarea(5, [dep(5, 4, "CF")], new Map([[4, 0]])).libre).toBe(true);
  });

  it("varias predecesoras: la primera pendiente manda", () => {
    const r = restriccionDeTarea(
      5,
      [dep(5, 3, "FC"), dep(5, 4, "FC")],
      new Map([[3, 100], [4, 30]]),
      new Map([[4, "2.4 Trazo"]]),
    );
    expect(r.libre).toBe(false);
    expect(r.motivo).toBe("2.4 Trazo al 30%");
  });

  it("una predecesora sin avance registrado cuenta como 0%", () => {
    const r = restriccionDeTarea(5, [dep(5, 4, "FC")], new Map());
    expect(r.libre).toBe(false);
    expect(r.motivo).toBe("tarea 4 al 0%");
  });
});


describe("sugerirCantidad", () => {
  it("sin partidas mapeadas no propone nada y lo explica", () => {
    const r = sugerirCantidad([]);
    expect(r.origen).toBe("SIN_PARTIDA");
    expect(r.unidad).toBeNull();
    expect(r.cantidad).toBeNull();
    expect(r.aviso).toBeTruthy();
  });

  it("una partida: su unidad y su metrado", () => {
    const r = sugerirCantidad([{ unidad: "m2", metrado: "120.5" }]);
    expect(r.origen).toBe("PARTIDA");
    expect(r.unidad).toBe("m2");
    expect(r.cantidad).toBe("120.5000");
  });

  it("varias partidas de la misma unidad: suma exacta", () => {
    const r = sugerirCantidad([
      { unidad: "m3", metrado: "12.5" },
      { unidad: "m3", metrado: "0.25" },
    ]);
    expect(r.origen).toBe("PARTIDAS_HOMOGENEAS");
    expect(r.cantidad).toBe("12.7500");
  });

  it("unidades distintas: no inventa una suma sin sentido", () => {
    const r = sugerirCantidad([
      { unidad: "m2", metrado: "10" },
      { unidad: "kg", metrado: "80" },
    ]);
    expect(r.origen).toBe("UNIDADES_MIXTAS");
    expect(r.unidad).toBeNull();
    expect(r.cantidad).toBeNull();
    expect(r.aviso).toBeTruthy();
  });

  it("con unidad pero sin metrado propone la unidad sola", () => {
    const r = sugerirCantidad([{ unidad: "und", metrado: null }]);
    expect(r.unidad).toBe("und");
    expect(r.cantidad).toBeNull();
  });
});


describe("mapaPreservablePorUid", () => {
  const campos = {
    zona: "Z1",
    proveedorId: "prov1",
    color: null,
    protocoloCalidad: true,
    // Se anota al cerrar la semana: si no se preservara, reabrir y volver a
    // guardar borraria lo que de verdad se ejecuto.
    cantidadEjec: "90.0000",
  };

  it("conserva lo que la pantalla no reenvia", () => {
    const m = mapaPreservablePorUid(
      [{ uid: 7, ...campos }],
      [{ uid: 7 }],
    );
    expect(m.get(7)).toEqual(campos);
  });

  it("no adivina si el uid estaba dos veces", () => {
    const m = mapaPreservablePorUid(
      [
        { uid: 7, ...campos },
        { uid: 7, ...campos, zona: "Z2" },
      ],
      [{ uid: 7 }],
    );
    expect(m.has(7)).toBe(false);
  });

  it("no adivina si el uid llega dos veces", () => {
    const m = mapaPreservablePorUid(
      [{ uid: 7, ...campos }],
      [{ uid: 7 }, { uid: 7 }],
    );
    expect(m.has(7)).toBe(false);
  });

  it("ignora las lineas libres y las tareas que ya no vienen", () => {
    const m = mapaPreservablePorUid(
      [
        { uid: null, ...campos },
        { uid: 9, ...campos },
      ],
      [{ uid: null }],
    );
    expect(m.size).toBe(0);
  });
});


describe("validarCantidadPlan", () => {
  it("vacio es valido: no toda tarea se mide por cantidad", () => {
    expect(validarCantidadPlan("")).toEqual({ ok: true, valor: null });
    expect(validarCantidadPlan(null)).toEqual({ ok: true, valor: null });
    expect(validarCantidadPlan(undefined)).toEqual({ ok: true, valor: null });
  });

  it("normaliza a 4 decimales y acepta coma", () => {
    expect(validarCantidadPlan("12,5")).toEqual({ ok: true, valor: "12.5000" });
    expect(validarCantidadPlan("120")).toEqual({ ok: true, valor: "120.0000" });
  });

  it("rechaza negativos, texto y desbordes", () => {
    expect(validarCantidadPlan("-3").ok).toBe(false);
    expect(validarCantidadPlan("abc").ok).toBe(false);
    expect(validarCantidadPlan("99999999999999").ok).toBe(false);
  });

  it("rechaza el separador ambiguo en vez de adivinar", () => {
    // "12,500" puede ser 12.5 o 12500: se pregunta, no se supone.
    expect(validarCantidadPlan("12,500").ok).toBe(false);
  });
});

describe("uidsDuplicados", () => {
  it("sin repetidos devuelve vacio", () => {
    expect(uidsDuplicados([{ uid: 1 }, { uid: 2 }])).toEqual([]);
  });

  it("detecta la tarea puesta dos veces", () => {
    expect(uidsDuplicados([{ uid: 1 }, { uid: 2 }, { uid: 1 }])).toEqual([1]);
  });

  it("dos lineas libres no son un duplicado", () => {
    expect(uidsDuplicados([{ uid: null }, { uid: null }])).toEqual([]);
  });
});
