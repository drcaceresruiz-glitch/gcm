import { describe, it, expect } from "vitest";
import {
  agruparPorCapitulo,
  alertasDeAtraso,
  cadenaCritica,
  partidasActivas,
  type TareaControlada,
} from "./control-avance";

let fila = 0;

function t(
  datos: Partial<TareaControlada> & { uid: number; nivel: number },
): TareaControlada {
  return {
    fila: ++fila,
    codigo: null,
    nombre: `Tarea ${datos.uid}`,
    esResumen: false,
    esHito: false,
    esCritico: false,
    duracionDias: "10.00",
    inicio: new Date("2026-08-01T00:00:00Z"),
    fin: new Date("2026-08-31T00:00:00Z"),
    porcentajePlaneado: "0.00",
    porcentajeReal: "0.00",
    desfase: "0.00",
    ...datos,
  };
}

const CORTE = new Date("2026-08-08T00:00:00Z");

describe("agruparPorCapitulo", () => {
  it("agrupa por el orden del documento, no por el codigo", async () => {
    // Es la trampa del archivo real: "7.3.1" es HERMANA de "7.3", las dos en
    // el mismo nivel. Agrupando por prefijo de codigo, "7.3.1" caeria dentro
    // de "7.3" y el capitulo saldria mal medido.
    fila = 0;
    const capitulos = agruparPorCapitulo([
      t({ uid: 1, nivel: 1, nombre: "PROYECTO", esResumen: true }),
      t({ uid: 2, nivel: 2, codigo: "7.0", nombre: "SANITARIAS", esResumen: true, porcentajePlaneado: "16.00" }),
      t({ uid: 3, nivel: 3, codigo: "7.3", porcentajePlaneado: "100.00", porcentajeReal: "100.00" }),
      t({ uid: 4, nivel: 3, codigo: "7.3.1", porcentajePlaneado: "0.00", porcentajeReal: "0.00" }),
      t({ uid: 5, nivel: 2, codigo: "8.0", nombre: "ELECTRICAS", esResumen: true }),
      t({ uid: 6, nivel: 3, codigo: "8.1", porcentajePlaneado: "50.00", porcentajeReal: "50.00" }),
    ]);

    expect(capitulos.map((c) => c.codigo)).toEqual(["7.0", "8.0"]);
    expect(capitulos[0]?.hojas).toBe(2);
    expect(capitulos[0]?.real).toBe("50.00");
    expect(capitulos[1]?.hojas).toBe(1);
    expect(capitulos[1]?.real).toBe("50.00");
  });

  it("LEE el planeado del capitulo y CALCULA el real", async () => {
    // El plan lo manda Project y el archivo ya trae el «% Planeado»
    // consolidado de cada capitulo: calcularlo por nuestra cuenta daba 50%
    // donde el informe del cliente dice 16%, y descuadraba el documento que ya
    // se entrega. El real, en cambio, lo manda GCM y sale de las hijas.
    fila = 0;
    const capitulos = agruparPorCapitulo([
      t({ uid: 1, nivel: 1, esResumen: true }),
      t({ uid: 2, nivel: 2, codigo: "7.0", esResumen: true, porcentajePlaneado: "16.00" }),
      t({ uid: 3, nivel: 3, porcentajePlaneado: "100.00", porcentajeReal: "80.00" }),
      t({ uid: 4, nivel: 3, porcentajePlaneado: "0.00", porcentajeReal: "20.00" }),
    ]);

    expect(capitulos[0]?.planeado).toBe("16.00");
    expect(capitulos[0]?.real).toBe("50.00");
    expect(capitulos[0]?.desfase).toBe("34.00");
  });

  it("pondera dentro del capitulo por duracion", async () => {
    // Una partida de 20 dias al 0% y una de 1 dia al 100% no son un 50%.
    fila = 0;
    const capitulos = agruparPorCapitulo([
      t({ uid: 1, nivel: 1, esResumen: true }),
      t({ uid: 2, nivel: 2, codigo: "3.0", esResumen: true }),
      t({ uid: 3, nivel: 3, duracionDias: "20.00", porcentajeReal: "0.00" }),
      t({ uid: 4, nivel: 3, duracionDias: "1.00", porcentajeReal: "100.00" }),
    ]);

    expect(capitulos[0]?.real).toBe("4.76");
  });

  it("cuenta las partidas atrasadas y las criticas de cada capitulo", async () => {
    fila = 0;
    const capitulos = agruparPorCapitulo([
      t({ uid: 1, nivel: 1, esResumen: true }),
      t({ uid: 2, nivel: 2, codigo: "4.0", esResumen: true }),
      t({ uid: 3, nivel: 3, desfase: "-30.00", esCritico: true }),
      t({ uid: 4, nivel: 3, desfase: "-5.00" }),
      t({ uid: 5, nivel: 3, desfase: "10.00" }),
    ]);

    expect(capitulos[0]?.atrasadas).toBe(2);
    expect(capitulos[0]?.criticas).toBe(1);
  });

  it("mide con sus propias cifras el capitulo que no tiene partidas debajo", async () => {
    // Si no, saldria a cero y pareceria parado cuando en realidad es el la
    // partida de trabajo.
    fila = 0;
    const capitulos = agruparPorCapitulo([
      t({ uid: 1, nivel: 1, esResumen: true }),
      t({ uid: 2, nivel: 2, codigo: "9.0", porcentajeReal: "80.00", porcentajePlaneado: "60.00" }),
    ]);

    expect(capitulos[0]?.real).toBe("80.00");
    expect(capitulos[0]?.desfase).toBe("20.00");
  });

  it("no devuelve capitulos cuando el cronograma es plano", async () => {
    fila = 0;
    const capitulos = agruparPorCapitulo([
      t({ uid: 1, nivel: 1 }),
      t({ uid: 2, nivel: 1 }),
    ]);

    expect(capitulos).toEqual([]);
  });
});

describe("alertasDeAtraso", () => {
  it("no lista las tareas resumen: duplicarian el aviso de sus hijas", async () => {
    fila = 0;
    const alertas = alertasDeAtraso(
      [
        t({ uid: 1, nivel: 2, esResumen: true, desfase: "-40.00" }),
        t({ uid: 2, nivel: 3, desfase: "-40.00" }),
      ],
      CORTE,
    );

    expect(alertas.map((a) => a.uid)).toEqual([2]);
  });

  it("marca como alta una tarea critica aunque su desfase sea pequeno", async () => {
    // Una critica atrasada empuja la fecha de termino de TODA la obra, aunque
    // sea por cinco puntos. Ordenar solo por porcentaje la dejaria abajo.
    fila = 0;
    const alertas = alertasDeAtraso(
      [
        t({ uid: 1, nivel: 3, desfase: "-5.00", esCritico: true, duracionDias: "20.00" }),
        t({ uid: 2, nivel: 3, desfase: "-45.00", duracionDias: "2.00" }),
      ],
      CORTE,
    );

    expect(alertas[0]?.uid).toBe(1);
    expect(alertas[0]?.severidad).toBe("alta");
    expect(alertas[1]?.severidad).toBe("media");
  });

  it("avisa de la tarea vencida sin terminar aunque no tenga desfase", async () => {
    // Su fecha de fin ya paso y no esta al 100%: eso es un incumplimiento,
    // aunque el porcentaje planeado y el real coincidan.
    fila = 0;
    const alertas = alertasDeAtraso(
      [
        t({
          uid: 1, nivel: 3, desfase: "0.00", porcentajeReal: "70.00",
          fin: new Date("2026-08-05T00:00:00Z"),
        }),
      ],
      CORTE,
    );

    expect(alertas).toHaveLength(1);
    expect(alertas[0]?.vencida).toBe(true);
    expect(alertas[0]?.severidad).toBe("alta");
    expect(alertas[0]?.pendiente).toBe("30");
  });

  it("no trata como urgente la vencida a la que solo le falta el remate", async () => {
    // Este era el fallo de la primera version: una partida al 95% cuya fecha
    // acababa de pasar salia igual de grave que una al 30%, y la lista ponia
    // arriba lo que ya estaba practicamente hecho.
    fila = 0;
    const alertas = alertasDeAtraso(
      [
        t({
          uid: 1, nivel: 3, desfase: "-5.00", porcentajeReal: "95.00",
          duracionDias: "2.00", fin: new Date("2026-08-05T00:00:00Z"),
        }),
        t({
          uid: 2, nivel: 3, desfase: "-53.00", porcentajeReal: "30.00",
          duracionDias: "1.00",
        }),
      ],
      CORTE,
    );

    expect(alertas[0]?.uid).toBe(2);
    expect(alertas.map((a) => a.severidad)).toEqual(["media", "media"]);
  });

  it("explica por que sube de nivel cada alerta", async () => {
    // Sin el motivo, un aviso «urgente» sobre una partida que NO esta en la
    // ruta critica se lee como si lo estuviera.
    fila = 0;
    const alertas = alertasDeAtraso(
      [
        t({ uid: 1, nivel: 3, desfase: "-5.00", esCritico: true }),
        t({
          uid: 2, nivel: 3, desfase: "-5.00", porcentajeReal: "40.00",
          fin: new Date("2026-08-05T00:00:00Z"),
        }),
      ],
      CORTE,
    );

    const porUid = new Map(alertas.map((a) => [a.uid, a]));
    expect(porUid.get(1)?.motivo).toContain("ruta critica");
    expect(porUid.get(2)?.motivo).toContain("60% por ejecutar");
    expect(porUid.get(2)?.esCritico).toBe(false);
  });

  it("no avisa de la que acabo a tiempo aunque su fin ya pasara", async () => {
    fila = 0;
    const alertas = alertasDeAtraso(
      [
        t({
          uid: 1, nivel: 3, desfase: "0.00", porcentajeReal: "100.00",
          fin: new Date("2026-08-05T00:00:00Z"),
        }),
      ],
      CORTE,
    );

    expect(alertas).toEqual([]);
  });

  it("traduce el desfase a dias de la propia tarea", async () => {
    // 10 puntos de una partida de 20 dias son 2 dias; 40 puntos de una de 2
    // dias son 0,8. Comparar porcentajes a secas invertiria la urgencia.
    fila = 0;
    const alertas = alertasDeAtraso(
      [
        t({ uid: 1, nivel: 3, desfase: "-10.00", duracionDias: "20.00" }),
        t({ uid: 2, nivel: 3, desfase: "-40.00", duracionDias: "2.00" }),
      ],
      CORTE,
    );

    const porUid = new Map(alertas.map((a) => [a.uid, a.diasAtraso]));
    expect(porUid.get(1)).toBe("2.0");
    expect(porUid.get(2)).toBe("0.8");
  });

  it("deja fuera lo que va al dia o por delante", async () => {
    fila = 0;
    const alertas = alertasDeAtraso(
      [
        t({ uid: 1, nivel: 3, desfase: "0.00" }),
        t({ uid: 2, nivel: 3, desfase: "15.00" }),
      ],
      CORTE,
    );

    expect(alertas).toEqual([]);
  });
});

describe("cadenaCritica", () => {
  const f = (d: string) => new Date(`${d}T00:00:00Z`);

  it("deja fuera resumenes e hitos aunque Project los marque criticos", async () => {
    // De las 26 filas criticas del cronograma real, 11 son capitulos y 2 son
    // hitos. Ninguno es trabajo sobre el que se pueda actuar: meter cuadrilla
    // en un capitulo no significa nada.
    fila = 0;
    const c = cadenaCritica(
      [
        t({ uid: 1, nivel: 1, esResumen: true, esCritico: true }),
        t({ uid: 2, nivel: 2, esResumen: true, esCritico: true, codigo: "11.0" }),
        t({ uid: 3, nivel: 3, esCritico: true, esHito: true, codigo: "0.9" }),
        t({ uid: 4, nivel: 3, esCritico: true, codigo: "11.1" }),
      ],
      CORTE,
    );

    expect(c.eslabones.map((e) => e.codigo)).toEqual(["11.1"]);
  });

  it("ordena por fecha de comienzo y no por el orden del archivo", async () => {
    // La ruta critica puede tener ramas paralelas, asi que no siempre es una
    // fila india. Lo que hay que ver es el orden en que hay que atenderlas.
    fila = 0;
    const c = cadenaCritica(
      [
        t({ uid: 1, nivel: 1, esResumen: true }),
        t({ uid: 2, nivel: 2, esResumen: true, codigo: "5.0" }),
        t({ uid: 3, nivel: 3, esCritico: true, codigo: "5.9", inicio: f("2026-09-20") }),
        t({ uid: 4, nivel: 3, esCritico: true, codigo: "5.1", inicio: f("2026-08-10") }),
      ],
      CORTE,
    );

    expect(c.eslabones.map((e) => e.codigo)).toEqual(["5.1", "5.9"]);
  });

  it("acumula la duracion de la cadena eslabon a eslabon", async () => {
    fila = 0;
    const c = cadenaCritica(
      [
        t({ uid: 1, nivel: 1, esResumen: true }),
        t({ uid: 2, nivel: 2, esResumen: true }),
        t({ uid: 3, nivel: 3, esCritico: true, duracionDias: "5.00", inicio: f("2026-08-10") }),
        t({ uid: 4, nivel: 3, esCritico: true, duracionDias: "7.00", inicio: f("2026-08-20") }),
      ],
      CORTE,
    );

    expect(c.eslabones.map((e) => e.acumuladoDias)).toEqual(["5.00", "12.00"]);
    expect(c.duracionTotal).toBe("12.00");
  });

  it("dice cuantos dias de la fecha de fin cuesta ya cada eslabon", async () => {
    // 20 puntos de atraso en una partida de 10 dias son 2 dias de obra, y en
    // la ruta critica esos 2 dias los pierde la obra entera.
    fila = 0;
    const c = cadenaCritica(
      [
        t({ uid: 1, nivel: 1, esResumen: true }),
        t({ uid: 2, nivel: 2, esResumen: true }),
        t({ uid: 3, nivel: 3, esCritico: true, duracionDias: "10.00", desfase: "-20.00" }),
        t({ uid: 4, nivel: 3, esCritico: true, duracionDias: "4.00", desfase: "-50.00" }),
      ],
      CORTE,
    );

    expect(c.eslabones.map((e) => e.diasAtraso)).toEqual(["2.0", "2.0"]);
    expect(c.atrasoAcumulado).toBe("4.0");
    expect(c.atrasados).toBe(2);
  });

  it("dice de que capitulo cuelga cada eslabon, por el orden del esquema", async () => {
    // Por prefijo de codigo fallaria: en el archivo real "7.3.1" es hermana de
    // "7.3" y no su hija.
    fila = 0;
    const c = cadenaCritica(
      [
        t({ uid: 1, nivel: 1, esResumen: true, nombre: "PROYECTO" }),
        t({ uid: 2, nivel: 2, esResumen: true, codigo: "5.0", nombre: "ESTRUCTURAS" }),
        t({ uid: 3, nivel: 3, esCritico: true, codigo: "5.1", inicio: f("2026-08-10") }),
        t({ uid: 4, nivel: 2, esResumen: true, codigo: "11.0", nombre: "ACABADOS" }),
        t({ uid: 5, nivel: 3, esCritico: true, codigo: "11.1", inicio: f("2026-08-19") }),
        t({ uid: 6, nivel: 3, esCritico: true, codigo: "11.2", inicio: f("2026-09-19") }),
      ],
      CORTE,
    );

    expect(c.eslabones[0]?.capitulo).toBe("5.0 ESTRUCTURAS");
    expect(c.concentracion[0]).toEqual({ capitulo: "11.0 ACABADOS", tareas: 2 });
  });

  it("marca lo que ya deberia haber arrancado a la fecha de corte", async () => {
    fila = 0;
    const c = cadenaCritica(
      [
        t({ uid: 1, nivel: 1, esResumen: true }),
        t({ uid: 2, nivel: 2, esResumen: true }),
        t({ uid: 3, nivel: 3, esCritico: true, inicio: f("2026-08-01") }),
        t({ uid: 4, nivel: 3, esCritico: true, inicio: f("2026-09-15") }),
      ],
      CORTE,
    );

    expect(c.eslabones.map((e) => e.arrancado)).toEqual([true, false]);
  });

  it("devuelve una cadena vacia si el archivo no marca ninguna critica", async () => {
    fila = 0;
    const c = cadenaCritica([t({ uid: 1, nivel: 1 }), t({ uid: 2, nivel: 2 })], CORTE);

    expect(c.eslabones).toEqual([]);
    expect(c.duracionTotal).toBe("0.00");
  });
});

describe("partidasActivas", () => {
  const f = (d: string) => new Date(`${d}T00:00:00Z`);

  it("recoge lo que sigue vivo y lo que arranca en la semana", async () => {
    fila = 0;
    const r = partidasActivas(
      [
        // Empezo antes del corte y sigue.
        t({ uid: 1, nivel: 3, inicio: f("2026-08-06"), fin: f("2026-08-10") }),
        // Arranca dentro de la semana.
        t({ uid: 2, nivel: 3, inicio: f("2026-08-12"), fin: f("2026-08-20") }),
        // Termino antes del corte.
        t({ uid: 3, nivel: 3, inicio: f("2026-08-01"), fin: f("2026-08-05") }),
        // Empieza dentro de un mes.
        t({ uid: 4, nivel: 3, inicio: f("2026-09-10"), fin: f("2026-09-20") }),
      ],
      CORTE,
    );

    expect(r.map((p) => p.uid).sort()).toEqual([1, 2]);
  });

  it("deja fuera lo terminado aunque caiga dentro de la semana", async () => {
    // En un informe semanal lo que interesa es lo que queda por hacer; una
    // lista con lo ya cerrado diluye lo que hay que mirar.
    fila = 0;
    const r = partidasActivas(
      [
        t({
          uid: 1, nivel: 3, porcentajeReal: "100.00",
          inicio: f("2026-08-06"), fin: f("2026-08-10"),
        }),
        t({
          uid: 2, nivel: 3, porcentajeReal: "40.00",
          inicio: f("2026-08-06"), fin: f("2026-08-10"),
        }),
      ],
      CORTE,
    );

    expect(r.map((p) => p.uid)).toEqual([2]);
  });

  it("no lista resumenes ni hitos", async () => {
    fila = 0;
    const r = partidasActivas(
      [
        t({ uid: 1, nivel: 2, esResumen: true, inicio: f("2026-08-06"), fin: f("2026-08-10") }),
        t({ uid: 2, nivel: 3, esHito: true, inicio: f("2026-08-08"), fin: f("2026-08-08") }),
        t({ uid: 3, nivel: 3, inicio: f("2026-08-06"), fin: f("2026-08-10") }),
      ],
      CORTE,
    );

    expect(r.map((p) => p.uid)).toEqual([3]);
  });

  it("pone primero las que van peor", async () => {
    // Es el orden en que se leen en una reunion de obra.
    fila = 0;
    const r = partidasActivas(
      [
        t({ uid: 1, nivel: 3, desfase: "10.00", inicio: f("2026-08-06"), fin: f("2026-08-10") }),
        t({ uid: 2, nivel: 3, desfase: "-53.00", inicio: f("2026-08-06"), fin: f("2026-08-10") }),
        t({ uid: 3, nivel: 3, desfase: "-5.00", inicio: f("2026-08-06"), fin: f("2026-08-10") }),
      ],
      CORTE,
    );

    expect(r.map((p) => p.uid)).toEqual([2, 3, 1]);
  });
});
