import { describe, expect, it } from "vitest";
import {
  UMBRAL_DINERO,
  criterioDePeso,
  pesoEnDineroPorTarea,
  pesoDeTarea,
} from "./pesos-tarea";
import { importeCubiertoPorTarea } from "./mapeo-partidas";
import { ponderar, planeadoEnFecha } from "./curva-s";

describe("cuando se pondera por dinero", () => {
  it("a partir del umbral prometido, y no antes", () => {
    // El 60 % no se elige aqui: es el que el manual y `lib/evm.ts` llevan
    // prometiendo desde el principio.
    expect(UMBRAL_DINERO).toBe(60);
    expect(criterioDePeso(60)).toBe("DINERO");
    expect(criterioDePeso(59.9)).toBe("DURACION");
    expect(criterioDePeso(0)).toBe("DURACION");
    expect(criterioDePeso(100)).toBe("DINERO");
  });
});

describe("cuanto dinero le toca a cada tarea", () => {
  const partidas = [
    { codigo: "1.1", parcial: "200000.00" },
    { codigo: "1.2", parcial: "2000.00" },
    // Un capitulo no lleva importe propio: no reparte nada.
    { codigo: "1.0", parcial: null },
  ];

  it("una tarea por partida: el importe entero", () => {
    const r = pesoEnDineroPorTarea(
      [
        { uid: 10, codigoPartida: "1.1" },
        { uid: 11, codigoPartida: "1.2" },
      ],
      partidas,
    );

    expect(r.get(10)).toBe("200000.0000");
    expect(r.get(11)).toBe("2000.0000");
  });

  it("varias tareas sobre la MISMA partida se reparten su importe", () => {
    // Si se le diera el importe entero a cada una, esa partida pesaria el
    // triple que las demas y el avance lo gobernaria la que mas veces se
    // mapeo. Es el mismo cuidado que ya tiene `cobertura`.
    const r = pesoEnDineroPorTarea(
      [
        { uid: 10, codigoPartida: "1.1" },
        { uid: 20, codigoPartida: "1.1" },
      ],
      partidas,
    );

    expect(r.get(10)).toBe("100000.0000");
    expect(r.get(20)).toBe("100000.0000");
  });

  it("una tarea que cubre varias partidas suma sus trozos", () => {
    const r = pesoEnDineroPorTarea(
      [
        { uid: 10, codigoPartida: "1.1" },
        { uid: 10, codigoPartida: "1.2" },
      ],
      partidas,
    );

    expect(r.get(10)).toBe("202000.0000");
  });

  it("una partida sin importe no da peso, y no rompe", () => {
    const r = pesoEnDineroPorTarea([{ uid: 99, codigoPartida: "1.0" }], partidas);
    expect(r.has(99)).toBe(false);
  });

  it("un mapeo a una partida que ya no existe se ignora", () => {
    // El mapeo guarda el CODIGO y no el id, justamente para sobrevivir a que
    // se reimporte el presupuesto. A cambio, un codigo puede desaparecer.
    const r = pesoEnDineroPorTarea([{ uid: 7, codigoPartida: "9.9" }], partidas);
    expect(r.size).toBe(0);
  });
});

describe("la funcion de peso que se usa", () => {
  const tareas = [
    { uid: 10, esResumen: false },
    { uid: 11, esResumen: false },
    { uid: 1, esResumen: true },
  ];

  it("con DURACION, el peso es la duracion y nadie se queda fuera", () => {
    const p = pesoDeTarea("DURACION", new Map(), tareas);

    expect(p.peso({ uid: 10, duracionDias: "5" })).toBe("5");
    expect(p.sinPeso).toBe(0);
  });

  it("con DINERO, una tarea sin partida pesa CERO y se cuenta", () => {
    // Es la consecuencia honesta de pesar por dinero -lo que no tiene importe
    // conocido no tiene peso- pero significa que parte del trabajo desaparece
    // de la cuenta, y quien lee la cifra tiene derecho a saber cuanto.
    const p = pesoDeTarea("DINERO", new Map([[10, "200000.0000"]]), tareas);

    expect(p.peso({ uid: 10, duracionDias: "5" })).toBe("200000.0000");
    expect(p.peso({ uid: 11, duracionDias: "5" })).toBe("0");
    expect(p.sinPeso).toBe(1);
  });

  it("los resumenes no cuentan como tareas sin peso", () => {
    // Su porcentaje ya es el de sus hijas: nunca llevan peso propio.
    const p = pesoDeTarea("DINERO", new Map([[10, "1"], [11, "1"]]), tareas);
    expect(p.sinPeso).toBe(0);
  });
});

describe("por que importa: la cifra cambia", () => {
  /*
   * Es el caso que el manual describe y que GCM no sabia contar: dos partidas
   * que duran lo mismo y valen cien veces distinto. Terminar la barata no es
   * haber hecho la mitad de la obra.
   */
  const tareas = [
    { uid: 10, esResumen: false, duracionDias: "10", real: "0.00" },
    { uid: 11, esResumen: false, duracionDias: "10", real: "100.00" },
  ];

  const importes = pesoEnDineroPorTarea(
    [
      { uid: 10, codigoPartida: "1.1" },
      { uid: 11, codigoPartida: "1.2" },
    ],
    [
      { codigo: "1.1", parcial: "200000.00" },
      { codigo: "1.2", parcial: "2000.00" },
    ],
  );

  it("por duracion dice 50 %", () => {
    const porDuracion = pesoDeTarea("DURACION", importes, tareas);
    expect(ponderar(tareas, porDuracion.peso, (t) => t.real)).toBe("50.00");
  });

  it("por dinero dice 0,99 %, que es lo que de verdad se ha construido", () => {
    const porDinero = pesoDeTarea("DINERO", importes, tareas);
    expect(ponderar(tareas, porDinero.peso, (t) => t.real)).toBe("0.99");
  });
});

describe("el plan se pesa igual que el real", () => {
  /*
   * La regla de oro. Si el plan se pesara por duracion y el real por dinero,
   * la resta -que es LO UNICO que se mira- no significaria nada.
   */
  const planificadas = [
    {
      uid: 10,
      esResumen: false,
      duracionDias: "10",
      inicio: new Date(Date.UTC(2026, 0, 1)),
      fin: new Date(Date.UTC(2026, 0, 11)),
    },
    {
      uid: 11,
      esResumen: false,
      duracionDias: "10",
      inicio: new Date(Date.UTC(2026, 0, 1)),
      fin: new Date(Date.UTC(2026, 0, 11)),
    },
  ];

  const importes = new Map([
    [10, "200000.0000"],
    [11, "2000.0000"],
  ]);

  it("con el mismo peso, plan y real son comparables", () => {
    const peso = pesoDeTarea("DINERO", importes, planificadas);

    // A mitad de camino las dos tareas van por la mitad: el plan es 50 %
    // pesado como sea, porque las dos duran lo mismo y arrancan juntas.
    const plan = planeadoEnFecha(planificadas, new Date(Date.UTC(2026, 0, 6)), peso.peso);
    expect(plan).toBeCloseTo(50, 1);
  });

  it("sin peso pasado, la curva sigue pesando por duracion como siempre", () => {
    // La compatibilidad importa: una obra sin mapeo no cambia ni una cifra.
    const plan = planeadoEnFecha(planificadas, new Date(Date.UTC(2026, 0, 6)));
    expect(plan).toBeCloseTo(50, 1);
  });
});

/**
 * LAS DOS FUNCIONES QUE SE LLAMABAN IGUAL.
 *
 * `lib/mapeo-partidas` tenia otra `importePorTarea` con la misma forma de
 * entrada y de salida que esta, y decide lo CONTRARIO sobre el reparto. Las
 * dos son correctas para lo suyo -aquella dice cuanto CUBRE una tarea, esta
 * cuanto PESA- pero con el mismo nombre nadie podia saber cual estaba usando,
 * y elegir la equivocada no daba error: daba una cifra creible.
 *
 * Esta prueba fija la diferencia para que no se vuelvan a fundir «porque hacen
 * lo mismo».
 */
describe("pesar y cubrir no son lo mismo", () => {
  const ENLACES = [
    { uid: 1, codigoPartida: "1.1" },
    { uid: 2, codigoPartida: "1.1" },
  ];
  const PARTIDAS = [{ codigo: "1.1", parcial: "10000.00" }];

  it("el PESO reparte: dos tareas sobre una partida suman el presupuesto", () => {
    const pesos = pesoEnDineroPorTarea(ENLACES, PARTIDAS);

    expect(pesos.get(1)).toBe("5000.0000");
    expect(pesos.get(2)).toBe("5000.0000");
    // La invariante: los pesos suman lo que vale la partida, no el doble. Sin
    // esto, esa partida pesaria el doble que las demas y el avance de la obra
    // quedaria gobernado por la que mas veces se mapeo.
    expect(Number(pesos.get(1)) + Number(pesos.get(2))).toBe(10000);
  });

  it("lo CUBIERTO no reparte: cada tarea cubre la partida entera", () => {
    const cubierto = importeCubiertoPorTarea(ENLACES, [
      { codigo: "1.1", descripcion: "Concreto", parcial: "10000.00" },
    ]);

    // Y es correcto para lo suyo: la pantalla de mapeo dice «esta tarea cubre
    // la partida 1.1, que vale 10.000», no «cubre media partida».
    expect(cubierto.get(1)).toBe("10000.00");
    expect(cubierto.get(2)).toBe("10000.00");
  });
});
