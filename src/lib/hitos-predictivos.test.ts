import { describe, expect, it } from "vitest";

import {
  predecirHitos,
  porEstancamiento,
  porHolgura,
  porSpi,
  porCpi,
  porConvergencia,
  porRecursos,
  COBERTURA_MINIMA,
  CONVERGENCIA_MINIMA,
  DIAS_ESTANCADA,
  RETRASO_CRITICO,
  type EntradaPrediccion,
  type SinDato,
  type TareaPredecible,
} from "@/lib/hitos-predictivos";
import type { DiaLaboral } from "@/lib/calendario";

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Lunes a viernes. Sabado y domingo, no. */
const SEMANA: DiaLaboral[] = [1, 2, 3, 4, 5]
  .map((n) => ({ diaSemana: n, laborable: true, horas: "8" }))
  .concat([
    { diaSemana: 6, laborable: false, horas: "0" },
    { diaSemana: 7, laborable: false, horas: "0" },
  ]);

function tarea(p: Partial<TareaPredecible> & { uid: number }): TareaPredecible {
  return {
    codigo: null,
    nombre: `T${p.uid}`,
    esResumen: false,
    esHito: false,
    esCritico: false,
    inicio: d("2026-08-03"),
    fin: d("2026-08-14"),
    porcentajePlaneado: "50",
    porcentajeReal: "50",
    ultimoAvance: null,
    ...p,
  };
}

function entrada(p: Partial<EntradaPrediccion> = {}): EntradaPrediccion {
  return {
    tareas: [],
    dependencias: [],
    calendario: SEMANA,
    hoy: d("2026-08-20"),
    finObra: d("2026-09-30"),
    spi: null,
    cpi: null,
    coberturaMapeo: 0,
    conLineaBase: false,
    anclasConHito: new Set(),
    ...p,
  };
}

describe("estancamiento", () => {
  it("propone cuando pasan los dias habiles del criterio", () => {
    const t = tarea({ uid: 1, porcentajeReal: "40", ultimoAvance: d("2026-08-11") });
    const p = porEstancamiento(entrada({ tareas: [t] }));

    expect(p).toHaveLength(1);
    expect(p[0]!.motivo).toContain("2026-08-11");
    expect(p[0]!.motivo).toContain("40%");
  });

  /**
   * La razon de contar dias HABILES y no naturales: con naturales, un puente
   * convierte una obra normal en abandono y la alarma se vuelve decorado.
   */
  it("un fin de semana no cuenta como abandono", () => {
    // Viernes 14 al lunes 17: 4 dias naturales, 2 habiles.
    const t = tarea({ uid: 1, porcentajeReal: "40", ultimoAvance: d("2026-08-14") });
    expect(porEstancamiento(entrada({ tareas: [t], hoy: d("2026-08-17") }))).toEqual([]);
  });

  it("no propone sobre una tarea que aun no ha empezado", () => {
    const t = tarea({ uid: 1, porcentajeReal: "0", ultimoAvance: null });
    expect(porEstancamiento(entrada({ tareas: [t] }))).toEqual([]);
  });

  it("ni sobre una terminada: de lo hecho no hay nada que anticipar", () => {
    const t = tarea({ uid: 1, porcentajeReal: "100", ultimoAvance: d("2026-08-01") });
    expect(porEstancamiento(entrada({ tareas: [t] }))).toEqual([]);
  });

  it("una critica estancada es urgente; una con holgura, solo aviso", () => {
    const base = { porcentajeReal: "40", ultimoAvance: d("2026-08-11") };
    expect(
      porEstancamiento(entrada({ tareas: [tarea({ uid: 1, ...base, esCritico: true })] }))[0]!
        .severidad,
    ).toBe("urgente");
    expect(
      porEstancamiento(entrada({ tareas: [tarea({ uid: 2, ...base })] }))[0]!.severidad,
    ).toBe("avisar");
  });
});

describe("holgura agotada", () => {
  const atrasada = (uid: number, real: string, esCritico: boolean) =>
    tarea({ uid, esCritico, porcentajePlaneado: "60", porcentajeReal: real });

  it("propone cuando la critica pasa del retraso del criterio", () => {
    // 60 planeado contra 40 real: 20 puntos, por encima de 15.
    const p = porHolgura(entrada({ tareas: [atrasada(1, "40", true)] }));
    expect(p).toHaveLength(1);
    expect(p[0]!.severidad).toBe("urgente");
  });

  it("y NO justo por debajo del umbral", () => {
    // 60 contra 45: 15 puntos exactos. El criterio dice «mas de 15».
    expect(porHolgura(entrada({ tareas: [atrasada(1, "45", true)] }))).toEqual([]);
  });

  /**
   * En una tarea con holgura, ir por detras no se come el plazo de la obra.
   * Avisar de todas seria pedir que se ignore el aviso.
   */
  it("ignora las que no estan en la ruta critica", () => {
    expect(porHolgura(entrada({ tareas: [atrasada(1, "10", false)] }))).toEqual([]);
  });
});

describe("SPI", () => {
  const conSpi = (spi: number | null, conLineaBase = true) =>
    porSpi(
      entrada({
        spi,
        conLineaBase,
        tareas: [tarea({ uid: 1, esCritico: true, porcentajeReal: "10" })],
        hoy: d("2026-08-20"),
        finObra: d("2026-09-30"),
      }),
    );

  it("proyecta el corrimiento del fin de obra", () => {
    const p = conSpi(0.8);
    expect(p).toHaveLength(1);
    expect(p[0]!.motivo).toContain("0.80");
    expect(p[0]!.motivo).toMatch(/\d+ dias despues/);
  });

  it("calla si se va al dia o por delante", () => {
    expect(conSpi(1)).toEqual([]);
    expect(conSpi(1.2)).toEqual([]);
  });

  it("calla si no hay SPI: el plan aun no toca nada", () => {
    expect(conSpi(null)).toEqual([]);
  });

  /**
   * Sin linea base el PV sale del porcentaje del propio archivo. El retraso es
   * real y se propone igual, pero la pantalla NO puede presentarlo como una
   * proyeccion firme.
   */
  it("sin linea base avisa de que la proyeccion es aproximada", () => {
    expect(conSpi(0.8, false)[0]!.motivo).toContain("APROXIMADO");
    expect(conSpi(0.8, true)[0]!.motivo).not.toContain("APROXIMADO");
  });
});

/**
 * La compuerta del CPI es la prueba mas importante del archivo: es lo que
 * impide que un indice que describe el 1% de la obra genere una alarma con
 * cara de hallazgo.
 */
describe("CPI y su compuerta", () => {
  const conCobertura = (coberturaMapeo: number, cpi: number | null) =>
    porCpi(entrada({ coberturaMapeo, cpi, tareas: [tarea({ uid: 1 })] }));

  it("por debajo de la cobertura minima CALLA, y dice cuanto falta", () => {
    const r = conCobertura(1.4, 0.5) as SinDato;
    expect(Array.isArray(r)).toBe(false);
    expect(r.regla).toBe("cpi");
    // El numero real, no un «no aplica».
    expect(r.falta).toContain("1.4%");
    expect(r.falta).toContain(`${COBERTURA_MINIMA}%`);
  });

  it("con cobertura suficiente y CPI malo, propone", () => {
    const r = conCobertura(75, 0.8);
    expect(Array.isArray(r)).toBe(true);
    expect((r as { motivo: string }[])[0]!.motivo).toContain("0.80");
  });

  it("con cobertura suficiente y CPI sano, no propone nada", () => {
    expect(conCobertura(75, 1.1)).toEqual([]);
  });

  it("con cobertura suficiente pero sin costo imputado, lo explica", () => {
    const r = conCobertura(75, null) as SinDato;
    expect(r.falta).toContain("costo real");
  });
});

describe("convergencia", () => {
  const enlaces = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ tareaUid: 9, predecesoraUid: i + 1 }));

  it("sin red de precedencias calla y explica por que", () => {
    const r = porConvergencia(entrada({ tareas: [tarea({ uid: 9 })] })) as SinDato;
    expect(Array.isArray(r)).toBe(false);
    expect(r.falta).toContain("MS Project");
  });

  it("propone donde confluyen suficientes predecesoras", () => {
    const r = porConvergencia(
      entrada({ tareas: [tarea({ uid: 9 })], dependencias: enlaces(CONVERGENCIA_MINIMA) }),
    );
    expect(Array.isArray(r)).toBe(true);
    expect((r as { motivo: string }[])[0]!.motivo).toContain(`${CONVERGENCIA_MINIMA} tareas`);
  });

  it("y no donde solo llegan una o dos", () => {
    const r = porConvergencia(
      entrada({ tareas: [tarea({ uid: 9 })], dependencias: enlaces(CONVERGENCIA_MINIMA - 1) }),
    );
    expect(r).toEqual([]);
  });
});

describe("saturacion de recursos", () => {
  it("siempre calla, y dice que dato falta en vez de fingir un calculo", () => {
    expect(porRecursos().falta).toContain("dotacion");
  });
});

describe("predecirHitos, todo junto", () => {
  /**
   * Se compara por ANCLA y no por uid, y por eso esta prueba existe: un hito
   * es una fila NUEVA con su propio uid, asi que comparar uids no encontraria
   * nunca la coincidencia y la pantalla propondria cada vez lo ya aceptado.
   */
  it("no vuelve a proponer donde ya hay un hito anclado", () => {
    const t = tarea({
      uid: 1,
      codigo: "4.4",
      porcentajeReal: "40",
      ultimoAvance: d("2026-08-11"),
    });

    expect(predecirHitos(entrada({ tareas: [t] })).propuestas).toHaveLength(1);
    expect(
      predecirHitos(entrada({ tareas: [t], anclasConHito: new Set(["4.4"]) })).propuestas,
    ).toEqual([]);
  });

  it("la propuesta lleva el ancla, que es lo que `crearHito` necesita", () => {
    const t = tarea({
      uid: 1,
      codigo: "4.4",
      porcentajeReal: "40",
      ultimoAvance: d("2026-08-11"),
    });
    expect(predecirHitos(entrada({ tareas: [t] })).propuestas[0]!.anclaCodigo).toBe("4.4");
  });

  it("los resumenes no son trabajo: no se predice sobre ellos", () => {
    const t = tarea({
      uid: 1,
      esResumen: true,
      porcentajeReal: "40",
      ultimoAvance: d("2026-08-11"),
    });
    expect(predecirHitos(entrada({ tareas: [t] })).propuestas).toEqual([]);
  });

  it("lo urgente va primero, y el orden no baila entre dos cargas", () => {
    const critica = tarea({
      uid: 7,
      esCritico: true,
      porcentajeReal: "40",
      ultimoAvance: d("2026-08-11"),
    });
    const suave = tarea({ uid: 2, porcentajeReal: "40", ultimoAvance: d("2026-08-11") });

    const p = predecirHitos(entrada({ tareas: [suave, critica] })).propuestas;
    expect(p.map((x) => x.uid)).toEqual([7, 2]);
  });

  /**
   * Con una obra sin nada, las tres reglas que hoy no pueden decir nada tienen
   * que APARECER explicandose. Es la mitad util de haber escrito el catalogo
   * entero: la pantalla es tambien la lista de lo que falta.
   */
  it("las reglas mudas siempre se explican", () => {
    const { propuestas, sinDato } = predecirHitos(entrada());

    expect(propuestas).toEqual([]);
    expect(sinDato.map((s) => s.regla).sort()).toEqual([
      "convergencia",
      "cpi",
      "recursos",
    ]);
    expect(sinDato.every((s) => s.falta.length > 20)).toBe(true);
  });
});

describe("los umbrales son criterio, no medicion", () => {
  it("estan expuestos con nombre para poder contrastarlos algun dia", () => {
    // Si alguien los cambia, que sea a proposito y aqui se vea.
    expect(DIAS_ESTANCADA).toBe(5);
    expect(RETRASO_CRITICO).toBe(15);
    expect(COBERTURA_MINIMA).toBe(60);
    expect(CONVERGENCIA_MINIMA).toBe(3);
  });
});
