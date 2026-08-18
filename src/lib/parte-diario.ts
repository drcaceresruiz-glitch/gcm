import type { DiaLaboral } from "@/lib/calendario";
import { normalizarDecimal, sumar } from "@/lib/decimal";

/**
 * El parte diario: el avance de todas las tareas activas, de una vez.
 *
 * QUE PROBLEMA RESUELVE
 *
 * GCM ya sabia registrar el avance de una tarea desde el 9 de agosto. Lo que no
 * se podia era registrarlo de TODAS: la tabla del cronograma abre una fila cada
 * vez y cada reporte es una peticion propia. Reportar la semana entera son unas
 * cien peticiones contra un hosting con veinte procesos de entrada. No es que
 * fuera lento: es que no se hacia.
 *
 * Asi que el parte diario no trae datos nuevos. Trae UN envio.
 *
 * LA REGLA QUE MANDA SOBRE TODAS LAS DEMAS
 *
 * El peor defecto que ha tenido este sistema fue escribir 100% de avance cuando
 * el campo iba vacio: un PPC honesto producia una curva S falsificada al alza.
 * Una pantalla con cien casillas es ese mismo defecto multiplicado por siete
 * dias, asi que aqui **una casilla vacia no escribe nada**. No es un error, es
 * la respuesta «de esta tarea no se nada hoy», y es una respuesta legitima.
 *
 * Si el residente no reporto una tarea, GCM tiene que seguir sin saber nada de
 * ella. Eso es un dato. Un cero o un cien inventados son una mentira.
 */

/// Cuantas tareas admite un parte. Cien y pico es el cronograma real; el tope
/// existe para que un cliente manipulado no meta diez mil filas de una vez.
export const MAX_FILAS_PARTE = 300;

/**
 * TODO LO DE ESTE MODULO CUENTA LOS DIAS EN UTC, y no es un capricho.
 *
 * Las fechas de obra vienen de columnas `@db.Date`, que Prisma devuelve a
 * medianoche UTC. `@/lib/calendario` decide el dia de la semana con `getDay()`
 * —hora LOCAL—, asi que en Peru (UTC-5) una fecha `@db.Date` cae en el dia
 * anterior y `esLaborable` responde por el dia equivocado. Se descubrio aqui,
 * al escribir el test del sabado de CRIOCORD: pedia sabado y salia viernes.
 *
 * Es un defecto latente de `calendario.ts` que afecta tambien a
 * `diasLaborablesEntre`, y arreglarlo alli toca a quien ya lo usa —el plazo de
 * la obra, el Lookahead—, asi que no se hace de paso. Queda anotado en
 * `docs/PENDIENTES.md`. Mientras tanto, este modulo no lo arrastra: cuenta en
 * UTC, que es la misma referencia que usa `curva-s.ts` y la que corresponde a
 * un `@db.Date`.
 */
function diaIsoUtc(fecha: Date): number {
  const d = fecha.getUTCDay();
  return d === 0 ? 7 : d;
}

function esLaborableUtc(
  fecha: Date,
  calendario: readonly DiaLaboral[],
): boolean {
  const dia = calendario.find((d) => d.diaSemana === diaIsoUtc(fecha));
  // Sin fila para ese dia se asume laborable, igual que en `calendario.ts`: es
  // preferible contar de mas a esconder trabajo que si esta programado.
  return dia ? dia.laborable : true;
}

/// Dias laborables entre dos fechas, ambas incluidas, contados en UTC.
function diasLaborablesUtc(
  desde: Date,
  hasta: Date,
  calendario: readonly DiaLaboral[],
): number {
  if (hasta.getTime() < desde.getTime()) return 0;

  let cuenta = 0;
  const cursor = new Date(desde.getTime());
  cursor.setUTCHours(0, 0, 0, 0);
  const fin = new Date(hasta.getTime());
  fin.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= fin.getTime()) {
    if (esLaborableUtc(cursor, calendario)) cuenta++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cuenta;
}

/**
 * Dias laborables transcurridos desde un reporte hasta hoy.
 *
 * Se descuenta uno porque `diasLaborablesUtc` cuenta los dos extremos:
 * reportar hoy tiene que dar cero dias sin reportar, no uno.
 */
export function diasSinReportar(
  ultimo: Date,
  hoy: Date,
  calendario: readonly DiaLaboral[],
): number {
  return Math.max(0, diasLaborablesUtc(ultimo, hoy, calendario) - 1);
}

export interface FilaParte {
  uid: number;
  codigo: string | null;
  nombre: string;
  /// El capitulo del que cuelga, para agrupar la pantalla.
  capitulo: string;
  /// Lo que GCM dice hoy de esta tarea. Se ensena AL LADO de la casilla, nunca
  /// dentro: dentro seria un valor por defecto, y de ahi vino el defecto del
  /// 100%.
  porcentajeActual: string;
  /// Real menos planeado. Negativo es ir por detras.
  desfase: string;
  /// Dias laborables desde el ultimo reporte. Null si nunca se reporto: no es
  /// lo mismo «hace mucho» que «nunca», igual que en el Lookahead no es lo
  /// mismo «sin restricciones» que «sin analizar».
  diasSinReportar: number | null;
  esCritico: boolean;
  /// Se esta ejecutando sin que ninguna semana abierta la comprometiera. No
  /// impide reportar: senala que el PPC de esa semana no cubre este trabajo.
  sinComprometer: boolean;
  /// Restricciones suyas sin levantar. Avanzar con ellas abiertas es la
  /// definicion de trabajo no confiable en el Last Planner.
  restriccionesAbiertas: number;
}

export interface GrupoParte {
  capitulo: string;
  filas: FilaParte[];
}

/// Lo minimo de una tarea del cronograma para decidir si entra en el parte.
export interface TareaAbierta {
  uid: number;
  fila: number;
  esResumen: boolean;
  esHito: boolean;
  inicio: Date;
  fin: Date;
  porcentajeReal: string;
  desfase: string;
}

export interface SeleccionParte<T> {
  dentro: T[];
  /// Cuantas se quedaron fuera por empezar mas alla de la ventana. Se ensena:
  /// una lista recortada que no dice que recorto se lee como la lista entera.
  fuera: number;
}

/**
 * Que tareas se ofrecen para reportar.
 *
 * **No se reutiliza `partidasActivas`**, y la diferencia importa. Aquella sirve
 * al informe semanal y exige `fin >= corte`: lo que ya deberia haber acabado
 * se cae de la lista. Para un informe esta bien —cuenta la semana— pero en el
 * parte del dia seria justo al reves: una partida que tenia que estar
 * terminada el jueves y sigue al 60% es LA que hay que reportar, y esconderla
 * la deja congelada en la curva S para siempre.
 *
 * Asi que aqui entra todo lo que esta abierto: no es resumen ni hito, no llega
 * al 100% y ya empezo o empieza dentro de la ventana. El limite es solo por
 * arriba —lo que aun no arranca— y lo que queda fuera se cuenta para poder
 * decirlo en pantalla.
 *
 * `diasVista === null` quita ese limite por arriba. Hace falta porque la obra
 * no respeta el cronograma: una cuadrilla que termina antes empieza la partida
 * de la semana que viene, y con la ventana puesta esa partida no se puede
 * reportar —queda congelada en 0% mientras avanza de verdad—. La ventana es
 * una comodidad para no ensenar cien filas, no una regla de negocio.
 *
 * El orden es el mismo que el del informe: primero lo que peor va.
 */
export function tareasAbiertas<T extends TareaAbierta>(
  tareas: readonly T[],
  hoy: Date,
  diasVista: number | null = 7,
): SeleccionParte<T> {
  const hasta = diasVista === null ? null : hoy.getTime() + diasVista * 86400000;
  let fuera = 0;

  const dentro = tareas.filter((t) => {
    if (t.esResumen || t.esHito) return false;
    if (Number(t.porcentajeReal) >= 100) return false;
    if (hasta !== null && t.inicio.getTime() > hasta) {
      fuera++;
      return false;
    }
    return true;
  });

  dentro.sort((a, b) => Number(a.desfase) - Number(b.desfase) || a.fila - b.fila);
  return { dentro, fuera };
}

/// Lo minimo de una tarea activa para pintar su fila.
export interface TareaDelParte {
  uid: number;
  codigo: string | null;
  nombre: string;
  porcentajeReal: string;
  desfase: string;
  esCritico: boolean;
}

/**
 * Lo que el plan sabe de una tarea que se esta reportando.
 *
 * El parte del dia registra la REALIDAD y nunca la discute: si la cuadrilla
 * avanzo, avanzo. Pero el Last Planner se sostiene sobre que lo ejecutado sea
 * lo prometido, y sin esta comparacion el PPC puede marcar 90% mientras la
 * obra entera avanza por fuera del plan. Un PPC alto sobre trabajo que nadie
 * comprometio no mide confiabilidad: mide cuantas casillas se marcaron.
 *
 * Por eso se ensena, no se impide.
 */
export interface SenalDelPlan {
  /// Ninguna semana ABIERTA la tiene comprometida.
  sinComprometer: boolean;
  /// Cuantas restricciones suyas siguen sin levantar.
  restriccionesAbiertas: number;
}

/**
 * Las filas del parte, ya agrupadas por capitulo y en el orden en que se
 * reportan.
 *
 * El orden dentro de cada capitulo lo trae quien llama —`partidasActivas` ya
 * ordena por desfase, lo mas atrasado primero— y aqui no se toca: quien rellena
 * el parte de arriba abajo empieza por lo que peor va.
 */
export function filasDelParte(
  tareas: readonly TareaDelParte[],
  capituloPorUid: ReadonlyMap<number, string>,
  ultimoReportePorUid: ReadonlyMap<number, Date>,
  hoy: Date,
  calendario: readonly DiaLaboral[],
  senales: ReadonlyMap<number, SenalDelPlan> = new Map(),
): GrupoParte[] {
  const grupos = new Map<string, FilaParte[]>();

  for (const t of tareas) {
    const capitulo = capituloPorUid.get(t.uid) ?? "Sin capítulo";
    const ultimo = ultimoReportePorUid.get(t.uid) ?? null;

    const fila: FilaParte = {
      uid: t.uid,
      codigo: t.codigo,
      nombre: t.nombre,
      capitulo,
      porcentajeActual: t.porcentajeReal,
      desfase: t.desfase,
      diasSinReportar:
        ultimo === null ? null : diasSinReportar(ultimo, hoy, calendario),
      esCritico: t.esCritico,
      // Sin mapa de senales —obra que no usa Last Planner— no se marca nada:
      // un aviso que sale en todas las filas no avisa de nada.
      sinComprometer: senales.get(t.uid)?.sinComprometer ?? false,
      restriccionesAbiertas: senales.get(t.uid)?.restriccionesAbiertas ?? 0,
    };

    grupos.set(capitulo, [...(grupos.get(capitulo) ?? []), fila]);
  }

  return [...grupos.entries()].map(([capitulo, filas]) => ({ capitulo, filas }));
}

// ---------------------------------------------------------------------------
// El dia de corte
// ---------------------------------------------------------------------------

/**
 * El ultimo dia laborable de la semana a la que pertenece una fecha.
 *
 * Hace falta porque `Project.diaCorteSemanal` es aritmetica pura de siete dias
 * —`fechasSemanales` en `@/lib/curva-s`— y **no mira el calendario laboral**:
 * nada impide hoy que el corte de una obra caiga en domingo. El residente que
 * dijo «el reporte sale el sabado, que es mi ultimo dia laborable» necesita que
 * GCM sepa cual es ese dia de verdad.
 *
 * La semana se toma de lunes a domingo, que es como la cuenta ISO. Si la obra
 * no trabajara NINGUN dia —calendario entero en no laborable, que seria un
 * error de configuracion— devuelve el domingo, para no quedarse sin respuesta.
 */
export function ultimoDiaLaborableDeLaSemana(
  fecha: Date,
  calendario: readonly DiaLaboral[],
): Date {
  const domingo = new Date(fecha.getTime());
  domingo.setUTCHours(0, 0, 0, 0);
  domingo.setUTCDate(domingo.getUTCDate() + (7 - diaIsoUtc(domingo)));

  const cursor = new Date(domingo.getTime());
  for (let i = 0; i < 7; i++) {
    if (esLaborableUtc(cursor, calendario)) return cursor;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return domingo;
}

// ---------------------------------------------------------------------------
// El guardado
// ---------------------------------------------------------------------------

export interface EntradaParte {
  uid: number;
  /// Lo que se tecleo. Vacio = no se toco esta tarea.
  porcentaje: string;
}

/**
 * Que acumulado deja en la tarea lo que se acaba de teclear.
 *
 * La casilla guarda el ACUMULADO de la tarea, pero la pantalla se llama
 * «cuanto se avanzo hoy», asi que el residente escribe 10 queriendo decir
 * «hoy diez puntos» y deja en 10% una partida que iba al 70%. No da error, y
 * ese numero es la fuente del real de la curva S, del EV y del SPI: la obra
 * entera retrocede en silencio.
 *
 * Se resuelve dando las dos formas de decirlo, sin quitar ninguna:
 *
 * - `70`  -> «la tarea queda al 70%». Es lo de siempre.
 * - `+10` -> «hoy avanzamos diez puntos», que se suman a lo que ya habia.
 *
 * Un texto que no se entiende se devuelve TAL CUAL para que lo rechace
 * `validarLoteAvance`: aqui no se inventa un valor ni se traga un error.
 */
export function resolverAvance(texto: string, actual: string): string {
  const t = texto.trim();
  if (t === "" || !t.startsWith("+")) return t;

  const incremento = normalizarDecimal(t.slice(1), 2);
  if (incremento === null) return t;

  const suma = sumar([actual, incremento]);
  // Por encima de 100 no hay avance que medir, y «+20» sobre un 95 es una
  // forma normal de decir «terminala».
  return Number(suma) > 100 ? "100.00" : suma;
}

export type ValidacionParte =
  | { ok: true; escribir: { uid: number; porcentaje: string }[] }
  | { ok: false; error: string };

/**
 * Valida el parte ENTERO antes de tocar la base.
 *
 * Dos decisiones que parecen de detalle y no lo son:
 *
 * 1. **Una casilla vacia no es un error, es una respuesta.** Se descarta en
 *    silencio y no se escribe. Es la regla del 100% dicha en codigo.
 * 2. **Un valor malo tumba el LOTE ENTERO**, no solo su fila. Guardar las
 *    buenas y callar las malas dejaria al residente creyendo que reporto
 *    ochenta tareas cuando entraron setenta y siete, y sin saber cuales
 *    faltan. Con cien casillas delante, eso no se descubre mirando.
 */
export function validarLoteAvance(
  entradas: readonly EntradaParte[],
  fecha: string,
  hoy: Date,
): ValidacionParte {
  if (entradas.length > MAX_FILAS_PARTE) {
    return { ok: false, error: "Demasiadas tareas en un solo parte." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: "Falta la fecha del parte." };
  }

  // Un reporte con fecha futura descolocaria la serie: el vigente de cada tarea
  // es el de fecha mas alta, asi que uno fechado el mes que viene congelaria
  // esa tarea hasta que llegara el mes que viene. Es la misma regla que
  // `registrarAvance` y por el mismo motivo.
  const dia = new Date(`${fecha}T00:00:00Z`);
  const limite = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()),
  );
  if (Number.isNaN(dia.getTime())) {
    return { ok: false, error: "La fecha del parte no existe." };
  }
  if (dia.getTime() > limite.getTime()) {
    return { ok: false, error: "No se puede reportar avance de un día futuro." };
  }

  const escribir: { uid: number; porcentaje: string }[] = [];
  const vistos = new Set<number>();

  for (const e of entradas) {
    const texto = e.porcentaje.trim();
    if (texto === "") continue;

    if (!Number.isSafeInteger(e.uid)) {
      return { ok: false, error: "Hay una tarea que no se reconoce." };
    }
    if (vistos.has(e.uid)) {
      // Dos valores para la misma tarea en el mismo envio: no hay forma de
      // saber cual quiso, y elegir uno seria adivinar.
      return { ok: false, error: "Una tarea aparece dos veces en el parte." };
    }

    const valor = normalizarDecimal(texto, 2);
    if (valor === null) {
      return { ok: false, error: `«${texto}» no es un porcentaje válido.` };
    }
    // Comparacion de rango, no aritmetica: lo que se guarda sigue siendo el
    // texto exacto que se normalizo.
    const n = Number(valor);
    if (n < 0 || n > 100) {
      return { ok: false, error: `El porcentaje ${valor} está fuera de 0 a 100.` };
    }

    vistos.add(e.uid);
    escribir.push({ uid: e.uid, porcentaje: valor });
  }

  return { ok: true, escribir };
}
