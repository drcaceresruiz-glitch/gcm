import { XMLParser } from "fast-xml-parser";
import { dividir, normalizarDecimal, sumar } from "@/lib/decimal";

/**
 * Lectura del cronograma desde un XML de MS Project (formato MSPDI).
 *
 * Espejo de `lib/excel-presupuesto.ts`, y por el mismo motivo: el importador
 * nunca escribe nada por si mismo. Analiza, valida y devuelve una vista
 * previa; la escritura ocurre despues, con el usuario habiendo visto lo que
 * se va a cargar.
 *
 * Aqui solo se lee lo que el archivo DICE. Nada se deduce ni se recalcula:
 * el reparto acordado es que MS Project manda sobre el plan y GCM sobre el
 * avance real, asi que inventar una cifra que el planificador no escribio
 * romperia ese reparto y descuadraria el informe que el cliente ya emite.
 */

export type TipoDependencia = "FC" | "CC" | "FF" | "CF";

export interface TareaImportada {
  /// `<UID>`: lo unico estable entre exportaciones. El ancla del avance.
  uid: number;
  /// `<ID>`: el numero de fila. Sirve para ordenar y para componer las
  /// cadenas de predecesoras del informe ("24FC+3 dias"). Jamas como clave.
  fila: number;
  /// El "4.4" del principio del nombre. Nulo si el nombre no lo trae.
  codigo: string | null;
  /// El nombre YA sin el codigo: la tabla los pinta en columnas distintas.
  nombre: string;
  /// `<OutlineLevel>` tal cual. Unica fuente de jerarquia.
  nivel: number;
  esResumen: boolean;
  esHito: boolean;
  esCritico: boolean;
  /// Fechas de CALENDARIO en "YYYY-MM-DD", no instantes. Ver `fechaDeCalendario`.
  inicio: string;
  fin: string;
  duracionDias: string;
  porcentajePlaneado: string;
  porcentajeArchivo: string;
  holguraDias: string;
  /// El archivo no traia `<TotalSlack>`: se asume cero, pero se marca para no
  /// confundir "sin holgura" con "no informado" al auditar.
  holguraInferida: boolean;
  /// Aviso no bloqueante: la tarea se importa igual.
  aviso?: string;
  /**
   * El hito NO venia marcado: se dedujo de que la duracion fuera cero, y la
   * fila lleva codigo de partida.
   *
   * Solo lo pone el lector de Excel, donde la conversion es derivada y por
   * tanto nadie la pidio. En MS Project la marca es explicita y esto se queda
   * sin poner a proposito: la pantalla lo pinta en rojo, y hacerlo sonar en
   * cada importacion de Project —donde los hitos reales llevan codigo—
   * convertiria la alarma en decorado.
   */
  hitoDerivado?: boolean;
}

export interface DependenciaImportada {
  tareaUid: number;
  predecesoraUid: number;
  tipo: TipoDependencia;
  /// Dias con signo. El archivo lo trae en decimas de minuto.
  desfaseDias: string;
}

export interface ErrorCronograma {
  /// Fila del archivo. Cero cuando el problema es del documento entero.
  fila: number;
  uid?: number;
  mensaje: string;
}

export interface ResultadoAnalisisCronograma {
  tareas: TareaImportada[];
  dependencias: DependenciaImportada[];
  errores: ErrorCronograma[];

  /// Nombre de la obra segun el archivo. Sale de la primera fila real y no
  /// del `<Title>`, que lleva la fecha del corte y cambia cada semana.
  nombreProyecto: string;
  /// `<StatusDate>`: la fecha a la que estan referidos los avances. Es lo que
  /// identifica el corte. No sirven `LastSaved` ni `CurrentDate`.
  fechaCorte: string | null;
  minutosPorDia: number;
  inicio: string | null;
  fin: string | null;
  /// Plazo total segun el archivo, no la resta de las fechas.
  duracionDias: string | null;

  totalTareas: number;
  totalHitos: number;
  totalResumen: number;
  totalCriticas: number;
  holgurasInferidas: number;
  /// Filas que no son tareas de obra: la del proyecto y las vacias de MSPDI.
  filasOmitidas: number;
  /// Enlaces que apuntan a una tarea que no esta en el archivo.
  dependenciasDescartadas: number;
}

/**
 * El "% Planeado" es un campo personalizado y se busca POR IDENTIFICADOR.
 *
 * Su nombre depende del idioma del MS Project que guardo el archivo: los dos
 * exports del mismo corte que hay de CRIOCORD lo llaman `Text1` uno y
 * `Texto1` el otro. Buscarlo por nombre habria funcionado en pruebas y
 * fallado en la maquina del planificador, dejando todo el plan a cero.
 */
const CAMPO_PORCENTAJE_PLANEADO = "188743731";

/**
 * Codigos de `<PredecessorLink><Type>` de MSPDI.
 *
 * El mapeo va completo aunque hoy el archivo solo traiga FC y un CC: un
 * enlace mal tipado desplaza fechas sin dar ningun sintoma.
 */
const TIPOS_DEPENDENCIA: Record<string, TipoDependencia> = {
  "0": "FF",
  "1": "FC",
  "2": "CF",
  "3": "CC",
};

/**
 * El codigo va al PRINCIPIO DEL NOMBRE, no en `<WBS>`.
 *
 * `<WBS>` lleva la numeracion interna de Project: para la partida "4.4" pone
 * "1.5.4". Lo que el informe imprime como codigo es el prefijo del nombre.
 *
 * El punto es lo que discrimina: exigir al menos un separador evita tomar
 * por codigo el "2026" de un nombre que empiece por un ano.
 */
const CODIGO_EN_NOMBRE = /^(\d+(?:\.\d+)+)\s+([\s\S]+)$/;

/** "2026-08-01T15:00:00" y tambien "2026-08-01" a secas. */
const FECHA_MSPDI = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/;

/** Duracion ISO 8601 tal como la escribe MSPDI: "PT408H0M0S". */
const DURACION_ISO = /^PT(\d+)H(\d+)M(\d+(?:\.\d+)?)S$/;

const ETIQUETAS_LISTA = new Set(["Task", "PredecessorLink", "ExtendedAttribute"]);

/**
 * `parseTagValue: false` es obligatorio: sin el, el analizador convierte los
 * textos a numero y "0.0" —el codigo del capitulo de hitos— se vuelve 0.
 *
 * `isArray` tambien: con una sola tarea, el analizador devolveria un objeto
 * en vez de una lista y el cronograma entero quedaria vacio sin dar error.
 */
const analizador = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  removeNSPrefix: true,
  isArray: (nombre) => ETIQUETAS_LISTA.has(nombre),
});

/** Nodo suelto del arbol que devuelve el analizador. */
type Nodo = Record<string, unknown>;

function objeto(valor: unknown): Nodo | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Nodo)
    : null;
}

function lista(valor: unknown): Nodo[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((v): v is Nodo => objeto(v) !== null);
}

/** Texto de una etiqueta hija. Cadena vacia si no esta. */
function texto(nodo: Nodo, etiqueta: string): string {
  const v = nodo[etiqueta];
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return "";
  return String(v).trim();
}

/** true solo si la etiqueta vale "1". MSPDI usa 1/0, no true/false. */
function bandera(nodo: Nodo, etiqueta: string): boolean {
  return texto(nodo, etiqueta) === "1";
}

function entero(valor: string): number | null {
  if (!/^-?\d+$/.test(valor)) return null;
  const n = Number(valor);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Convierte el instante del archivo en una fecha de CALENDARIO, quedandose
 * con el trozo "YYYY-MM-DD" literal.
 *
 * Es deliberado no construir un `Date`. Las fechas del cronograma llevan hora
 * ("2026-08-01T15:00:00") y son fechas de obra, no instantes: pasarlas por
 * `new Date()` en un servidor en UTC y volver a formatearlas en horario de
 * Lima (UTC-5) retrocede el reloj cinco horas y corre un dia el cronograma
 * entero. El mismo cuidado que documenta `utils/fechas.ts`.
 */
function fechaDeCalendario(valor: string): string | null {
  const m = FECHA_MSPDI.exec(valor);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Duracion ISO a dias, con los minutos de jornada del propio archivo.
 *
 * NUNCA se restan las fechas: una partida de un dia puede abarcar tres dias
 * naturales por el calendario, y en CRIOCORD el sabado es laborable de cinco
 * horas, con lo que restar fechas falla en 68 de las 108 tareas.
 *
 * `<DurationFormat>` se ignora a proposito. Vale 7 en estos archivos y las
 * tablas que circulan lo traducen por "meses": convertiria una partida de 8,8
 * dias en una de 8,8 meses. La conversion real es siempre horas / jornada.
 */
function duracionADias(valor: string, minutosPorDia: number): string | null {
  const m = DURACION_ISO.exec(valor);
  if (!m || minutosPorDia <= 0) return null;

  const enteros = Number(m[1]) * 3600 + Number(m[2]) * 60;
  const segundos = sumar([String(enteros), m[3]!], 3);

  return dividir(segundos, String(minutosPorDia * 60), 2);
}

/**
 * Decimas de minuto a dias, con signo.
 *
 * Es la unidad de `<TotalSlack>` y de `<LinkLag>`: el "24FC+3 dias" del
 * informe viaja en el archivo como 14400. Tomarlo por minutos —o por dias—
 * desplazaria los enlaces sin que nada lo delate.
 */
function decimasADias(valor: string, minutosPorDia: number): string | null {
  if (minutosPorDia <= 0) return null;
  return dividir(valor, String(minutosPorDia * 10), 2);
}

/** "83%" -> "83.00". Acepta tambien el valor sin el simbolo. */
function porcentaje(valor: string): string | null {
  return normalizarDecimal(valor.trim().replace(/%$/, "").trim(), 2);
}

/**
 * Separa el "4.4" del principio del nombre.
 *
 * El nombre se devuelve YA sin el codigo porque la tabla los pinta en
 * columnas distintas; dejarlo dentro lo imprimiria dos veces.
 */
function partirNombre(nombre: string): { codigo: string | null; resto: string } {
  const m = CODIGO_EN_NOMBRE.exec(nombre);
  return m ? { codigo: m[1]!, resto: m[2]!.trim() } : { codigo: null, resto: nombre };
}

/**
 * Valor de un campo personalizado, buscado por identificador.
 *
 * Nunca por `<FieldName>`: ese nombre esta traducido al idioma del Project
 * que guardo el archivo —"Text1" en uno de los exports de CRIOCORD y
 * "Texto1" en el otro, siendo el mismo corte—, mientras que el `<FieldID>`
 * es el mismo numero en todos.
 */
function valorCampo(nodo: Nodo, campo: string): string | null {
  for (const atributo of lista(nodo["ExtendedAttribute"])) {
    if (texto(atributo, "FieldID") === campo) return texto(atributo, "Value");
  }
  return null;
}

/**
 * Deja el porcentaje dentro de 0..100 y deja constancia si venia fuera.
 *
 * La comparacion se hace con `Number` a proposito: es una comprobacion de
 * rango, no aritmetica, y el valor que se guarda sigue siendo el texto exacto
 * que se leyo del archivo.
 */
function acotarPorcentaje(valor: string, etiqueta: string, avisos: string[]): string {
  const n = Number(valor);

  if (n < 0) {
    avisos.push(`El ${etiqueta} venia en ${valor} y se acota a 0.`);
    return "0.00";
  }
  if (n > 100) {
    avisos.push(`El ${etiqueta} venia en ${valor} y se acota a 100.`);
    return "100.00";
  }
  return valor;
}

/** Decodifica el archivo respetando la marca de orden de bytes. */
function decodificar(contenido: ArrayBuffer): string {
  const bytes = new Uint8Array(contenido);

  // MS Project tambien guarda el MSPDI en UTF-16. Leerlo como UTF-8 no falla:
  // devuelve un documento ilegible, que es peor que fallar.
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function vacio(mensaje: string): ResultadoAnalisisCronograma {
  return {
    tareas: [], dependencias: [], errores: [{ fila: 0, mensaje }],
    nombreProyecto: "", fechaCorte: null, minutosPorDia: 0,
    inicio: null, fin: null, duracionDias: null,
    totalTareas: 0, totalHitos: 0, totalResumen: 0, totalCriticas: 0,
    holgurasInferidas: 0, filasOmitidas: 0, dependenciasDescartadas: 0,
  };
}

/** Enlace tal como viene, antes de saber si su predecesora existe. */
interface EnlaceCrudo {
  tareaUid: number;
  predecesoraUid: number;
  tipo: string;
  desfase: string;
}

export async function analizarProjectXml(
  contenido: ArrayBuffer,
): Promise<ResultadoAnalisisCronograma> {
  const crudo = decodificar(contenido);

  // Un MSPDI legitimo no declara DOCTYPE. Rechazarlo antes de analizar cierra
  // la puerta a las entidades expandidas, con las que un archivo de pocos
  // kilobytes se convierte en gigabytes de memoria al abrirlo.
  if (/<!DOCTYPE/i.test(crudo)) {
    return vacio(
      "El archivo declara un DOCTYPE y no se puede procesar. Vuelve a exportarlo desde MS Project.",
    );
  }

  let arbol: unknown;
  try {
    arbol = analizador.parse(crudo);
  } catch {
    // Sin detalle a proposito: un archivo corrupto no debe revelar nada de la
    // libreria ni del servidor.
    return vacio("El archivo no se pudo leer como XML.");
  }

  const raiz = objeto(arbol);
  const proyecto = raiz ? objeto(raiz["Project"]) : null;

  if (!proyecto) {
    return vacio(
      "El archivo no es un cronograma de MS Project: no se encontro el elemento <Project>.",
    );
  }

  // Los minutos de jornada gobiernan todas las conversiones de duracion y de
  // desfase. Si el archivo no los trae se usa la jornada estandar de Project.
  const declarados = entero(texto(proyecto, "MinutesPerDay")) ?? 0;
  const minutosPorDia = declarados > 0 ? declarados : 480;

  const contenedor = objeto(proyecto["Tasks"]);
  const tareasXml = contenedor ? lista(contenedor["Task"]) : [];

  if (tareasXml.length === 0) {
    return vacio("El cronograma no contiene ninguna tarea.");
  }

  const errores: ErrorCronograma[] = [];
  const tareas: TareaImportada[] = [];
  const enlaces: EnlaceCrudo[] = [];
  const uidsVistos = new Map<number, number>();

  let filasOmitidas = 0;
  let holgurasInferidas = 0;
  let duracionProyecto: string | null = null;
  let nivelAnterior = 0;

  for (const nodo of tareasXml) {
    const uid = entero(texto(nodo, "UID"));
    const fila = entero(texto(nodo, "ID")) ?? 0;

    // Filas en blanco del esquema: MSPDI las exporta como tareas nulas.
    if (bandera(nodo, "IsNull")) {
      filasOmitidas++;
      continue;
    }

    if (uid === null) {
      errores.push({
        fila,
        mensaje: `La fila ${fila} no tiene <UID>, que es lo unico contra lo que se puede anclar su avance. Se descarta.`,
      });
      continue;
    }

    /**
     * El espacio NEGATIVO es de las tareas tecleadas en GCM, y solo suyo.
     *
     * `entero()` admite el signo porque otros campos —el desfase de un
     * enlace— lo necesitan de verdad. Aqui no: un archivo con `<UID>-3` se
     * llevaria por delante el ancla de una tarea escrita a mano, y con ella su
     * avance, sin que nada lo dijera. Project no exporta uids negativos, asi
     * que rechazarlos no cierra ninguna puerta legitima.
     */
    // Se rechaza el NEGATIVO y no el cero: el cero es el `<UID>` de la fila del
    // proyecto, que Project si exporta y que unas lineas mas abajo se descarta
    // por su nivel de esquema. Cortarla aqui la convertiria en un error a la
    // vista del usuario en todos los archivos.
    if (uid < 0) {
      errores.push({
        fila,
        uid,
        mensaje: `La fila ${fila} trae el UID ${uid}. Los negativos estan reservados para las tareas escritas en GCM y no pueden venir de un archivo. Se descarta.`,
      });
      continue;
    }

    const nivelLeido = entero(texto(nodo, "OutlineLevel"));

    /**
     * La fila del proyecto no es una partida de obra: es el total.
     *
     * Se descarta por su nivel de esquema y NUNCA por su texto, que lleva la
     * fecha del corte y cambia cada semana. De ella solo se aprovecha el
     * plazo, que el archivo ya trae calculado.
     */
    if (nivelLeido === 0) {
      duracionProyecto = duracionADias(texto(nodo, "Duration"), minutosPorDia);
      filasOmitidas++;
      continue;
    }

    const anterior = uidsVistos.get(uid);
    if (anterior !== undefined) {
      errores.push({
        fila, uid,
        mensaje: `El UID ${uid} ya aparece en la fila ${anterior}. Cada tarea debe tener el suyo.`,
      });
      continue;
    }

    const nombreCrudo = texto(nodo, "Name");
    if (!nombreCrudo) {
      errores.push({ fila, uid, mensaje: `La tarea de la fila ${fila} no tiene nombre. Se descarta.` });
      continue;
    }

    const inicio = fechaDeCalendario(texto(nodo, "Start"));
    const fin = fechaDeCalendario(texto(nodo, "Finish"));

    if (!inicio || !fin) {
      errores.push({
        fila, uid,
        mensaje: `La tarea "${nombreCrudo}" no trae fechas de comienzo y fin legibles. Se descarta.`,
      });
      continue;
    }

    const avisos: string[] = [];
    let { codigo, resto: nombre } = partirNombre(nombreCrudo);

    if (codigo !== null && codigo.length > 40) {
      avisos.push(`El codigo "${codigo}" es demasiado largo y se deja sin asignar.`);
      codigo = null;
      nombre = nombreCrudo;
    }

    if (nombre.length > 500) {
      nombre = nombre.slice(0, 500);
      avisos.push("El nombre se recorto a 500 caracteres.");
    }

    // Sin <OutlineLevel> no se sabe donde colgarla. Se deja en el primer
    // nivel en vez de descartarla: perder una partida del plan en silencio es
    // peor que pintarla en el sitio equivocado con un aviso al lado.
    let nivel = nivelLeido;
    if (nivel === null || nivel < 1) {
      nivel = 1;
      avisos.push("Sin nivel de esquema en el archivo: se situa en el primer nivel.");
    } else if (nivel > nivelAnterior + 1) {
      avisos.push(
        `El esquema salta del nivel ${nivelAnterior} al ${nivel}: la sangria de la tabla puede verse rara.`,
      );
    }
    nivelAnterior = nivel;

    let duracionDias = duracionADias(texto(nodo, "Duration"), minutosPorDia);
    if (duracionDias === null) {
      duracionDias = "0.00";
      avisos.push("La duracion no se pudo leer del archivo: se anota como cero.");
    }

    const planeado = valorCampo(nodo, CAMPO_PORCENTAJE_PLANEADO);
    let porcentajePlaneado = planeado === null ? null : porcentaje(planeado);

    if (porcentajePlaneado === null) {
      porcentajePlaneado = "0.00";
      avisos.push(
        'Sin "% Planeado" en el archivo. Se anota cero, y esta tarea no aportara nada a la curva de avance previsto.',
      );
    }

    /**
     * `<TotalSlack>` se omite cuando vale cero, asi que su ausencia no
     * distingue "sin holgura" de "no informado". Se guarda como cero y se
     * marca, para que una auditoria posterior sepa cual de las dos era.
     */
    const slack = texto(nodo, "TotalSlack");
    const holguraLeida = slack === "" ? null : decimasADias(slack, minutosPorDia);
    const holguraInferida = holguraLeida === null;
    const holguraDias = holguraLeida ?? "0.00";
    if (holguraInferida) holgurasInferidas++;

    if (fin < inicio) {
      avisos.push("La fecha de fin es anterior a la de comienzo.");
    }

    for (const enlace of lista(nodo["PredecessorLink"])) {
      const predecesora = entero(texto(enlace, "PredecessorUID"));
      if (predecesora === null) continue;

      enlaces.push({
        tareaUid: uid,
        predecesoraUid: predecesora,
        tipo: texto(enlace, "Type"),
        desfase: texto(enlace, "LinkLag") || "0",
      });
    }

    uidsVistos.set(uid, fila);
    tareas.push({
      uid, fila, codigo, nombre, nivel,
      esResumen: bandera(nodo, "Summary"),
      /**
       * Aqui la marca es EXPLICITA del archivo, y por eso no se avisa de
       * ella como si hace el lector de Excel.
       *
       * La diferencia no es de forma. En Project alguien marco `Milestone`
       * a proposito, y ademas los hitos reales de estos cronogramas llevan
       * codigo («0.1 Inicio de Obra»): avisar de todos seria una alarma en
       * cada importacion, y una alarma que siempre suena no la lee nadie.
       * Lo que hay que delatar es la conversion que NADIE pidio, y esa solo
       * ocurre al deducir el hito de una duracion cero.
       */
      esHito: bandera(nodo, "Milestone"),
      // Viene dado por el archivo. No se deduce de la holgura: en el
      // cronograma real hay 18 tareas con holgura cero que no son criticas.
      esCritico: bandera(nodo, "Critical"),
      inicio, fin, duracionDias,
      porcentajePlaneado: acotarPorcentaje(porcentajePlaneado, "% planeado", avisos),
      porcentajeArchivo: acotarPorcentaje(
        porcentaje(texto(nodo, "PercentComplete")) ?? "0.00",
        "% completado",
        avisos,
      ),
      holguraDias, holguraInferida,
      ...(avisos.length > 0 ? { aviso: avisos.join(" ") } : {}),
    });
  }

  /**
   * Segunda pasada para los enlaces.
   *
   * La predecesora puede estar mas abajo en el documento —pasa en 16 de los
   * 76 enlaces del cronograma real—, asi que hasta tener todas las tareas no
   * se sabe si existe. Los que apuntan a una tarea ausente se cuentan y se
   * dejan fuera: guardarlos crearia flechas hacia ninguna parte.
   */
  const conocidos = new Set(tareas.map((t) => t.uid));
  const dependencias: DependenciaImportada[] = [];
  let dependenciasDescartadas = 0;

  for (const enlace of enlaces) {
    const tipo = TIPOS_DEPENDENCIA[enlace.tipo];
    const desfaseDias = decimasADias(enlace.desfase, minutosPorDia);

    if (
      !tipo ||
      desfaseDias === null ||
      enlace.predecesoraUid === enlace.tareaUid ||
      !conocidos.has(enlace.predecesoraUid)
    ) {
      dependenciasDescartadas++;
      continue;
    }

    dependencias.push({
      tareaUid: enlace.tareaUid,
      predecesoraUid: enlace.predecesoraUid,
      tipo,
      desfaseDias,
    });
  }

  // El nombre de la obra sale de la primera fila real y no del `<Title>`, que
  // lleva la fecha del corte y cambiaria cada semana.
  const cabecera = tareas.find((t) => t.nivel === 1);
  const nombreProyecto = (cabecera?.nombre || texto(proyecto, "Title")).slice(0, 255);

  const inicio =
    fechaDeCalendario(texto(proyecto, "StartDate")) ??
    tareas.reduce<string | null>((m, t) => (m === null || t.inicio < m ? t.inicio : m), null);

  const fin =
    fechaDeCalendario(texto(proyecto, "FinishDate")) ??
    tareas.reduce<string | null>((m, t) => (m === null || t.fin > m ? t.fin : m), null);

  return {
    tareas,
    dependencias,
    errores,
    nombreProyecto,
    fechaCorte: fechaDeCalendario(texto(proyecto, "StatusDate")),
    minutosPorDia,
    inicio,
    fin,
    duracionDias: duracionProyecto,
    totalTareas: tareas.length,
    totalHitos: tareas.filter((t) => t.esHito).length,
    totalResumen: tareas.filter((t) => t.esResumen).length,
    totalCriticas: tareas.filter((t) => t.esCritico).length,
    holgurasInferidas,
    filasOmitidas,
    dependenciasDescartadas,
  };
}
