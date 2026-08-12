import { describe, expect, it } from "vitest";
import { resumenParaCorreo } from "./informe-correo";
import type { DatosCsvInforme } from "./informe-csv";
import type { AlertaAtraso } from "./control-avance";

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const ALERTA: AlertaAtraso = {
  uid: 9,
  codigo: "1.4",
  nombre: "Muro de contención",
  planeado: "80.00",
  real: "30.00",
  desfase: "-50.00",
  diasAtraso: "6.00",
  pendiente: "70.00",
  severidad: "alta",
  esCritico: true,
  vencida: true,
  motivo: "En ruta crítica y vencida",
};

function datos(parcial: Partial<DatosCsvInforme> = {}): DatosCsvInforme {
  return {
    empresa: "Constructora Andina S.A.C.",
    obra: "Ampliación Clínica",
    ubicacion: "Cusco",
    fechaCorte: dia("2026-08-08"),
    version: 3,
    importadoPor: "residente@obra.pe",
    planeadoProject: null,
    realProject: null,
    real: "22.60",
    planeado: "13.06",
    desviacion: "9.54",
    periodo: { desde: null, realAnterior: "0.00", ganado: "0.00", tareas: [] },
    curva: { plan: [], realSemanal: [] },
    capitulos: [],
    alertas: [],
    activas: [],
    lastPlanner: null,
    generadoPor: "Ana Quispe",
    ...parcial,
  };
}

describe("resumenParaCorreo - el titular", () => {
  it("dice por delante cuando lo va, con la cifra", () => {
    expect(resumenParaCorreo(datos()).estado).toBe(
      "La obra va 9.54 puntos por delante del plan.",
    );
  });

  it("dice por detras en positivo, sin el signo menos", () => {
    // "va -9.54 puntos por detras" es una doble negacion que se lee mal.
    expect(resumenParaCorreo(datos({ desviacion: "-9.54" })).estado).toBe(
      "La obra va 9.54 puntos por detrás del plan.",
    );
  });

  it("una desviacion minima es ir al dia, no ir por delante", () => {
    // Anunciar «por delante» por dos centesimas en un correo que puede ir al
    // cliente es vender algo que no hay.
    expect(resumenParaCorreo(datos({ desviacion: "0.02" })).estado).toBe(
      "La obra va al día respecto al plan.",
    );
    expect(resumenParaCorreo(datos({ desviacion: "-0.30" })).estado).toBe(
      "La obra va al día respecto al plan.",
    );
  });

  it("el asunto lleva la obra y la fecha del corte", () => {
    expect(resumenParaCorreo(datos()).asunto).toBe(
      "Informe de obra — Ampliación Clínica (corte 08/08/2026)",
    );
  });
});

describe("resumenParaCorreo - las cifras", () => {
  it("en el primer informe no menciona lo ganado, porque no hay periodo", () => {
    const r = resumenParaCorreo(datos());
    expect(r.cifras.map((c) => c.etiqueta)).toEqual([
      "Avance real",
      "Avance planeado",
      "Desviación",
    ]);
  });

  it("con corte anterior anade lo ganado y desde cuando", () => {
    const r = resumenParaCorreo(
      datos({
        periodo: {
          desde: dia("2026-08-01"),
          realAnterior: "18.20",
          ganado: "4.40",
          tareas: [],
        },
      }),
    );
    expect(r.cifras[3]).toEqual({
      etiqueta: "Ganado desde el 01/08/2026",
      valor: "4.40 puntos",
    });
  });
});

describe("resumenParaCorreo - el PPC", () => {
  const lp = (semana: DatosCsvInforme["lastPlanner"]) => datos({ lastPlanner: semana });

  it("se menciona cuando la semana cerro", () => {
    const r = resumenParaCorreo(
      lp({
        semana: { numero: 3, cerrada: true, total: 12, cumplidos: 9, ppc: 75 },
        compromisos: [],
        tendencia: [],
        pareto: [],
      }),
    );
    expect(r.ppc).toBe("PPC de la semana 3: 75% (9 de 12 compromisos)");
  });

  it("se CALLA si la semana sigue abierta", () => {
    // Un PPC a medio evaluar en un correo se lee como definitivo.
    const r = resumenParaCorreo(
      lp({
        semana: { numero: 4, cerrada: false, total: 10, cumplidos: 6, ppc: null },
        compromisos: [],
        tendencia: [],
        pareto: [],
      }),
    );
    expect(r.ppc).toBeNull();
  });

  it("se calla sin permiso de plan semanal", () => {
    expect(resumenParaCorreo(datos({ lastPlanner: null })).ppc).toBeNull();
  });
});

describe("resumenParaCorreo - lo mas grave", () => {
  it("solo saca las de severidad alta", () => {
    const r = resumenParaCorreo(
      datos({
        alertas: [
          ALERTA,
          { ...ALERTA, uid: 10, nombre: "Tarrajeo", severidad: "media" },
        ],
      }),
    );
    expect(r.masGraves).toHaveLength(1);
    expect(r.masGraves[0]?.partida).toBe("1.4 Muro de contención");
  });

  it("dice el desfase en positivo y los dias de trabajo que cuesta", () => {
    // Un porcentaje no mueve a nadie; «6 días de trabajo» si.
    const r = resumenParaCorreo(datos({ alertas: [ALERTA] }));
    expect(r.masGraves[0]?.detalle).toBe(
      "50.00 puntos por detrás · 6.00 días de trabajo · ruta crítica",
    );
  });

  it("omite la coletilla de ruta critica cuando no lo esta", () => {
    const r = resumenParaCorreo(
      datos({ alertas: [{ ...ALERTA, esCritico: false }] }),
    );
    expect(r.masGraves[0]?.detalle).not.toContain("ruta crítica");
  });

  it("corta en tres y dice cuantas se quedaron fuera", () => {
    // El correo se lee en el movil; la lista entera va en el adjunto.
    const cinco = Array.from({ length: 5 }, (_, i) => ({
      ...ALERTA,
      uid: i,
      nombre: `Partida ${i}`,
    }));
    const r = resumenParaCorreo(datos({ alertas: cinco }));
    expect(r.masGraves).toHaveLength(3);
    expect(r.gravesOmitidas).toBe(2);
  });

  it("sin atrasos graves no inventa una lista vacia con contador", () => {
    const r = resumenParaCorreo(datos());
    expect(r.masGraves).toEqual([]);
    expect(r.gravesOmitidas).toBe(0);
  });
});
