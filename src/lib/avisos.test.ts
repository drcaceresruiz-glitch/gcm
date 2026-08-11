import { describe, it, expect } from "vitest";
import {
  quiereEvento,
  cubreFlujo,
  seFiltraPorFlujo,
  canalesEfectivos,
  repartirAvisos,
  diasEntre,
  tocaRecordar,
  esEstreno,
  claveDeAviso,
  diaDeClave,
  acotarPorTope,
  estadoDelReloj,
  siguienteLote,
  validarContacto,
  validarSuscripcion,
  recortar,
  textoAvisoSms,
  textoAviso,
  flujosDe,
  tareasDe,
  LIMITE_SMS,
  RELOJ_SILENCIO_MINUTOS,
  type Canales,
  type Momentos,
  type MotivoAviso,
  type Persona,
  type SuscripcionAviso,
} from "./avisos";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

const TODOS_CANALES: Canales = { app: true, correo: true, sms: true };
const SOLO_SMS: Canales = { app: false, correo: false, sms: true };
const SOLO_APP: Canales = { app: true, correo: false, sms: false };

const TODOS_MOMENTOS: Momentos = {
  alAbrir: true,
  alRecordar: true,
  alQuedarLista: true,
  enResumen: true,
};

function usuario(id: string, extra: Partial<Persona> = {}): Persona {
  return {
    clave: `u:${id}`,
    nombre: id,
    email: `${id}@obra.pe`,
    celular: "987654321",
    celularUtil: true,
    tieneBandeja: true,
    ...extra,
  };
}

function externo(id: string, extra: Partial<Persona> = {}): Persona {
  return {
    clave: `c:${id}`,
    nombre: id,
    email: `${id}@proveedor.pe`,
    celular: null,
    celularUtil: false,
    tieneBandeja: false,
    ...extra,
  };
}

function suscripcion(extra: Partial<SuscripcionAviso> = {}): SuscripcionAviso {
  return {
    id: "s1",
    userId: "u1",
    rol: null,
    contactoId: null,
    tipo: null,
    canales: TODOS_CANALES,
    momentos: TODOS_MOMENTOS,
    ...extra,
  };
}

function motivo(uid: number, tipo: MotivoAviso["tipo"], dias = 0): MotivoAviso {
  return { uid, tarea: `Tarea ${uid}`, tipo, diasAbierta: dias };
}

// ---------------------------------------------------------------------------

describe("quiereEvento", () => {
  it("cada momento se enciende por separado", () => {
    const solo = suscripcion({
      momentos: { ...TODOS_MOMENTOS, alRecordar: false },
    });
    expect(quiereEvento(solo, "ABRIR")).toBe(true);
    expect(quiereEvento(solo, "RECORDAR")).toBe(false);
  });
});

describe("cubreFlujo", () => {
  it("sin tipo, le interesan los siete", () => {
    const s = suscripcion({ tipo: null });
    expect(cubreFlujo(s, "MATERIALES")).toBe(true);
    expect(cubreFlujo(s, "SEGURIDAD")).toBe(true);
  });

  it("con tipo, solo el suyo: el de materiales no es el de informacion", () => {
    const s = suscripcion({ tipo: "MATERIALES" });
    expect(cubreFlujo(s, "MATERIALES")).toBe(true);
    expect(cubreFlujo(s, "INFORMACION")).toBe(false);
  });
});

describe("seFiltraPorFlujo", () => {
  it("'quedo lista' NO se filtra por flujo: es de la tarea", () => {
    expect(seFiltraPorFlujo("LISTA")).toBe(false);
  });

  it("los demas si", () => {
    expect(seFiltraPorFlujo("ABRIR")).toBe(true);
    expect(seFiltraPorFlujo("RECORDAR")).toBe(true);
    expect(seFiltraPorFlujo("RESUMEN")).toBe(true);
  });
});

describe("canalesEfectivos", () => {
  it("un usuario completo recibe por los tres", () => {
    const r = canalesEfectivos(usuario("u1"), TODOS_CANALES);
    expect(r.canales).toEqual(["APP", "CORREO", "SMS"]);
    expect(r.sinCanal).toBe(false);
  });

  it("SIN CELULAR VERIFICADO, el SMS cae al correo", () => {
    // La regla de la casa: el fallo seguro es "te llega por correo", nunca
    // "no te llega".
    const r = canalesEfectivos(usuario("u1", { celularUtil: false }), SOLO_SMS);
    expect(r.canales).toEqual(["CORREO"]);
  });

  it("sin celular ninguno, el SMS tambien cae al correo", () => {
    const r = canalesEfectivos(usuario("u1", { celular: null }), SOLO_SMS);
    expect(r.canales).toEqual(["CORREO"]);
  });

  it("alguien de fuera no recibe por la campanita aunque se pida", () => {
    // No tiene bandeja: seria escribir un aviso que nadie va a mirar jamas.
    const r = canalesEfectivos(externo("c1"), SOLO_APP);
    expect(r.canales).toEqual([]);
    expect(r.sinCanal).toBe(true);
  });

  it("sin correo ni celular util, no recibe NADA y se puede decir", () => {
    const nadie = externo("c1", { email: null, celular: null });
    const r = canalesEfectivos(nadie, TODOS_CANALES);
    expect(r.canales).toEqual([]);
    expect(r.sinCanal).toBe(true);
  });

  it("un externo con celular normalizado si recibe SMS", () => {
    const con = externo("c1", { celular: "987654321", celularUtil: true });
    expect(canalesEfectivos(con, SOLO_SMS).canales).toEqual(["SMS"]);
  });
});

describe("repartirAvisos", () => {
  const motivos = [
    motivo(1, "MATERIALES"),
    motivo(2, "MATERIALES"),
    motivo(3, "INFORMACION"),
  ];

  it("agrupa: seis motivos de una persona dan UN lote por canal", () => {
    // Sin esto, analizar diez tareas mandaria cuarenta SMS a una SIM personal.
    const lotes = repartirAvisos(
      [{ suscripcion: suscripcion({ canales: SOLO_SMS }), personas: [usuario("u1")] }],
      motivos,
      "ABRIR",
    );
    expect(lotes).toHaveLength(1);
    expect(lotes[0]?.canal).toBe("SMS");
    expect(lotes[0]?.motivos).toHaveLength(3);
  });

  it("la misma persona por dos suscripciones aparece UNA vez, con los canales unidos", () => {
    // Estar suscrito por nombre y ademas por rol no significa recibirlo dos
    // veces: significa recibirlo por todos los canales que cualquiera pidiera.
    const persona = usuario("u1");
    const lotes = repartirAvisos(
      [
        { suscripcion: suscripcion({ id: "a", canales: SOLO_SMS }), personas: [persona] },
        { suscripcion: suscripcion({ id: "b", canales: SOLO_APP }), personas: [persona] },
      ],
      motivos,
      "ABRIR",
    );
    expect(lotes.map((l) => l.canal).sort()).toEqual(["APP", "SMS"]);
    expect(new Set(lotes.map((l) => l.persona.clave)).size).toBe(1);
  });

  it("cada persona recibe solo los motivos de SU flujo", () => {
    const lotes = repartirAvisos(
      [
        {
          suscripcion: suscripcion({ id: "a", tipo: "MATERIALES", canales: SOLO_APP }),
          personas: [usuario("mat")],
        },
        {
          suscripcion: suscripcion({ id: "b", tipo: "INFORMACION", canales: SOLO_APP }),
          personas: [usuario("inf")],
        },
      ],
      motivos,
      "ABRIR",
    );
    const mat = lotes.find((l) => l.persona.clave === "u:mat");
    const inf = lotes.find((l) => l.persona.clave === "u:inf");
    expect(mat?.motivos.map((m) => m.uid)).toEqual([1, 2]);
    expect(inf?.motivos.map((m) => m.uid)).toEqual([3]);
  });

  it("quien esperaba MATERIALES tambien se entera de que la tarea quedo lista", () => {
    // Filtrarlo por flujo significaria que solo se entera quien responde del
    // ultimo flujo levantado, que es justo el que ya lo sabia.
    const lotes = repartirAvisos(
      [
        {
          suscripcion: suscripcion({
            tipo: "MATERIALES",
            canales: SOLO_APP,
            momentos: { ...TODOS_MOMENTOS, alQuedarLista: true },
          }),
          personas: [usuario("u1")],
        },
      ],
      [motivo(7, "INFORMACION")],
      "LISTA",
    );
    expect(lotes).toHaveLength(1);
    expect(lotes[0]?.motivos.map((m) => m.uid)).toEqual([7]);
  });

  it("una suscripcion que no pidio ese momento no reparte nada", () => {
    const lotes = repartirAvisos(
      [
        {
          suscripcion: suscripcion({
            momentos: { ...TODOS_MOMENTOS, alQuedarLista: false },
          }),
          personas: [usuario("u1")],
        },
      ],
      motivos,
      "LISTA",
    );
    expect(lotes).toEqual([]);
  });

  it("un rol sin nadie asignado no revienta ni produce lotes", () => {
    const lotes = repartirAvisos(
      [{ suscripcion: suscripcion({ userId: null, rol: "RESIDENTE" }), personas: [] }],
      motivos,
      "ABRIR",
    );
    expect(lotes).toEqual([]);
  });

  it("quien no tiene por donde recibir no aparece: no se promete un aviso que no llega", () => {
    const nadie = externo("c1", { email: null, celular: null });
    const lotes = repartirAvisos(
      [{ suscripcion: suscripcion({ userId: null, contactoId: "c1" }), personas: [nadie] }],
      motivos,
      "ABRIR",
    );
    expect(lotes).toEqual([]);
  });

  it("lo mas antiguo va primero: es lo que arde", () => {
    const lotes = repartirAvisos(
      [{ suscripcion: suscripcion({ canales: SOLO_APP }), personas: [usuario("u1")] }],
      [motivo(1, "MATERIALES", 2), motivo(2, "ESPACIO", 9)],
      "RECORDAR",
    );
    expect(lotes[0]?.motivos.map((m) => m.diasAbierta)).toEqual([9, 2]);
  });
});

describe("diasEntre y tocaRecordar", () => {
  it("cuenta dias de calendario, sin mirar la hora", () => {
    expect(diasEntre(d("2026-08-01"), d("2026-08-04"))).toBe(3);
    expect(
      diasEntre(new Date("2026-08-01T23:59:00"), new Date("2026-08-02T00:01:00")),
    ).toBe(1);
  });

  it("insiste cada N dias, no todos los dias a partir del N", () => {
    // Un recordatorio diario se ignora a la semana y molesta desde el segundo.
    expect(tocaRecordar(3, 3)).toBe(true);
    expect(tocaRecordar(4, 3)).toBe(false);
    expect(tocaRecordar(5, 3)).toBe(false);
    expect(tocaRecordar(6, 3)).toBe(true);
  });

  it("el dia cero no toca nunca: de eso avisa la apertura", () => {
    expect(tocaRecordar(0, 3)).toBe(false);
  });

  it("un umbral absurdo no divide por cero", () => {
    expect(tocaRecordar(5, 0)).toBe(false);
  });
});

describe("esEstreno", () => {
  it("una obra recien configurada NO dispara la historia de golpe", () => {
    // Sin esto, la primera pasada sobre una obra con cuarenta restricciones
    // viejas manda cuarenta recordatorios y el usuario lo apaga el primer dia.
    expect(esEstreno(d("2026-08-10"), d("2026-08-11"), 3)).toBe(true);
  });

  it("pasado un ciclo entero, ya insiste", () => {
    expect(esEstreno(d("2026-08-08"), d("2026-08-11"), 3)).toBe(false);
  });
});

describe("claveDeAviso", () => {
  it("la misma restriccion y la misma persona dan la misma clave", () => {
    // Es lo unico que impide que dos pasadas solapadas manden dos veces.
    const a = claveDeAviso("ABRIR", "r1", "u:u1");
    const b = claveDeAviso("ABRIR", "r1", "u:u1");
    expect(a).toBe(b);
  });

  it("lo repetible lleva el dia dentro; lo de una sola vez, no", () => {
    const hoy = diaDeClave(d("2026-08-11"));
    const manana = diaDeClave(d("2026-08-12"));

    expect(claveDeAviso("RECORDAR", "r1", "u:u1", hoy)).not.toBe(
      claveDeAviso("RECORDAR", "r1", "u:u1", manana),
    );
    // El de apertura ignora el dia: si lo llevara, saldria otra vez cada dia.
    expect(claveDeAviso("ABRIR", "r1", "u:u1", hoy)).toBe(
      claveDeAviso("ABRIR", "r1", "u:u1", manana),
    );
  });

  it("nunca pasa de lo que cabe en la columna", () => {
    const larga = "x".repeat(200);
    expect(claveDeAviso("RESUMEN", larga, larga, "2026-08-11").length).toBeLessThanOrEqual(120);
  });
});

describe("acotarPorTope", () => {
  const topes = { porPersonaDia: 3, porObraDia: 20, porPasada: 10 };
  const sinGastar = { porPersona: new Map<string, number>(), porObra: 0 };
  const lote = (p: Persona) => ({
    persona: p,
    canal: "SMS" as const,
    motivos: [motivo(1, "MATERIALES")],
  });

  it("lo que cabe pasa tal cual", () => {
    const r = acotarPorTope([lote(usuario("u1"))], sinGastar, topes);
    expect(r.lotes[0]?.canal).toBe("SMS");
    expect(r.degradados).toEqual([]);
  });

  it("el cuarto SMS del dia DEGRADA a correo, no se pierde", () => {
    const gastado = { porPersona: new Map([["u:u1", 3]]), porObra: 0 };
    const r = acotarPorTope([lote(usuario("u1"))], gastado, topes);
    expect(r.lotes[0]?.canal).toBe("CORREO");
    expect(r.degradados[0]?.motivo).toBe("tope-persona");
    expect(r.descartados).toEqual([]);
  });

  it("pasado el tope de la obra, tambien cae al correo", () => {
    const gastado = { porPersona: new Map<string, number>(), porObra: 20 };
    const r = acotarPorTope([lote(usuario("u1"))], gastado, topes);
    expect(r.lotes[0]?.canal).toBe("CORREO");
    expect(r.degradados[0]?.motivo).toBe("tope-obra");
  });

  it("quien no tiene correo SI se descarta, y queda el motivo", () => {
    const sinCorreo = usuario("u1", { email: null });
    const gastado = { porPersona: new Map([["u:u1", 3]]), porObra: 0 };
    const r = acotarPorTope([lote(sinCorreo)], gastado, topes);
    expect(r.lotes).toEqual([]);
    expect(r.descartados[0]).toEqual({ clave: "u:u1", motivo: "tope-persona" });
  });

  it("no duplica el correo si ya iba a recibir uno", () => {
    const p = usuario("u1");
    const gastado = { porPersona: new Map([["u:u1", 3]]), porObra: 0 };
    const r = acotarPorTope(
      [
        { persona: p, canal: "CORREO", motivos: [motivo(1, "MATERIALES")] },
        lote(p),
      ],
      gastado,
      topes,
    );
    expect(r.lotes.filter((l) => l.canal === "CORREO")).toHaveLength(1);
    expect(r.degradados).toHaveLength(1);
  });

  it("el tope de la pasada corta el resto", () => {
    const lotes = Array.from({ length: 4 }, (_, i) => lote(usuario(`u${i}`)));
    const r = acotarPorTope(lotes, sinGastar, { ...topes, porPasada: 2 });
    expect(r.lotes.filter((l) => l.canal === "SMS")).toHaveLength(2);
    expect(r.degradados).toHaveLength(2);
  });

  it("los canales que no son SMS no se tocan", () => {
    const r = acotarPorTope(
      [{ persona: usuario("u1"), canal: "APP", motivos: [motivo(1, "ESPACIO")] }],
      { porPersona: new Map([["u:u1", 99]]), porObra: 999 },
      topes,
    );
    expect(r.lotes[0]?.canal).toBe("APP");
  });
});

describe("estadoDelReloj", () => {
  const ahora = new Date("2026-08-11T18:00:00Z");

  it("null es NUNCA, y no es lo mismo que parado", () => {
    // "Nunca" significa que falta crear la linea del cron, y el consejo que
    // hay que dar es otro.
    expect(estadoDelReloj(null, ahora)).toBe("nunca");
  });

  it("hace un momento es vivo", () => {
    const hace4 = new Date(ahora.getTime() - 4 * 60_000);
    expect(estadoDelReloj(hace4, ahora)).toBe("vivo");
  });

  it("pasado el silencio, parado", () => {
    const mudo = new Date(ahora.getTime() - (RELOJ_SILENCIO_MINUTOS + 1) * 60_000);
    expect(estadoDelReloj(mudo, ahora)).toBe("parado");
  });
});

describe("siguienteLote", () => {
  const obras = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("sin cursor empieza por el principio", () => {
    const r = siguienteLote(obras, null, 2);
    expect(r.lote.map((o) => o.id)).toEqual(["a", "b"]);
    expect(r.siguiente).toBe("b");
  });

  it("sigue por donde iba", () => {
    expect(siguienteLote(obras, "b", 2).lote.map((o) => o.id)).toEqual(["c", "d"]);
  });

  it("da la vuelta al llegar al final", () => {
    expect(siguienteLote(obras, "d", 2).lote.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("un cursor que ya no existe empieza por el principio en vez de colgarse", () => {
    // La obra se borro. Sin esto el reloj se quedaria parado sin que nadie lo
    // notara, que es el peor fallo posible en algo que avisa.
    expect(siguienteLote(obras, "zzz", 2).lote.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("sin obras no revienta", () => {
    expect(siguienteLote([], null, 5)).toEqual({ lote: [], siguiente: null });
  });

  it("pedir mas de las que hay no repite ninguna", () => {
    const r = siguienteLote(obras, null, 10);
    expect(new Set(r.lote.map((o) => o.id)).size).toBe(4);
  });
});

describe("validarContacto", () => {
  const vacio = { nombre: "", empresa: "", cargo: "", celular: "", email: "" };

  it("sin nombre no vale", () => {
    expect(validarContacto({ ...vacio, email: "a@b.pe" }).ok).toBe(false);
  });

  it("SIN NINGUN contacto no vale: seria una fila muerta", () => {
    const r = validarContacto({ ...vacio, nombre: "Juan" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("al menos");
  });

  it("con solo correo vale", () => {
    const r = validarContacto({ ...vacio, nombre: "Juan", email: "J@Obra.PE " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos.email).toBe("j@obra.pe");
  });

  it("normaliza el celular a nueve cifras", () => {
    const r = validarContacto({ ...vacio, nombre: "Juan", celular: "+51 987 654 321" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos.celular).toBe("987654321");
  });

  it("un celular que no es peruano se rechaza en vez de guardarse", () => {
    // `enviarSms` espera nueve cifras: guardar basura es mandar el SMS a
    // ninguna parte y pagarlo.
    expect(validarContacto({ ...vacio, nombre: "Juan", celular: "123" }).ok).toBe(false);
  });
});

describe("validarSuscripcion", () => {
  const base = { canales: TODOS_CANALES, momentos: TODOS_MOMENTOS };

  it("hace falta un sujeto", () => {
    expect(validarSuscripcion(base).ok).toBe(false);
  });

  it("DOS sujetos a la vez no significan nada", () => {
    const r = validarSuscripcion({ ...base, userId: "u1", rol: "RESIDENTE" });
    expect(r.ok).toBe(false);
  });

  it("hace falta al menos un canal", () => {
    const r = validarSuscripcion({
      ...base,
      userId: "u1",
      canales: { app: false, correo: false, sms: false },
    });
    expect(r.ok).toBe(false);
  });

  it("hace falta al menos un momento", () => {
    const r = validarSuscripcion({
      ...base,
      userId: "u1",
      momentos: { alAbrir: false, alRecordar: false, alQuedarLista: false, enResumen: false },
    });
    expect(r.ok).toBe(false);
  });

  it("con un sujeto, un canal y un momento, vale", () => {
    expect(validarSuscripcion({ ...base, contactoId: "c1" }).ok).toBe(true);
  });
});

describe("los textos", () => {
  it("flujosDe respeta el orden de la matriz y no repite", () => {
    const f = flujosDe([
      motivo(1, "SEGURIDAD"),
      motivo(2, "INFORMACION"),
      motivo(3, "INFORMACION"),
    ]);
    expect(f).toEqual(["Informacion", "Seguridad"]);
  });

  it("tareasDe cuenta tareas, no restricciones", () => {
    expect(tareasDe([motivo(1, "MATERIALES"), motivo(1, "ESPACIO")])).toBe(1);
  });

  it("recortar no parte una palabra por la mitad", () => {
    expect(recortar("EDIFICIO MULTIFAMILIAR CRIOCORD", 20)).toBe("EDIFICIO…");
  });

  it("recortar deja el texto corto en paz", () => {
    expect(recortar("CRIOCORD", 40)).toBe("CRIOCORD");
  });

  it("el SMS cabe en 160 caracteres con la obra mas larga posible", () => {
    // Un SMS que se pasa se parte en dos, que se cobran dos y llegan
    // desordenados.
    const obra = "O".repeat(255);
    const muchos = Array.from({ length: 40 }, (_, i) =>
      motivo(i, i % 2 === 0 ? "MATERIALES" : "INFORMACION"),
    );
    expect(textoAvisoSms(obra, muchos).length).toBeLessThanOrEqual(LIMITE_SMS);
  });

  it("el SMS nunca lleva un enlace: las operadoras lo marcan como spam", () => {
    const texto = textoAvisoSms("CRIOCORD", [motivo(1, "MATERIALES")]);
    expect(texto).not.toMatch(/https?:|www\.|\.com|\.pe\//);
  });

  it("el SMS concuerda en singular y en plural", () => {
    expect(textoAvisoSms("OBRA", [motivo(1, "MATERIALES")])).toContain("1 tarea espera");
    expect(
      textoAvisoSms("OBRA", [motivo(1, "MATERIALES"), motivo(2, "ESPACIO")]),
    ).toContain("2 tareas esperan");
  });

  it("cada aviso dice la CONSECUENCIA, no solo el hecho", () => {
    for (const evento of ["ABRIR", "RECORDAR", "LISTA", "RESUMEN"] as const) {
      const t = textoAviso(evento, [motivo(1, "MATERIALES", 5)]);
      expect(t.titulo.length).toBeGreaterThan(0);
      expect(t.cuerpo.length).toBeGreaterThan(30);
    }
  });

  it("el recordatorio dice cuantos dias lleva la mas antigua", () => {
    const t = textoAviso("RECORDAR", [
      motivo(1, "MATERIALES", 2),
      motivo(2, "ESPACIO", 9),
    ]);
    expect(t.cuerpo).toContain("9 días");
  });

  it("el titulo y el cuerpo caben en sus columnas", () => {
    const muchos = Array.from({ length: 50 }, (_, i) => motivo(i, "MATERIALES", i));
    const t = textoAviso("RECORDAR", muchos);
    expect(t.titulo.length).toBeLessThanOrEqual(200);
    expect(t.cuerpo.length).toBeLessThanOrEqual(400);
  });
});
