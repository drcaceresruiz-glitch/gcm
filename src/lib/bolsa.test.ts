import { describe, expect, it } from "vitest";

import {
  calcularBolsa,
  desfaseDeMeta,
  resumenGastosGenerales,
  totalDeGasto,
  type DatosBolsa,
  type LineaContractual,
  type LineaMeta,
} from "@/lib/bolsa";
import { sumar } from "@/lib/decimal";

/**
 * El contractual de referencia: tres partidas que suman 100.000.
 * Cifras redondas a proposito, para poder comprobar cada resultado a mano.
 */
const CONTRACTUAL: LineaContractual[] = [
  { codigo: "1.1", descripcion: "Concreto", importe: "50000.00" },
  { codigo: "1.2", descripcion: "Acero", importe: "30000.00" },
  { codigo: "2.1", descripcion: "Instalaciones", importe: "20000.00" },
];

/**
 * La meta: dos partidas espejadas, una linea propia, y —a proposito— NADA
 * para la partida 2.1. Ese hueco es la mitad de lo que estas pruebas vigilan.
 */
const META: LineaMeta[] = [
  { codigoRef: "1.1", descripcion: "Concreto", importe: "45000.00" },
  { codigoRef: "1.2", descripcion: "Acero", importe: "31000.00" },
  { codigoRef: null, descripcion: "Andamio alquilado", importe: "3000.00" },
];

const BASE: DatosBolsa = {
  modo: "PARTIDA",
  contractual: CONTRACTUAL,
  meta: META,
  gastosGeneralesContractual: "10000.00",
  gastosGeneralesMeta: "7000.00",
  utilidadContractual: "8000.00",
};

describe("la utilidad no es bolsa", () => {
  // Es LA prueba de este archivo. Si algun dia alguien decide que la utilidad
  // "tambien es margen disponible" y la suma, el equipo de obra se la gasta.
  it("no entra en bolsaTotal por ningun camino", () => {
    const b = calcularBolsa(BASE);

    // produccion 21.000 + plazo 3.000. La utilidad son 8.000 mas, y no estan.
    expect(b.bolsaTotal).toBe("24000.00");
    expect(b.utilidadContractual).toBe("8000.00");
  });

  it("y el margen esperado la suma aparte, con nombre propio", () => {
    const b = calcularBolsa(BASE);
    expect(b.margenEsperado).toBe("32000.00");
  });

  it("cambiar la utilidad no mueve la bolsa", () => {
    const conMas = calcularBolsa({ ...BASE, utilidadContractual: "99999.00" });
    const conCero = calcularBolsa({ ...BASE, utilidadContractual: "0.00" });

    expect(conMas.bolsaTotal).toBe(conCero.bolsaTotal);
    expect(conMas.bolsaProduccion).toBe(conCero.bolsaProduccion);
  });
});

describe("las dos bolsas van separadas", () => {
  it("produccion sale del costo directo y plazo de los gastos generales", () => {
    const b = calcularBolsa(BASE);

    expect(b.costoDirectoContractual).toBe("100000.00");
    expect(b.costoDirectoMeta).toBe("79000.00");
    expect(b.bolsaProduccion).toBe("21000.00");
    expect(b.bolsaPlazo).toBe("3000.00");
  });

  it("un ahorro de plazo no tapa un sobrecosto de produccion", () => {
    // La meta se pasa en produccion (-5.000) pero ahorra en plazo (+8.000).
    // El total queda positivo, y por eso las dos cifras tienen que verse.
    const b = calcularBolsa({
      ...BASE,
      meta: [{ codigoRef: "1.1", descripcion: "Concreto", importe: "55000.00" }],
      contractual: [CONTRACTUAL[0]!],
      gastosGeneralesContractual: "10000.00",
      gastosGeneralesMeta: "2000.00",
    });

    expect(b.bolsaProduccion).toBe("-5000.00");
    expect(b.bolsaPlazo).toBe("8000.00");
    expect(b.bolsaTotal).toBe("3000.00");
  });
});

describe("lo que la meta no cubre no es margen", () => {
  it("la partida sin meta se marca, no se celebra", () => {
    const b = calcularBolsa(BASE);
    const fila = b.porLinea.find((f) => f.codigo === "2.1")!;

    expect(fila.senal).toBe("sin_meta");
    expect(fila.contractual).toBe("20000.00");
    expect(fila.meta).toBe("0.00");
  });

  it("y se totaliza aparte, con su lectura prudente", () => {
    const b = calcularBolsa(BASE);

    expect(b.contractualSinMeta).toBe("20000.00");
    // De los 21.000 de bolsa, 20.000 son una partida que nadie presupuesto.
    expect(b.bolsaProduccionCubierta).toBe("1000.00");
  });

  it("una meta completa deja el hueco en cero", () => {
    const b = calcularBolsa({
      ...BASE,
      meta: [...META, { codigoRef: "2.1", descripcion: "Instalaciones", importe: "18000.00" }],
    });

    expect(b.contractualSinMeta).toBe("0.00");
    expect(b.bolsaProduccionCubierta).toBe(b.bolsaProduccion);
  });
});

describe("las lineas cuadran con el total", () => {
  // Sin esta invariante, la tabla de la pantalla y su pie dirian cosas
  // distintas, y no habria forma de saber cual de las dos miente.
  const suman = (b: ReturnType<typeof calcularBolsa>) =>
    sumar(b.porLinea.map((f) => f.bolsa));

  it("en modo PARTIDA", () => {
    const b = calcularBolsa(BASE);
    expect(suman(b)).toBe(b.bolsaProduccion);
  });

  it("en modo CAPITULO", () => {
    const b = calcularBolsa({
      ...BASE,
      modo: "CAPITULO",
      contractual: [
        { codigo: "1.0", descripcion: "ESTRUCTURAS", importe: "80000.00" },
        { codigo: "2.0", descripcion: "INSTALACIONES", importe: "20000.00" },
      ],
      meta: [
        { codigoRef: "1.0", descripcion: "ESTRUCTURAS", importe: "76000.00" },
        { codigoRef: null, descripcion: "Andamio alquilado", importe: "3000.00" },
      ],
    });

    expect(suman(b)).toBe(b.bolsaProduccion);
  });
});

describe("PARTIDA y CAPITULO son el mismo calculo a distinta altura", () => {
  // Es la comprobacion de que el modo no cambia el dinero, solo el detalle.
  // Si algun dia divergen, una obra veria un margen distinto segun como
  // decidio cargar su meta, que es indefendible.
  it("dan los mismos totales sobre los mismos importes", () => {
    const porPartida = calcularBolsa(BASE);

    const porCapitulo = calcularBolsa({
      ...BASE,
      modo: "CAPITULO",
      contractual: [
        { codigo: "1.0", descripcion: "ESTRUCTURAS", importe: "80000.00" },
        { codigo: "2.0", descripcion: "INSTALACIONES", importe: "20000.00" },
      ],
      meta: [
        { codigoRef: "1.0", descripcion: "ESTRUCTURAS", importe: "76000.00" },
        { codigoRef: null, descripcion: "Andamio alquilado", importe: "3000.00" },
      ],
    });

    expect(porCapitulo.costoDirectoContractual).toBe(porPartida.costoDirectoContractual);
    expect(porCapitulo.costoDirectoMeta).toBe(porPartida.costoDirectoMeta);
    expect(porCapitulo.bolsaProduccion).toBe(porPartida.bolsaProduccion);
    expect(porCapitulo.bolsaTotal).toBe(porPartida.bolsaTotal);
    expect(porCapitulo.contractualSinMeta).toBe(porPartida.contractualSinMeta);
  });
});

describe("las lineas propias de la meta", () => {
  it("se marcan como propias y consumen bolsa", () => {
    const b = calcularBolsa(BASE);
    const andamio = b.porLinea.find((f) => f.descripcion === "Andamio alquilado")!;

    expect(andamio.propia).toBe(true);
    expect(andamio.codigo).toBeNull();
    expect(andamio.contractual).toBe("0.00");
    expect(andamio.bolsa).toBe("-3000.00");
    expect(andamio.senal).toBe("excedida");
  });

  it("no se confunden con una partida sin meta", () => {
    // Las dos tienen una contraparte en cero, pero significan lo contrario:
    // la propia es gasto que asumes de mas; la sin_meta es gasto que aun no
    // has presupuestado. Pintarlas igual seria un error de lectura caro.
    const b = calcularBolsa(BASE);

    const propias = b.porLinea.filter((f) => f.propia);
    const sinMeta = b.porLinea.filter((f) => f.senal === "sin_meta");

    expect(propias).toHaveLength(1);
    expect(sinMeta).toHaveLength(1);
    expect(propias[0]!.descripcion).toBe("Andamio alquilado");
    expect(sinMeta[0]!.codigo).toBe("2.1");
  });
});

describe("modo FRENTE: la contraparte sale del reparto", () => {
  const FRENTES: LineaMeta[] = [
    {
      codigoRef: null,
      descripcion: "Frente A - estructura zona 1",
      importe: "45000.00",
      reparto: [{ parcial: "50000.00", fraccion: "100" }],
    },
    {
      codigoRef: null,
      descripcion: "Frente B - acero zona 1",
      importe: "31000.00",
      // Media partida: la otra mitad la hace otro frente que aun no existe.
      reparto: [{ parcial: "30000.00", fraccion: "50" }],
    },
  ];

  const datos: DatosBolsa = { ...BASE, modo: "FRENTE", meta: FRENTES };

  it("pondera cada partida por su fraccion", () => {
    const b = calcularBolsa(datos);

    expect(b.porLinea[0]!.contractual).toBe("50000.00");
    expect(b.porLinea[0]!.bolsa).toBe("5000.00");
    expect(b.porLinea[1]!.contractual).toBe("15000.00");
    expect(b.porLinea[1]!.bolsa).toBe("-16000.00");
  });

  it("anade una fila con lo que ningun frente cubre, y cuadra", () => {
    const b = calcularBolsa(datos);
    const resto = b.porLinea.find((f) => f.senal === "sin_meta")!;

    // 100.000 de contrato - 65.000 repartidos.
    expect(resto.descripcion).toBe("Partidas sin frente asignado");
    expect(resto.contractual).toBe("35000.00");
    expect(sumar(b.porLinea.map((f) => f.bolsa))).toBe(b.bolsaProduccion);
  });

  it("y avisa cuando los frentes suman mas presupuesto del que hay", () => {
    // Dos frentes sobre la misma partida: 100 % + 60 % = 160 %. Es un error
    // de reparto, y sin este aviso se leeria como una bolsa negativa
    // inexplicable en vez de como lo que es.
    const b = calcularBolsa({
      ...datos,
      contractual: [CONTRACTUAL[0]!],
      meta: [
        { codigoRef: null, descripcion: "A", importe: "10000.00", reparto: [{ parcial: "50000.00", fraccion: "100" }] },
        { codigoRef: null, descripcion: "B", importe: "10000.00", reparto: [{ parcial: "50000.00", fraccion: "60" }] },
      ],
    });

    const aviso = b.porLinea.find((f) => f.senal === "sin_meta")!;
    expect(aviso.descripcion).toBe("Reparto excedido: los frentes suman mas que el presupuesto");
    expect(aviso.contractual).toBe("-30000.00");
  });
});

describe("aritmetica de dinero", () => {
  it("resta bien contra un importe negativo", () => {
    // La trampa historica de esta base de codigo: `sumar([a, "-" + b])` con
    // una b ya negativa produce "--500.00", que `sumar` descarta en silencio
    // y devuelve el minuendo intacto. En CRIOCORD hay un descuento comercial
    // de -26.821,60, asi que no es hipotetico.
    const b = calcularBolsa({
      ...BASE,
      contractual: [{ codigo: "1.1", descripcion: "x", importe: "1000.00" }],
      meta: [{ codigoRef: "1.1", descripcion: "x", importe: "-500.00" }],
    });

    expect(b.porLinea[0]!.bolsa).toBe("1500.00");
    expect(b.bolsaProduccion).toBe("1500.00");
  });

  it("no arrastra el ruido de la coma flotante", () => {
    // 0.1 + 0.2 en binario da 0.30000000000000004.
    const b = calcularBolsa({
      ...BASE,
      contractual: [{ codigo: "1.1", descripcion: "x", importe: "0.30" }],
      meta: [
        { codigoRef: "1.1", descripcion: "x", importe: "0.10" },
        { codigoRef: null, descripcion: "y", importe: "0.20" },
      ],
    });

    expect(b.bolsaProduccion).toBe("0.00");
  });
});

describe("el desfase de la meta", () => {
  it("dice cuanto exagera la bolsa, no solo que exagera", () => {
    const d = desfaseDeMeta([
      { importeNeto: "84200.00" },
      { importeNeto: "-1200.00" },
    ]);

    expect(d.hay).toBe(true);
    expect(d.movimientos).toBe(2);
    expect(d.importe).toBe("83000.00");
  });

  it("sin movimientos posteriores, no hay desfase", () => {
    const d = desfaseDeMeta([]);

    expect(d.hay).toBe(false);
    expect(d.movimientos).toBe(0);
    expect(d.importe).toBe("0.00");
  });

  it("un adicional aprobado despues infla la bolsa en su importe", () => {
    // La meta se fijo con el contrato en 100.000. Llega un adicional de
    // 20.000 y el vigente sube; la meta sigue igual, asi que la bolsa crece
    // 20.000 sin que nadie haya ahorrado un sol.
    const antes = calcularBolsa(BASE);
    const despues = calcularBolsa({
      ...BASE,
      contractual: [...CONTRACTUAL, { codigo: "3.1", descripcion: "Adicional", importe: "20000.00" }],
    });

    const d = desfaseDeMeta([{ importeNeto: "20000.00" }]);

    expect(despues.bolsaProduccion).toBe("41000.00");
    expect(antes.bolsaProduccion).toBe("21000.00");
    expect(d.importe).toBe("20000.00");
  });
});

describe("los gastos generales de la meta", () => {
  it("un fijo vale su importe; un variable, mensual por meses", () => {
    expect(
      totalDeGasto({ tipo: "FIJO", montoMensual: null, meses: null, montoFijo: "5000.00" }),
    ).toBe("5000.00");

    expect(
      totalDeGasto({ tipo: "VARIABLE", montoMensual: "1200.00", meses: "6", montoFijo: null }),
    ).toBe("7200.00");
  });

  it("una fila mal formada devuelve null, no cero", () => {
    // Un cero se suma sin ruido y desaparece del total; un null se puede
    // contar y ensenar. Es la validacion que la base de datos no sabe hacer.
    expect(
      totalDeGasto({ tipo: "VARIABLE", montoMensual: null, meses: "6", montoFijo: null }),
    ).toBeNull();

    expect(
      totalDeGasto({ tipo: "VARIABLE", montoMensual: "1200.00", meses: null, montoFijo: null }),
    ).toBeNull();

    expect(
      totalDeGasto({ tipo: "FIJO", montoMensual: null, meses: null, montoFijo: null }),
    ).toBeNull();
  });

  it("admite medio mes, que es como acaban muchos plazos", () => {
    expect(
      totalDeGasto({ tipo: "VARIABLE", montoMensual: "1200.00", meses: "6.50", montoFijo: null }),
    ).toBe("7800.00");
  });
});

describe("el precio de cada mes de atraso", () => {
  const GASTOS = [
    { tipo: "FIJO" as const, montoMensual: null, meses: null, montoFijo: "5000.00" },
    { tipo: "VARIABLE" as const, montoMensual: "1200.00", meses: "6", montoFijo: null },
    { tipo: "VARIABLE" as const, montoMensual: "800.00", meses: "6", montoFijo: null },
  ];

  it("solo cuentan los variables: los fijos no se mueven con el plazo", () => {
    // Es la razon entera de guardar el mensual en vez de un total ciego. Una
    // carta fianza no cuesta mas porque la obra se estire; el residente si.
    const r = resumenGastosGenerales(GASTOS);

    expect(r.costeMensualDelAtraso).toBe("2000.00");
    expect(r.fijos).toBe("5000.00");
    expect(r.variables).toBe("12000.00");
    expect(r.total).toBe("17000.00");
    expect(r.invalidas).toBe(0);
  });

  it("las filas invalidas se cuentan y quedan fuera de la suma", () => {
    const r = resumenGastosGenerales([
      ...GASTOS,
      { tipo: "VARIABLE" as const, montoMensual: null, meses: "3", montoFijo: null },
    ]);

    expect(r.invalidas).toBe(1);
    expect(r.total).toBe("17000.00");
    expect(r.costeMensualDelAtraso).toBe("2000.00");
  });

  it("sin gastos, todo en cero y nada invalido", () => {
    const r = resumenGastosGenerales([]);

    expect(r.total).toBe("0.00");
    expect(r.costeMensualDelAtraso).toBe("0.00");
    expect(r.invalidas).toBe(0);
  });
});
