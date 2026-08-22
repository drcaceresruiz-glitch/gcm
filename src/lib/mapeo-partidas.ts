import { sumar } from "@/lib/decimal";

/**
 * Proponer que partidas del presupuesto cubre cada tarea del cronograma.
 *
 * Existe para poder PONDERAR EL AVANCE POR DINERO. Sin esto, el avance de la
 * obra se pondera por duracion, que es lo unico que trae el archivo de
 * Project; con esto se expresa en soles y se puede contrastar con lo
 * comprometido en ordenes.
 *
 * LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO: aqui solo se PROPONE. Nada de lo
 * que sale de aqui se guarda por su cuenta. Se midio sobre los archivos
 * reales de CRIOCORD y enlazar por codigo automaticamente resulto PEOR que no
 * enlazar: de las 56 coincidencias de codigo, 36 apuntaban a otra cosa —el
 * capitulo 5 del cronograma va desplazado una posicion respecto al del
 * presupuesto, y el "5.5" habria caido sobre un descuento comercial—. Y un
 * mapeo equivocado no da ningun sintoma: la curva sale bonita y miente.
 *
 * Por eso la coincidencia de codigo se marca pero NO puntua. Si puntuara,
 * ordenaria la lista poniendo arriba justo los emparejamientos que se midieron
 * como falsos, y la persona que revisa aceptaria el primero.
 */

/** Palabras que aparecen en casi toda descripcion y no distinguen nada. */
const VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "en", "para", "con", "por", "a",
  "un", "una", "al", "e", "o", "su", "sus", "se", "lo", "segun", "tipo",
  "incluye", "incluido", "obra", "trabajos",
]);

const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Palabras significativas de un texto, sin tildes ni signos.
 *
 * Los numeros se conservan: en un presupuesto "210" (kg/cm2), "1/2" o "piso 1"
 * son justo lo que distingue una partida de su vecina.
 */
export function palabras(texto: string): Set<string> {
  const limpio = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .replace(/[^a-z0-9/]+/g, " ");

  return new Set(
    limpio
      .split(" ")
      .map((p) => p.trim())
      .filter((p) => p.length > 1 && !VACIAS.has(p)),
  );
}

/**
 * Parecido entre dos textos, de 0 a 1 (coeficiente de Dice).
 *
 * Se usa el doble de las palabras comunes sobre el total de ambas, y no solo
 * las comunes sobre las de una: asi una descripcion larguisima no puntua alto
 * solo por contener todas las palabras de una corta.
 */
export function parecido(a: string, b: string): number {
  const pa = palabras(a);
  const pb = palabras(b);
  if (pa.size === 0 || pb.size === 0) return 0;

  let comunes = 0;
  for (const p of pa) if (pb.has(p)) comunes++;

  return (2 * comunes) / (pa.size + pb.size);
}

export interface PartidaMapeable {
  codigo: string;
  descripcion: string;
  /// Lo que cuesta. Es el peso que este mapeo existe para aportar.
  parcial: string | null;
}

export interface Propuesta {
  codigo: string;
  descripcion: string;
  parcial: string | null;
  /// Parecido de la descripcion, de 0 a 1.
  puntuacion: number;
  /// El codigo de la tarea y el de la partida coinciden. SE MARCA PERO NO
  /// PUNTUA: se midio que en dos de cada tres casos apunta a otra cosa.
  mismoCodigo: boolean;
}

/// Por debajo de esto, proponer solo estorba: la persona lee cinco lineas que
/// no tienen nada que ver y deja de leer las propuestas.
const MINIMO = 0.2;

/**
 * Las partidas que mejor encajan con una tarea, de mas a menos parecida.
 *
 * Devuelve lista vacia cuando ninguna llega al minimo. Es lo correcto: en
 * CRIOCORD hay 314 partidas para 106 tareas, y muchas tareas del cronograma
 * —hitos, «fin de estructuras»— no cubren ninguna partida.
 */
export function proponerPartidas(
  tarea: { codigo: string | null; nombre: string },
  partidas: readonly PartidaMapeable[],
  limite = 5,
): Propuesta[] {
  const propuestas: Propuesta[] = [];

  for (const p of partidas) {
    const puntuacion = parecido(tarea.nombre, p.descripcion);
    const mismoCodigo = tarea.codigo !== null && normalizarCodigo(tarea.codigo) === normalizarCodigo(p.codigo);

    // Una coincidencia de codigo entra en la lista aunque el texto no se
    // parezca, para que la persona pueda verla y descartarla a conciencia.
    if (puntuacion < MINIMO && !mismoCodigo) continue;

    propuestas.push({
      codigo: p.codigo,
      descripcion: p.descripcion,
      parcial: p.parcial,
      puntuacion,
      mismoCodigo,
    });
  }

  return propuestas
    .sort((a, b) => b.puntuacion - a.puntuacion)
    .slice(0, limite);
}

/**
 * "02.04" y "2.4" son el mismo codigo escrito de dos formas.
 *
 * El cronograma los escribe sin ceros a la izquierda y el presupuesto, que
 * viene de S10, con ellos. Compararlos como texto daria que nunca coinciden, y
 * entonces la marca de «mismo codigo» no avisaria de nada.
 */
function normalizarCodigo(codigo: string): string {
  return codigo
    .split(".")
    .map((s) => String(Number(s)))
    .join(".");
}

export interface EnlaceConfirmado {
  uid: number;
  codigoPartida: string;
}

/**
 * Cuanto dinero cubre cada tarea, segun el mapeo confirmado.
 *
 * Una tarea puede cubrir VARIAS partidas —hay 314 partidas para 106 tareas,
 * asi que el presupuesto es tres veces mas fino—, y su importe es la suma de
 * las que tenga enlazadas.
 *
 * Una misma partida enlazada a dos tareas se cuenta en las dos, y es
 * deliberado no impedirlo aqui: repartir ese importe exigiria saber en que
 * proporcion, y eso no lo sabe ningun algoritmo. Lo que si hace `cobertura` es
 * contarla UNA sola vez, para que el porcentaje cubierto no pase del 100%.
 */
export function importePorTarea(
  enlaces: readonly EnlaceConfirmado[],
  partidas: readonly PartidaMapeable[],
): Map<number, string> {
  const porCodigo = new Map(partidas.map((p) => [p.codigo, p.parcial]));
  const acumulado = new Map<number, string[]>();

  for (const e of enlaces) {
    const parcial = porCodigo.get(e.codigoPartida);
    if (!parcial) continue;

    acumulado.set(e.uid, [...(acumulado.get(e.uid) ?? []), parcial]);
  }

  const importes = new Map<number, string>();
  for (const [uid, valores] of acumulado) importes.set(uid, sumar(valores));

  return importes;
}

export interface Cobertura {
  /// Importe del presupuesto que alguna tarea cubre.
  mapeado: string;
  /// Importe total de las partidas costeables.
  total: string;
  /// De 0 a 100. Es lo que decide si la curva ya se puede pesar por dinero.
  porcentaje: number;
  /// Cuantas partidas del presupuesto siguen sin tarea que las cubra.
  partidasSinTarea: number;
}

/**
 * Que parte del presupuesto esta cubierta por el mapeo.
 *
 * Es la cifra que decide si el CPI (y sus proyecciones, EAC/VAC) son
 * fiables: un costo registrado que solo cubre el 20% del presupuesto
 * describe una quinta parte de la obra, aunque la cifra parezca completa. No
 * decide con que se pesa el avance —eso siempre es la duracion, GCM no
 * pondera por dinero hoy—.
 *
 * Cada partida cuenta UNA vez aunque la cubran varias tareas; si no, el
 * porcentaje podria pasar del 100% y dejaria de significar nada.
 */
export function cobertura(
  enlaces: readonly EnlaceConfirmado[],
  partidas: readonly PartidaMapeable[],
): Cobertura {
  const costeables = partidas.filter((p) => p.parcial !== null);
  const cubiertos = new Set(enlaces.map((e) => e.codigoPartida));

  const conTarea = costeables.filter((p) => cubiertos.has(p.codigo));

  const mapeado = sumar(conTarea.map((p) => p.parcial!));
  const total = sumar(costeables.map((p) => p.parcial!));

  const t = Number(total);

  return {
    mapeado,
    total,
    // Comparacion para decidir, no aritmetica: los importes que se guardan y
    // se muestran siguen siendo los textos exactos.
    porcentaje: t > 0 ? (Number(mapeado) / t) * 100 : 0,
    partidasSinTarea: costeables.length - conTarea.length,
  };
}
