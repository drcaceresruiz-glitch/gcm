import { describe, it, expect } from "vitest";
import {
  agruparPorCapitulo,
  alertasDeAtraso,
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
    esCritico: false,
    duracionDias: "10.00",
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
      t({ uid: 2, nivel: 2, codigo: "7.0", nombre: "SANITARIAS", esResumen: true }),
      t({ uid: 3, nivel: 3, codigo: "7.3", porcentajePlaneado: "100.00", porcentajeReal: "100.00" }),
      t({ uid: 4, nivel: 3, codigo: "7.3.1", porcentajePlaneado: "0.00", porcentajeReal: "0.00" }),
      t({ uid: 5, nivel: 2, codigo: "8.0", nombre: "ELECTRICAS", esResumen: true }),
      t({ uid: 6, nivel: 3, codigo: "8.1", porcentajePlaneado: "50.00", porcentajeReal: "50.00" }),
    ]);

    expect(capitulos.map((c) => c.codigo)).toEqual(["7.0", "8.0"]);
    expect(capitulos[0]?.hojas).toBe(2);
    expect(capitulos[0]?.planeado).toBe("50.00");
    expect(capitulos[1]?.hojas).toBe(1);
    expect(capitulos[1]?.planeado).toBe("50.00");
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
