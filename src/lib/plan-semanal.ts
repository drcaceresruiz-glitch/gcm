import type { CausaNoCumplimiento } from "@/generated/prisma/enums";
import { normalizarDecimal, sumar } from "@/lib/decimal";

/**
 * Plan Semanal (Last Planner): las cuentas del corto plazo, en logica pura.
 *
 *   - PPC (Percent Plan Complete) = compromisos CUMPLIDOS / TOTAL comprometido.
 *     Mide la fiabilidad de la planificacion, no el avance fisico: da igual
 *     cuanto se hizo de mas; lo que cuenta es si se cumplio lo que se prometio.
 *   - CNC (causas de no cumplimiento) = por que fallo cada compromiso no
 *     cumplido. Contadas de mayor a menor son el Pareto que dice donde atacar.
 *
 * Sin base de datos: se prueba sola. El servicio trae los compromisos y aqui
 * solo se cuentan.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

/// Etiquetas legibles del catalogo fijo de causas.
export const ETIQUETA_CNC: Record<CausaNoCumplimiento, string> = {
  PRERREQUISITO: "Prerrequisito / tarea previa",
  MATERIALES: "Materiales",
  MANO_OBRA: "Mano de obra",
  EQUIPOS: "Equipos",
  INFORMACION: "Informacion / RFI",
  CLIENTE_TERCEROS: "Cliente / terceros",
  CLIMA: "Clima",
  REPROGRAMACION: "Reprogramacion",
  OTRA: "Otra",
};

/**
 * Un compromiso tal como llega del servidor a la pantalla de cierre.
 *
 * Vive aqui, y no en el componente, porque lo que se hace con el —decidir que
 * se conserva cuando los compromisos cambian bajo los pies— es aritmetica y
 * tiene que estar probado.
 */
export interface CompromisoDeCierre {
  id: string;
  descripcion: string;
  /// uid de la tarea del cronograma; null si es una linea libre.
  uid: number | null;
  metaPorcentaje: string | null;
  cumplido: boolean | null;
  causa: CausaNoCumplimiento | null;
  notaCierre: string | null;
  porcentajeReal: string | null;
  cantidadPlan: string | null;
  unidad: string | null;
  cantidadEjec: string | null;
}

/// La fila editable de la pantalla de cierre.
export interface FilaCierre {
  id: string;
  descripcion: string;
  /// uid de la tarea del cronograma; null si es una linea libre (no propaga avance).
  uid: number | null;
  cumplido: boolean;
  causa: CausaNoCumplimiento;
  nota: string;
  /// % alcanzado (acumulado 0-100) de la tarea; se propaga a su avance al cerrar.
  porcentajeReal: string;
  /// Cuanto se ejecuto, en la unidad del compromiso. Solo se pide si se
  /// comprometio por cantidad.
  cantidadEjec: string;
  cantidadPlan: string | null;
  unidad: string | null;
}

/**
 * Construye las filas editables del cierre a partir de lo que manda el
 * servidor, conservando lo que la persona ya estaba tecleando.
 *
 * POR QUE HACE FALTA CONSERVAR NADA: guardar la planificacion BORRA los
 * compromisos y los vuelve a crear (`deleteMany` + `createMany` en
 * `guardarCompromisos`), asi que despues de guardar los ids son otros. Y las
 * dos cosas viven en la misma pantalla: arriba se planifica, abajo se cierra.
 * Sin esto, quien ajustaba los compromisos y cerraba sin recargar mandaba ids
 * que ya no existian y se topaba con un callejon sin salida.
 *
 * El emparejamiento es por `uid` —y por descripcion en las lineas libres, que
 * no tienen uid—, NUNCA por `id`, que es justo lo que no sobrevive. Es la
 * misma idea que `mapaPreservablePorUid` en el servicio, y por la misma
 * razon: lo que la persona escribio no puede perderse porque una fila haya
 * cambiado de identidad por debajo.
 *
 * El orden de preferencia de cada campo es: lo que la persona acaba de
 * teclear, luego lo ya guardado, luego el punto de partida razonable.
 */
export function construirFilasCierre(
  compromisos: readonly CompromisoDeCierre[],
  previas?: readonly FilaCierre[],
): FilaCierre[] {
  const porUid = new Map<number, FilaCierre>();
  const porDescripcion = new Map<string, FilaCierre>();
  for (const f of previas ?? []) {
    if (f.uid !== null) porUid.set(f.uid, f);
    else porDescripcion.set(f.descripcion, f);
  }

  return compromisos.map((c) => {
    const antes =
      c.uid !== null ? porUid.get(c.uid) : porDescripcion.get(c.descripcion);

    return {
      id: c.id,
      descripcion: c.descripcion,
      uid: c.uid,
      // Si el compromiso nunca se evaluo (cumplido null) arranca SIN tildar:
      // darlo por cumplido inflaba el PPC y tildaba hasta tareas al 0%.
      cumplido: antes?.cumplido ?? c.cumplido ?? false,
      causa: antes?.causa ?? c.causa ?? "PRERREQUISITO",
      nota: antes?.nota ?? c.notaCierre ?? "",
      porcentajeReal:
        antes?.porcentajeReal ?? c.porcentajeReal ?? c.metaPorcentaje ?? "",
      // Se arranca de lo comprometido, que es la respuesta mas probable ("se
      // hizo lo previsto") y se corrige encima.
      cantidadEjec: antes?.cantidadEjec ?? c.cantidadEjec ?? c.cantidadPlan ?? "",
      cantidadPlan: c.cantidadPlan,
      unidad: c.unidad,
    };
  });
}

/// El orden fijo de las causas, para el select y el Pareto.
export const CAUSAS_CNC = Object.keys(ETIQUETA_CNC) as CausaNoCumplimiento[];

export interface CompromisoEvaluado {
  /// null = sin evaluar todavia.
  cumplido: boolean | null;
  causa: CausaNoCumplimiento | null;
}

export interface PpcResultado {
  total: number;
  cumplidos: number;
  /// 0..100. null si no hay compromisos (no hay PPC que calcular).
  ppc: number | null;
}

/**
 * El PPC de un plan: cumplidos entre el TOTAL comprometido.
 *
 * El denominador es todo lo comprometido, no solo lo evaluado: un compromiso
 * sin marcar cuenta como no cumplido, que es lo honesto —no cerrar la semana no
 * sube el PPC—.
 */
export function ppcDePlan(compromisos: readonly CompromisoEvaluado[]): PpcResultado {
  const total = compromisos.length;
  const cumplidos = compromisos.filter((c) => c.cumplido === true).length;
  return { total, cumplidos, ppc: total === 0 ? null : (cumplidos / total) * 100 };
}

/**
 * Que porcentaje de avance fisico se registra al cerrar un compromiso.
 *
 * **Esta funcion existe por un fallo real que falsificaba la curva S.** La
 * regla anterior era: si el campo viene vacio y esta marcado como cumplido,
 * escribir `100`. Parece razonable y no lo es, porque el caso normal del Last
 * Planner es comprometer el TRAMO de esta semana de una tarea que dura tres:
 * el residente marca cumplido —que es verdad—, no toca un campo que no le pide
 * nada, y la tarea entera quedaba al 100 %.
 *
 * `AvanceTarea` es la fuente unica del real de la curva S, del EV, del SPI,
 * del Gantt y de las alertas de atraso. Es decir: un PPC honesto producia una
 * obra que se veia al dia. El peor fallo posible en una herramienta de
 * control, porque aparecia justo cuando el PTS se usaba bien.
 *
 * La regla nueva no adivina:
 *
 * - Si hay un porcentaje escrito, ese manda —tambien si no se cumplio: se
 *   pudo avanzar sin llegar a la meta, y eso es informacion buena—.
 * - Si no lo hay pero se cumplio y habia META pactada, se registra la meta:
 *   cumplir un compromiso es alcanzar lo que se prometio.
 * - Si no hay ni porcentaje ni meta, NO SE REGISTRA NADA. Callar es correcto;
 *   inventar un 100 no lo es. La pantalla avisa de que no se registrara.
 */
export function porcentajeARegistrar(entrada: {
  /// Lo que tecleo quien cierra la semana. Vacio = no dijo nada.
  porcentajeReal: string | null | undefined;
  cumplido: boolean | null | undefined;
  /// La meta acumulada pactada al comprometer, si la hubo.
  metaPorcentaje: string | null | undefined;
}): string | null {
  const escrito = entrada.porcentajeReal?.trim();
  if (escrito) return escrito;

  if (!entrada.cumplido) return null;

  const meta = entrada.metaPorcentaje?.trim();
  return meta ? meta : null;
}

export interface FilaPareto {
  causa: CausaNoCumplimiento;
  conteo: number;
}

/**
 * Cuenta las causas de los compromisos NO cumplidos, de mayor a menor.
 *
 * Solo entran los que fallaron y tienen causa: un compromiso cumplido, o uno
 * fallido sin causa anotada, no aporta al Pareto.
 */
export function paretoCausas(
  compromisos: readonly CompromisoEvaluado[],
): FilaPareto[] {
  const conteo = new Map<CausaNoCumplimiento, number>();

  for (const c of compromisos) {
    if (c.cumplido === false && c.causa) {
      conteo.set(c.causa, (conteo.get(c.causa) ?? 0) + 1);
    }
  }

  return [...conteo.entries()]
    .map(([causa, n]) => ({ causa, conteo: n }))
    .sort((a, b) => b.conteo - a.conteo);
}

export interface PuntoPpc {
  fecha: Date;
  ppc: number;
}

/**
 * La serie de PPC por semana, del mas antiguo al mas reciente, saltando las
 * semanas sin PPC (abiertas o vacias). Es lo que dibuja la tendencia.
 */
export function tendenciaPpc(
  planes: readonly { fecha: Date; ppc: number | null }[],
): PuntoPpc[] {
  return planes
    .filter((p): p is PuntoPpc => p.ppc !== null)
    .slice()
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}

/**
 * La proxima fecha de corte segun el dia ISO configurado (1=lunes..7=domingo):
 * hoy si hoy ya es ese dia, o el siguiente dia de la semana que coincida.
 *
 * Sirve para proponer la fecha de una semana nueva: se planifica la semana que
 * cierra en el proximo corte.
 */
export function proximoCorte(diaSemana: number, hoy: Date): Date {
  const iso = hoy.getUTCDay() === 0 ? 7 : hoy.getUTCDay();
  const salto = (diaSemana - iso + 7) % 7;
  return new Date(hoy.getTime() + salto * DIA_MS);
}

export interface RangoSemana {
  inicio: Date;
  fin: Date;
}

/**
 * La semana que representa un plan: los 7 dias que TERMINAN en el corte, es
 * decir [corte - 6 dias, corte]. El corte es el dia en que se cierra y mide la
 * semana; el trabajo comprometido es el de esos siete dias.
 */
export function rangoSemana(fechaCorte: Date): RangoSemana {
  return { inicio: new Date(fechaCorte.getTime() - 6 * DIA_MS), fin: fechaCorte };
}

export interface TareaProgramada {
  uid: number;
  codigo: string | null;
  nombre: string;
  inicio: Date;
  fin: Date;
  esResumen: boolean;
}

/**
 * Las tareas del cronograma cuyo trabajo programado SOLAPA la semana: su
 * periodo [inicio, fin] toca el rango [inicioSemana, finSemana]. Incluye las
 * que vienen de antes y siguen en curso. Se excluyen los resumenes (son
 * agrupadores, no trabajo). Ordenadas por fecha de inicio y luego por codigo.
 *
 * Es la base del autocargado del Plan Semanal: al abrir una semana sin
 * compromisos, se proponen estas tareas para que el residente solo confirme.
 */
export function tareasDeLaSemana(
  tareas: readonly TareaProgramada[],
  inicioSemana: Date,
  finSemana: Date,
): TareaProgramada[] {
  const ini = inicioSemana.getTime();
  const fin = finSemana.getTime();
  return tareas
    .filter((t) => !t.esResumen && t.inicio.getTime() <= fin && t.fin.getTime() >= ini)
    .slice()
    .sort(
      (a, b) =>
        a.inicio.getTime() - b.inicio.getTime() ||
        (a.codigo ?? "").localeCompare(b.codigo ?? ""),
    );
}

export interface EnlacePredecesora {
  tareaUid: number;
  predecesoraUid: number;
  /// FC (fin-comienzo), CC (comienzo-comienzo), FF (fin-fin), CF (comienzo-fin).
  tipo: string;
}

export interface RestriccionTarea {
  /// true = se puede iniciar/adelantar; false = tiene una predecesora pendiente.
  libre: boolean;
  /// Descripcion de la restriccion cuando no esta libre (para el aviso).
  motivo: string | null;
}

/**
 * Si una tarea se puede INICIAR (o adelantar) segun sus predecesoras.
 *
 * Solo miran al INICIO de la tarea (que es lo que se adelanta):
 *   - FC (fin->comienzo): la predecesora debe TERMINAR antes -> restringe si &lt; 100%.
 *   - CC (comienzo->comienzo): debe haber ARRANCADO -> restringe si esta en 0%.
 *   - FF / CF: gobiernan el fin, no el inicio -> no restringen adelantar.
 *
 * Sin predecesoras, o con todas las que gobiernan el inicio satisfechas, la
 * tarea esta LIBRE. Es la logica Last Planner de "liberar restricciones": no
 * bloquea, solo avisa.
 */
export function restriccionDeTarea(
  uid: number,
  dependencias: readonly EnlacePredecesora[],
  avancePorUid: ReadonlyMap<number, number>,
  nombrePorUid?: ReadonlyMap<number, string>,
): RestriccionTarea {
  for (const d of dependencias) {
    if (d.tareaUid !== uid) continue;

    const avance = avancePorUid.get(d.predecesoraUid) ?? 0;
    const tipo = d.tipo.toUpperCase();

    const gobierna =
      tipo === "FC" ? avance < 100 : tipo === "CC" ? avance <= 0 : false;

    if (gobierna) {
      const nombre =
        nombrePorUid?.get(d.predecesoraUid) ?? `tarea ${d.predecesoraUid}`;
      return { libre: false, motivo: `${nombre} al ${Math.round(avance)}%` };
    }
  }

  return { libre: true, motivo: null };
}


export interface PartidaMedible {
  unidad: string | null;
  /// Metrado como texto decimal (viene de un Decimal de la BD).
  metrado: string | null;
}

export type OrigenCantidad =
  | "SIN_PARTIDA"
  | "PARTIDA"
  | "PARTIDAS_HOMOGENEAS"
  | "UNIDADES_MIXTAS";

export interface SugerenciaCantidad {
  unidad: string | null;
  cantidad: string | null;
  origen: OrigenCantidad;
  /// Texto para la pantalla cuando no se puede proponer nada.
  aviso: string | null;
}

/**
 * Que cantidad y unidad proponer al comprometer una tarea, a partir de las
 * partidas del presupuesto que tiene mapeadas.
 *
 * Una tarea puede mapear a VARIAS partidas (el mapeo es N:N). Sumar metrados de
 * unidades distintas (m2 + kg) no significa nada: en ese caso no se propone
 * nada y se dice por que, para que lo escriba el residente, que es quien sabe.
 * La suma va con `sumar` (exacta, sin coma flotante) porque es una cantidad de
 * obra, no un adorno.
 */
export function sugerirCantidad(
  partidas: readonly PartidaMedible[],
): SugerenciaCantidad {
  const conUnidad = partidas.filter(
    (p): p is PartidaMedible & { unidad: string } =>
      typeof p.unidad === "string" && p.unidad.trim().length > 0,
  );
  const primera = conUnidad[0];
  if (!primera) {
    return {
      unidad: null,
      cantidad: null,
      origen: "SIN_PARTIDA",
      aviso: "La tarea no tiene partida mapeada: indica cantidad y unidad.",
    };
  }

  const unidad = primera.unidad.trim();
  const mixtas = conUnidad.some(
    (p) => p.unidad.trim().toLowerCase() !== unidad.toLowerCase(),
  );
  if (mixtas) {
    return {
      unidad: null,
      cantidad: null,
      origen: "UNIDADES_MIXTAS",
      aviso: "Varias partidas con unidades distintas: indicala a mano.",
    };
  }

  const metrados = conUnidad
    .map((p) => p.metrado)
    .filter((m): m is string => typeof m === "string" && m.trim().length > 0);

  return {
    unidad,
    cantidad: metrados.length > 0 ? sumar(metrados, 4) : null,
    origen: conUnidad.length === 1 ? "PARTIDA" : "PARTIDAS_HOMOGENEAS",
    aviso: null,
  };
}


/**
 * Los campos operativos del compromiso que la pantalla de planificar NO edita
 * todavia (zona, subcontratista, color, protocolo). Se conservan al reemplazar.
 *
 * OJO al ampliar el PTS: si anades aqui un campo que la pantalla SI edita,
 * quedara congelado para siempre (se preservaria el viejo en cada guardado).
 * Los que la pantalla edita viajan en `DatosCompromiso`, no aqui.
 */
export interface CamposPreservables {
  zona: string | null;
  proveedorId: string | null;
  color: string | null;
  protocoloCalidad: boolean;
  /// Se anota al CERRAR la semana, no al planificar. Si no se preservara,
  /// reabrir y volver a guardar borraria lo que de verdad se ejecuto.
  cantidadEjec: string | null;
}

/**
 * Que conservar de cada compromiso cuando se reemplaza la semana entera.
 *
 * Planificar REEMPLAZA los compromisos (se borran y se recrean), asi que todo
 * lo que la pantalla no reenvie se perderia. Se rescata por `uid`, pero SOLO
 * cuando no hay ambiguedad: si un uid aparece dos veces (en lo viejo o en lo
 * nuevo) no se sabe a que fila pertenecia el proveedor, y adivinar es peor que
 * no proponer. Las lineas libres (uid null) no se pueden emparejar.
 */
export function mapaPreservablePorUid(
  existentes: readonly ({ uid: number | null } & CamposPreservables)[],
  entrantes: readonly { uid: number | null }[],
): Map<number, CamposPreservables> {
  const contar = (filas: readonly { uid: number | null }[]) => {
    const veces = new Map<number, number>();
    for (const f of filas) {
      if (f.uid === null) continue;
      veces.set(f.uid, (veces.get(f.uid) ?? 0) + 1);
    }
    return veces;
  };

  const vecesViejo = contar(existentes);
  const vecesNuevo = contar(entrantes);

  const mapa = new Map<number, CamposPreservables>();
  for (const e of existentes) {
    if (e.uid === null) continue;
    if (vecesViejo.get(e.uid) !== 1 || vecesNuevo.get(e.uid) !== 1) continue;
    mapa.set(e.uid, {
      zona: e.zona,
      proveedorId: e.proveedorId,
      color: e.color,
      protocoloCalidad: e.protocoloCalidad,
      cantidadEjec: e.cantidadEjec,
    });
  }
  return mapa;
}

/// Tope de `Decimal(14,4)`: 10 enteros + 4 decimales.
const CANTIDAD_MAXIMA = 9_999_999_999.9999;

export type CantidadValidada =
  | { ok: true; valor: string | null }
  | { ok: false; error: string };

/**
 * Valida y normaliza la cantidad planificada de un compromiso.
 *
 * Vacio es valido (no toda tarea se mide por cantidad). Se rechaza lo negativo
 * y lo que desborda la columna. Acepta coma decimal, pero `normalizarDecimal`
 * rechaza casos ambiguos como "12,500" (?12.5 o 12500?): mejor preguntar que
 * guardar una cantidad de obra equivocada.
 */
export function validarCantidadPlan(
  texto: string | null | undefined,
): CantidadValidada {
  if (texto === null || texto === undefined || texto.trim() === "") {
    return { ok: true, valor: null };
  }

  const normal = normalizarDecimal(texto, 4);
  if (normal === null) {
    return {
      ok: false,
      error: `Cantidad no valida: "${texto.trim()}". Usa punto decimal (por ejemplo 12.5).`,
    };
  }
  const n = Number(normal);
  if (n < 0) return { ok: false, error: "La cantidad no puede ser negativa." };
  if (n > CANTIDAD_MAXIMA) {
    return { ok: false, error: "La cantidad es demasiado grande." };
  }
  return { ok: true, valor: normal };
}

/// Los uid que aparecen mas de una vez. Las lineas libres (null) no cuentan.
export function uidsDuplicados(
  filas: readonly { uid: number | null }[],
): number[] {
  const veces = new Map<number, number>();
  for (const f of filas) {
    if (f.uid === null) continue;
    veces.set(f.uid, (veces.get(f.uid) ?? 0) + 1);
  }
  return [...veces.entries()].filter(([, n]) => n > 1).map(([uid]) => uid);
}
