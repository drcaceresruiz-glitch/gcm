import { describe, expect, it } from "vitest";
import {
  fechaCsv,
  filasDelInformeCsv,
  nombreArchivoInformeCsv,
  type DatosCsvInforme,
} from "./informe-csv";
import type { Capitulo } from "./control-avance";

/// Una fecha de cronograma: `@db.Date` llega siempre como medianoche UTC.
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const CAPITULO: Capitulo = {
  uid: 1,
  codigo: "1.0",
  nombre: "Estructuras",
  planeado: "40.00",
  real: "35.00",
  desfase: "-5.00",
  hojas: 12,
  medible: true,
  atrasadas: 3,
  criticas: 1,
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

/// Busca la fila que empieza por un rotulo. Los tests hablan de contenido, no
/// de en que numero de linea cayo.
function fila(filas: (string | number | null | undefined)[][], rotulo: string) {
  return filas.find((f) => f[0] === rotulo);
}

const texto = (filas: (string | number | null | undefined)[][]) =>
  filas.map((f) => f.join("|")).join("\n");

describe("fechaCsv", () => {
  it("lee la fecha en UTC, que es como la guarda el cronograma", () => {
    // Con `getDate()` esto daria 07/08 en Peru (UTC-5) y el informe entero
    // saldria fechado un dia antes. Es el mismo defecto de `calendario.ts`.
    expect(fechaCsv(dia("2026-08-08"))).toBe("08/08/2026");
  });

  it("rellena con cero el dia y el mes", () => {
    expect(fechaCsv(dia("2026-01-05"))).toBe("05/01/2026");
  });
});

describe("filasDelInformeCsv - cabecera", () => {
  it("identifica la obra, la empresa y el corte", () => {
    const f = filasDelInformeCsv(datos(), dia("2026-08-12"));

    expect(fila(f, "Obra")).toEqual(["Obra", "Ampliación Clínica"]);
    expect(fila(f, "Empresa")).toEqual([
      "Empresa",
      "Constructora Andina S.A.C.",
    ]);
    expect(fila(f, "Fecha de corte")).toEqual(["Fecha de corte", "08/08/2026"]);
    expect(fila(f, "Generado el")).toEqual(["Generado el", "12/08/2026"]);
  });

  it("da las tres cifras del resumen", () => {
    const f = filasDelInformeCsv(datos(), dia("2026-08-12"));

    expect(fila(f, "Avance real (%)")).toEqual(["Avance real (%)", "22.60"]);
    expect(fila(f, "Avance planeado (%)")).toEqual([
      "Avance planeado (%)",
      "13.06",
    ]);
    expect(fila(f, "Desviación (puntos)")).toEqual([
      "Desviación (puntos)",
      "9.54",
    ]);
  });

  it("omite los totales de MS Project cuando el archivo no los trae", () => {
    const f = filasDelInformeCsv(datos(), dia("2026-08-12"));
    expect(texto(f)).not.toContain("MS Project");
  });
});

describe("filasDelInformeCsv - capitulos", () => {
  it("lista los capitulos con trabajo en marcha", () => {
    const f = filasDelInformeCsv(datos({ capitulos: [CAPITULO] }), dia("2026-08-12"));

    expect(f).toContainEqual([
      "1.0",
      "Estructuras",
      "40.00",
      "35.00",
      "-5.00",
      12,
      3,
      1,
    ]);
  });

  it("deja fuera los mismos que la pantalla: los de puros hitos", () => {
    // Un capitulo sin trabajo medible da real 0 contra planeado 100 y describe
    // un atraso que no existe. Si saliera aqui y no en el papel, el archivo y
    // el informe impreso dejarian de cuadrar.
    const hitos: Capitulo = {
      ...CAPITULO,
      nombre: "Hitos clave",
      medible: false,
    };
    const f = filasDelInformeCsv(datos({ capitulos: [hitos] }), dia("2026-08-12"));

    expect(texto(f)).not.toContain("Hitos clave");
  });

  it("deja fuera los que estan enteros a cero", () => {
    const futuro: Capitulo = {
      ...CAPITULO,
      nombre: "Acabados",
      planeado: "0.00",
      real: "0.00",
    };
    const f = filasDelInformeCsv(datos({ capitulos: [futuro] }), dia("2026-08-12"));

    expect(texto(f)).not.toContain("Acabados");
  });

  it("cuando no queda ninguno lo dice, en vez de dejar la cabecera sola", () => {
    const f = filasDelInformeCsv(datos(), dia("2026-08-12"));
    expect(texto(f)).toContain("Ningún capítulo con trabajo medible en marcha");
  });
});

describe("filasDelInformeCsv - el periodo", () => {
  it("en el primer informe dice que no hay periodo, no un cero", () => {
    const f = filasDelInformeCsv(datos(), dia("2026-08-12"));
    expect(texto(f)).toContain("Es el primer informe de la obra");
  });

  it("con corte anterior da lo ganado y las tareas que se movieron", () => {
    const f = filasDelInformeCsv(
      datos({
        periodo: {
          desde: dia("2026-08-01"),
          realAnterior: "18.20",
          ganado: "4.40",
          tareas: [
            {
              codigo: "2.3",
              nombre: "Losa aligerada",
              antes: "40.00",
              ahora: "70.00",
              delta: "30.00",
            },
          ],
        },
      }),
      dia("2026-08-12"),
    );

    expect(fila(f, "Corte anterior")).toEqual(["Corte anterior", "01/08/2026"]);
    expect(fila(f, "Ganado en el periodo (puntos)")).toEqual([
      "Ganado en el periodo (puntos)",
      "4.40",
    ]);
    expect(f).toContainEqual([
      "2.3",
      "Losa aligerada",
      "40.00",
      "70.00",
      "30.00",
    ]);
  });
});

describe("filasDelInformeCsv - Last Planner", () => {
  const semanaCerrada = {
    semana: { numero: 3, cerrada: true, total: 12, cumplidos: 9, ppc: 75 },
    compromisos: [],
    tendencia: [],
    pareto: [],
  };

  it("una semana abierta NO da un PPC numerico", () => {
    // Un PPC a medio evaluar puesto en una columna acaba promediandose con los
    // de verdad. Que diga por que no lo hay es mas util que un numero falso.
    const f = filasDelInformeCsv(
      datos({
        lastPlanner: {
          ...semanaCerrada,
          semana: { numero: 4, cerrada: false, total: 10, cumplidos: 6, ppc: null },
        },
      }),
      dia("2026-08-12"),
    );

    expect(fila(f, "PPC (%)")).toEqual([
      "PPC (%)",
      "Sin cerrar: todavía no hay PPC",
    ]);
  });

  it("un compromiso sin evaluar no se cuenta como incumplido", () => {
    const f = filasDelInformeCsv(
      datos({
        lastPlanner: {
          ...semanaCerrada,
          compromisos: [
            { descripcion: "Vaciar losa", cumplido: null, causa: null, notaCierre: null },
            {
              descripcion: "Encofrar columnas",
              cumplido: false,
              causa: "MATERIALES",
              notaCierre: "Llegó tarde el fierro",
            },
          ],
        },
      }),
      dia("2026-08-12"),
    );

    expect(f).toContainEqual(["Vaciar losa", "Sin evaluar", "", ""]);
    expect(f).toContainEqual([
      "Encofrar columnas",
      "No",
      "Materiales",
      "Llegó tarde el fierro",
    ]);
  });

  it("sin permiso de plan semanal lo dice, y no que la obra no lo use", () => {
    const f = filasDelInformeCsv(datos({ lastPlanner: null }), dia("2026-08-12"));
    expect(texto(f)).toContain("Sin acceso al plan semanal");
  });

  it("si ninguna semana cierra ese dia lo explica", () => {
    const f = filasDelInformeCsv(
      datos({ lastPlanner: { ...semanaCerrada, semana: null } }),
      dia("2026-08-12"),
    );
    expect(texto(f)).toContain("Ninguna semana del plan cierra");
  });
});

describe("filasDelInformeCsv - curva S", () => {
  it("pone al lado de cada real el planeado de ESE dia", () => {
    const f = filasDelInformeCsv(
      datos({
        curva: {
          plan: [
            { fecha: dia("2026-08-01"), valor: 10 },
            { fecha: dia("2026-08-08"), valor: 13.06 },
          ],
          realSemanal: [
            { fecha: dia("2026-08-01"), valor: 18.2 },
            { fecha: dia("2026-08-08"), valor: 22.6 },
          ],
        },
      }),
      dia("2026-08-12"),
    );

    expect(f).toContainEqual(["01/08/2026", "10.00", "18.20"]);
    expect(f).toContainEqual(["08/08/2026", "13.06", "22.60"]);
  });

  it("deja el planeado vacio si el plan no llega a ese dia, sin inventarlo", () => {
    const f = filasDelInformeCsv(
      datos({
        curva: {
          plan: [],
          realSemanal: [{ fecha: dia("2026-08-08"), valor: 22.6 }],
        },
      }),
      dia("2026-08-12"),
    );

    expect(f).toContainEqual(["08/08/2026", "", "22.60"]);
  });
});

describe("nombreArchivoInformeCsv", () => {
  /*
   * Desde el 23 de agosto de 2026 la forma la pone `lib/nombre-archivo`, que
   * es la MISMA para todo lo que GCM deja descargar: sistema, obra, documento
   * y fecha. Antes cada descarga inventaba la suya y tres de ellas salian con
   * un nombre fijo, sin obra: bajarlas para tres obras daba «(1)», «(2)» y
   * «(3)». Lo que se prueba aqui es lo propio del informe -que su fecha es la
   * del CORTE, no la del dia en que se descarga-.
   */
  it("quita tildes y espacios: el nombre viaja en una cabecera HTTP", () => {
    expect(nombreArchivoInformeCsv("Ampliación Clínica", dia("2026-08-08"))).toBe(
      "GCM_ampliacion-clinica_informe_2026-08-08.csv",
    );
  });

  it("lleva la FECHA DEL CORTE, no la de hoy", () => {
    // Un informe al 08/08 descargado en septiembre sigue siendo el del 08/08.
    // Con la fecha de descarga, dos cortes distintos bajados el mismo dia se
    // pisarian el nombre.
    const n = nombreArchivoInformeCsv("Obra", dia("2026-08-08"));
    expect(n).toContain("2026-08-08");
  });

  it("fecha en ISO, para que la carpeta ordene por nombre y salga en orden", () => {
    const a = nombreArchivoInformeCsv("Obra", dia("2026-01-05"));
    const b = nombreArchivoInformeCsv("Obra", dia("2026-08-08"));
    expect([b, a].sort()).toEqual([a, b]);
  });

  it("aguanta un nombre que no deja ni una letra utilizable", () => {
    expect(nombreArchivoInformeCsv("///", dia("2026-08-08"))).toBe(
      "GCM_sin-nombre_informe_2026-08-08.csv",
    );
  });

  it("recorta los nombres largos sin dejar un guion colgando", () => {
    const nombre = nombreArchivoInformeCsv("A".repeat(80), dia("2026-08-08"));
    expect(nombre.endsWith("_2026-08-08.csv")).toBe(true);
    expect(nombre).not.toContain("--");
  });
});
