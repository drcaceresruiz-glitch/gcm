import type { CausaNoCumplimiento } from "@/generated/prisma/enums";
import type { CeldaCsv } from "./csv";
import {
  capitulosDelInforme,
  type AlertaAtraso,
  type Capitulo,
  type PartidaActiva,
} from "./control-avance";
import { ETIQUETA_CNC, type FilaPareto, type PuntoPpc } from "./plan-semanal";
import type { PuntoDiario } from "./curva-s";

/**
 * El informe al corte, en filas de hoja de calculo.
 *
 * Es EL MISMO contenido que la pantalla imprime, no un resumen: quien descarga
 * el archivo lo hace para cruzarlo con lo suyo —una valorizacion, un cuadro de
 * la constructora, el Excel del cliente— y un extracto obligaria a volver a la
 * pantalla a copiar a mano lo que falte. Por eso van tambien las alertas, la
 * curva y el Last Planner, que son las tablas que nadie quiere teclear.
 *
 * La entrada es, a proposito, la MISMA forma que recibe `InformeSemanal`: el
 * archivo y el papel salen del mismo objeto, asi que no pueden decir cosas
 * distintas. Si algun dia la pantalla cambia de datos, el compilador obliga a
 * mirar aqui.
 *
 * LAS FECHAS SE LEEN EN UTC. Las del cronograma son `@db.Date`, o sea
 * medianoche UTC, y leerlas con `getDate()` en Peru (UTC-5) devuelve el dia
 * anterior. Es el mismo motivo por el que `parte-diario.ts` cuenta dias en
 * UTC, y hay que mantenerlo hasta que se arregle `calendario.ts`.
 */

/// Lo que se usa de la curva. Se declara aqui y no se importa de
/// `cronograma.service` porque ese modulo es `server-only` y esto es logica
/// pura que se prueba sin servidor.
export interface CurvaCsv {
  /// El plan dia a dia, de donde sale el planeado de cada semana.
  plan: readonly PuntoDiario[];
  /// El real muestreado por semana: la cadencia con la que se reporta.
  realSemanal: readonly PuntoDiario[];
}

export interface PeriodoCsv {
  desde: Date | null;
  realAnterior: string;
  ganado: string;
  tareas: readonly {
    codigo: string | null;
    nombre: string;
    antes: string;
    ahora: string;
    delta: string;
  }[];
}

export interface LastPlannerCsv {
  semana: {
    numero: number;
    cerrada: boolean;
    total: number;
    cumplidos: number;
    ppc: number | null;
  } | null;
  compromisos: readonly {
    descripcion: string;
    cumplido: boolean | null;
    causa: CausaNoCumplimiento | null;
    notaCierre: string | null;
  }[];
  tendencia: readonly PuntoPpc[];
  pareto: readonly FilaPareto[];
}

export interface DatosCsvInforme {
  empresa: string;
  obra: string;
  ubicacion: string | null;
  fechaCorte: Date;
  version: number;
  importadoPor: string;
  planeadoProject: string | null;
  realProject: string | null;
  real: string;
  planeado: string;
  desviacion: string;
  periodo: PeriodoCsv;
  curva: CurvaCsv;
  capitulos: readonly Capitulo[];
  alertas: readonly AlertaAtraso[];
  activas: readonly PartidaActiva[];
  lastPlanner: LastPlannerCsv | null;
  generadoPor: string;
}

/// dd/mm/aaaa, que es como se leen las fechas en obra. En UTC, por lo que
/// explica la cabecera del modulo.
export function fechaCsv(fecha: Date): string {
  const dia = String(fecha.getUTCDate()).padStart(2, "0");
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${fecha.getUTCFullYear()}`;
}

/// Un `boolean | null` de evaluacion. El null NO es un "No": es que todavia no
/// se ha evaluado, y confundirlos convierte una semana a medio cerrar en una
/// semana con incumplimientos.
function siNoOPendiente(valor: boolean | null): string {
  if (valor === null) return "Sin evaluar";
  return valor ? "Sí" : "No";
}

const ROTULO_SEVERIDAD = { alta: "Alta", media: "Media", baja: "Baja" } as const;

/// Una linea en blanco entre bloques: es lo que deja seleccionar una tabla
/// suelta en Excel con Ctrl+Mayus+flecha sin arrastrar la de al lado.
///
/// Devuelve una fila NUEVA cada vez, y no una constante compartida: la misma
/// referencia repetida por todo el documento es una mina para el primero que
/// necesite retocar una separacion.
const vacia = (): CeldaCsv[] => [];

/**
 * Un bloque con su titulo y su cabecera.
 *
 * Cuando no hay nada que listar escribe POR QUE no lo hay en vez de dejar la
 * cabecera sola: una tabla vacia se lee como «se perdieron los datos», y aqui
 * casi siempre significa «esa semana no hubo».
 */
function bloque(
  destino: CeldaCsv[][],
  titulo: string,
  cabeceras: readonly CeldaCsv[],
  cuerpo: readonly CeldaCsv[][],
  siNoHay: string,
): void {
  destino.push(vacia(), [titulo]);
  if (cuerpo.length === 0) {
    destino.push([siNoHay]);
    return;
  }
  destino.push([...cabeceras], ...cuerpo.map((f) => [...f]));
}

/// El plan diario indexado por dia, para poder poner al lado de cada punto
/// real el planeado que le tocaba.
function planPorDia(plan: readonly PuntoDiario[]): Map<string, number> {
  const indice = new Map<string, number>();
  for (const p of plan) indice.set(p.fecha.toISOString().slice(0, 10), p.valor);
  return indice;
}

export function filasDelInformeCsv(
  d: DatosCsvInforme,
  generadoEl: Date,
): CeldaCsv[][] {
  const filas: CeldaCsv[][] = [
    ["INFORME DE OBRA AL CORTE"],
    ["Empresa", d.empresa],
    ["Obra", d.obra],
    ["Ubicación", d.ubicacion ?? ""],
    ["Fecha de corte", fechaCsv(d.fechaCorte)],
    ["Versión del cronograma", d.version],
    ["Importado por", d.importadoPor],
    ["Generado por", d.generadoPor],
    ["Generado el", fechaCsv(generadoEl)],
  ];

  resumen(filas, d);
  periodo(filas, d.periodo);
  capitulos(filas, d.capitulos);
  activas(filas, d.activas);
  alertas(filas, d.alertas);
  lastPlanner(filas, d.lastPlanner);
  curva(filas, d.curva);

  return filas;
}

function resumen(filas: CeldaCsv[][], d: DatosCsvInforme): void {
  filas.push(vacia(), ["RESUMEN"], ["Concepto", "Valor"]);
  filas.push(["Avance real (%)", d.real]);
  filas.push(["Avance planeado (%)", d.planeado]);
  filas.push(["Desviación (puntos)", d.desviacion]);

  // Los totales del propio MS Project van aparte y rotulados como suyos: son
  // para CONTRASTAR, no la cifra del informe. Solo si el archivo los trae.
  if (d.planeadoProject !== null) {
    filas.push(["Avance planeado según MS Project (%)", d.planeadoProject]);
  }
  if (d.realProject !== null) {
    filas.push(["Avance real según MS Project (%)", d.realProject]);
  }
}

function periodo(filas: CeldaCsv[][], p: PeriodoCsv): void {
  filas.push(vacia(), ["LO QUE PASÓ EN EL PERIODO"]);

  if (p.desde === null) {
    filas.push(["Es el primer informe de la obra: no hay periodo anterior."]);
    return;
  }

  filas.push(["Concepto", "Valor"]);
  filas.push(["Corte anterior", fechaCsv(p.desde)]);
  filas.push(["Avance real en el corte anterior (%)", p.realAnterior]);
  filas.push(["Ganado en el periodo (puntos)", p.ganado]);

  bloque(
    filas,
    "TAREAS QUE SE MOVIERON EN EL PERIODO",
    ["Código", "Tarea", "Antes (%)", "Ahora (%)", "Ganó (puntos)"],
    p.tareas.map((t) => [t.codigo ?? "", t.nombre, t.antes, t.ahora, t.delta]),
    "Ninguna tarea avanzó en este periodo.",
  );
}

function capitulos(filas: CeldaCsv[][], todos: readonly Capitulo[]): void {
  bloque(
    filas,
    "CAPÍTULOS",
    [
      "Código",
      "Capítulo",
      "Planeado (%)",
      "Real (%)",
      "Desviación",
      "Partidas",
      "Atrasadas",
      "Críticas",
    ],
    capitulosDelInforme(todos).map((c) => [
      c.codigo ?? "",
      c.nombre,
      c.planeado,
      c.real,
      c.desfase,
      c.hojas,
      c.atrasadas,
      c.criticas,
    ]),
    "Ningún capítulo con trabajo medible en marcha a esta fecha.",
  );
}

function activas(filas: CeldaCsv[][], partidas: readonly PartidaActiva[]): void {
  bloque(
    filas,
    "PARTIDAS ACTIVAS EN LA SEMANA DEL CORTE",
    [
      "Código",
      "Partida",
      "Inicio",
      "Fin",
      "Planeado (%)",
      "Real (%)",
      "Desviación",
      "Ruta crítica",
    ],
    partidas.map((p) => [
      p.codigo ?? "",
      p.nombre,
      fechaCsv(p.inicio),
      fechaCsv(p.fin),
      p.porcentajePlaneado,
      p.porcentajeReal,
      p.desfase,
      p.esCritico ? "Sí" : "No",
    ]),
    "Ninguna partida en marcha en la semana del corte.",
  );
}

function alertas(filas: CeldaCsv[][], avisos: readonly AlertaAtraso[]): void {
  bloque(
    filas,
    "PARTIDAS ATRASADAS",
    [
      "Código",
      "Partida",
      "Severidad",
      "Planeado (%)",
      "Real (%)",
      "Desviación",
      "Días de atraso",
      "Pendiente (puntos)",
      "Vencida",
      "Ruta crítica",
      "Motivo",
    ],
    avisos.map((a) => [
      a.codigo ?? "",
      a.nombre,
      ROTULO_SEVERIDAD[a.severidad],
      a.planeado,
      a.real,
      a.desfase,
      a.diasAtraso,
      a.pendiente,
      a.vencida ? "Sí" : "No",
      a.esCritico ? "Sí" : "No",
      a.motivo ?? "",
    ]),
    "Ninguna partida por detrás del plan a esta fecha.",
  );
}

function lastPlanner(filas: CeldaCsv[][], lp: LastPlannerCsv | null): void {
  filas.push(vacia(), ["LAST PLANNER"]);

  // Null es «quien descarga no tiene permiso de plan semanal», no «no hay
  // Last Planner». Decirlo evita que alguien concluya que la obra no lo usa.
  if (lp === null) {
    filas.push(["Sin acceso al plan semanal: este bloque no se incluye."]);
    return;
  }

  if (lp.semana === null) {
    filas.push(["Ninguna semana del plan cierra exactamente en esta fecha."]);
  } else {
    filas.push(["Concepto", "Valor"]);
    filas.push(["Semana", lp.semana.numero]);
    filas.push(["Estado", lp.semana.cerrada ? "Cerrada" : "Abierta"]);
    filas.push(["Compromisos", lp.semana.total]);
    filas.push(["Cumplidos", lp.semana.cumplidos]);
    // El PPC de una semana abierta no existe todavia: un porcentaje a medio
    // evaluar en una hoja de calculo se acaba promediando con los de verdad.
    filas.push([
      "PPC (%)",
      lp.semana.ppc ?? "Sin cerrar: todavía no hay PPC",
    ]);
  }

  bloque(
    filas,
    "COMPROMISOS DE LA SEMANA",
    ["Compromiso", "Cumplido", "Causa del incumplimiento", "Nota de cierre"],
    lp.compromisos.map((c) => [
      c.descripcion,
      siNoOPendiente(c.cumplido),
      c.causa === null ? "" : ETIQUETA_CNC[c.causa],
      c.notaCierre ?? "",
    ]),
    "No hay compromisos registrados para esta semana.",
  );

  bloque(
    filas,
    "PPC POR SEMANA (SEMANAS CERRADAS HASTA EL CORTE)",
    ["Cierre de la semana", "PPC (%)"],
    lp.tendencia.map((p) => [fechaCsv(p.fecha), p.ppc]),
    "Todavía no hay semanas cerradas.",
  );

  bloque(
    filas,
    "CAUSAS DE INCUMPLIMIENTO ACUMULADAS",
    ["Causa", "Veces"],
    lp.pareto.map((p) => [ETIQUETA_CNC[p.causa], p.conteo]),
    "Ningún compromiso incumplido hasta esta fecha.",
  );
}

/**
 * La curva S, muestreada por semana.
 *
 * Se exporta el REAL SEMANAL y no el plan dia a dia entero: el plan son cientos
 * de filas —una por dia de obra— y quien descarga esto quiere volver a dibujar
 * la curva, para lo cual le basta la cadencia con la que se reporta. A cada
 * punto real se le pone al lado el planeado de ESE dia, que es la comparacion
 * que se quiere hacer y la que si no habria que ir a buscar a mano.
 */
function curva(filas: CeldaCsv[][], c: CurvaCsv): void {
  const plan = planPorDia(c.plan);

  bloque(
    filas,
    "CURVA S",
    ["Fecha", "Planeado acumulado (%)", "Real acumulado (%)"],
    c.realSemanal.map((p) => {
      const planeado = plan.get(p.fecha.toISOString().slice(0, 10));
      return [
        fechaCsv(p.fecha),
        planeado === undefined ? "" : planeado.toFixed(2),
        p.valor.toFixed(2),
      ];
    }),
    // El motivo es la falta de REPORTES, no la de plan: una obra con
    // cronograma cargado y sin avance reportado llega aqui con `plan` lleno y
    // `realSemanal` vacio, y decir «sin plan» mandaria a mirar donde no es.
    "Todavía no hay avance reportado: la curva no tiene puntos.",
  );
}

/// Mas largo que esto el nombre no aporta y empieza a estorbar en el
/// explorador de archivos.
const MAX_NOMBRE_OBRA = 40;

/**
 * Como se llama el archivo que se descarga.
 *
 * Dos exigencias que chocan:
 *
 * - **Solo ASCII.** El nombre viaja en la cabecera `Content-Disposition`, y una
 *   tilde ahi se convierte en simbolos raros o directamente rompe la descarga
 *   en algunos navegadores. Por eso «Ampliación» sale «ampliacion».
 * - **Que ordene bien.** La fecha va en ISO —no en dd/mm— para que los
 *   informes de una obra queden en orden cronologico al ordenar la carpeta por
 *   nombre, que es como se van a acumular.
 */
export function nombreArchivoInformeCsv(obra: string, fechaCorte: Date): string {
  const limpio = obra
    .normalize("NFD")
    // Las marcas que NFD acaba de separar de su letra. Se nombran por su
    // categoria Unicode y no por un rango de caracteres literales: esos son
    // invisibles en el codigo y el primer editor que toque el archivo puede
    // llevarselos sin que nadie lo note.
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_NOMBRE_OBRA)
    .replace(/-+$/, "");

  const iso = fechaCorte.toISOString().slice(0, 10);
  return `informe-${limpio === "" ? "obra" : limpio}-${iso}.csv`;
}
