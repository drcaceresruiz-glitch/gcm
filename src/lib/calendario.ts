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
 *
 * TODO ESTE ARCHIVO TRABAJA EN UTC, NUNCA EN HORA LOCAL. Hasta el 21 de
 * agosto de 2026, `diaIso`/`esLaborable`/`diasLaborablesEntre` usaban
 * `getDay()`/`setHours()`/`setDate()` (hora LOCAL del proceso de Node), y
 * `avanzarDiasLaborables` -escrita despues- usaba UTC con su propia copia
 * privada de `esLaborable` (`esLaborableUTC`) precisamente para no heredar
 * ese problema. Mezclar las dos convenciones en el mismo archivo, con
 * llamadores que construian fechas ancladas en UTC (`Date.UTC`, campos
 * `@db.Date` de Prisma) y otros que las anclaban en hora local a proposito
 * -cada uno con su propio comentario explicando por que- solo era correcto
 * mientras la zona horaria del proceso de Node coincidiera con UTC, algo
 * que este repositorio no fija en ningun sitio (`process.env.TZ`) y que por
 * tanto depende de como este configurado el servidor de despliegue. Se
 * unifico TODO a UTC -la convencion que ya usan las fechas `@db.Date` de la
 * base y la mayoria de los llamadores- en vez de arriesgar a adivinar cual
 * de las dos convenciones era la que corria en produccion.
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

/// El dia de la semana en ISO. `getUTCDay()` da 0 el domingo; aqui es 7.
export function diaIso(fecha: Date): number {
  const d = fecha.getUTCDay();
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
  cursor.setUTCHours(0, 0, 0, 0);
  const fin = new Date(hasta.getTime());
  fin.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= fin.getTime()) {
    if (esLaborable(cursor, calendario)) cuenta++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cuenta;
}

/**
 * Adelanta (o retrocede) una fecha N dias LABORABLES, segun el calendario.
 *
 * Es la operacion inversa de `diasLaborablesEntre`: esa cuenta dias
 * laborables ENTRE dos fechas fijas; esta, dada una fecha y una cantidad,
 * dice a que fecha se llega. La necesita el CPM (`lib/ruta-critica.ts`)
 * para propagar duraciones por la red de dependencias.
 */
export function avanzarDiasLaborables(
  fecha: Date,
  dias: number,
  calendario: readonly DiaLaboral[],
  sentido: 1 | -1,
): Date {
  const cursor = new Date(fecha.getTime());
  cursor.setUTCHours(0, 0, 0, 0);

  let restantes = Math.max(0, Math.round(dias));
  while (restantes > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + sentido);
    if (esLaborable(cursor, calendario)) restantes--;
  }
  return cursor;
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
