import type { CausaNoCumplimiento } from "@/generated/prisma/enums";
import { nombreDeArchivo } from "@/lib/nombre-archivo";
import type { CeldaCsv } from "./csv";
import {
  capitulosDelInforme,
  type AlertaAtraso,
  type Capitulo,
  type PartidaActiva,
  type TareaControlada,
} from "./control-avance";
import { ETIQUETA_CNC, type FilaPareto, type PuntoPpc } from "./plan-semanal";
import type { PuntoDiario } from "./curva-s";

/**
 * El informe al corte, como ESTRUCTURA: secciones, tablas y filas.
 *
 * De aqui salen las dos versiones que se llevan los datos fuera de la
 * pantalla —la hoja de calculo y el PDF—. Antes esto vivia dentro del
 * generador de CSV; al aparecer el PDF habria habido dos listas de secciones
 * que mantener en paralelo, y la primera vez que alguien anadiera un bloque a
 * una y no a la otra, el archivo y el documento firmado dejarian de decir lo
 * mismo sin que nadie se enterase.
 *
 * Aqui NO se decide como se ve nada: ni anchos, ni fuentes, ni separadores.
 * Solo QUE se dice y en que orden.
 *
 * LAS FECHAS SE LEEN EN UTC. Las del cronograma son `@db.Date`, o sea
 * medianoche UTC, y leerlas con `getDate()` en Peru (UTC-5) devuelve el dia
 * anterior. Es el mismo motivo por el que `parte-diario.ts` cuenta dias en
 * UTC, y hay que mantenerlo hasta que se arregle `calendario.ts`.
 */

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

/**
 * El dinero de la obra al corte.
 *
 * Vive aqui, con el resto de la forma del informe, y no en el servicio que lo
 * compone: quien lo dibuja es la maquetacion, y una hoja de PDF no tiene por
 * que importar nada de `services/`.
 */
export interface EconomiaDelInforme {
  /// Contra lo que se mide: la base mas los adicionales aprobados de la linea
  /// base vigente. Sale de `bacDeObra`, no del total del arbol vivo.
  presupuesto: string;
  comprometido: string;
  /**
   * `null` si la resta no se pudo hacer con datos reales.
   *
   * Es la regla del dinero de este proyecto: un importe que miente es peor que
   * no tener el importe. La hoja que lo pinta dice que falta, no escribe un
   * cero.
   */
  saldo: string | null;
  /// Sin linea base aprobada no hay adicionales que sumar, y conviene decirlo
  /// antes de que alguien compare esta cifra con la del contractual.
  conLineaBase: boolean;
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
  /**
   * Con que se pesaron las tres de arriba: "DURACION" o "DINERO".
   *
   * OPCIONAL para no romper a quien componga un documento sin el; cuando no
   * viene se asume duracion, que es lo que todo el mundo da por hecho al ver
   * un porcentaje de avance de obra. El PDF solo lo dice cuando es dinero,
   * que es la excepcion.
   */
  criterioPeso?: "DURACION" | "DINERO";
  periodo: PeriodoCsv;
  curva: CurvaCsv;
  capitulos: readonly Capitulo[];
  /**
   * El cronograma entero, para quien sepa DIBUJARLO.
   *
   * Mismo criterio que el `grafico` de una seccion: la hoja de calculo lo
   * ignora —alli las tablas por capitulo ya son el dato— y el PDF lo usa para
   * la hoja del Gantt. Opcional porque el informe se compone igual sin el.
   */
  tareas?: readonly TareaControlada[];
  alertas: readonly AlertaAtraso[];
  activas: readonly PartidaActiva[];
  lastPlanner: LastPlannerCsv | null;
  /// El dinero al corte. La hoja de calculo lo ignora; la hoja de control
  /// economica del PDF lo dibuja. `null` sin permiso de ordenes.
  economia?: EconomiaDelInforme | null;
  /**
   * DONDE se abre la brecha entre lo construido y lo comprometido.
   *
   * El revisor del diseño lo dejo anotado: la hoja de control cruzaba fisico
   * contra economico SOLO en global -«11 % de avance contra 26,3 %
   * comprometido»-, y una cifra global dice que hay un problema sin decir
   * donde ir a mirarlo. Capitulo a capitulo si lo dice.
   *
   * Opcional y anulable por lo mismo que `economia`: sin permiso de ordenes no
   * hay cifra de gasto, y un cruce con el gasto en cero no seria un cruce
   * conservador, seria uno que miente en la direccion tranquilizadora.
   */
  cruce?: readonly CapituloDeLaBrecha[] | null;
  generadoPor: string;
}

/**
 * Un capitulo del cruce fisico-economico, con lo justo para dibujarlo.
 *
 * Es un recorte de `CapituloDelCruce` a proposito: el documento no necesita
 * los subtotales ni la base medible, solo los dos porcentajes, y aceptar el
 * tipo entero ataria `lib/` a la forma que hoy tiene el servicio.
 */
export interface CapituloDeLaBrecha {
  codigo: string;
  nombre: string;
  /// 0..100 ponderado por importe. Null si no hay ninguna partida medible.
  fisico: number | null;
  /// 0..100: gastado sobre lo medible. Null por la misma razon.
  economico: number | null;
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

/**
 * Una seccion del informe.
 *
 * - `datos`: pares concepto/valor. La cabecera de portada no lleva rotulos de
 *   columna; el resto si.
 * - `tabla`: una rejilla con cabeceras. Cuando no hay filas se escribe POR QUE
 *   no las hay: una tabla vacia se lee como «se perdieron los datos», y aqui
 *   casi siempre significa «esa semana no hubo».
 * - `nota`: una frase suelta, para cuando la seccion entera no aplica.
 */
/// Una linea de un grafico: puntos en el tiempo con su valor 0..100.
export interface SerieGrafico {
  nombre: string;
  /// "plan" se dibuja sobria; "real" es la que se mira.
  papel: "plan" | "real";
  puntos: readonly { fecha: Date; valor: number }[];
}

export type SeccionInforme =
  | {
      clase: "datos";
      titulo: string;
      cabecera: readonly [string, string] | null;
      filas: readonly (readonly [string, CeldaCsv])[];
    }
  | {
      clase: "tabla";
      titulo: string;
      cabeceras: readonly string[];
      filas: readonly (readonly CeldaCsv[])[];
      siNoHay: string;
      /**
       * Los mismos datos, para quien sepa DIBUJARLOS.
       *
       * La hoja de calculo lo ignora —alli la tabla ya es el dato, y quien la
       * abra hara su propio grafico— y el PDF pinta la curva encima de la
       * tabla. Va aqui, junto a las filas de las que sale, para que no pueda
       * dibujarse una cosa y tabularse otra.
       */
      grafico?: SerieGrafico[];
    }
  | { clase: "nota"; titulo: string; texto: string };

export function documentoDelInforme(
  d: DatosCsvInforme,
  generadoEl: Date,
): SeccionInforme[] {
  return [
    portada(d, generadoEl),
    resumen(d),
    ...periodo(d.periodo),
    capitulos(d.capitulos),
    activas(d.activas),
    alertas(d.alertas),
    ...lastPlanner(d.lastPlanner),
    curva(d.curva),
  ];
}

function portada(d: DatosCsvInforme, generadoEl: Date): SeccionInforme {
  return {
    clase: "datos",
    titulo: "INFORME DE OBRA AL CORTE",
    cabecera: null,
    filas: [
      ["Empresa", d.empresa],
      ["Obra", d.obra],
      ["Ubicación", d.ubicacion ?? ""],
      ["Fecha de corte", fechaCsv(d.fechaCorte)],
      ["Versión del cronograma", d.version],
      ["Importado por", d.importadoPor],
      ["Generado por", d.generadoPor],
      ["Generado el", fechaCsv(generadoEl)],
    ],
  };
}

function resumen(d: DatosCsvInforme): SeccionInforme {
  const filas: [string, CeldaCsv][] = [
    ["Avance real (%)", d.real],
    ["Avance planeado (%)", d.planeado],
    ["Desviación (puntos)", d.desviacion],
  ];

  // Los totales del propio MS Project van aparte y rotulados como suyos: son
  // para CONTRASTAR, no la cifra del informe. Solo si el archivo los trae.
  if (d.planeadoProject !== null) {
    filas.push(["Avance planeado según MS Project (%)", d.planeadoProject]);
  }
  if (d.realProject !== null) {
    filas.push(["Avance real según MS Project (%)", d.realProject]);
  }

  return {
    clase: "datos",
    titulo: "RESUMEN",
    cabecera: ["Concepto", "Valor"],
    filas,
  };
}

function periodo(p: PeriodoCsv): SeccionInforme[] {
  const titulo = "LO QUE PASÓ EN EL PERIODO";

  if (p.desde === null) {
    return [
      {
        clase: "nota",
        titulo,
        texto: "Es el primer informe de la obra: no hay periodo anterior.",
      },
    ];
  }

  return [
    {
      clase: "datos",
      titulo,
      cabecera: ["Concepto", "Valor"],
      filas: [
        ["Corte anterior", fechaCsv(p.desde)],
        ["Avance real en el corte anterior (%)", p.realAnterior],
        ["Ganado en el periodo (puntos)", p.ganado],
      ],
    },
    {
      clase: "tabla",
      titulo: "TAREAS QUE SE MOVIERON EN EL PERIODO",
      cabeceras: ["Código", "Tarea", "Antes (%)", "Ahora (%)", "Ganó (puntos)"],
      filas: p.tareas.map((t) => [t.codigo ?? "", t.nombre, t.antes, t.ahora, t.delta]),
      siNoHay: "Ninguna tarea avanzó en este periodo.",
    },
  ];
}

function capitulos(todos: readonly Capitulo[]): SeccionInforme {
  return {
    clase: "tabla",
    titulo: "CAPÍTULOS",
    cabeceras: [
      "Código",
      "Capítulo",
      "Planeado (%)",
      "Real (%)",
      "Desviación",
      "Partidas",
      "Atrasadas",
      "Críticas",
    ],
    filas: capitulosDelInforme(todos).map((c) => [
      c.codigo ?? "",
      c.nombre,
      c.planeado,
      c.real,
      c.desfase,
      c.hojas,
      c.atrasadas,
      c.criticas,
    ]),
    siNoHay: "Ningún capítulo con trabajo medible en marcha a esta fecha.",
  };
}

function activas(partidas: readonly PartidaActiva[]): SeccionInforme {
  return {
    clase: "tabla",
    titulo: "PARTIDAS ACTIVAS EN LA SEMANA DEL CORTE",
    cabeceras: [
      "Código",
      "Partida",
      "Inicio",
      "Fin",
      "Planeado (%)",
      "Real (%)",
      "Desviación",
      "Ruta crítica",
    ],
    filas: partidas.map((p) => [
      p.codigo ?? "",
      p.nombre,
      fechaCsv(p.inicio),
      fechaCsv(p.fin),
      p.porcentajePlaneado,
      p.porcentajeReal,
      p.desfase,
      p.esCritico ? "Sí" : "No",
    ]),
    siNoHay: "Ninguna partida en marcha en la semana del corte.",
  };
}

function alertas(avisos: readonly AlertaAtraso[]): SeccionInforme {
  return {
    clase: "tabla",
    titulo: "PARTIDAS ATRASADAS",
    cabeceras: [
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
    filas: avisos.map((a) => [
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
    siNoHay: "Ninguna partida por detrás del plan a esta fecha.",
  };
}

function lastPlanner(lp: LastPlannerCsv | null): SeccionInforme[] {
  const titulo = "LAST PLANNER";

  // Null es «quien lo pide no tiene permiso de plan semanal», no «no hay Last
  // Planner». Decirlo evita que alguien concluya que la obra no lo usa.
  if (lp === null) {
    return [
      {
        clase: "nota",
        titulo,
        texto: "Sin acceso al plan semanal: este bloque no se incluye.",
      },
    ];
  }

  const cabeza: SeccionInforme =
    lp.semana === null
      ? {
          clase: "nota",
          titulo,
          texto: "Ninguna semana del plan cierra exactamente en esta fecha.",
        }
      : {
          clase: "datos",
          titulo,
          cabecera: ["Concepto", "Valor"],
          filas: [
            ["Semana", lp.semana.numero],
            ["Estado", lp.semana.cerrada ? "Cerrada" : "Abierta"],
            ["Compromisos", lp.semana.total],
            ["Cumplidos", lp.semana.cumplidos],
            // El PPC de una semana abierta no existe todavia: un porcentaje a
            // medio evaluar se acaba promediando con los de verdad.
            ["PPC (%)", lp.semana.ppc ?? "Sin cerrar: todavía no hay PPC"],
          ],
        };

  return [
    cabeza,
    {
      clase: "tabla",
      titulo: "COMPROMISOS DE LA SEMANA",
      cabeceras: ["Compromiso", "Cumplido", "Causa del incumplimiento", "Nota de cierre"],
      filas: lp.compromisos.map((c) => [
        c.descripcion,
        siNoOPendiente(c.cumplido),
        c.causa === null ? "" : ETIQUETA_CNC[c.causa],
        c.notaCierre ?? "",
      ]),
      siNoHay: "No hay compromisos registrados para esta semana.",
    },
    {
      clase: "tabla",
      titulo: "PPC POR SEMANA (SEMANAS CERRADAS HASTA EL CORTE)",
      cabeceras: ["Cierre de la semana", "PPC (%)"],
      filas: lp.tendencia.map((p) => [fechaCsv(p.fecha), p.ppc]),
      siNoHay: "Todavía no hay semanas cerradas.",
    },
    {
      clase: "tabla",
      titulo: "CAUSAS DE INCUMPLIMIENTO ACUMULADAS",
      cabeceras: ["Causa", "Veces"],
      filas: lp.pareto.map((p) => [ETIQUETA_CNC[p.causa], p.conteo]),
      siNoHay: "Ningún compromiso incumplido hasta esta fecha.",
    },
  ];
}

/// El plan diario indexado por dia, para poder poner al lado de cada punto
/// real el planeado que le tocaba.
function planPorDia(plan: readonly PuntoDiario[]): Map<string, number> {
  const indice = new Map<string, number>();
  for (const p of plan) indice.set(p.fecha.toISOString().slice(0, 10), p.valor);
  return indice;
}

/**
 * La curva S, muestreada por semana.
 *
 * Se exporta el REAL SEMANAL y no el plan dia a dia entero: el plan son
 * cientos de filas —una por dia de obra— y quien recibe esto quiere volver a
 * dibujar la curva, para lo cual le basta la cadencia con la que se reporta. A
 * cada punto real se le pone al lado el planeado de ESE dia, que es la
 * comparacion que se quiere hacer y la que si no habria que buscar a mano.
 */
function curva(c: CurvaCsv): SeccionInforme {
  const plan = planPorDia(c.plan);

  return {
    clase: "tabla",
    titulo: "CURVA S",
    cabeceras: ["Fecha", "Planeado acumulado (%)", "Real acumulado (%)"],
    filas: c.realSemanal.map((p) => {
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
    siNoHay: "Todavía no hay avance reportado: la curva no tiene puntos.",
    // Para el grafico si vale la pena el plan ENTERO, dia a dia: es una linea
    // continua y son puntos, no filas de una tabla que nadie leeria.
    grafico: [
      { nombre: "Planeado", papel: "plan", puntos: c.plan },
      { nombre: "Real", papel: "real", puntos: c.realSemanal },
    ],
  };
}

/**
 * Como se llama el archivo que se descarga o se adjunta.
 *
 * Dos exigencias que chocan:
 *
 * - **Solo ASCII.** El nombre viaja en la cabecera `Content-Disposition` y en
 *   la del adjunto del correo, y una tilde ahi se convierte en simbolos raros
 *   o rompe la descarga en algunos clientes. Por eso «Ampliación» sale
 *   «ampliacion».
 * - **Que ordene bien.** La fecha va en ISO —no en dd/mm— para que los
 *   informes de una obra queden en orden cronologico al ordenar la carpeta por
 *   nombre, que es como se van a acumular.
 */
export function nombreArchivoInforme(
  obra: string,
  fechaCorte: Date,
  extension: string,
): string {
  // La forma y el limpiado los pone `nombreDeArchivo`, que es el unico sitio
  // donde se decide como se llama lo que GCM deja descargar. Este envoltorio
  // se queda porque el informe tiene una particularidad: su fecha es la del
  // CORTE, no la del dia en que se descarga.
  return nombreDeArchivo({
    ambito: obra,
    documento: "informe",
    fecha: fechaCorte,
    extension,
  });
}
