import { describe, it, expect } from "vitest";
import {
  cobertura,
  importePorTarea,
  parecido,
  proponerPartidas,
  type PartidaMapeable,
} from "./mapeo-partidas";

const p = (codigo: string, descripcion: string, parcial: string | null): PartidaMapeable => ({
  codigo,
  descripcion,
  parcial,
});

describe("parecido", () => {
  it("ignora tildes, mayusculas y palabras vacias", async () => {
    expect(parecido("Eliminación de material excedente", "eliminacion del material excedente"))
      .toBeCloseTo(1, 6);
  });

  it("conserva los numeros, que son lo que distingue una partida de su vecina", async () => {
    // "210" y "175" son dos concretos distintos. Si los numeros se tiraran,
    // las dos descripciones serian identicas.
    const a = parecido("Concreto f'c=210 kg/cm2 en zapatas", "Concreto f'c=210 kg/cm2 en zapatas");
    const b = parecido("Concreto f'c=210 kg/cm2 en zapatas", "Concreto f'c=175 kg/cm2 en zapatas");

    expect(a).toBeGreaterThan(b);
  });

  it("no premia a la descripcion larguisima que contiene a la corta", async () => {
    // Con «comunes sobre las de la corta» esto daria 1. Dice lo penaliza,
    // que es lo que evita que la partida mas verbosa gane siempre.
    const r = parecido("Trazo y replanteo", "Trazo y replanteo de ejes, niveles, alturas, tabiques y posicion de equipos");

    expect(r).toBeGreaterThan(0.2);
    expect(r).toBeLessThan(0.8);
  });

  it("da cero entre textos sin nada en comun", async () => {
    expect(parecido("Excavacion masiva", "Pintura latex en cielo raso")).toBe(0);
  });
});

describe("proponerPartidas", () => {
  const PARTIDAS = [
    p("2.04", "Trazo y Replanteo. Replanteo de ejes, alineamiento de tabiques", "2100.00"),
    p("3.03", "Eliminacion de material excedente (acarreo y transporte)", "1500.00"),
    p("5.05", "Descuento comercial por adelanto", "-26821.60"),
  ];

  it("ordena por parecido de la descripcion", async () => {
    const r = proponerPartidas(
      { codigo: "3.3", nombre: "Eliminacion de material excedente (Acarreo y transporte)." },
      PARTIDAS,
    );

    expect(r[0]?.codigo).toBe("3.03");
    expect(r[0]?.puntuacion).toBeGreaterThan(0.8);
  });

  it("marca el mismo codigo pero NO lo usa para puntuar", async () => {
    // Es la medida que decide el diseno: de las 56 coincidencias de codigo de
    // CRIOCORD, 36 apuntaban a otra cosa. Si el codigo puntuara, ordenaria la
    // lista poniendo arriba justo los emparejamientos falsos.
    const r = proponerPartidas(
      { codigo: "5.5", nombre: "Montaje de estructura metalica en losa" },
      PARTIDAS,
    );

    const descuento = r.find((x) => x.codigo === "5.05");
    expect(descuento?.mismoCodigo).toBe(true);
    expect(descuento?.puntuacion).toBe(0);
  });

  it("reconoce el mismo codigo escrito con y sin ceros a la izquierda", async () => {
    // El cronograma escribe "2.4" y el presupuesto, que viene de S10, "02.04".
    const r = proponerPartidas({ codigo: "2.4", nombre: "Trazo y Replanteo" }, PARTIDAS);

    expect(r.find((x) => x.codigo === "2.04")?.mismoCodigo).toBe(true);
  });

  it("no propone nada cuando ninguna partida se parece", async () => {
    // Muchas tareas del cronograma —hitos, «fin de estructuras»— no cubren
    // ninguna partida. Proponer cinco al azar solo ensena a ignorar la lista.
    const r = proponerPartidas(
      { codigo: "0.1", nombre: "Inicio de obra y entrega del almacen" },
      PARTIDAS,
    );

    expect(r).toEqual([]);
  });
});

describe("importePorTarea", () => {
  it("suma las partidas que cubre una misma tarea", async () => {
    // El presupuesto es tres veces mas fino que el cronograma: una tarea cubre
    // varias partidas.
    const importes = importePorTarea(
      [
        { uid: 10, codigoPartida: "1.01" },
        { uid: 10, codigoPartida: "1.02" },
        { uid: 20, codigoPartida: "2.01" },
      ],
      [p("1.01", "A", "1000.00"), p("1.02", "B", "250.50"), p("2.01", "C", "700.00")],
    );

    expect(importes.get(10)).toBe("1250.50");
    expect(importes.get(20)).toBe("700.00");
  });

  it("ignora el enlace a una partida que ya no existe", async () => {
    // Reimportar el presupuesto puede borrar una partida; el mapeo se guarda
    // por codigo justo para sobrevivir a eso, pero el codigo puede desaparecer.
    const importes = importePorTarea(
      [{ uid: 10, codigoPartida: "9.99" }],
      [p("1.01", "A", "1000.00")],
    );

    expect(importes.has(10)).toBe(false);
  });
});

describe("cobertura", () => {
  it("cuenta cada partida una sola vez aunque la cubran dos tareas", async () => {
    // Si se contara dos veces, el porcentaje podria pasar del 100% y dejaria
    // de significar nada.
    const c = cobertura(
      [
        { uid: 10, codigoPartida: "1.01" },
        { uid: 20, codigoPartida: "1.01" },
      ],
      [p("1.01", "A", "600.00"), p("1.02", "B", "400.00")],
    );

    expect(c.mapeado).toBe("600.00");
    expect(c.total).toBe("1000.00");
    expect(c.porcentaje).toBeCloseTo(60, 6);
    expect(c.partidasSinTarea).toBe(1);
  });

  it("no cuenta las partidas sin importe", async () => {
    // Los capitulos y las lineas de alcance no tienen parcial propio: no son
    // dinero que cubrir.
    const c = cobertura(
      [{ uid: 10, codigoPartida: "1.01" }],
      [p("1.00", "CAPITULO", null), p("1.01", "A", "500.00")],
    );

    expect(c.porcentaje).toBeCloseTo(100, 6);
    expect(c.partidasSinTarea).toBe(0);
  });

  it("da cero sin reventar cuando el presupuesto esta vacio", async () => {
    const c = cobertura([], []);

    expect(c.porcentaje).toBe(0);
    expect(c.mapeado).toBe("0.00");
  });
});
