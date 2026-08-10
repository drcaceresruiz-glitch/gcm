/**
 * El regimen laboral de la obra, sin base de datos.
 *
 * No todas las obras trabajan igual: una edificacion urbana va de lunes a
 * sabado, una obra vial o minera de turno corrido puede ir los siete dias. Por
 * eso el calendario se configura por obra en vez de estar escrito en el codigo.
 *
 * Los dias van en ISO —1 = lunes, 7 = domingo—, igual que `diaCorteSemanal` de
 * la obra. Ojo: `Date.getDay()` de JavaScript devuelve 0 para el domingo, y de
 * ahi sale `diaIso()`.
 */

export const DIAS_ISO = [1, 2, 3, 4, 5, 6, 7] as const;

export const NOMBRE_DIA: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miercoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sabado",
  7: "Domingo",
};

export interface DiaLaboral {
  diaSemana: number;
  laborable: boolean;
  /// Horas del dia, como texto decimal (viene de un Decimal de la BD).
  horas: string;
}

/// El dia de la semana en ISO. `getDay()` da 0 el domingo; aqui es 7.
export function diaIso(fecha: Date): number {
  const d = fecha.getDay();
  return d === 0 ? 7 : d;
}

/** Si se trabaja ese dia segun el calendario de la obra. */
export function esLaborable(
  fecha: Date,
  calendario: readonly DiaLaboral[],
): boolean {
  const dia = calendario.find((d) => d.diaSemana === diaIso(fecha));
  // Sin fila para ese dia se asume laborable: es preferible contar de mas a
  // esconder trabajo que si esta programado.
  return dia ? dia.laborable : true;
}

/**
 * Dias laborables entre dos fechas, ambas incluidas.
 *
 * Sirve para decir «56 dias de plazo, 42 laborables», que es la cifra con la
 * que de verdad se planifica una cuadrilla.
 */
export function diasLaborablesEntre(
  desde: Date,
  hasta: Date,
  calendario: readonly DiaLaboral[],
): number {
  if (hasta.getTime() < desde.getTime()) return 0;

  let cuenta = 0;
  const cursor = new Date(desde.getTime());
  cursor.setHours(0, 0, 0, 0);
  const fin = new Date(hasta.getTime());
  fin.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= fin.getTime()) {
    if (esLaborable(cursor, calendario)) cuenta++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return cuenta;
}

/** Horas de trabajo a la semana, segun el calendario. */
export function horasPorSemana(calendario: readonly DiaLaboral[]): number {
  return calendario
    .filter((d) => d.laborable)
    .reduce((total, d) => total + (Number(d.horas) || 0), 0);
}

export type ValidacionDia =
  | { ok: true; dias: DiaLaboral[] }
  | { ok: false; error: string };

/// Tope de `Decimal(4,2)` y del sentido comun: un dia tiene 24 horas.
const HORAS_MAXIMO = 24;

/**
 * Valida el calendario que llega del formulario.
 *
 * Un dia no laborable se guarda con cero horas aunque la pantalla mande otra
 * cosa: dejar «domingo, no laborable, 5 horas» seria un dato que se contradice
 * a si mismo y que alguien acabaria sumando.
 */
export function validarCalendario(dias: readonly DiaLaboral[]): ValidacionDia {
  if (dias.length !== 7) {
    return { ok: false, error: "El calendario necesita los siete dias." };
  }

  const vistos = new Set<number>();
  const limpios: DiaLaboral[] = [];

  for (const d of dias) {
    if (!DIAS_ISO.includes(d.diaSemana as (typeof DIAS_ISO)[number])) {
      return { ok: false, error: "Hay un dia de la semana no valido." };
    }
    if (vistos.has(d.diaSemana)) {
      return { ok: false, error: "Hay un dia repetido en el calendario." };
    }
    vistos.add(d.diaSemana);

    if (!d.laborable) {
      limpios.push({ diaSemana: d.diaSemana, laborable: false, horas: "0" });
      continue;
    }

    const h = Number(String(d.horas).replace(",", "."));
    if (!Number.isFinite(h) || h <= 0) {
      return {
        ok: false,
        error: `Indica cuantas horas se trabaja el ${NOMBRE_DIA[d.diaSemana]?.toLowerCase()}.`,
      };
    }
    if (h > HORAS_MAXIMO) {
      return { ok: false, error: "Un dia no puede tener mas de 24 horas." };
    }

    limpios.push({
      diaSemana: d.diaSemana,
      laborable: true,
      horas: h.toFixed(2),
    });
  }

  if (limpios.every((d) => !d.laborable)) {
    return { ok: false, error: "Al menos un dia tiene que ser laborable." };
  }

  return { ok: true, dias: limpios.sort((a, b) => a.diaSemana - b.diaSemana) };
}
