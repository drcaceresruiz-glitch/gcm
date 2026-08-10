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
  type CompromisoEvaluado,
  type TareaProgramada,
  type EnlacePredecesora,
} from "./plan-semanal";

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
