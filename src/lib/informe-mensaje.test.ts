import { describe, expect, it } from "vitest";

import type { DatosCsvInforme } from "./informe-csv";
import {
  aAscii,
  enlaceWhatsApp,
  MAX_SMS,
  textoSms,
  textoWhatsApp,
} from "./informe-mensaje";

function datos(parcial: Partial<DatosCsvInforme> = {}): DatosCsvInforme {
  return {
    empresa: "Constructora",
    obra: "Ampliación de planta",
    ubicacion: null,
    fechaCorte: new Date("2026-08-09T00:00:00Z"),
    version: 1,
    importadoPor: "Ana",
    planeadoProject: null,
    realProject: null,
    real: "45.20",
    planeado: "47.51",
    desviacion: "-2.31",
    periodo: { desde: null, hasta: new Date("2026-08-09T00:00:00Z"), ganado: "0.00" },
    curva: { puntos: [] },
    capitulos: [],
    alertas: [],
    activas: [],
    lastPlanner: null,
    generadoPor: "Ana",
    ...parcial,
  } as DatosCsvInforme;
}

const alerta = (n: number): DatosCsvInforme["alertas"] =>
  Array.from({ length: n }, (_, i) => ({
    uid: i + 1,
    codigo: `1.${i + 1}`,
    nombre: "Cimentación",
    planeado: "10.00",
    real: "5.00",
    desfase: "-5.00",
    diasAtraso: "4",
    pendiente: "5.00",
    esCritico: false,
    vencida: false,
    motivo: "Va por detrás del plan",
    severidad: "alta" as const,
  }));

describe("aAscii", () => {
  // Si esto falla, el SMS pasa a UCS-2 y el limite cae de 160 a 70.
  it("quita las tildes y la eñe sin comerse las letras", () => {
    expect(aAscii("Ampliación de la Ñaña, Cimentación")).toBe(
      "Ampliacion de la Nana, Cimentacion",
    );
  });

  it("cambia los signos de imprenta en vez de dejarlos pasar", () => {
    expect(aAscii("obra «A» — 3 días · fin")).toBe('obra "A" - 3 dias - fin');
  });

  it("no deja ni un caracter fuera de ASCII", () => {
    const salida = aAscii("Excavación 🚧 —«ok»— día");
    expect(/^[\x20-\x7E]*$/.test(salida)).toBe(true);
  });
});

describe("textoSms", () => {
  it("cabe en un solo SMS", () => {
    expect(textoSms(datos()).length).toBeLessThanOrEqual(MAX_SMS);
  });

  it("no lleva tildes aunque la obra las tenga", () => {
    expect(textoSms(datos())).toContain("Ampliacion de planta");
  });

  // Las operadoras marcan como spam los SMS con URL: el que lleva enlace es
  // justo el que no llega.
  it("no lleva ningun enlace", () => {
    const sms = textoSms(datos({ obra: "Obra www.ejemplo.com" }));
    expect(sms).not.toMatch(/https?:\/\/|wa\.me/);
  });

  it("dice las dos cifras que nadie puede deducir", () => {
    const sms = textoSms(datos());
    expect(sms).toContain("real 45.20%");
    expect(sms).toContain("plan 47.51%");
  });
});

describe("textoSms cuando no cabe todo", () => {
  const obraLarguisima = "Obra " + "muy larga ".repeat(40);

  // LA INVARIANTE: se recorta el nombre, nunca una cifra. Un «45.2» cortado de
  // «45.20» se sigue leyendo como un numero, y seria un numero falso.
  it("recorta el nombre de la obra pero deja las cifras enteras", () => {
    const sms = textoSms(datos({ obra: obraLarguisima }));

    expect(sms.length).toBeLessThanOrEqual(MAX_SMS);
    expect(sms).toContain("real 45.20%");
    expect(sms).toContain("plan 47.51%");
  });

  it("sacrifica las partidas graves antes que el PPC", () => {
    const sms = textoSms(
      datos({
        // Medido para que quepa el PPC y NO quepan las graves: con menos, la
        // prueba pasaria sin comprobar el orden de sacrificio.
        obra: ("Ampliación de planta " + "y anexos ".repeat(7)).trim(),
        alertas: alerta(4),
        lastPlanner: {
          semana: { numero: 33, ppc: 80, cumplidos: 4, total: 5 },
        } as DatosCsvInforme["lastPlanner"],
      }),
    );

    expect(sms.length).toBeLessThanOrEqual(MAX_SMS);
    expect(sms).toContain("PPC 80%");
    expect(sms).not.toContain("partidas graves");
  });

  it("con sitio de sobra dice tambien las partidas graves", () => {
    const sms = textoSms(datos({ obra: "Planta", alertas: alerta(4) }));

    expect(sms).toContain("4 partidas graves");
  });
});

describe("textoSms y el correo no pueden contradecirse", () => {
  // El umbral de «al dia» es el mismo objeto, no una copia: si alguien lo
  // cambia en el correo, este SMS cambia con el.
  it("por debajo del umbral dice al dia y no un atraso de 0.20", () => {
    expect(textoSms(datos({ desviacion: "-0.20" }))).toContain("(al dia)");
  });

  it("por encima del umbral dice el atraso con su signo", () => {
    expect(textoSms(datos({ desviacion: "-2.31" }))).toContain("(-2.31 pts)");
    expect(textoSms(datos({ desviacion: "3.10" }))).toContain("(+3.10 pts)");
  });

  // Con la semana abierta el PPC no se menciona: a medio cerrar siempre parece
  // malo, y el correo ya se calla por la misma razon.
  it("calla el PPC mientras la semana sigue abierta", () => {
    const sms = textoSms(
      datos({
        lastPlanner: {
          semana: { numero: 33, ppc: null, cumplidos: 2, total: 5 },
        } as DatosCsvInforme["lastPlanner"],
      }),
    );

    expect(sms).not.toContain("PPC");
  });
});

describe("textoWhatsApp", () => {
  it("conserva las tildes: aqui no hay problema de alfabeto", () => {
    expect(textoWhatsApp(datos())).toContain("Ampliación de planta");
  });

  it("lleva el estado y las dos cifras", () => {
    const texto = textoWhatsApp(datos());

    expect(texto).toContain("2.31 puntos por detrás del plan");
    expect(texto).toContain("Avance real: 45.20%");
  });

  it("enumera las partidas atrasadas y dice cuantas quedaron fuera", () => {
    const texto = textoWhatsApp(datos({ alertas: alerta(5) }));

    expect(texto).toContain("Partidas más atrasadas");
    expect(texto).toContain("…y 2 más en el informe completo.");
  });

  // El informe vive detras de la sesion: un enlace solo enseñaria el login.
  it("no mete enlaces en el cuerpo del mensaje", () => {
    expect(textoWhatsApp(datos())).not.toMatch(/https?:\/\//);
  });
});

describe("enlaceWhatsApp", () => {
  it("no exige numero: el chat se elige en WhatsApp", () => {
    expect(enlaceWhatsApp("hola")).toBe("https://wa.me/?text=hola");
  });

  // Sin codificar, un salto de linea o un `&` del nombre de una obra parte la
  // URL y el mensaje llega cortado por la mitad.
  it("codifica saltos de linea y simbolos que romperian la URL", () => {
    const url = enlaceWhatsApp("Obra A & B\nreal 45%");

    expect(url).toContain("%26");
    expect(url).toContain("%0A");
    expect(url).not.toContain("\n");
  });
});
