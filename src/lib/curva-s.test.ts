import { describe, it, expect } from "vitest";
import {
  curvaPlaneada,
  fechasSemanales,
  planeadoEnFecha,
  ponderarPorDuracion,
  proyectar,
  serieCurvaS,
  serieRealPorFechas,
  type TareaParaCurva,
} from "./curva-s";
import type { AvanceReportado } from "./cronograma";

function tarea(
  uid: number,
  duracionDias: string,
  porcentajePlaneado: string,
  porcentajeArchivo: string,
  esResumen = false,
): TareaParaCurva {
  return { uid, duracionDias, porcentajePlaneado, porcentajeArchivo, esResumen };
}

function avance(uid: number, porcentaje: string, fecha: string): AvanceReportado {
  return {
    uid,
    porcentaje,
    fecha: new Date(`${fecha}T00:00:00Z`),
    createdAt: new Date(`${fecha}T12:00:00Z`),
    reportadoPor: "Residente",
    nota: null,
  };
}

describe("ponderarPorDuracion", () => {
  it("pesa cada tarea por su duracion, no las promedia", async () => {
    // Una partida de 20 dias al 0% y una de 1 dia al 100%. El promedio simple
    // diria 50%; la verdad es 4,76%.
    const r = ponderarPorDuracion(
      [tarea(1, "20.00", "0.00", "0.00"), tarea(2, "1.00", "100.00", "100.00")],
      (t) => t.porcentajePlaneado,
    );

    expect(r).toBe("4.76");
  });

  it("no cuenta las tareas resumen", async () => {
    // El resumen ya lleva consolidado el avance de sus hijas: sumarlo con
    // ellas contaria dos veces el mismo trabajo. Es la misma trampa que
    // `sumarHojas` resolvio en el presupuesto.
    const r = ponderarPorDuracion(
      [
        tarea(1, "10.00", "100.00", "100.00", true),
        tarea(2, "5.00", "100.00", "100.00"),
        tarea(3, "5.00", "0.00", "0.00"),
      ],
      (t) => t.porcentajePlaneado,
    );

    expect(r).toBe("50.00");
  });

  it("devuelve cero si ninguna tarea tiene duracion", async () => {
    // Un cronograma de puros hitos no tiene avance ponderable. Debe dar cero
    // y no romper la pantalla con una division por cero.
    const r = ponderarPorDuracion(
      [tarea(1, "0.00", "100.00", "100.00"), tarea(2, "0.00", "0.00", "0.00")],
      (t) => t.porcentajePlaneado,
    );

    expect(r).toBe("0.00");
  });

  it("acumula con precision y no arrastra los redondeos", async () => {
    // Tres tercios de 33,33: redondeando cada aporte a dos decimales antes de
    // dividir, el resultado se desvia.
    const r = ponderarPorDuracion(
      [
        tarea(1, "1.00", "33.33", "0.00"),
        tarea(2, "1.00", "33.33", "0.00"),
        tarea(3, "1.00", "33.34", "0.00"),
      ],
      (t) => t.porcentajePlaneado,
    );

    expect(r).toBe("33.33");
  });
});

describe("serieCurvaS", () => {
  const corte = (version: number, fecha: string, tareas: TareaParaCurva[]) => ({
    version,
    fechaCorte: new Date(`${fecha}T00:00:00Z`),
    tareas,
  });

  it("ordena los cortes por fecha aunque se hayan cargado al reves", async () => {
    // Nada impide cargar despues un corte antiguo para completar el
    // historico, y la curva tiene que salir igualmente de izquierda a derecha.
    const serie = serieCurvaS(
      [
        corte(2, "2026-08-03", [tarea(1, "10.00", "20.00", "10.00")]),
        corte(1, "2026-08-08", [tarea(1, "10.00", "60.00", "50.00")]),
      ],
      [],
    );

    expect(serie.map((p) => p.version)).toEqual([2, 1]);
    expect(serie.map((p) => p.planeado)).toEqual(["20.00", "60.00"]);
  });

  it("usa el reporte de obra vigente en la fecha del corte, no el de hoy", async () => {
    // La curva cuenta lo que se sabia entonces. Si tomara siempre el ultimo
    // reporte, el pasado se reescribiria cada vez que alguien reporta hoy y
    // la curva dejaria de ser un historico.
    const tareas = [tarea(1, "10.00", "50.00", "0.00")];

    const serie = serieCurvaS(
      [corte(1, "2026-08-03", tareas), corte(2, "2026-08-08", tareas)],
      [avance(1, "30.00", "2026-08-02"), avance(1, "90.00", "2026-08-08")],
    );

    expect(serie[0]?.real).toBe("30.00");
    expect(serie[1]?.real).toBe("90.00");
  });

  it("cae al porcentaje del archivo mientras la tarea no tenga reporte", async () => {
    const serie = serieCurvaS(
      [corte(1, "2026-08-08", [tarea(1, "10.00", "80.00", "45.00")])],
      [],
    );

    expect(serie[0]?.real).toBe("45.00");
  });

  it("calcula el desfase con signo", async () => {
    const serie = serieCurvaS(
      [
        corte(1, "2026-08-03", [tarea(1, "10.00", "20.00", "35.00")]),
        corte(2, "2026-08-08", [tarea(1, "10.00", "80.00", "45.00")]),
      ],
      [],
    );

    expect(serie.map((p) => p.desfase)).toEqual(["15.00", "-35.00"]);
  });
});

function planificada(
  uid: number,
  duracionDias: string,
  inicio: string,
  fin: string,
  esResumen = false,
) {
  return {
    uid,
    duracionDias,
    esResumen,
    inicio: new Date(`${inicio}T00:00:00Z`),
    fin: new Date(`${fin}T00:00:00Z`),
  };
}

const f = (d: string) => new Date(`${d}T00:00:00Z`);

describe("planeadoEnFecha", () => {
  it("reparte cada tarea linealmente a lo largo de sus dias", async () => {
    // Una sola tarea de 10 dias: a mitad de camino va por la mitad.
    const tareas = [planificada(1, "10.00", "2026-08-01", "2026-08-11")];

    expect(planeadoEnFecha(tareas, f("2026-08-01"))).toBe(0);
    expect(planeadoEnFecha(tareas, f("2026-08-06"))).toBeCloseTo(50, 6);
    expect(planeadoEnFecha(tareas, f("2026-08-11"))).toBe(100);
  });

  it("no pasa del 100 ni baja de 0 fuera del plazo de la tarea", async () => {
    const tareas = [planificada(1, "5.00", "2026-08-10", "2026-08-15")];

    expect(planeadoEnFecha(tareas, f("2026-08-01"))).toBe(0);
    expect(planeadoEnFecha(tareas, f("2026-12-31"))).toBe(100);
  });

  it("dibuja una S: arranque lento, centro rapido y cierre lento", async () => {
    // Es la forma que da el solape real de una obra: al principio y al final
    // hay pocas tareas a la vez, y en el centro se acumulan.
    const tareas = [
      planificada(1, "2.00", "2026-08-01", "2026-08-11"),
      planificada(2, "10.00", "2026-08-06", "2026-08-16"),
      planificada(3, "2.00", "2026-08-11", "2026-08-21"),
    ];

    const en = (d: string) => planeadoEnFecha(tareas, f(d));
    const primerTramo = en("2026-08-06") - en("2026-08-01");
    const tramoCentral = en("2026-08-16") - en("2026-08-06");
    const ultimoTramo = en("2026-08-21") - en("2026-08-16");

    expect(tramoCentral).toBeGreaterThan(primerTramo);
    expect(tramoCentral).toBeGreaterThan(ultimoTramo);
  });

  it("no cuenta las tareas resumen ni los hitos sin duracion", async () => {
    const tareas = [
      planificada(1, "10.00", "2026-08-01", "2026-08-11", true),
      planificada(2, "0.00", "2026-08-01", "2026-08-01"),
      planificada(3, "10.00", "2026-08-01", "2026-08-11"),
    ];

    expect(planeadoEnFecha(tareas, f("2026-08-06"))).toBeCloseTo(50, 6);
  });
});

describe("curvaPlaneada", () => {
  it("empieza en cero, acaba en cien y no se salta el ultimo dia", async () => {
    const tareas = [planificada(1, "10.00", "2026-08-01", "2026-08-11")];
    const curva = curvaPlaneada(tareas, f("2026-08-01"), f("2026-08-11"));

    expect(curva[0]?.valor).toBe(0);
    expect(curva[curva.length - 1]?.fecha.toISOString().slice(0, 10)).toBe("2026-08-11");
    expect(curva[curva.length - 1]?.valor).toBe(100);
  });

  it("muestrea mas grueso en plazos largos en vez de soltar miles de puntos", async () => {
    const tareas = [planificada(1, "700.00", "2026-01-01", "2027-12-01")];
    const curva = curvaPlaneada(tareas, f("2026-01-01"), f("2027-12-01"));

    expect(curva.length).toBeLessThanOrEqual(402);
  });
});

describe("proyectar", () => {
  it("continua al ritmo que se lleva y arranca en el punto real", async () => {
    // A mitad del plazo se lleva el 25% donde tocaba el 50%: se rinde a la
    // mitad, asi que la obra acabaria al 50% de lo previsto en la fecha fin.
    const tareas = [planificada(1, "10.00", "2026-08-01", "2026-08-11")];
    const plan = curvaPlaneada(tareas, f("2026-08-01"), f("2026-08-11"));

    const { puntos, factor } = proyectar(plan, f("2026-08-06"), 25);

    expect(factor).toBeCloseTo(0.5, 6);
    expect(puntos[0]?.valor).toBe(25);
    expect(puntos[0]?.fecha.toISOString().slice(0, 10)).toBe("2026-08-06");
    expect(puntos[puntos.length - 1]?.valor).toBeCloseTo(50, 6);
  });

  it("dice cuando se llegaria al 100% si se adelanta el ritmo", async () => {
    const tareas = [planificada(1, "10.00", "2026-08-01", "2026-08-11")];
    const plan = curvaPlaneada(tareas, f("2026-08-01"), f("2026-08-11"));

    const { terminoProyectado } = proyectar(plan, f("2026-08-06"), 100);

    expect(terminoProyectado).not.toBeNull();
    expect(terminoProyectado!.getTime()).toBeLessThan(f("2026-08-11").getTime());
  });

  it("no dispara la curva cuando todavia no habia nada planeado", async () => {
    // Dividir por un planeado de cero daria infinito y la proyeccion se
    // saldria del grafico el primer dia de obra.
    const tareas = [planificada(1, "10.00", "2026-08-01", "2026-08-11")];
    const plan = curvaPlaneada(tareas, f("2026-08-01"), f("2026-08-11"));

    const { factor, puntos } = proyectar(plan, f("2026-08-01"), 0);

    expect(factor).toBe(1);
    expect(puntos.every((p) => Number.isFinite(p.valor))).toBe(true);
  });
});

const dc = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (f: Date) => f.toISOString().slice(0, 10);

describe("fechasSemanales", () => {
  it("incluye la fecha de inicio si cae en el dia pedido, y va de 7 en 7", () => {
    const desde = dc("2026-08-03");
    const dia = desde.getUTCDay() === 0 ? 7 : desde.getUTCDay();
    const fechas = fechasSemanales(desde, dc("2026-08-20"), dia);
    expect(fechas.map(iso)).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
  });

  it("salta a la primera ocurrencia del dia pedido", () => {
    const desde = dc("2026-08-03");
    const dia = desde.getUTCDay() === 0 ? 7 : desde.getUTCDay();
    const siguiente = dia === 7 ? 1 : dia + 1;
    const fechas = fechasSemanales(desde, dc("2026-08-12"), siguiente);
    expect(iso(fechas[0]!)).toBe("2026-08-04");
  });

  it("vacio si hasta es anterior a desde", () => {
    expect(fechasSemanales(dc("2026-08-10"), dc("2026-08-01"), 5)).toEqual([]);
  });
});

describe("serieRealPorFechas", () => {
  it("muestrea el avance vigente en cada fecha, ponderado por duracion", () => {
    const tareas = [
      tarea(1, "10.00", "0.00", "0.00"),
      tarea(2, "10.00", "0.00", "0.00"),
    ];
    const avances = [
      avance(1, "50.00", "2026-08-05"),
      avance(1, "100.00", "2026-08-12"),
      avance(2, "20.00", "2026-08-12"),
    ];
    const serie = serieRealPorFechas(tareas, avances, [dc("2026-08-06"), dc("2026-08-13")]);
    // 06/08: t1=50 (reporte del 05), t2=0 (sin reporte) -> (50+0)/2 = 25.
    // 13/08: t1=100, t2=20 -> (100+20)/2 = 60. Iguales duraciones => media simple.
    expect(serie[0]!.valor).toBeCloseTo(25);
    expect(serie[1]!.valor).toBeCloseTo(60);
  });

  it("usa el % del archivo cuando la tarea aun no tiene reporte a esa fecha", () => {
    const serie = serieRealPorFechas(
      [tarea(1, "10.00", "0.00", "30.00")],
      [],
      [dc("2026-08-06")],
    );
    expect(serie[0]!.valor).toBeCloseTo(30);
  });
});
