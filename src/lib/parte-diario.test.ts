import { describe, it, expect } from "vitest";
import {
  validarLoteAvance,
  ultimoDiaLaborableDeLaSemana,
  filasDelParte,
  tareasAbiertas,
  MAX_FILAS_PARTE,
  type EntradaParte,
  type TareaAbierta,
  type TareaDelParte,
} from "./parte-diario";
import type { DiaLaboral } from "@/lib/calendario";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const HOY = d("2026-08-12"); // miercoles

/// Lunes a viernes, 8 h. El sabado y el domingo, no.
const SEMANA_NORMAL: DiaLaboral[] = [1, 2, 3, 4, 5, 6, 7].map((diaSemana) => ({
  diaSemana,
  laborable: diaSemana <= 5,
  horas: diaSemana <= 5 ? "8.00" : "0.00",
  turno: "NORMAL" as const,
}));

/// El de CRIOCORD: el sabado se trabaja cinco horas.
const CON_SABADO: DiaLaboral[] = SEMANA_NORMAL.map((dia) =>
  dia.diaSemana === 6
    ? { ...dia, laborable: true, horas: "5.00" }
    : dia,
);

describe("validarLoteAvance", () => {
  const v = (entradas: EntradaParte[], fecha = "2026-08-12") =>
    validarLoteAvance(entradas, fecha, HOY);

  it("UNA CASILLA VACIA NO ESCRIBE NADA", () => {
    // El defecto mas grave que ha tenido el sistema fue escribir 100% cuando el
    // campo iba vacio, y eso falsifico la curva S al alza. Con cien casillas
    // delante, ese defecto se multiplica por siete dias.
    const r = v([
      { uid: 1, porcentaje: "" },
      { uid: 2, porcentaje: "   " },
      { uid: 3, porcentaje: "40" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.escribir).toEqual([{ uid: 3, porcentaje: "40.00" }]);
  });

  it("un parte entero en blanco es valido y no escribe nada", () => {
    // Es una respuesta legitima: «hoy no supervise nada».
    const r = v([
      { uid: 1, porcentaje: "" },
      { uid: 2, porcentaje: "" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.escribir).toEqual([]);
  });

  it("un valor malo tumba el LOTE ENTERO, no solo su fila", () => {
    // Guardar las buenas y callar las malas dejaria al residente creyendo que
    // reporto ochenta tareas cuando entraron setenta y siete. Con cien
    // casillas, eso no se descubre mirando.
    const r = v([
      { uid: 1, porcentaje: "40" },
      { uid: 2, porcentaje: "120" },
      { uid: 3, porcentaje: "60" },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("120");
  });

  it("acepta los extremos: 0 y 100 son porcentajes buenos", () => {
    const r = v([
      { uid: 1, porcentaje: "0" },
      { uid: 2, porcentaje: "100" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.escribir).toEqual([
        { uid: 1, porcentaje: "0.00" },
        { uid: 2, porcentaje: "100.00" },
      ]);
    }
  });

  it("rechaza lo que no es un numero", () => {
    expect(v([{ uid: 1, porcentaje: "casi" }]).ok).toBe(false);
  });

  it("rechaza una fecha futura", () => {
    // El vigente de cada tarea es el de fecha mas alta: uno fechado el mes que
    // viene congelaria esa tarea hasta que llegara el mes que viene.
    const r = v([{ uid: 1, porcentaje: "40" }], "2026-08-13");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("futuro");
  });

  it("acepta HOY y acepta un dia pasado", () => {
    // Lo pasado es el caso real: «lo dejo para el viernes y relleno la semana».
    expect(v([{ uid: 1, porcentaje: "40" }], "2026-08-12").ok).toBe(true);
    expect(v([{ uid: 1, porcentaje: "40" }], "2026-08-10").ok).toBe(true);
  });

  it("rechaza la misma tarea dos veces en el mismo parte", () => {
    // No hay forma de saber cual quiso, y elegir uno seria adivinar.
    const r = v([
      { uid: 1, porcentaje: "40" },
      { uid: 1, porcentaje: "60" },
    ]);
    expect(r.ok).toBe(false);
  });

  it("no se traga un parte de diez mil filas", () => {
    const muchas = Array.from({ length: MAX_FILAS_PARTE + 1 }, (_, i) => ({
      uid: i,
      porcentaje: "10",
    }));
    expect(v(muchas).ok).toBe(false);
  });
});

describe("ultimoDiaLaborableDeLaSemana", () => {
  it("con sabado laborable, el corte real es el SABADO", () => {
    // Es el caso literal del residente: «el reporte se emite el sabado, que en
    // este caso es el ultimo dia laborable de la semana».
    expect(ultimoDiaLaborableDeLaSemana(d("2026-08-12"), CON_SABADO)).toEqual(
      d("2026-08-15"),
    );
  });

  it("de lunes a viernes, el corte real es el VIERNES", () => {
    expect(ultimoDiaLaborableDeLaSemana(d("2026-08-12"), SEMANA_NORMAL)).toEqual(
      d("2026-08-14"),
    );
  });

  it("da lo mismo desde cualquier dia de esa semana", () => {
    // Lunes y domingo de la misma semana tienen que dar el mismo corte, o el
    // aviso de «tu semana cierra el X» diria una cosa distinta cada dia.
    const lunes = ultimoDiaLaborableDeLaSemana(d("2026-08-10"), CON_SABADO);
    const domingo = ultimoDiaLaborableDeLaSemana(d("2026-08-16"), CON_SABADO);
    expect(lunes).toEqual(domingo);
  });

  it("sin calendario configurado, todo dia cuenta como laborable", () => {
    // `esLaborable` asume laborable sin fila: es preferible contar de mas a
    // esconder trabajo que si esta programado.
    expect(ultimoDiaLaborableDeLaSemana(d("2026-08-12"), [])).toEqual(
      d("2026-08-16"),
    );
  });
});

describe("filasDelParte", () => {
  const tarea = (uid: number, extra: Partial<TareaDelParte> = {}): TareaDelParte => ({
    uid,
    codigo: `1.${uid}`,
    nombre: `Tarea ${uid}`,
    porcentajeReal: "40.00",
    desfase: "-5.00",
    esCritico: false,
    ...extra,
  });

  const capitulos = new Map([
    [1, "ESTRUCTURAS"],
    [2, "ESTRUCTURAS"],
    [3, "ACABADOS"],
  ]);

  it("agrupa por capitulo y conserva el orden que le llega", () => {
    // `partidasActivas` ya ordena por desfase, lo mas atrasado primero: quien
    // rellena de arriba abajo empieza por lo que peor va.
    const grupos = filasDelParte(
      [tarea(1), tarea(2), tarea(3)],
      capitulos,
      new Map(),
      HOY,
      CON_SABADO,
    );
    expect(grupos.map((g) => g.capitulo)).toEqual(["ESTRUCTURAS", "ACABADOS"]);
    expect(grupos[0]?.filas.map((f) => f.uid)).toEqual([1, 2]);
  });

  it("«nunca reportada» y «hace mucho» son distintos", () => {
    // Null no es cero, igual que en el Lookahead «sin restricciones» no es
    // «sin analizar». Si se confundieran, una tarea recien creada se veria
    // igual que una abandonada.
    const grupos = filasDelParte(
      [tarea(1), tarea(2)],
      capitulos,
      new Map([[2, d("2026-08-10")]]),
      HOY,
      CON_SABADO,
    );
    const filas = grupos[0]!.filas;
    expect(filas.find((f) => f.uid === 1)?.diasSinReportar).toBeNull();
    expect(filas.find((f) => f.uid === 2)?.diasSinReportar).toBe(2);
  });

  it("reportar HOY da cero dias sin reportar, no uno", () => {
    const grupos = filasDelParte(
      [tarea(1)],
      capitulos,
      new Map([[1, HOY]]),
      HOY,
      CON_SABADO,
    );
    expect(grupos[0]?.filas[0]?.diasSinReportar).toBe(0);
  });

  it("el porcentaje actual va en la fila, para ensenarlo AL LADO", () => {
    // Nunca dentro de la casilla: dentro seria un valor por defecto, y de ahi
    // vino el defecto del 100%.
    const grupos = filasDelParte(
      [tarea(1, { porcentajeReal: "62.50" })],
      capitulos,
      new Map(),
      HOY,
      CON_SABADO,
    );
    expect(grupos[0]?.filas[0]?.porcentajeActual).toBe("62.50");
  });

  it("una tarea sin capitulo conocido no se pierde", () => {
    const grupos = filasDelParte([tarea(9)], new Map(), new Map(), HOY, CON_SABADO);
    expect(grupos[0]?.capitulo).toBe("Sin capítulo");
    expect(grupos[0]?.filas).toHaveLength(1);
  });
});

describe("tareasAbiertas", () => {
  const t = (
    uid: number,
    campos: Partial<TareaAbierta> = {},
  ): TareaAbierta => ({
    uid,
    fila: uid,
    esResumen: false,
    esHito: false,
    inicio: d("2026-08-10"),
    fin: d("2026-08-14"),
    porcentajeReal: "40.00",
    desfase: "0.00",
    ...campos,
  });

  it("SIGUE OFRECIENDO LO QUE YA DEBERIA HABER ACABADO", () => {
    // Es la diferencia con `partidasActivas`, que exige `fin >= corte` porque
    // sirve a un informe semanal. Una partida que tenia que cerrar el jueves y
    // sigue al 60% es justo la que hay que reportar: si se cae de la lista,
    // queda congelada en la curva S para siempre.
    const r = tareasAbiertas(
      [t(1, { inicio: d("2026-07-01"), fin: d("2026-07-20") })],
      HOY,
    );
    expect(r.dentro.map((x) => x.uid)).toEqual([1]);
  });

  it("deja fuera lo que aun no arranca, y dice cuantas son", () => {
    // Una lista recortada que no dice que recorto se lee como la lista entera.
    const r = tareasAbiertas(
      [t(1), t(2, { inicio: d("2026-09-15") }), t(3, { inicio: d("2026-09-20") })],
      HOY,
    );
    expect(r.dentro.map((x) => x.uid)).toEqual([1]);
    expect(r.fuera).toBe(2);
  });

  it("una ventana mas ancha rescata lo que empieza despues", () => {
    const r = tareasAbiertas([t(1, { inicio: d("2026-08-25") })], HOY, 21);
    expect(r.dentro).toHaveLength(1);
    expect(r.fuera).toBe(0);
  });

  it("SIN VENTANA OFRECE TODAS LAS PARTIDAS ABIERTAS", () => {
    // El caso real: la obra no respeta el cronograma. Una cuadrilla que acaba
    // antes arranca la partida del mes que viene, y con ventana esa partida no
    // se puede reportar —queda en 0% mientras avanza de verdad—.
    const r = tareasAbiertas(
      [t(1), t(2, { inicio: d("2026-11-01") }), t(3, { inicio: d("2027-03-01") })],
      HOY,
      null,
    );
    expect(r.dentro.map((x) => x.uid)).toEqual([1, 2, 3]);
    expect(r.fuera).toBe(0);
  });

  it("sin ventana SIGUE sin ofrecer resumenes, hitos ni terminadas", () => {
    // Quitar la ventana abre el limite por fecha, no las otras tres puertas:
    // reportar avance sobre un resumen descuadraria el dinero.
    const r = tareasAbiertas(
      [
        t(1, { esResumen: true, inicio: d("2027-01-01") }),
        t(2, { esHito: true, inicio: d("2027-01-01") }),
        t(3, { porcentajeReal: "100.00", inicio: d("2027-01-01") }),
        t(4, { inicio: d("2027-01-01") }),
      ],
      HOY,
      null,
    );
    expect(r.dentro.map((x) => x.uid)).toEqual([4]);
  });

  it("no ofrece resumenes, hitos ni terminadas", () => {
    const r = tareasAbiertas(
      [
        t(1, { esResumen: true }),
        t(2, { esHito: true }),
        t(3, { porcentajeReal: "100.00" }),
        t(4),
      ],
      HOY,
    );
    expect(r.dentro.map((x) => x.uid)).toEqual([4]);
    // Ninguna de las tres se cuenta como «fuera de ventana»: no es que no
    // toquen todavia, es que no se reportan nunca.
    expect(r.fuera).toBe(0);
  });

  it("pone primero lo que peor va", () => {
    const r = tareasAbiertas(
      [t(1, { desfase: "-2.00" }), t(2, { desfase: "-30.00" }), t(3, { desfase: "5.00" })],
      HOY,
    );
    expect(r.dentro.map((x) => x.uid)).toEqual([2, 1, 3]);
  });
});
