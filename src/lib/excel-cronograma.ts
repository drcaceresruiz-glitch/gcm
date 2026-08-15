import ExcelJS from "exceljs";

import { normalizarDecimal } from "@/lib/decimal";
import type {
  DependenciaImportada,
  ErrorCronograma,
  ResultadoAnalisisCronograma,
  TareaImportada,
  TipoDependencia,
} from "@/lib/msproject-xml";

/**
 * Lectura del cronograma desde un Excel.
 *
 * Segunda puerta del cronograma, junto al XML de MS Project. Existe por lo
 * mismo que el alta manual de ordenes de compra: el archivo es un acelerador,
 * no el unico camino, y una obra sin MS Project se quedaba hasta hoy sin
 * cronograma —y con el sin Gantt, sin curva S y sin EVM—.
 *
 * Devuelve EL MISMO `ResultadoAnalisisCronograma` que `analizarProjectXml`.
 * Ese contrato compartido es lo que permite que la vista previa, las acciones
 * de servidor y `importarCronograma` no se enteren de por donde entro el plan.
 *
 * Lo que este archivo NO sabe, no lo inventa. Un Excel no trae la red de
 * precedencias completa, asi que no hay ruta critica ni holgura que calcular:
 * todas las tareas salen con `esCritico` en falso y `holguraInferida` en
 * cierto. Es la misma regla por la que el lector de MS Project se niega a
 * deducir `esCritico` de la holgura.
 */

/** El nombre que lleva la hoja de datos en la plantilla. */
export const HOJA_CRONOGRAMA = "Cronograma";

/** Filas de cabecera y preambulo que se exploran buscando las etiquetas. */
const MAXIMO_FILAS_CABECERA = 30;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Deja un encabezado comparable: sin tildes, sin simbolos de grado y con los
 * espacios colapsados. Asi "N°", "Nro." y "numero" son la misma columna.
 *
 * Los rangos Unicode se construyen desde string y no como literal: si alguien
 * reguarda este archivo en otra codificacion, un literal se invierte y la
 * funcion deja de quitar diacriticos sin que nada falle.
 */
function normalizarTexto(valor: unknown): string {
  return String(valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(new RegExp("[\\u00b0\\u00ba]", "g"), "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** El valor crudo de la celda, resolviendo formulas y texto enriquecido. */
function valorCelda(celda: ExcelJS.Cell | undefined): unknown {
  const v = celda?.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "result" in v) return v.result ?? null;
  if (typeof v === "object" && "richText" in v) {
    return v.richText.map((t) => t.text).join("");
  }
  return v;
}

/** El texto de la celda, ya recortado. */
function textoCelda(celda: ExcelJS.Cell | undefined): string {
  const v = valorCelda(celda);
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/**
 * Comprueba que la fecha existe de verdad.
 *
 * `new Date("2026-02-31")` NO falla: rueda al 3 de marzo. Volver a formatear
 * y comparar es lo unico que caza esos dias que no existen, y aqui importa
 * porque una fecha corrida mueve una partida de sitio en toda la curva.
 */
function esFechaValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const fecha = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === iso;
}

/**
 * La fecha de una celda, en "YYYY-MM-DD".
 *
 * exceljs devuelve unas veces `Date` y otras texto, segun como se guardara la
 * celda. Con `Date` se leen los componentes UTC: `getFullYear` y compania
 * usan la zona del servidor y correrian el cronograma un dia entero.
 *
 * El numero de serie crudo de Excel se rechaza a proposito. Interpretarlo
 * exige saber si el libro usa la base de 1900 o la de 1904, y equivocarse
 * desplaza el plan cuatro anos sin dar ningun sintoma.
 */
function fechaDeCelda(celda: ExcelJS.Cell | undefined): { iso: string } | { crudo: string } {
  const v = valorCelda(celda);
  if (v === null || v === undefined || v === "") return { crudo: "" };

  if (v instanceof Date) {
    return { iso: `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}` };
  }

  if (typeof v === "number") return { crudo: String(v) };

  const texto = String(v).trim();
  const dmy = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const iso = `${dmy[3]}-${pad2(Number(dmy[2]))}-${pad2(Number(dmy[1]))}`;
    return esFechaValida(iso) ? { iso } : { crudo: texto };
  }

  const soloFecha = texto.slice(0, 10);
  return esFechaValida(soloFecha) ? { iso: soloFecha } : { crudo: texto };
}

type Campo =
  | "fila"
  | "uid"
  | "nivel"
  | "codigo"
  | "nombre"
  | "inicio"
  | "fin"
  | "duracion"
  | "planeado"
  | "avance"
  | "depende";

/**
 * Sinonimos aceptados por columna, ya normalizados.
 *
 * El orden importa: se resuelven de mas especifica a menos, porque "fecha
 * inicio" y "inicio" compiten, y "id de tarea" tiene que ganar a "id" antes
 * de que "id" se lleve la columna del numero de orden.
 */
const ALIAS: ReadonlyArray<readonly [Campo, readonly string[]]> = [
  ["uid", ["id de tarea", "id tarea", "uid", "id unico", "identificador", "id msp", "id"]],
  ["nivel", ["nivel esquema", "outline level", "outlinelevel", "jerarquia", "nivel", "esquema"]],
  ["planeado", ["% planeado", "porcentaje planeado", "% programado", "avance planeado", "planeado"]],
  ["avance", ["% avance", "% real", "% ejecutado", "avance real", "porcentaje de avance", "avance"]],
  ["duracion", ["duracion dias", "duracion (dias)", "duracion", "dias", "plazo"]],
  ["inicio", ["fecha inicio", "inicio programado", "f. inicio", "comienzo", "start", "desde", "inicio"]],
  ["fin", ["fecha fin", "fin programado", "f. fin", "termino", "finish", "hasta", "fin"]],
  ["nombre", ["nombre de tarea", "actividad", "descripcion", "concepto", "partida", "tarea", "nombre"]],
  ["codigo", ["codigo", "cod", "wbs", "edt", "partida n"]],
  ["depende", ["depende de", "predecesoras", "predecesora", "precedentes", "antecede", "depende"]],
  ["fila", ["n", "nro", "num", "numero", "item", "orden", "fila"]],
];

/** Coincidencia laxa: acepta "Inicio", "Inicio " y "Inicio." */
function encaja(encabezado: string, alias: string): boolean {
  return (
    encabezado === alias ||
    encabezado === `${alias}.` ||
    encabezado.startsWith(`${alias} `)
  );
}

type Mapa = Partial<Record<Campo, number>>;

/**
 * Localiza la cabecera por contenido y no por posicion.
 *
 * La gente anade filas de titulo encima sin pensarlo, y la propia plantilla
 * lleva cinco. Se da por buena la primera fila que traiga a la vez ID,
 * actividad, inicio y fin: con menos que eso no hay tabla que leer.
 */
function detectarCabecera(hoja: ExcelJS.Worksheet): { fila: number; mapa: Mapa } | null {
  const hasta = Math.min(hoja.rowCount, MAXIMO_FILAS_CABECERA);

  for (let f = 1; f <= hasta; f++) {
    const fila = hoja.getRow(f);
    const mapa: Mapa = {};
    const usadas = new Set<number>();

    for (const [campo, alias] of ALIAS) {
      for (let c = 1; c <= Math.max(fila.cellCount, 1); c++) {
        if (usadas.has(c)) continue;
        const encabezado = normalizarTexto(textoCelda(fila.getCell(c)));
        if (encabezado === "") continue;
        if (alias.some((a) => encaja(encabezado, a))) {
          mapa[campo] = c;
          usadas.add(c);
          break;
        }
      }
    }

    if (mapa.uid && mapa.nombre && mapa.inicio && mapa.fin) return { fila: f, mapa };
  }

  return null;
}

/**
 * Lee una etiqueta del preambulo, de las que van encima de la tabla.
 *
 * El valor puede estar en la celda de al lado —"Fecha de corte:" | "2026-08-14"—
 * o dentro de la misma celda tras los dos puntos, que es como la gente lo
 * escribe cuando no piensa en columnas. Se aceptan las dos.
 */
function leerEtiqueta(
  hoja: ExcelJS.Worksheet,
  hastaFila: number,
  alias: readonly string[],
): string {
  for (let f = 1; f < hastaFila; f++) {
    const fila = hoja.getRow(f);
    for (let c = 1; c <= Math.max(fila.cellCount, 1); c++) {
      const crudo = textoCelda(fila.getCell(c));
      if (crudo === "") continue;
      const sinDosPuntos = normalizarTexto(crudo.replace(/:\s*$/, ""));
      const soloEtiqueta = alias.some((a) => sinDosPuntos === a);
      const conValor = crudo.includes(":") && alias.some((a) => normalizarTexto(crudo.split(":")[0]) === a);

      if (soloEtiqueta) {
        const derecha = fila.getCell(c + 1);
        const valor = valorCelda(derecha) instanceof Date
          ? (fechaDeCelda(derecha) as { iso?: string }).iso ?? ""
          : textoCelda(derecha);
        if (valor !== "") return valor;
      }
      if (conValor) {
        const resto = crudo.slice(crudo.indexOf(":") + 1).trim();
        if (resto !== "") return resto;
      }
    }
  }
  return "";
}

const ETIQUETAS_CORTE = ["fecha de corte", "fecha corte", "corte", "fecha de estado", "avance al", "status date"];
const ETIQUETAS_OBRA = ["obra", "proyecto", "nombre de la obra", "nombre del proyecto", "titulo"];
const ETIQUETAS_JORNADA = ["minutos por dia", "minutos jornada", "jornada (minutos)", "minutesperday"];

const TIPOS: readonly TipoDependencia[] = ["FC", "CC", "FF", "CF"];

/**
 * Lee la columna "Depende de": "6", "6FC+2", "6; 7CC-1".
 *
 * Alimenta `dependencias[]` y nada mas. NO produce ruta critica ni holgura:
 * con la red incompleta —y en un Excel siempre lo esta— calcular el camino
 * critico daria un resultado que parece cierto y no lo es.
 */
function leerDependencias(
  crudo: string,
  uid: number,
  conocidos: Set<number>,
): { enlaces: DependenciaImportada[]; descartadas: number; avisos: string[] } {
  const enlaces: DependenciaImportada[] = [];
  const avisos: string[] = [];
  let descartadas = 0;

  for (const trozo of crudo.split(/[;,]/)) {
    const t = trozo.trim();
    if (t === "") continue;

    const m = t.match(/^(\d+)\s*([A-Za-z]{2})?\s*([+-]\s*\d+(?:[.,]\d+)?)?$/);
    if (!m || !m[1]) {
      descartadas++;
      avisos.push(`Depende de "${t}": no se entiende. Escribe el ID de la tarea anterior, como 6 o 6FC+2.`);
      continue;
    }

    const predecesoraUid = Number(m[1]);
    if (predecesoraUid === uid) {
      descartadas++;
      avisos.push("Una tarea no puede depender de si misma. El enlace se descarta.");
      continue;
    }
    if (!conocidos.has(predecesoraUid)) {
      descartadas++;
      avisos.push(`Depende de "${t}": no hay ninguna tarea con ese ID en el archivo. El enlace se descarta.`);
      continue;
    }

    const pedido = (m[2] ?? "FC").toUpperCase() as TipoDependencia;
    const tipo = TIPOS.includes(pedido) ? pedido : "FC";
    if (!TIPOS.includes(pedido)) {
      avisos.push(`Depende de "${t}": no se entiende el tipo de enlace. Se toma FC (fin-comienzo).`);
    }

    const desfase = m[3] ? normalizarDecimal(m[3].replace(/\s+/g, "").replace(",", "."), 2) : "0.00";
    enlaces.push({ tareaUid: uid, predecesoraUid, tipo, desfaseDias: desfase ?? "0.00" });
  }

  return { enlaces, descartadas, avisos };
}

/** Un resultado vacio con el motivo dentro: este lector nunca lanza. */
function soloError(mensaje: string): ResultadoAnalisisCronograma {
  return {
    tareas: [],
    dependencias: [],
    errores: [{ fila: 0, mensaje }],
    nombreProyecto: "",
    fechaCorte: null,
    minutosPorDia: 480,
    inicio: null,
    fin: null,
    duracionDias: null,
    totalTareas: 0,
    totalHitos: 0,
    totalResumen: 0,
    totalCriticas: 0,
    holgurasInferidas: 0,
    filasOmitidas: 0,
    dependenciasDescartadas: 0,
  };
}

/** Lo leido de una fila, antes de derivar resumen e hito. */
interface FilaLeida {
  filaExcel: number;
  uid: number;
  orden: number;
  codigo: string | null;
  nombre: string;
  nivel: number;
  inicio: string;
  fin: string;
  duracionDias: string;
  porcentajePlaneado: string | null;
  porcentajeArchivo: string;
  depende: string;
  avisos: string[];
}

export async function analizarCronogramaExcel(
  contenido: ArrayBuffer,
): Promise<ResultadoAnalisisCronograma> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(contenido);

  const hoja = libro.worksheets[0];
  if (!hoja) return soloError("El archivo no contiene ninguna hoja.");

  const cabecera = detectarCabecera(hoja);
  if (!cabecera) {
    return soloError(
      "No se encontro la tabla de tareas. Se necesitan al menos una columna de ID, una de Actividad y las de Inicio y Fin.",
    );
  }

  const { fila: filaCabecera, mapa } = cabecera;
  const errores: ErrorCronograma[] = [];

  if (!mapa.nivel) {
    errores.push({
      fila: 0,
      mensaje:
        'Falta la columna Nivel. Es lo unico que dice que cuelga de que: el codigo no sirve, porque "7.3.1" es hermana de "7.3" y no su hija.',
    });
  }

  const corteCrudo = leerEtiqueta(hoja, filaCabecera, ETIQUETAS_CORTE);
  let fechaCorte: string | null = null;
  if (corteCrudo === "") {
    errores.push({
      fila: 0,
      mensaje:
        'El archivo no trae la fecha de corte. Escribela arriba, en la celda de al lado de "Fecha de corte:": es la fecha a la que estan referidos los avances.',
    });
  } else {
    const dmy = corteCrudo.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    const iso = dmy && dmy[1] && dmy[2] && dmy[3]
      ? `${dmy[3]}-${pad2(Number(dmy[2]))}-${pad2(Number(dmy[1]))}`
      : corteCrudo.slice(0, 10);
    if (esFechaValida(iso)) fechaCorte = iso;
    else {
      errores.push({
        fila: 0,
        mensaje: `La fecha de corte "${corteCrudo}" no es una fecha valida. Escribela como AAAA-MM-DD, por ejemplo 2026-08-14.`,
      });
    }
  }

  const leidas: FilaLeida[] = [];
  const vistos = new Map<number, number>();
  let filasOmitidas = 0;
  let nivelAnterior: number | null = null;

  for (let f = filaCabecera + 1; f <= hoja.rowCount; f++) {
    const fila = hoja.getRow(f);
    const avisos: string[] = [];

    const uidCrudo = textoCelda(fila.getCell(mapa.uid ?? 1));
    const nombre = textoCelda(fila.getCell(mapa.nombre ?? 1));

    // Ni ID ni nombre: fila en blanco de las que Excel arrastra al final.
    if (uidCrudo === "" && nombre === "") continue;

    // Ocultar una fila es la forma habitual de dejar una actividad fuera de
    // alcance sin borrarla. Se cuenta para poder decir cuantas se dejaron.
    if (fila.hidden) {
      filasOmitidas++;
      continue;
    }

    // Texto suelto sin ID: subtitulos, notas, totales. Se omiten en silencio y
    // solo se cuentan: listarlas como errores ensena a ignorar el informe, y
    // entonces se pierde tambien el error de verdad.
    if (uidCrudo === "") {
      filasOmitidas++;
      continue;
    }

    if (!/^-?\d+$/.test(uidCrudo)) {
      errores.push({ fila: f, mensaje: `El ID "${uidCrudo}" no es un numero entero. Escribe 1, 2, 3...` });
      continue;
    }
    const uid = Number(uidCrudo);
    if (!Number.isSafeInteger(uid) || uid <= 0) {
      errores.push({ fila: f, mensaje: "El ID debe ser mayor que cero." });
      continue;
    }
    const anterior = vistos.get(uid);
    if (anterior !== undefined) {
      errores.push({
        fila: f,
        uid,
        mensaje: `El ID ${uid} ya aparece en la fila ${anterior}. Cada tarea debe tener el suyo.`,
      });
      continue;
    }
    vistos.set(uid, f);

    if (nombre === "") {
      errores.push({
        fila: f,
        uid,
        mensaje:
          "Falta el nombre de la actividad. Es lo unico que identifica la tarea en el informe y en las alertas de atraso.",
      });
      continue;
    }

    const nivelCrudo = textoCelda(fila.getCell(mapa.nivel ?? 1));
    const nivel = Number(nivelCrudo);
    if (!mapa.nivel || !/^\d+$/.test(nivelCrudo) || nivel < 1) {
      errores.push({
        fila: f,
        uid,
        mensaje: `El Nivel "${nivelCrudo}" no es un numero entero mayor que cero.`,
      });
      continue;
    }
    if (nivelAnterior !== null && nivel > nivelAnterior + 1) {
      errores.push({
        fila: f,
        uid,
        mensaje: `El Nivel salta de ${nivelAnterior} a ${nivel}: falta la fila intermedia. La jerarquia se lee del Nivel, y un salto deja esta partida sin capitulo del que colgar.`,
      });
      continue;
    }
    nivelAnterior = nivel;

    const cInicio = fechaDeCelda(fila.getCell(mapa.inicio ?? 1));
    if (!("iso" in cInicio)) {
      errores.push({
        fila: f,
        uid,
        mensaje:
          cInicio.crudo === ""
            ? "Falta la fecha de inicio."
            : `La fecha de inicio "${cInicio.crudo}" no es una fecha valida. Escribela como AAAA-MM-DD, por ejemplo 2026-06-01.`,
      });
      continue;
    }

    const cFin = fechaDeCelda(fila.getCell(mapa.fin ?? 1));
    if (!("iso" in cFin)) {
      errores.push({
        fila: f,
        uid,
        mensaje:
          cFin.crudo === ""
            ? "Falta la fecha de fin."
            : `La fecha de fin "${cFin.crudo}" no es una fecha valida. Escribela como AAAA-MM-DD, por ejemplo 2026-09-04.`,
      });
      continue;
    }

    if (cFin.iso < cInicio.iso) {
      errores.push({
        fila: f,
        uid,
        mensaje: `El fin (${cFin.iso}) es anterior al inicio (${cInicio.iso}). Una tarea que acaba antes de empezar cuenta como planeada al 100% desde el primer dia e infla la curva de toda la obra.`,
      });
      continue;
    }

    const duracionCruda = textoCelda(fila.getCell(mapa.duracion ?? 1));
    if (!mapa.duracion || duracionCruda === "") {
      errores.push({
        fila: f,
        uid,
        mensaje:
          "Falta la duracion en dias. No se calcula restando las fechas: una partida de un dia puede abarcar tres dias naturales por el calendario.",
      });
      continue;
    }
    const duracionDias = normalizarDecimal(duracionCruda, 2);
    if (duracionDias === null) {
      errores.push({
        fila: f,
        uid,
        mensaje: `La duracion "${duracionCruda}" no es un numero. Escribe los dias en cifra, por ejemplo 8 o 8.8.`,
      });
      continue;
    }
    if (duracionDias.startsWith("-")) {
      errores.push({ fila: f, uid, mensaje: "La duracion no puede ser negativa." });
      continue;
    }

    const planeado = leerPorcentaje(fila, mapa.planeado, f, uid, "% Planeado", errores);
    if (planeado === false) continue;
    const avance = leerPorcentaje(fila, mapa.avance, f, uid, "% Avance", errores);
    if (avance === false) continue;

    const ordenCrudo = mapa.fila ? textoCelda(fila.getCell(mapa.fila)) : "";
    const orden = /^\d+$/.test(ordenCrudo) ? Number(ordenCrudo) : leidas.length + 1;

    let codigo: string | null = mapa.codigo ? textoCelda(fila.getCell(mapa.codigo)) || null : null;
    if (codigo && codigo.length > 40) {
      codigo = codigo.slice(0, 40);
      avisos.push("El codigo se recorto a 40 caracteres.");
    }
    let nombreFinal = nombre;
    if (nombreFinal.length > 500) {
      nombreFinal = nombreFinal.slice(0, 500);
      avisos.push("El nombre se recorto a 500 caracteres.");
    }

    leidas.push({
      filaExcel: f,
      uid,
      orden,
      codigo,
      nombre: nombreFinal,
      nivel,
      inicio: cInicio.iso,
      fin: cFin.iso,
      duracionDias,
      porcentajePlaneado: planeado,
      porcentajeArchivo: avance ?? "0.00",
      depende: mapa.depende ? textoCelda(fila.getCell(mapa.depende)) : "",
      avisos,
    });
  }

  if (leidas.length === 0 && errores.length === 0) {
    errores.push({ fila: 0, mensaje: "El archivo no trae ninguna tarea que importar." });
  }

  // La jerarquia se comprueba sobre el conjunto: una sola raiz, y niveles que
  // de verdad se escalonen. Sin eso `recorrerCapitulos` tomaria las partidas
  // por capitulos y el informe mediria otra cosa.
  const raices = leidas.filter((t) => t.nivel === 1);
  if (leidas.length > 0 && raices.length === 0) {
    errores.push({
      fila: 0,
      mensaje:
        "El archivo no trae ninguna fila de Nivel 1. La primera fila debe ser la obra entera, con Nivel 1; de ella cuelgan los capitulos, con Nivel 2.",
    });
  }
  if (raices.length > 1) {
    errores.push({
      fila: 0,
      mensaje: `El archivo trae ${raices.length} filas de Nivel 1 (filas ${raices.map((r) => r.filaExcel).join(", ")}). Solo puede haber una: la obra entera. Los capitulos van con Nivel 2.`,
    });
  }
  if (leidas.length > 1 && new Set(leidas.map((t) => t.nivel)).size === 1) {
    errores.push({
      fila: 0,
      mensaje:
        "Todas las filas tienen el mismo Nivel. Sin jerarquia no hay capitulos que medir: pon Nivel 1 en la obra, Nivel 2 en los capitulos y Nivel 3 en las partidas.",
    });
  }

  const conocidos = new Set(leidas.map((t) => t.uid));
  const dependencias: DependenciaImportada[] = [];
  let dependenciasDescartadas = 0;

  const tareas: TareaImportada[] = leidas.map((t, i) => {
    const avisos = [...t.avisos];

    // `esResumen` se DERIVA de que la fila siguiente cuelgue mas adentro. Un
    // booleano mantenido a mano que contradiga el nivel produce doble conteo
    // silencioso al ponderar por duracion, que filtra por `!esResumen`.
    const siguiente = leidas[i + 1];
    const esResumen = siguiente !== undefined && siguiente.nivel > t.nivel;

    // Un hito es duracion cero. No se pide marcarlo: pedir el dato y el
    // booleano invita a que se contradigan.
    const esHito = t.duracionDias === "0.00";
    if (esHito && t.inicio !== t.fin) {
      avisos.push("Duracion 0 pero el inicio y el fin no coinciden: se toma como hito en la fecha de inicio.");
    }

    if (t.depende !== "") {
      const r = leerDependencias(t.depende, t.uid, conocidos);
      dependencias.push(...r.enlaces);
      dependenciasDescartadas += r.descartadas;
      avisos.push(...r.avisos);
    }

    let planeado = t.porcentajePlaneado;
    if (planeado === null) {
      planeado = repartoLineal(t.inicio, t.fin, fechaCorte);
      avisos.push(
        `El % Planeado estaba vacio: se calculo ${planeado} repartiendo la duracion entre el inicio y el fin hasta la fecha de corte.`,
      );
    }

    const tarea: TareaImportada = {
      uid: t.uid,
      fila: t.orden,
      codigo: t.codigo,
      nombre: t.nombre,
      nivel: t.nivel,
      esResumen,
      esHito,
      // Fijos, y a proposito: un Excel no trae la red completa, asi que la
      // ruta critica y la holgura NO SE CONOCEN. Marcarlas como no informadas
      // es lo unico honesto; deducirlas seria inventar el dato.
      esCritico: false,
      inicio: t.inicio,
      fin: esHito ? t.inicio : t.fin,
      duracionDias: t.duracionDias,
      porcentajePlaneado: planeado,
      porcentajeArchivo: t.porcentajeArchivo,
      holguraDias: "0.00",
      holguraInferida: true,
    };
    if (avisos.length > 0) tarea.aviso = avisos.join(" ");
    return tarea;
  });

  const raiz = leidas.find((t) => t.nivel === 1);
  const nombreObra = leerEtiqueta(hoja, filaCabecera, ETIQUETAS_OBRA);
  const jornada = Number(leerEtiqueta(hoja, filaCabecera, ETIQUETAS_JORNADA));

  const inicios = tareas.map((t) => t.inicio).sort();
  const fines = tareas.map((t) => t.fin).sort();

  return {
    tareas,
    dependencias,
    errores,
    nombreProyecto: (raiz?.nombre || nombreObra).slice(0, 255),
    fechaCorte,
    minutosPorDia: Number.isFinite(jornada) && jornada > 0 ? jornada : 480,
    inicio: inicios[0] ?? null,
    fin: fines[fines.length - 1] ?? null,
    duracionDias: raiz?.duracionDias ?? null,
    totalTareas: tareas.length,
    totalHitos: tareas.filter((t) => t.esHito).length,
    totalResumen: tareas.filter((t) => t.esResumen).length,
    // Cero y `tareas.length`: consecuencia directa de que no se conozcan.
    totalCriticas: 0,
    holgurasInferidas: tareas.length,
    filasOmitidas,
    dependenciasDescartadas,
  };
}

/**
 * Un porcentaje de 0 a 100. `null` si la celda esta vacia, `false` si es
 * invalida —y entonces ya ha dejado el error puesto—.
 */
function leerPorcentaje(
  fila: ExcelJS.Row,
  columna: number | undefined,
  filaExcel: number,
  uid: number,
  etiqueta: string,
  errores: ErrorCronograma[],
): string | null | false {
  if (!columna) return null;
  const crudo = textoCelda(fila.getCell(columna));
  if (crudo === "") return null;

  const valor = normalizarDecimal(crudo, 2);
  if (valor === null || Number(valor) < 0 || Number(valor) > 100) {
    errores.push({
      fila: filaExcel,
      uid,
      mensaje: `El ${etiqueta} "${crudo}" esta fuera de 0 a 100.`,
    });
    return false;
  }
  return valor;
}

/**
 * Reparte la duracion por igual entre el inicio y el fin, y devuelve cuanto
 * tocaria llevar a la fecha de corte.
 *
 * Es la red para cuando el usuario deja el % Planeado en blanco. Se avisa
 * siempre que se usa: una curva calculada no es la que el planificador
 * escribio, y quien mire el informe tiene que saberlo.
 */
function repartoLineal(inicio: string, fin: string, corte: string | null): string {
  if (corte === null) return "0.00";
  if (corte < inicio) return "0.00";
  if (corte >= fin) return "100.00";

  const dia = 86_400_000;
  const total = (Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / dia;
  if (total <= 0) return "100.00";
  const hecho = (Date.parse(`${corte}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / dia;
  return normalizarDecimal(String((hecho / total) * 100), 2) ?? "0.00";
}
