/**
 * Hitos del cronograma: su estado y su desvio contra la linea base.
 *
 * Los hitos (milestones) ya vienen marcados en cada tarea (`esHito`, del flag
 * Milestone de MS Project). Aqui no se crean: se cruzan los del plan VIGENTE
 * con los de la version marcada como LINEA BASE para leer, de un vistazo, si
 * cada fecha clave se ha movido y en cuantos dias.
 *
 * Logica pura: sin base de datos, se prueba sola. Las fechas son de calendario
 * (medianoche UTC, como las guarda Prisma); el desvio se cuenta en dias.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

export interface HitoVigente {
  uid: number;
  nombre: string;
  /// Fecha del hito en el plan vigente.
  fin: Date;
  /// % reportado (0..100). Un hito esta cumplido cuando llega a 100.
  avance: number;
}

/// Solo la fecha del hito en la linea base, cruzable por uid.
export interface HitoBaseFecha {
  uid: number;
  fin: Date;
}

/// En plazo, ya cumplido, o vencido sin cumplir a la fecha de corte.
export type EstadoHito = "cumplido" | "en_plazo" | "vencido";

export interface FilaHito {
  uid: number;
  nombre: string;
  finVigente: Date;
  /// Fecha en la base; null si el hito no existia en la version base.
  finBase: Date | null;
  /// finVigente - finBase en dias. Positivo = se corrio a mas tarde (peor);
  /// negativo = se adelanto. null si no hay base para ese hito.
  desviacionDias: number | null;
  estado: EstadoHito;
  cumplido: boolean;
}

/** Un hito se da por cumplido al llegar (o pasar) el 100%. */
function estaCumplido(avance: number): boolean {
  return avance >= 99.995;
}

/** Dias enteros entre dos fechas de calendario (b - a). */
function diasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DIA_MS);
}

/**
 * Las filas de la tabla de hitos: cada hito vigente con su estado y, si existe
 * en la base, su desvio en dias.
 *
 * El orden de salida sigue al de `vigentes` (que ya viene por fila del
 * cronograma). Un hito que estaba en la base pero ya no en lo vigente no se
 * lista: la vista es de lo que hay que vigilar hoy, no un historico de lo que
 * se quito.
 */
export function filasHitos(
  vigentes: readonly HitoVigente[],
  base: readonly HitoBaseFecha[],
  fechaCorte: Date,
): FilaHito[] {
  const porUid = new Map<number, Date>();
  for (const b of base) porUid.set(b.uid, b.fin);

  return vigentes.map((h) => {
    const finBase = porUid.get(h.uid) ?? null;
    const cumplido = estaCumplido(h.avance);

    const estado: EstadoHito = cumplido
      ? "cumplido"
      : h.fin.getTime() < fechaCorte.getTime()
        ? "vencido"
        : "en_plazo";

    return {
      uid: h.uid,
      nombre: h.nombre,
      finVigente: h.fin,
      finBase,
      desviacionDias: finBase ? diasEntre(finBase, h.fin) : null,
      estado,
      cumplido,
    };
  });
}
