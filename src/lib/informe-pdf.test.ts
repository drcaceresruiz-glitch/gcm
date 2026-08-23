import { describe, expect, it } from "vitest";
import { A4_APAISADO, paginasDelInforme, type PaginaPdf } from "./informe-pdf";
import type { SeccionInforme } from "./informe-documento";

const medir = (texto: string, tamano: number) => texto.length * (tamano / 2);

const paginas = (secciones: SeccionInforme[]): PaginaPdf[] =>
  paginasDelInforme(secciones, "Informe", "Obra · corte", A4_APAISADO, medir);

const tabla = (n: number): SeccionInforme => ({
  clase: "tabla",
  titulo: "PARTIDAS",
  cabeceras: ["Código", "Partida", "Real (%)"],
  filas: Array.from({ length: n }, (_, i) => [`1.${i}`, `Partida número ${i}`, "50.00"]),
  siNoHay: "No hay.",
});

/// El punto mas bajo que ocupa un elemento. El anillo baja media pluma por
/// debajo de su circunferencia, y ese medio grosor es justo lo que se sale de
/// la hoja si nadie lo cuenta.
const bordeInferior = (e: PaginaPdf["elementos"][number]): number => {
  if (e.tipo === "linea" || e.tipo === "trazo") return Math.min(e.y1, e.y2);
  if (e.tipo === "arco") return e.cy - e.radio - e.grosor / 2;
  return e.y;
};

const textos = (p: PaginaPdf) =>
  p.elementos.filter((e) => e.tipo === "texto").map((e) => e.texto);

describe("paginasDelInforme", () => {
  it("un informe corto cabe en una pagina", () => {
    expect(paginas([tabla(5)])).toHaveLength(1);
  });

  it("una tabla larga se reparte en varias paginas", () => {
    const p = paginas([tabla(300)]);
    expect(p.length).toBeGreaterThan(1);
  });

  it("nada se sale por abajo de la hoja", () => {
    // Es el fallo tipico de paginar a mano: la ultima fila medio impresa
    // fuera del papel.
    for (const pagina of paginas([tabla(300)])) {
      for (const e of pagina.elementos) {
        expect(bordeInferior(e)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("nada se sale por arriba ni por los lados", () => {
    for (const pagina of paginas([tabla(300)])) {
      for (const e of pagina.elementos) {
        if (e.tipo === "texto") {
          expect(e.y).toBeLessThanOrEqual(A4_APAISADO.alto);
          expect(e.x).toBeGreaterThanOrEqual(A4_APAISADO.margen);
          expect(e.x).toBeLessThanOrEqual(A4_APAISADO.ancho - A4_APAISADO.margen);
        }
      }
    }
  });

  it("la cabecera se repite en cada pagina de la tabla", () => {
    // Sin esto hay que volver a la pagina anterior para saber que columna es
    // cual, que es justo lo que pasa con los informes exportados a la brava.
    const p = paginas([tabla(300)]);
    for (const pagina of p) {
      expect(textos(pagina)).toContain("Código");
    }
  });
});

describe("paginasDelInforme - las secciones", () => {
  it("escribe el titulo de cada seccion", () => {
    const p = paginas([tabla(3)]);
    expect(textos(p[0]!)).toContain("PARTIDAS");
  });

  it("una tabla vacia explica POR QUE, en vez de dejar la cabecera sola", () => {
    const p = paginas([{ ...tabla(0) }]);
    expect(textos(p[0]!)).toContain("No hay.");
    expect(textos(p[0]!)).not.toContain("Código");
  });

  it("una nota se escribe tal cual", () => {
    const p = paginas([
      { clase: "nota", titulo: "LAST PLANNER", texto: "Sin acceso al plan." },
    ]);
    expect(textos(p[0]!)).toContain("Sin acceso al plan.");
  });

  it("los pares concepto/valor salen los dos", () => {
    const p = paginas([
      {
        clase: "datos",
        titulo: "RESUMEN",
        cabecera: ["Concepto", "Valor"],
        filas: [["Avance real (%)", "22.60"]],
      },
    ]);
    expect(textos(p[0]!)).toContain("Avance real (%)");
    expect(textos(p[0]!)).toContain("22.60");
  });

  it("sanea los caracteres que la fuente no sabe pintar", () => {
    // Si esto llegara crudo a pdf-lib, lanzaria y no habria informe.
    const p = paginas([
      { clase: "nota", titulo: "NOTA", texto: "Losa 🧱 lista" },
    ]);
    expect(textos(p[0]!)).toContain("Losa ? lista");
  });

  it("un titulo no se queda solo al pie: arrastra la seccion a la pagina siguiente", () => {
    const p = paginas([tabla(60), { clase: "nota", titulo: "COLA", texto: "algo" }]);
    const ultima = p[p.length - 1]!;
    const conTitulo = p.findIndex((pag) => textos(pag).includes("COLA"));
    expect(textos(p[conTitulo]!)).toContain("algo");
    expect(ultima).toBeDefined();
  });
});

describe("paginasDelInforme - que no se pisen las columnas", () => {
  /// Dos textos se pisan si comparten linea y sus cajas se cruzan en
  /// horizontal. Es el defecto que no se ve leyendo el PDF —el texto esta
  /// todo— y que arruina la tabla al mirarla.
  const seSolapan = (
    a: { x: number; y: number; texto: string; tam: number },
    b: { x: number; y: number; texto: string; tam: number },
  ) => {
    if (Math.abs(a.y - b.y) > 0.01) return false;
    const finA = a.x + medir(a.texto, a.tam);
    const finB = b.x + medir(b.texto, b.tam);
    return a.x < finB && b.x < finA;
  };

  it("ningún texto invade la columna de al lado", () => {
    const secciones: SeccionInforme[] = [
      {
        clase: "tabla",
        titulo: "PARTIDAS ATRASADAS",
        // Once columnas, que es la tabla mas ancha del informe real.
        cabeceras: [
          "Código", "Partida", "Severidad", "Planeado (%)", "Real (%)",
          "Desviación", "Días de atraso", "Pendiente (puntos)", "Vencida",
          "Ruta crítica", "Motivo",
        ],
        filas: Array.from({ length: 30 }, (_, i) => [
          `1.${i}`,
          "Muro de contención eje A, incluye encofrado, curado y desencofrado",
          "Alta", "80.00", "30.00", "-50.00", "6.00", "70.00", "Sí", "Sí",
          "En ruta crítica y vencida",
        ]),
        siNoHay: "No hay.",
      },
    ];

    for (const pagina of paginas(secciones)) {
      const textos = pagina.elementos.filter((e) => e.tipo === "texto");
      for (let i = 0; i < textos.length; i++) {
        for (let j = i + 1; j < textos.length; j++) {
          expect(seSolapan(textos[i]!, textos[j]!)).toBe(false);
        }
      }
    }
  });
});

describe("paginasDelInforme - el grafico de la curva", () => {
  const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  const conCurva = (
    plan: { fecha: Date; valor: number }[],
    real: { fecha: Date; valor: number }[],
  ): SeccionInforme => ({
    clase: "tabla",
    titulo: "CURVA S",
    cabeceras: ["Fecha", "Planeado", "Real"],
    filas: real.map((p) => ["01/08/2026", "10.00", String(p.valor)]),
    siNoHay: "Sin datos.",
    grafico: [
      { nombre: "Planeado", papel: "plan", puntos: plan },
      { nombre: "Real", papel: "real", puntos: real },
    ],
  });

  const trazos = (p: PaginaPdf[]) =>
    p.flatMap((pag) => pag.elementos).filter((e) => e.tipo === "trazo");

  it("dibuja un tramo por cada par de puntos consecutivos", () => {
    const p = paginas([
      conCurva(
        [
          { fecha: dia("2026-08-01"), valor: 10 },
          { fecha: dia("2026-08-08"), valor: 20 },
          { fecha: dia("2026-08-15"), valor: 30 },
        ],
        [
          { fecha: dia("2026-08-01"), valor: 12 },
          { fecha: dia("2026-08-08"), valor: 25 },
        ],
      ),
    ]);
    // 2 tramos del plan + 1 del real.
    expect(trazos(p)).toHaveLength(3);
    expect(trazos(p).filter((t) => t.papel === "real")).toHaveLength(1);
  });

  it("el eje va de 0 a 100 SIEMPRE, no del minimo al maximo", () => {
    // Reescalar una curva de avance a su propio rango convierte una diferencia
    // de dos puntos en un abismo visual. Dos series casi iguales tienen que
    // salir casi juntas.
    const p = paginas([
      conCurva(
        [
          { fecha: dia("2026-08-01"), valor: 10 },
          { fecha: dia("2026-08-08"), valor: 11 },
        ],
        [
          { fecha: dia("2026-08-01"), valor: 12 },
          { fecha: dia("2026-08-08"), valor: 13 },
        ],
      ),
    ]);
    const plan = trazos(p).find((t) => t.papel === "plan")!;
    const real = trazos(p).find((t) => t.papel === "real")!;
    // Dos puntos porcentuales sobre 150pt de alto son 3pt: nada.
    expect(Math.abs(real.y1 - plan.y1)).toBeLessThan(6);
  });

  it("una serie vacia no rompe el grafico ni lo deja en blanco", () => {
    const p = paginas([
      conCurva([{ fecha: dia("2026-08-01"), valor: 10 }, { fecha: dia("2026-08-08"), valor: 20 }], []),
    ]);
    expect(trazos(p).length).toBeGreaterThan(0);
  });

  it("sin ningun punto no dibuja nada y sigue adelante", () => {
    const p = paginas([conCurva([], [])]);
    expect(trazos(p)).toHaveLength(0);
    expect(p.length).toBeGreaterThan(0);
  });

  it("el grafico va ANTES de su tabla", () => {
    const p = paginas([
      conCurva(
        [{ fecha: dia("2026-08-01"), valor: 10 }, { fecha: dia("2026-08-08"), valor: 20 }],
        [{ fecha: dia("2026-08-01"), valor: 12 }, { fecha: dia("2026-08-08"), valor: 25 }],
      ),
    ]);
    const elementos = p[0]!.elementos;
    const primerTrazo = elementos.findIndex((e) => e.tipo === "trazo");
    const cabeceraTabla = elementos.findIndex(
      (e) => e.tipo === "texto" && e.texto === "Fecha",
    );
    expect(primerTrazo).toBeGreaterThanOrEqual(0);
    expect(primerTrazo).toBeLessThan(cabeceraTabla);
  });
});
