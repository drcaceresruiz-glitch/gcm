import type { DependenciaImportada, TareaImportada } from "@/lib/msproject-xml";

/**
 * La forma canonica del PLAN que trae un archivo de cronograma.
 *
 * Existe para responder UNA pregunta: **¿cambio el archivo?** No responde
 * "¿difiere la base de lo que dice el archivo?", que es otra cosa y llevaria
 * a la respuesta equivocada.
 *
 * El guardia de `importarCronograma` salta cuando ya hay un corte con la
 * misma `fechaCorte`. Su motivo es bueno —del mismo corte hay dos exports
 * distintos, guardados con otra configuracion, y admitir los dos pondria dos
 * puntos sobre el mismo dia de la curva S— pero comparaba SOLO la fecha, asi
 * que trataba igual "mismo corte, mismo plan" (saltar, bien) y "mismo corte,
 * plan distinto" (saltar, mal, y en silencio).
 *
 * Comparar los archivos byte a byte no sirve, por lo mismo que dice el
 * comentario del guardia. Lo que se compara es el plan ya leido.
 */

/** Lo que hace falta de una fila YA GUARDADA para pesarla en la huella. */
export interface TareaGuardadaComparable {
  uid: number;
  fila: number;
  codigo: string | null;
  nombre: string;
  nivel: number;
  esHito: boolean;
  esCritico: boolean;
  inicio: Date;
  fin: Date;
  /// Llegan como `Decimal` de Prisma; solo se les pide `toString()`.
  duracionDias: { toString(): string };
  porcentajePlaneado: { toString(): string };
  porcentajeArchivo: { toString(): string };
  holguraDias: { toString(): string };
  holguraInferida: boolean;
}

export interface DependenciaGuardadaComparable {
  tareaUid: number;
  predecesoraUid: number;
  tipo: string;
  desfaseDias: { toString(): string };
}

/**
 * Dos decimales, que es la precision de las columnas.
 *
 * ESTA ES LA TRAMPA PRINCIPAL DE TODO EL MODULO. Los mismos numeros llegan
 * como texto desde el lector ("8.8", "0") y como `Decimal` desde Prisma
 * ("8.80", "0.00"). Sin normalizar, la huella saldria distinta SIEMPRE, el
 * no-op legitimo se convertiria en una confirmacion perpetua y el arreglo
 * seria el fallo de hoy girado del reves.
 */
function dec(valor: string | { toString(): string }): string {
  const n = Number(typeof valor === "string" ? valor : valor.toString());
  return Number.isFinite(n) ? n.toFixed(2) : "?";
}

/**
 * Fecha de calendario en "YYYY-MM-DD".
 *
 * El lector ya la da asi y la base la devuelve como `Date` a medianoche UTC.
 * `toISOString()` es correcto porque `fechaDeObra` la anclo en UTC; pasar por
 * la zona local correria un dia todo el cronograma, que es justo lo que
 * `cronograma.service.ts` evita al escribirla.
 */
function dia(valor: string | Date): string {
  return typeof valor === "string" ? valor : valor.toISOString().slice(0, 10);
}

/**
 * QUE ENTRA Y QUE NO, que es lo unico dificil de este modulo.
 *
 * **No entran `esResumen` ni `sinProgramar`, y no entran las fechas ni la
 * duracion de las filas que el ARCHIVO marca como resumen.** Los recalcula
 * GCM despues de importar, no los manda el archivo:
 *
 * `recalcularResumenes` (`edt.service.ts`) reescribe `esResumen`,
 * `sinProgramar`, `inicio`, `fin` y `duracionDias`, y consulta las filas SIN
 * filtrar por origen, asi que tambien toca las `IMPORTADO`. Lo llaman la
 * sincronizacion de la EDT y las tres operaciones de tarea manual. La
 * importacion NO lo llama, asi que un corte recien cargado guarda lo del
 * archivo tal cual; en cuanto alguien sincroniza la EDT, las filas resumen
 * dejan de coincidir con el.
 *
 * Si esos campos entraran, despues de la primera sincronizacion el mismo
 * archivo daria "distinto" y GCM ofreceria un reemplazo que ademas
 * DESHARIA el recalculo —incluida la cabecera que `ec364ae` acaba de
 * colocar en su sitio— hasta volver a sincronizar.
 *
 * Las hojas si conservan lo del archivo: el recalculo solo les escribe
 * cuando dejan de ser resumen, y entonces la estructura ya cambio y eso lo
 * cazan `nivel` y `fila`, que nadie recalcula.
 *
 * Tampoco entran `nombreProyecto` ni el nombre del archivo: son metadatos, y
 * es justo lo que permite que dos exports del mismo corte guardados con otra
 * configuracion sigan siendo el mismo corte.
 */
function componer(
  filas: readonly { uid: number; identidad: string; plan: string }[],
  dependencias: readonly string[],
  minutosPorDia: number,
  resumenSegunArchivo: ReadonlySet<number>,
): string {
  const tareas = [...filas]
    .sort((a, b) => a.uid - b.uid)
    .map((f) =>
      // El resumen aporta identidad y estructura, pero no fechas: las suyas
      // son la envoltura de sus hijas y las pone GCM.
      resumenSegunArchivo.has(f.uid)
        ? `${f.uid}|${f.identidad}|resumen`
        : `${f.uid}|${f.identidad}|${f.plan}`,
    );

  return [
    `min:${minutosPorDia}`,
    ...tareas,
    ...[...dependencias].sort(),
  ].join("\n");
}

/** Los UID que el ARCHIVO marca como resumen. Manda el archivo en los dos lados. */
export function resumenesDelArchivo(
  tareas: readonly TareaImportada[],
): ReadonlySet<number> {
  return new Set(tareas.filter((t) => t.esResumen).map((t) => t.uid));
}

/**
 * Los dos lados componen la fila con ESTA funcion y no cada uno la suya.
 *
 * Duplicar el orden de los campos en los dos adaptadores es exactamente la
 * clase de fallo que no da la cara: se anade un campo en uno, se olvida en el
 * otro, y la huella difiere siempre sin que ninguna prueba obvia lo note.
 */
function identidad(t: {
  fila: number;
  codigo: string | null;
  nombre: string;
  nivel: number;
  esHito: boolean;
  esCritico: boolean;
  porcentajePlaneado: string;
  porcentajeArchivo: string;
  holguraDias: string;
  holguraInferida: boolean;
}): string {
  return [
    t.fila,
    t.codigo ?? "",
    t.nombre,
    t.nivel,
    t.esHito ? "H" : "-",
    t.esCritico ? "C" : "-",
    t.porcentajePlaneado,
    t.porcentajeArchivo,
    t.holguraDias,
    t.holguraInferida ? "i" : "-",
  ].join("|");
}

function enlace(d: {
  tareaUid: number;
  predecesoraUid: number;
  tipo: string;
  desfaseDias: string;
}): string {
  return `dep:${d.tareaUid}|${d.predecesoraUid}|${d.tipo}|${d.desfaseDias}`;
}

/** La forma canonica del plan tal como lo trae el archivo. */
export function formaCanonicaDeArchivo(analisis: {
  tareas: readonly TareaImportada[];
  dependencias: readonly DependenciaImportada[];
  minutosPorDia: number;
}): string {
  return componer(
    analisis.tareas.map((t) => ({
      uid: t.uid,
      identidad: identidad({
        ...t,
        porcentajePlaneado: dec(t.porcentajePlaneado),
        porcentajeArchivo: dec(t.porcentajeArchivo),
        holguraDias: dec(t.holguraDias),
      }),
      plan: `${dia(t.inicio)}|${dia(t.fin)}|${dec(t.duracionDias)}`,
    })),
    analisis.dependencias.map((d) => enlace({ ...d, desfaseDias: dec(d.desfaseDias) })),
    analisis.minutosPorDia,
    resumenesDelArchivo(analisis.tareas),
  );
}

/**
 * La forma canonica de lo GUARDADO, para comparar con la del archivo.
 *
 * `resumenSegunArchivo` sale del archivo a proposito, no de la columna
 * `esResumen` de la base: esa la recalcula GCM y usarla haria que el criterio
 * de comparacion dependiera de lo que se esta comparando.
 *
 * Solo se le pasan las filas `origen: IMPORTADO`. Las `MANUAL` no salieron de
 * ningun archivo y no deben hacer que el archivo parezca distinto.
 */
export function formaCanonicaDeGuardado(
  tareas: readonly TareaGuardadaComparable[],
  dependencias: readonly DependenciaGuardadaComparable[],
  minutosPorDia: number,
  resumenSegunArchivo: ReadonlySet<number>,
): string {
  return componer(
    tareas.map((t) => ({
      uid: t.uid,
      identidad: identidad({
        ...t,
        porcentajePlaneado: dec(t.porcentajePlaneado),
        porcentajeArchivo: dec(t.porcentajeArchivo),
        holguraDias: dec(t.holguraDias),
      }),
      plan: `${dia(t.inicio)}|${dia(t.fin)}|${dec(t.duracionDias)}`,
    })),
    dependencias.map((d) => enlace({ ...d, desfaseDias: dec(d.desfaseDias) })),
    minutosPorDia,
    resumenSegunArchivo,
  );
}
