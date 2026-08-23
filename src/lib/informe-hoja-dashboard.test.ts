import { describe, expect, it } from "vitest";
import { hojaDashboard } from "./informe-hoja-dashboard";
import { A4_APAISADO, type ElementoPdf } from "./informe-pdf";
import type { Capitulo, AlertaAtraso } from "./control-avance";
import type { DatosCsvInforme } from "./informe-documento";

const medir = (texto: string, tamano: number) => texto.length * (tamano / 2);

const capitulo = (n: number, planeado: string, real: string): Capitulo => ({
  uid: n,
  codigo: `${n}.0`,
  nombre: `Capítulo número ${n}`,
  planeado,
  real,
  desfase: "0.00",
  hojas: 3,
  medible: true,
  atrasadas: 0,
  criticas: 0,
});

const alerta = (n: number, severidad: AlertaAtraso["severidad"]): AlertaAtraso => ({
  uid: n,
  codigo: `4.${n}`,
  nombre: `Partida atrasada ${n}`,
  planeado: "83.00",
  real: "30.00",
  desfase: "-53.00",
  diasAtraso: "2",
  pendiente: "53.00",
  severidad,
  esCritico: severidad === "alta",
  vencida: false,
  motivo: null,
});

const datos = (parcial: Partial<DatosCsvInforme> = {}): DatosCsvInforme => ({
  empresa: "LARQUITECTURA STUDIO SAC",
  obra: "LABORATORIO CRIOCORD - LURÍN",
  ubicacion: "Carretera Panamericana Sur Km 29.5, Lima",
  fechaCorte: new Date(Date.UTC(2026, 7, 8)),
  version: 1,
  importadoPor: "Eduardo Pérez",
  planeadoProject: null,
  realProject: null,
  real: "11.00",
  planeado: "11.00",
  desviacion: "0.00",
  periodo: { desde: null, realAnterior: "0", ganado: "0", tareas: [] },
  curva: { plan: [], realSemanal: [] },
  capitulos: [],
  alertas: [],
  activas: [],
  lastPlanner: null,
  generadoPor: "GCM",
  ...parcial,
});

const hoja = (parcial: Partial<DatosCsvInforme> = {}) =>
  hojaDashboard(datos(parcial), A4_APAISADO, medir);

const textos = (elementos: readonly ElementoPdf[]) =>
  elementos.filter((e) => e.tipo === "texto").map((e) => e.texto);

/**
 * El rectangulo que ocupa un elemento en la hoja.
 *
 * El anillo se sale de su circunferencia media pluma por cada lado, y ese
 * medio grosor es justo lo que se imprime fuera del papel si nadie lo cuenta.
 */
const caja = (e: ElementoPdf) => {
  if (e.tipo === "linea" || e.tipo === "trazo") {
    return {
      izquierda: Math.min(e.x1, e.x2),
      derecha: Math.max(e.x1, e.x2),
      abajo: Math.min(e.y1, e.y2),
      arriba: Math.max(e.y1, e.y2),
    };
  }
  if (e.tipo === "arco") {
    const r = e.radio + e.grosor / 2;
    return { izquierda: e.cx - r, derecha: e.cx + r, abajo: e.cy - r, arriba: e.cy + r };
  }
  if (e.tipo === "fondo" || e.tipo === "imagen") {
    return {
      izquierda: e.x,
      derecha: e.x + e.ancho,
      abajo: e.y,
      arriba: e.y + e.alto,
    };
  }
  return { izquierda: e.x, derecha: e.x, abajo: e.y, arriba: e.y + e.tam };
};

const arcos = (elementos: readonly ElementoPdf[]) =>
  elementos.filter((e) => e.tipo === "arco");

describe("hojaDashboard - el anillo de avance", () => {
  it("dibuja el aro entero y encima el tramo del avance", () => {
    // Sin el aro gris de fondo, un 11 % es una raya suelta que no se lee como
    // «once de cien».
    const a = arcos(hoja({ real: "11.00" }).elementos);
    expect(a).toHaveLength(2);
    expect(a[0]?.hasta).toBe(360);
    expect(a[1]?.hasta).toBeCloseTo(39.6);
  });

  it("una obra sin avance no dibuja tramo, solo el aro", () => {
    expect(arcos(hoja({ real: "0.00" }).elementos)).toHaveLength(1);
  });

  it("un avance del 100 % cierra la vuelta entera", () => {
    const a = arcos(hoja({ real: "100.00" }).elementos);
    expect(a[1]?.hasta).toBe(360);
  });

  it("un porcentaje ilegible se dibuja como cero en vez de romper el anillo", () => {
    // El informe TIENE que salir: una cifra que no se puede leer es un aro
    // vacio, nunca un NaN que deje el PDF a medio escribir.
    const a = arcos(hoja({ real: "" }).elementos);
    expect(a).toHaveLength(1);
    expect(a[0]?.hasta).toBe(360);
  });
});

describe("hojaDashboard - los capitulos", () => {
  it("pinta una barra por capitulo con avance", () => {
    const h = hoja({ capitulos: [capitulo(1, "100", "97"), capitulo(2, "64", "66")] });
    expect(textos(h.elementos)).toContain("R 97%");
    expect(textos(h.elementos)).toContain("R 66%");
  });

  it("deja fuera los capitulos que no son medibles", () => {
    // Son los de puros hitos: su real ponderado sale 0 por construccion y
    // junto a un planeado del 100 % describen un atraso que no existe.
    const hitos = { ...capitulo(9, "100", "0"), medible: false };
    const h = hoja({ capitulos: [hitos] });
    expect(textos(h.elementos)).toContain("Todavía no hay capítulos con avance que medir.");
  });

  it("cuando hay mas capitulos de los que caben, lo dice en vez de recortar en silencio", () => {
    const muchos = Array.from({ length: 14 }, (_, i) => capitulo(i, "50", "50"));
    const t = textos(hoja({ capitulos: muchos }).elementos);
    expect(t.some((x) => x.includes("5 capítulo(s) más"))).toBe(true);
  });
});

describe("hojaDashboard - las alertas", () => {
  it("una obra al dia lo dice, en vez de dejar el hueco vacio", () => {
    expect(textos(hoja().elementos)).toContain(
      "Ninguna partida va por detrás del plan al corte.",
    );
  });

  it("cada alerta lleva su color por severidad", () => {
    const h = hoja({ alertas: [alerta(1, "alta"), alerta(2, "baja")] });
    const cuadros = h.elementos.filter((e) => e.tipo === "fondo" && e.ancho === 5);
    expect(cuadros.map((c) => (c.tipo === "fondo" ? c.tinta : null))).toEqual([
      "peligro",
      "tinta-suave",
    ]);
  });

  it("las alertas que no caben se anuncian", () => {
    const seis = Array.from({ length: 6 }, (_, i) => alerta(i, "media"));
    const t = textos(hoja({ alertas: seis }).elementos);
    expect(t.some((x) => x.includes("2 alerta(s) más"))).toBe(true);
  });
});

describe("hojaDashboard - la hoja como papel", () => {
  it("nada se sale de la hoja por ningun lado", () => {
    // Es el mismo fallo que persigue la prueba de paginacion: aqui las
    // coordenadas se escriben a mano, asi que hay mas donde equivocarse.
    const h = hoja({
      capitulos: Array.from({ length: 14 }, (_, i) => capitulo(i, "50", "50")),
      alertas: Array.from({ length: 6 }, (_, i) => alerta(i, "alta")),
    });
    for (const e of h.elementos) {
      const c = caja(e);
      expect(c.izquierda).toBeGreaterThanOrEqual(0);
      expect(c.derecha).toBeLessThanOrEqual(A4_APAISADO.ancho);
      expect(c.abajo).toBeGreaterThanOrEqual(0);
      expect(c.arriba).toBeLessThanOrEqual(A4_APAISADO.alto);
    }
  });

  it("la cabecera lleva la obra, la empresa y el corte", () => {
    const t = textos(hoja().elementos);
    expect(t).toContain("LABORATORIO CRIOCORD - LURÍN");
    expect(t.some((x) => x.includes("Corte del 08/08/2026"))).toBe(true);
  });

  it("la desviacion negativa se tine de peligro y la positiva de exito", () => {
    const malo = hoja({ desviacion: "-3.00" }).elementos.find(
      (e) => e.tipo === "texto" && e.texto.includes("-3.00 pts"),
    );
    const bueno = hoja({ desviacion: "2.00" }).elementos.find(
      (e) => e.tipo === "texto" && e.texto.includes("2.00 pts"),
    );
    expect(malo?.tipo === "texto" && malo.tinta).toBe("peligro");
    expect(bueno?.tipo === "texto" && bueno.tinta).toBe("exito");
  });

  it("no nombra ni un solo color: todo va por tinta", () => {
    // La regla de capas del informe. Si algun dia alguien mete un hex aqui,
    // el dia que la empresa cambie de identidad no habra donde buscarlo.
    const fuente = hoja().elementos;
    for (const e of fuente) {
      if (e.tipo === "texto") expect(e.gris).toBe(false);
    }
  });
});

describe("hojaDashboard - que nada se pise", () => {
  it("el par planeado/desviacion no se mete dentro del anillo", () => {
    // Se coloco a ojo la primera vez y el separador vertical entraba pluma y
    // media en el aro. Aqui se afirma la holgura, no la coordenada.
    const h = hoja();
    const aro = h.elementos.find((e) => e.tipo === "arco");
    if (aro?.tipo !== "arco") throw new Error("no hay anillo");
    const bordeDelAro = aro.cy - aro.radio - aro.grosor / 2;

    const debajoDelAro = h.elementos.filter(
      (e) => e.tipo === "texto" && (e.texto === "PLANEADO" || e.texto === "DESVIACIÓN"),
    );
    expect(debajoDelAro).toHaveLength(2);
    for (const e of debajoDelAro) {
      // `y` es la BASE del texto; su parte alta es y + tam.
      if (e.tipo === "texto") expect(e.y + e.tam).toBeLessThan(bordeDelAro);
    }
  });

  it("la columna de capitulos empieza despues del anillo", () => {
    const h = hoja({ capitulos: [capitulo(1, "100", "97")] });
    const aro = h.elementos.find((e) => e.tipo === "arco");
    if (aro?.tipo !== "arco") throw new Error("no hay anillo");
    const derechaDelAro = aro.cx + aro.radio + aro.grosor / 2;

    const titulo = h.elementos.find(
      (e) => e.tipo === "texto" && e.texto === "CONTROL DE CAPÍTULOS",
    );
    expect(titulo?.tipo === "texto" && titulo.x).toBeGreaterThan(derechaDelAro);
  });
});
