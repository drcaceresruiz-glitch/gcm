import { describe, it, expect } from "vitest";
import {
  ventanaLookahead,
  faseDeTarea,
  estadoDeTarea,
  confiabilidad,
  planificarFlujos,
  normalizarSemanas,
  SEMANAS_SUGERIDAS,
  FLUJOS_RESTRICCION,
  TIPOS_RESTRICCION,
  SEMANAS_POR_DEFECTO,
  SEMANAS_MINIMO,
  SEMANAS_MAXIMO,
  type RestriccionActual,
} from "./lookahead";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("ventanaLookahead", () => {
  it("por defecto abarca 3 semanas (21 dias) desde hoy", () => {
    const { desde, hasta } = ventanaLookahead(d("2026-08-10"));
    expect(desde).toEqual(d("2026-08-10"));
    expect(hasta).toEqual(d("2026-08-31"));
  });

  it("respeta el numero de semanas indicado", () => {
    const { hasta } = ventanaLookahead(d("2026-08-10"), 6);
    expect(hasta).toEqual(d("2026-09-21"));
  });
});

describe("normalizarSemanas", () => {
  it("sin valor usa el defecto, que sigue siendo 3", () => {
    // Cambiar el defecto le movería la ventana a todo el mundo en silencio.
    expect(SEMANAS_POR_DEFECTO).toBe(3);
    expect(normalizarSemanas(undefined)).toBe(3);
    expect(normalizarSemanas(null)).toBe(3);
    expect(normalizarSemanas("")).toBe(3);
  });

  it("acepta el numero venga como texto o como numero", () => {
    expect(normalizarSemanas("6")).toBe(6);
    expect(normalizarSemanas(6)).toBe(6);
  });

  it("lo que no es un numero cae al defecto en vez de fallar", () => {
    // Llega de la URL: una ventana rara no puede tumbar la pantalla.
    expect(normalizarSemanas("seis")).toBe(3);
    expect(normalizarSemanas("<script>")).toBe(3);
  });

  it("recorta al rango en vez de rechazar", () => {
    expect(normalizarSemanas(0)).toBe(SEMANAS_MINIMO);
    expect(normalizarSemanas(-4)).toBe(SEMANAS_MINIMO);
    expect(normalizarSemanas(99)).toBe(SEMANAS_MAXIMO);
  });

  it("trunca los decimales: media semana no significa nada aqui", () => {
    expect(normalizarSemanas("4.7")).toBe(4);
  });
});

/**
 * Las obras cortas tambien planifican.
 *
 * El Last Planner habla de tres semanas como minimo util, y ese sigue siendo
 * el defecto. Pero una obra de dos semanas no tiene tres que mirar: si el
 * selector solo ofreciera ventanas mas largas que la obra entera, la matriz
 * se llenaria de trabajo que no existe.
 */
describe("la ventana admite obras cortas", () => {
  it("ofrece 1 y 2 semanas en el selector", () => {
    expect(SEMANAS_SUGERIDAS).toContain(1);
    expect(SEMANAS_SUGERIDAS).toContain(2);
  });

  it("y sigue proponiendo 3 por defecto", () => {
    expect(SEMANAS_POR_DEFECTO).toBe(3);
    expect(normalizarSemanas(1)).toBe(1);
  });
});

describe("FLUJOS_RESTRICCION", () => {
  it("son los 7 flujos del Last Planner, sin repetir", () => {
    expect(FLUJOS_RESTRICCION).toHaveLength(7);
    expect(new Set(TIPOS_RESTRICCION).size).toBe(7);
  });
});

const ANALIZADA = d("2026-08-11");

describe("faseDeTarea", () => {
  it("sin fecha de analisis, nadie la ha mirado", () => {
    expect(faseDeTarea({ analizadaAt: null, restricciones: [] })).toBe(
      "SIN_ANALIZAR",
    );
  });

  it("la fecha manda sobre las filas: sembrada pero sin mirar sigue SIN_ANALIZAR", () => {
    // Las tareas viejas nacian con las 7 sembradas sin que nadie las mirara.
    expect(
      faseDeTarea({
        analizadaAt: null,
        restricciones: [{ resuelta: false }, { resuelta: false }],
      }),
    ).toBe("SIN_ANALIZAR");
  });

  it("analizada SIN ninguna restriccion esta LISTA", () => {
    // El caso que antes no se podia expresar: "la revise y no le aplica nada".
    expect(faseDeTarea({ analizadaAt: ANALIZADA, restricciones: [] })).toBe(
      "LISTA",
    );
  });

  it("analizada con alguna sin resolver tiene pendientes", () => {
    expect(
      faseDeTarea({
        analizadaAt: ANALIZADA,
        restricciones: [{ resuelta: true }, { resuelta: false }],
      }),
    ).toBe("CON_PENDIENTES");
  });

  it("analizada con todas resueltas esta LISTA", () => {
    expect(
      faseDeTarea({
        analizadaAt: ANALIZADA,
        restricciones: [{ resuelta: true }, { resuelta: true }],
      }),
    ).toBe("LISTA");
  });
});

describe("estadoDeTarea", () => {
  it("LISTO si y solo si la fase es LISTA", () => {
    // El semaforo guardado se deriva de la fase: si estos dos divergen, el
    // aviso de comprometer al PTS empieza a mentir.
    const casos = [
      { analizadaAt: null, restricciones: [] },
      { analizadaAt: null, restricciones: [{ resuelta: true }] },
      { analizadaAt: ANALIZADA, restricciones: [] },
      { analizadaAt: ANALIZADA, restricciones: [{ resuelta: false }] },
      { analizadaAt: ANALIZADA, restricciones: [{ resuelta: true }] },
    ];
    for (const c of casos) {
      expect(estadoDeTarea(c) === "LISTO").toBe(faseDeTarea(c) === "LISTA");
    }
  });

  it("sin analizar es PENDIENTE aunque no tenga restricciones", () => {
    expect(estadoDeTarea({ analizadaAt: null, restricciones: [] })).toBe(
      "PENDIENTE",
    );
  });

  it("analizada sin restricciones es LISTO", () => {
    expect(estadoDeTarea({ analizadaAt: ANALIZADA, restricciones: [] })).toBe(
      "LISTO",
    );
  });
});

describe("confiabilidad", () => {
  it("cuenta las LISTAS y saca el porcentaje entero", () => {
    const r = confiabilidad([
      { fase: "LISTA" },
      { fase: "LISTA" },
      { fase: "CON_PENDIENTES" },
      { fase: "SIN_ANALIZAR" },
    ]);
    expect(r).toEqual({ listas: 2, total: 4, porcentaje: 50, sinAnalizar: 1 });
  });

  it("ventana sin analizar: 0% y lo dice, para no leerse como mala ejecucion", () => {
    const r = confiabilidad([{ fase: "SIN_ANALIZAR" }, { fase: "SIN_ANALIZAR" }]);
    expect(r).toEqual({ listas: 0, total: 2, porcentaje: 0, sinAnalizar: 2 });
  });

  it("todas analizadas sin restricciones: 100% y nada sin analizar", () => {
    const r = confiabilidad([{ fase: "LISTA" }, { fase: "LISTA" }]);
    expect(r).toEqual({ listas: 2, total: 2, porcentaje: 100, sinAnalizar: 0 });
  });

  it("ventana vacia: 0% sin dividir por cero", () => {
    expect(confiabilidad([])).toEqual({
      listas: 0,
      total: 0,
      porcentaje: 0,
      sinAnalizar: 0,
    });
  });
});

describe("planificarFlujos", () => {
  const enBlanco = (
    id: string,
    tipo: RestriccionActual["tipo"],
  ): RestriccionActual => ({
    id,
    tipo,
    resuelta: false,
    detalle: null,
    requiereDoc: false,
    documentoId: null,
    fotos: 0,
  });

  it("desde cero crea los pedidos, en el orden de la matriz", () => {
    const p = planificarFlujos([], ["SEGURIDAD", "INFORMACION"]);
    expect(p.crear).toEqual(["INFORMACION", "SEGURIDAD"]);
    expect(p.borrar).toEqual([]);
    expect(p.conservadas).toEqual([]);
  });

  it("pedir cero flujos deja la tarea limpia: es 'no le aplica ninguna'", () => {
    const p = planificarFlujos([enBlanco("r1", "MATERIALES")], []);
    expect(p.crear).toEqual([]);
    expect(p.borrar).toEqual(["r1"]);
  });

  it("en modo agregar no quita nada", () => {
    const p = planificarFlujos(
      [enBlanco("r1", "MATERIALES")],
      ["EQUIPOS"],
      "agregar",
    );
    expect(p.crear).toEqual(["EQUIPOS"]);
    expect(p.borrar).toEqual([]);
    expect(p.conservadas).toEqual([]);
  });

  it("es idempotente: pedir lo mismo dos veces no hace nada", () => {
    const p = planificarFlujos([enBlanco("r1", "MATERIALES")], ["MATERIALES"]);
    expect(p).toEqual({ crear: [], borrar: [], conservadas: [] });
  });

  it("no borra una restriccion RESUELTA: es trabajo hecho", () => {
    const p = planificarFlujos(
      [{ ...enBlanco("r1", "MATERIALES"), resuelta: true }],
      [],
    );
    expect(p.borrar).toEqual([]);
    expect(p.conservadas).toEqual([
      { id: "r1", tipo: "MATERIALES", motivo: "resuelta" },
    ]);
  });

  it("no borra una restriccion CON FOTOS: la evidencia quedaria huerfana", () => {
    // La FK es SET NULL: la foto sobrevive sin anclaje y no la ve nadie nunca.
    const p = planificarFlujos(
      [{ ...enBlanco("r1", "ESPACIO"), fotos: 2 }],
      [],
    );
    expect(p.borrar).toEqual([]);
    expect(p.conservadas).toEqual([
      { id: "r1", tipo: "ESPACIO", motivo: "con-fotos" },
    ]);
  });

  it("no borra una restriccion con detalle escrito ni con documento", () => {
    const p = planificarFlujos(
      [
        { ...enBlanco("r1", "ESPACIO"), detalle: "falta liberar el frente" },
        { ...enBlanco("r2", "EQUIPOS"), documentoId: "doc1" },
        { ...enBlanco("r3", "SEGURIDAD"), requiereDoc: true },
        // Un detalle en blanco no es nada escrito.
        { ...enBlanco("r4", "REQUISITOS"), detalle: "   " },
      ],
      [],
    );
    expect(p.borrar).toEqual(["r4"]);
    expect(p.conservadas.map((c) => c.id)).toEqual(["r1", "r2", "r3"]);
    expect(new Set(p.conservadas.map((c) => c.motivo))).toEqual(
      new Set(["con-datos"]),
    );
  });

  it("mezcla: crea lo que falta, borra lo vacio y conserva lo trabajado", () => {
    const p = planificarFlujos(
      [
        enBlanco("r1", "MATERIALES"),
        { ...enBlanco("r2", "SEGURIDAD"), resuelta: true },
        enBlanco("r3", "ESPACIO"),
      ],
      ["ESPACIO", "MANO_OBRA"],
    );
    expect(p.crear).toEqual(["MANO_OBRA"]);
    expect(p.borrar).toEqual(["r1"]);
    expect(p.conservadas).toEqual([
      { id: "r2", tipo: "SEGURIDAD", motivo: "resuelta" },
    ]);
  });
});
