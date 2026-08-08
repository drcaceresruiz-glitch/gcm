import { describe, it, expect } from "vitest";
import { analizarProjectXml } from "./msproject-xml";

/**
 * Los cronogramas reales de CRIOCORD no estan en el repositorio —es publico y
 * son documentos del cliente—, asi que cada patologia se reproduce aqui en un
 * XML minimo, igual que `excel-presupuesto.test.ts` construye sus libros.
 *
 * Las cifras que aparecen en los comentarios estan tomadas de los dos cortes
 * reales (02 y 09 de agosto de 2026) y del informe semanal que el cliente ya
 * emite: son la medida de si el lector acierta.
 */

interface TareaFalsa {
  uid: number;
  id?: number;
  nombre: string;
  nivel?: number;
  inicio?: string;
  fin?: string;
  /// Duracion ISO tal como la escribe MSPDI. Por defecto, un dia de 8 horas.
  duracion?: string;
  /// Valor del campo personalizado "% Planeado". `null` para no escribirlo.
  planeado?: string | null;
  completado?: string;
  resumen?: boolean;
  hito?: boolean;
  critico?: boolean;
  /// Holgura en decimas de minuto. `null` para omitir la etiqueta, que es lo
  /// que hace MS Project cuando vale cero.
  holgura?: string | null;
  predecesoras?: { uid: number; tipo?: string; lag?: string }[];
  /// XML suelto que se inserta dentro de la tarea.
  extra?: string;
}

interface Opciones {
  titulo?: string;
  fechaCorte?: string | null;
  inicio?: string;
  fin?: string;
  minutosPorDia?: string | null;
  /// Nombre del campo personalizado. En un Project en espanol es "Texto1".
  nombreCampo?: string;
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function tareaXml(t: TareaFalsa): string {
  const partes = [
    `<UID>${t.uid}</UID>`,
    `<ID>${t.id ?? t.uid}</ID>`,
    `<Name>${escapar(t.nombre)}</Name>`,
    `<OutlineLevel>${t.nivel ?? 1}</OutlineLevel>`,
    // El WBS lleva la numeracion interna de Project y NUNCA el codigo del
    // informe: aqui se escribe distinto a proposito para que se note si
    // alguien lo usa por error.
    `<WBS>9.9.9</WBS>`,
    `<Start>${t.inicio ?? "2026-08-01"}T15:00:00</Start>`,
    `<Finish>${t.fin ?? "2026-08-01"}T17:00:00</Finish>`,
    `<Duration>${t.duracion ?? "PT8H0M0S"}</Duration>`,
    // Vale 7 en todos los archivos reales. Las tablas que circulan lo
    // traducen por "meses": el lector debe ignorarlo.
    `<DurationFormat>7</DurationFormat>`,
    `<Summary>${t.resumen ? 1 : 0}</Summary>`,
    `<Milestone>${t.hito ? 1 : 0}</Milestone>`,
    `<Critical>${t.critico ? 1 : 0}</Critical>`,
    `<PercentComplete>${t.completado ?? "0"}</PercentComplete>`,
  ];

  if (t.holgura !== null) partes.push(`<TotalSlack>${t.holgura ?? "0"}</TotalSlack>`);

  for (const p of t.predecesoras ?? []) {
    partes.push(
      `<PredecessorLink><PredecessorUID>${p.uid}</PredecessorUID>` +
        `<Type>${p.tipo ?? "1"}</Type><LinkLag>${p.lag ?? "0"}</LinkLag>` +
        `<LagFormat>7</LagFormat></PredecessorLink>`,
    );
  }

  if (t.planeado !== null) {
    partes.push(
      `<ExtendedAttribute><FieldID>188743731</FieldID>` +
        `<Value>${t.planeado ?? "0%"}</Value></ExtendedAttribute>`,
    );
  }

  if (t.extra) partes.push(t.extra);

  return `<Task>${partes.join("")}</Task>`;
}

function construirXml(tareas: TareaFalsa[], o: Opciones = {}): ArrayBuffer {
  const corte =
    o.fechaCorte === null ? "" : `<StatusDate>${o.fechaCorte ?? "2026-08-08"}T19:00:00</StatusDate>`;

  const jornada =
    o.minutosPorDia === null ? "" : `<MinutesPerDay>${o.minutosPorDia ?? "480"}</MinutesPerDay>`;

  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Project xmlns="http://schemas.microsoft.com/project">` +
    `<Title>${escapar(o.titulo ?? "PROGRAMACION EP 2026.08.09")}</Title>` +
    `<LastSaved>2026-08-08T10:37:00</LastSaved>` +
    `<CurrentDate>2026-08-08T16:36:58</CurrentDate>` +
    corte +
    `<StartDate>${o.inicio ?? "2026-08-01"}T15:00:00</StartDate>` +
    `<FinishDate>${o.fin ?? "2026-10-05"}T11:00:00</FinishDate>` +
    jornada +
    `<ExtendedAttributes><ExtendedAttribute>` +
    `<FieldID>188743731</FieldID><FieldName>${o.nombreCampo ?? "Text1"}</FieldName>` +
    `<Alias>% Planeado</Alias></ExtendedAttribute></ExtendedAttributes>` +
    `<Tasks>${tareas.map(tareaXml).join("")}</Tasks>` +
    `</Project>`;

  return aBuffer(xml);
}

function aBuffer(texto: string): ArrayBuffer {
  return new TextEncoder().encode(texto).buffer as ArrayBuffer;
}

/** La fila 0 del archivo: el proyecto entero. Se descarta al importar. */
const FILA_PROYECTO: TareaFalsa = {
  uid: 0,
  id: 0,
  nombre: "PROGRAMACION EP 2026.08.09",
  nivel: 0,
  duracion: "PT408H0M0S",
  resumen: true,
  fin: "2026-10-05",
};

describe("analizarProjectXml", () => {
  it("toma la fecha del corte de StatusDate y no de cuando se guardo", async () => {
    // Hay dos exports del mismo corte guardados con cinco horas de
    // diferencia. Identificarlos por `LastSaved` o `CurrentDate` los daria
    // por cortes distintos y duplicaria la version del cronograma.
    const r = await analizarProjectXml(
      construirXml([FILA_PROYECTO, { uid: 2, nombre: "1.1 Trazo", nivel: 1 }]),
    );

    expect(r.errores).toHaveLength(0);
    expect(r.fechaCorte).toBe("2026-08-08");
    expect(r.minutosPorDia).toBe(480);
  });

  it("descarta la fila del proyecto por su nivel de esquema, nunca por su texto", async () => {
    // El nombre de esa fila lleva la fecha y cambia cada semana. En el
    // archivo real hay 108 filas y se importan 107.
    const r = await analizarProjectXml(
      construirXml([
        FILA_PROYECTO,
        { uid: 2, nombre: "PROYECTO: Laboratorio Criocord", nivel: 1 },
        { uid: 81, nombre: "0.0 HITOS CLAVE DEL PROYECTO", nivel: 2, resumen: true },
      ]),
    );

    expect(r.totalTareas).toBe(2);
    expect(r.filasOmitidas).toBe(1);
    expect(r.tareas.some((t) => t.uid === 0)).toBe(false);
    // De la fila descartada si se aprovecha el plazo, que el archivo ya trae.
    expect(r.duracionDias).toBe("51.00");
  });

  it("saca el codigo del principio del nombre, no de <WBS>", async () => {
    // En el archivo real la partida "4.4" tiene <WBS>1.5.4</WBS>. Tomar el
    // codigo de ahi imprimiria una numeracion que el informe no usa.
    const r = await analizarProjectXml(
      construirXml([{ uid: 109, nombre: "4.4 Solados para zapatas y acero corrugado" }]),
    );

    expect(r.tareas[0]?.codigo).toBe("4.4");
    expect(r.tareas[0]?.nombre).toBe("Solados para zapatas y acero corrugado");
  });

  it("deja sin codigo la fila cuyo nombre no lo trae", async () => {
    const r = await analizarProjectXml(
      construirXml([{ uid: 2, nombre: "PROYECTO: Laboratorio Criocord - Megacentro Lurin" }]),
    );

    expect(r.tareas[0]?.codigo).toBeNull();
    expect(r.tareas[0]?.nombre).toBe("PROYECTO: Laboratorio Criocord - Megacentro Lurin");
  });

  it("no convierte el codigo 0.0 en el numero cero", async () => {
    // Si el analizador interpreta los textos como numeros, "0.0" se vuelve 0
    // y el capitulo de hitos pierde su codigo.
    const r = await analizarProjectXml(
      construirXml([{ uid: 81, nombre: "0.0 HITOS CLAVE DEL PROYECTO", resumen: true }]),
    );

    expect(r.tareas[0]?.codigo).toBe("0.0");
  });

  it("respeta el nivel del esquema aunque el codigo sugiera otra cosa", async () => {
    // Caso real: "7.3.1" (UID 197) es HERMANA de "7.3" (UID 126), las dos en
    // el nivel 3, y "7.3" ni siquiera es una tarea resumen. Deducir la
    // jerarquia del codigo colgaria una de la otra y perderia las 26
    // partidas que el archivo tiene en el nivel 4.
    const r = await analizarProjectXml(
      construirXml([
        { uid: 2, nombre: "PROYECTO: Laboratorio Criocord", nivel: 1, resumen: true },
        { uid: 123, nombre: "7.0 INSTALACIONES SANITARIAS", nivel: 2, resumen: true },
        { uid: 126, nombre: "7.3 Conexiones de TRONCAL principal desague", nivel: 3 },
        { uid: 197, nombre: "7.3.1 Conexiones de agua y desague general", nivel: 3 },
        { uid: 127, nombre: "7.4 Empalme para conexion al segundo piso", nivel: 3 },
      ]),
    );

    expect(r.errores).toHaveLength(0);
    expect(r.tareas.every((t) => t.aviso === undefined)).toBe(true);

    const sanitarias = r.tareas.filter((t) => !t.esResumen);
    expect(sanitarias.map((t) => t.codigo)).toEqual(["7.3", "7.3.1", "7.4"]);
    // Las tres en el mismo nivel: "7.3.1" no cuelga de "7.3", que ademas ni
    // siquiera es una tarea resumen pese a que su codigo lo aparente.
    expect(sanitarias.map((t) => t.nivel)).toEqual([3, 3, 3]);
    expect(r.totalResumen).toBe(2);
  });
});

describe("analizarProjectXml: porcentajes", () => {
  it("lee el % planeado del campo personalizado, no lo calcula", async () => {
    // Es la comprobacion que decide el modulo entero. En el corte del 08/08
    // el informe del cliente imprime estas cuatro filas asi, y ninguna se
    // explica con un reparto lineal: la partida 4.4 dura un dia, va del 07
    // al 10 de agosto y marca 83%.
    const r = await analizarProjectXml(
      construirXml([
        { uid: 104, id: 25, nombre: "3.3 Eliminacion de material excedente", planeado: "63%", completado: "100" },
        { uid: 109, id: 30, nombre: "4.4 Solados para zapatas", planeado: "83%", completado: "30" },
        { uid: 125, id: 46, nombre: "7.2 Nivelacion cama de arena", planeado: "88%", completado: "100" },
        { uid: 126, id: 47, nombre: "7.3 Conexiones de TRONCAL principal", planeado: "81%", completado: "81" },
      ]),
    );

    expect(r.tareas.map((t) => [t.porcentajePlaneado, t.porcentajeArchivo])).toEqual([
      ["63.00", "100.00"],
      ["83.00", "30.00"],
      ["88.00", "100.00"],
      ["81.00", "81.00"],
    ]);
  });

  it("busca el campo por identificador y no por su nombre traducido", async () => {
    // Los dos exports del mismo corte llaman al campo "Text1" y "Texto1"
    // segun el idioma del Project que los guardo. Buscarlo por nombre habria
    // funcionado en pruebas y dejado el plan entero a cero en la maquina del
    // planificador, sin un solo error.
    const r = await analizarProjectXml(
      construirXml([{ uid: 109, nombre: "4.4 Solados", planeado: "83%" }], {
        nombreCampo: "Texto1",
      }),
    );

    expect(r.tareas[0]?.porcentajePlaneado).toBe("83.00");
  });

  it("avisa cuando una tarea no trae % planeado y la deja en cero", async () => {
    const r = await analizarProjectXml(
      construirXml([{ uid: 40, nombre: "5.1 Partida sin planificar", planeado: null }]),
    );

    expect(r.errores).toHaveLength(0);
    expect(r.tareas[0]?.porcentajePlaneado).toBe("0.00");
    expect(r.tareas[0]?.aviso).toContain("% Planeado");
  });

  it("acota los porcentajes imposibles y deja constancia", async () => {
    const r = await analizarProjectXml(
      construirXml([{ uid: 40, nombre: "5.1 Partida", planeado: "180%", completado: "-20" }]),
    );

    expect(r.tareas[0]?.porcentajePlaneado).toBe("100.00");
    expect(r.tareas[0]?.porcentajeArchivo).toBe("0.00");
    expect(r.tareas[0]?.aviso).toContain("acota");
  });
});

describe("analizarProjectXml: duraciones, fechas y holgura", () => {
  it("saca la duracion de <Duration> y no de restar las fechas", async () => {
    // En el calendario de CRIOCORD el sabado es laborable de cinco horas.
    // Restar las fechas falla en 68 de las 108 tareas: aqui la partida dura
    // dos dias de jornada y abarca cuatro dias naturales.
    const r = await analizarProjectXml(
      construirXml([
        {
          uid: 105,
          nombre: "3.4 Excavacion masiva",
          inicio: "2026-08-07",
          fin: "2026-08-10",
          duracion: "PT16H0M0S",
        },
      ]),
    );

    expect(r.tareas[0]?.duracionDias).toBe("2.00");
  });

  it("conserva la duracion fraccionaria que el informe imprime", async () => {
    // La partida 4.0 del archivo real dura 8,8 dias. Redondearla a 9
    // descuadraria la tabla contra el informe del cliente.
    const r = await analizarProjectXml(
      construirXml([{ uid: 105, nombre: "4.0 ESTRUCTURAS", duracion: "PT70H24M0S" }]),
    );

    expect(r.tareas[0]?.duracionDias).toBe("8.80");
  });

  it("no toma las fechas como instantes: no corre el cronograma un dia", async () => {
    // Las fechas del archivo llevan hora ("2026-08-01T15:00:00"). Pasarlas
    // por Date en un servidor en UTC y formatearlas en horario de Lima
    // retrocede cinco horas y convierte el 01/08 en el 31/07.
    const r = await analizarProjectXml(
      construirXml([{ uid: 82, nombre: "0.1 Inicio de obra", inicio: "2026-08-01", fin: "2026-08-01" }]),
    );

    expect(r.tareas[0]?.inicio).toBe("2026-08-01");
    expect(r.tareas[0]?.fin).toBe("2026-08-01");
  });

  it("marca la holgura ausente en vez de confundirla con holgura cero", async () => {
    // MSPDI omite <TotalSlack> cuando vale cero: en el corte del 08/08 falta
    // en 43 de las 107 tareas.
    const r = await analizarProjectXml(
      construirXml([
        { uid: 83, nombre: "0.2 Fin de preliminares", holgura: "216000" },
        { uid: 84, nombre: "0.3 Fin de cimentaciones", holgura: null },
      ]),
    );

    // 216000 decimas de minuto entre una jornada de 480 minutos: 45 dias.
    expect(r.tareas[0]?.holguraDias).toBe("45.00");
    expect(r.tareas[0]?.holguraInferida).toBe(false);

    expect(r.tareas[1]?.holguraDias).toBe("0.00");
    expect(r.tareas[1]?.holguraInferida).toBe(true);
    expect(r.holgurasInferidas).toBe(1);
  });

  it("toma la ruta critica del archivo y no de la holgura", async () => {
    // El archivo real tiene 18 tareas con holgura cero que no son criticas.
    const r = await analizarProjectXml(
      construirXml([
        { uid: 10, nombre: "1.1 Critica", critico: true, holgura: "0" },
        { uid: 11, nombre: "1.2 Con holgura cero pero no critica", critico: false, holgura: "0" },
      ]),
    );

    expect(r.tareas.map((t) => t.esCritico)).toEqual([true, false]);
    expect(r.totalCriticas).toBe(1);
  });

  it("distingue los hitos por <Milestone>", async () => {
    const r = await analizarProjectXml(
      construirXml([
        { uid: 82, nombre: "0.1 Inicio de Obra", hito: true, duracion: "PT0H0M0S" },
        { uid: 90, nombre: "1.1 Trazo y replanteo" },
      ]),
    );

    expect(r.totalHitos).toBe(1);
    expect(r.tareas[0]?.esHito).toBe(true);
    expect(r.tareas[0]?.duracionDias).toBe("0.00");
  });
});

describe("analizarProjectXml: dependencias", () => {
  it("traduce los cuatro tipos de enlace de MSPDI", async () => {
    // Hoy el archivo solo trae FC y un CC, pero el mapeo va completo: un
    // enlace mal tipado desplaza fechas sin dar ningun sintoma.
    const r = await analizarProjectXml(
      construirXml([
        { uid: 1, nombre: "1.1 Origen" },
        { uid: 2, nombre: "1.2 Fin-fin", predecesoras: [{ uid: 1, tipo: "0" }] },
        { uid: 3, nombre: "1.3 Fin-comienzo", predecesoras: [{ uid: 1, tipo: "1" }] },
        { uid: 4, nombre: "1.4 Comienzo-fin", predecesoras: [{ uid: 1, tipo: "2" }] },
        { uid: 5, nombre: "1.5 Comienzo-comienzo", predecesoras: [{ uid: 1, tipo: "3" }] },
      ]),
    );

    expect(r.dependencias.map((d) => d.tipo)).toEqual(["FF", "FC", "CF", "CC"]);
  });

  it("convierte el desfase de decimas de minuto a dias, con su signo", async () => {
    // El "+3 dias" que imprime el informe viaja en el archivo como 14400, y
    // el "-5 dias" como -24000. Tomarlos por minutos o por dias moveria los
    // enlaces sin que nada lo delate.
    const r = await analizarProjectXml(
      construirXml([
        { uid: 1, nombre: "1.1 Origen" },
        { uid: 2, nombre: "1.2 Con adelanto", predecesoras: [{ uid: 1, lag: "14400" }] },
        { uid: 3, nombre: "1.3 Con solape", predecesoras: [{ uid: 1, lag: "-24000" }] },
        { uid: 4, nombre: "1.4 Sin desfase", predecesoras: [{ uid: 1 }] },
      ]),
    );

    expect(r.dependencias.map((d) => d.desfaseDias)).toEqual(["3.00", "-5.00", "0.00"]);
  });

  it("resuelve la predecesora que aparece mas abajo en el documento", async () => {
    // Pasa en 16 de los 76 enlaces del archivo real. Resolver en una sola
    // pasada los daria por inexistentes y borraria la quinta parte de la red.
    const r = await analizarProjectXml(
      construirXml([
        { uid: 2, nombre: "1.2 Depende de una que viene despues", predecesoras: [{ uid: 9 }] },
        { uid: 9, nombre: "1.9 La predecesora" },
      ]),
    );

    expect(r.dependencias).toHaveLength(1);
    expect(r.dependenciasDescartadas).toBe(0);
  });

  it("descarta en silencio el enlace hacia una tarea que no esta", async () => {
    // Guardarlo pintaria una flecha hacia ninguna parte. Se cuenta, pero no
    // se convierte en error: un listado ruidoso ensena a ignorarlo.
    const r = await analizarProjectXml(
      construirXml([{ uid: 2, nombre: "1.2 Huerfana", predecesoras: [{ uid: 999 }, { uid: 2 }] }]),
    );

    expect(r.errores).toHaveLength(0);
    expect(r.dependencias).toHaveLength(0);
    expect(r.dependenciasDescartadas).toBe(2);
  });
});

describe("analizarProjectXml: archivos defectuosos", () => {
  it("descarta la tarea con el UID repetido y explica cual era", async () => {
    // El UID es el ancla del avance: dos tareas con el mismo se pisarian los
    // reportes de obra.
    const r = await analizarProjectXml(
      construirXml([
        { uid: 7, id: 3, nombre: "1.1 Primera" },
        { uid: 7, id: 8, nombre: "1.2 Repetida" },
      ]),
    );

    expect(r.tareas).toHaveLength(1);
    expect(r.errores[0]?.mensaje).toContain("ya aparece en la fila 3");
  });

  it("descarta la tarea sin UID y la que no trae fechas legibles", async () => {
    const xml =
      `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project">` +
      `<StatusDate>2026-08-08T19:00:00</StatusDate><MinutesPerDay>480</MinutesPerDay><Tasks>` +
      `<Task><ID>4</ID><Name>1.1 Sin UID</Name><OutlineLevel>1</OutlineLevel>` +
      `<Start>2026-08-01T15:00:00</Start><Finish>2026-08-01T17:00:00</Finish></Task>` +
      `<Task><UID>5</UID><ID>5</ID><Name>1.2 Sin fechas</Name><OutlineLevel>1</OutlineLevel></Task>` +
      `<Task><UID>6</UID><ID>6</ID><Name>1.3 Buena</Name><OutlineLevel>1</OutlineLevel>` +
      `<Start>2026-08-01T15:00:00</Start><Finish>2026-08-01T17:00:00</Finish>` +
      `<Duration>PT8H0M0S</Duration></Task>` +
      `</Tasks></Project>`;

    const r = await analizarProjectXml(new TextEncoder().encode(xml).buffer as ArrayBuffer);

    expect(r.tareas).toHaveLength(1);
    expect(r.tareas[0]?.uid).toBe(6);
    expect(r.errores).toHaveLength(2);
    expect(r.errores[0]?.mensaje).toContain("<UID>");
    expect(r.errores[1]?.mensaje).toContain("fechas");
  });

  it("sigue devolviendo una lista cuando el cronograma tiene una sola tarea", async () => {
    // Con un unico <Task> un analizador XML devuelve un objeto y no una
    // lista. Sin forzarlo, el cronograma quedaria vacio sin dar error.
    const r = await analizarProjectXml(construirXml([{ uid: 3, nombre: "1.1 Unica" }]));

    expect(r.tareas).toHaveLength(1);
    expect(r.tareas[0]?.uid).toBe(3);
  });

  it("rechaza el archivo que declara un DOCTYPE", async () => {
    // Un MSPDI legitimo no lo lleva, y las entidades expandidas convierten
    // unos kilobytes en gigabytes de memoria al abrirlos.
    const xml =
      `<?xml version="1.0"?><!DOCTYPE Project [<!ENTITY a "aaaa">]>` +
      `<Project xmlns="http://schemas.microsoft.com/project"><Tasks></Tasks></Project>`;

    const r = await analizarProjectXml(new TextEncoder().encode(xml).buffer as ArrayBuffer);

    expect(r.tareas).toHaveLength(0);
    expect(r.errores[0]?.mensaje).toContain("DOCTYPE");
  });

  it("explica sin dar detalles tecnicos que el archivo no es un cronograma", async () => {
    // Un archivo corrupto no debe revelar nada de la libreria ni del
    // servidor.
    const otro = new TextEncoder().encode(
      `<?xml version="1.0"?><workbook><sheet/></workbook>`,
    ).buffer as ArrayBuffer;

    const r = await analizarProjectXml(otro);

    expect(r.errores[0]?.mensaje).toContain("<Project>");
    expect(r.errores[0]?.mensaje).not.toMatch(/parser|xml-parser|at line/i);
  });

  it("avisa cuando el cronograma no tiene ninguna tarea", async () => {
    const r = await analizarProjectXml(construirXml([]));

    expect(r.errores[0]?.mensaje).toContain("ninguna tarea");
  });

  it("lee el archivo guardado en UTF-16", async () => {
    // MS Project tambien guarda el MSPDI en UTF-16. Leerlo como UTF-8 no
    // falla: devuelve un documento ilegible, que es peor que fallar.
    const xml =
      `<?xml version="1.0" encoding="UTF-16"?>` +
      `<Project xmlns="http://schemas.microsoft.com/project">` +
      `<StatusDate>2026-08-08T19:00:00</StatusDate><MinutesPerDay>480</MinutesPerDay><Tasks>` +
      `<Task><UID>3</UID><ID>3</ID><Name>1.1 Trazo</Name><OutlineLevel>1</OutlineLevel>` +
      `<Start>2026-08-01T15:00:00</Start><Finish>2026-08-01T17:00:00</Finish>` +
      `<Duration>PT8H0M0S</Duration></Task></Tasks></Project>`;

    const bytes = new Uint8Array(2 + xml.length * 2);
    const vista = new DataView(bytes.buffer);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (let i = 0; i < xml.length; i++) vista.setUint16(2 + i * 2, xml.charCodeAt(i), true);

    const r = await analizarProjectXml(bytes.buffer);

    expect(r.errores).toHaveLength(0);
    expect(r.tareas[0]?.codigo).toBe("1.1");
  });

  it("usa la jornada estandar si el archivo no declara los minutos por dia", async () => {
    const r = await analizarProjectXml(
      construirXml([{ uid: 3, nombre: "1.1 Trazo", duracion: "PT8H0M0S" }], {
        minutosPorDia: null,
      }),
    );

    expect(r.minutosPorDia).toBe(480);
    expect(r.tareas[0]?.duracionDias).toBe("1.00");
  });

  it("toma el nombre de la obra de la primera fila real y no del titulo", async () => {
    // El <Title> lleva la fecha del corte: cambiaria cada semana.
    const r = await analizarProjectXml(
      construirXml(
        [FILA_PROYECTO, { uid: 2, nombre: "PROYECTO: Laboratorio Criocord - Megacentro Lurin", nivel: 1 }],
        { titulo: "PROGRAMACION EP 2026.08.09" },
      ),
    );

    expect(r.nombreProyecto).toBe("PROYECTO: Laboratorio Criocord - Megacentro Lurin");
  });
});
