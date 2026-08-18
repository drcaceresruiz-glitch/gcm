/**
 * Cuando le toca valorizar a cada contratista.
 *
 * La cadencia tiene DOS NIVELES con herencia, y encima de los dos manda una
 * lista de fechas pactadas:
 *
 *   1. fechas pactadas del encargo  ->  mandan sobre todo (son hitos, se
 *      acordaron una a una y son mas especificas que cualquier periodo);
 *   2. `cadenciaDias` del encargo   ->  el override del contratista;
 *   3. la OBRA                      ->  semanal, atada a su `diaCorteSemanal`.
 *
 * Vive en `lib/` y no toca la base: recibe lo que ya se leyo y devuelve la
 * cuenta. Asi se puede probar el caso raro —el contratista que empieza un
 * jueves con corte los viernes— sin montar una obra entera.
 *
 * TODAS las fechas se tratan en UTC a medianoche, que es como las guarda la
 * base (`@db.Date`). Mezclar husos aqui correria un dia el aviso, y un aviso
 * que llega un dia tarde es justo el que nadie vuelve a mirar.
 */

const MS_DIA = 24 * 60 * 60 * 1000;

/** Medianoche UTC del dia de esta fecha. */
export function aDia(fecha: Date): Date {
  return new Date(
    Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()),
  );
}

/** Dias enteros de `desde` a `hasta`. Negativo si `hasta` es anterior. */
export function diasDeDiferencia(desde: Date, hasta: Date): number {
  return Math.round((aDia(hasta).getTime() - aDia(desde).getTime()) / MS_DIA);
}

function sumarDias(fecha: Date, dias: number): Date {
  return new Date(aDia(fecha).getTime() + dias * MS_DIA);
}

/**
 * Dia de la semana ISO: lunes = 1 ... domingo = 7.
 *
 * `getUTCDay()` devuelve domingo = 0, y el resto del sistema —`WorkCalendar`,
 * `diaCorteSemanal`— usa ISO. Confundirlos desplaza el corte un dia.
 */
export function diaIso(fecha: Date): number {
  const d = aDia(fecha).getUTCDay();
  return d === 0 ? 7 : d;
}

/** El primer dia con ese ISO ESTRICTAMENTE posterior a `desde`. */
export function siguienteDiaDeCorte(desde: Date, diaCorteIso: number): Date {
  const actual = diaIso(desde);
  const faltan = (diaCorteIso - actual + 7) % 7;
  // `|| 7`: si cae en el mismo dia de la semana, el siguiente corte es dentro
  // de una semana, no hoy. Sin esto, el dia del corte la cuenta se queda
  // clavada y el contratista sale «pendiente» para siempre.
  return sumarDias(desde, faltan || 7);
}

/** De donde salio la cadencia que se aplico. Se ensena en pantalla. */
export type OrigenCadencia = "fechas" | "encargo" | "obra";

export interface DatosCadencia {
  /// `diaCorteSemanal` de la obra (ISO 1..7). Es el nivel heredado.
  diaCorteObra: number;
  /// Override del encargo. `null` = hereda la obra.
  cadenciaDias: number | null;
  /// Fechas pactadas del encargo. Si hay alguna, mandan.
  fechas: readonly Date[];
  /// Fecha de la ULTIMA valorizacion registrada, si hay.
  ultimaValorizacion: Date | null;
  /// Desde cuando corre el encargo. Sin fecha de inicio no hay de donde
  /// contar, y entonces el ancla es el dia en que se creo.
  inicioEncargo: Date;
}

export interface EstadoCadencia {
  /// La fecha que toca. `null` solo cuando se pactaron fechas y ya pasaron
  /// todas: no queda nada por valorizar y no hay nada que reclamar.
  proxima: Date | null;
  /// La fecha que tocaba ya paso y no consta valorizacion para ella.
  vencida: boolean;
  /// Cuantos dias lleva de retraso. 0 si no esta vencida.
  diasDeRetraso: number;
  origen: OrigenCadencia;
}

/**
 * En que punto esta la valorizacion de un encargo.
 *
 * NO decide si se avisa ni si se bloquea nada: solo cuenta. Que el aviso no
 * bloquee el avance es decision del usuario, y se cumple sola si esta funcion
 * no sabe nada del avance.
 */
export function estadoDeCadencia(
  datos: DatosCadencia,
  hoy: Date,
): EstadoCadencia {
  const dia = aDia(hoy);

  // --- Nivel 1: las fechas pactadas mandan ---------------------------------
  if (datos.fechas.length > 0) {
    const ordenadas = [...datos.fechas]
      .map(aDia)
      .sort((a, b) => a.getTime() - b.getTime());

    /**
     * Una fecha esta cubierta si hay una valorizacion en ese dia o despues.
     * Se mira contra la ULTIMA y no contra cada corte porque la valorizacion
     * es ACUMULADA: un corte del dia 20 ya dice a cuanto se llego, y deja
     * contestada la fecha del 15 que nadie registro a tiempo.
     */
    const cubiertaHasta = datos.ultimaValorizacion
      ? aDia(datos.ultimaValorizacion)
      : null;

    const pendientes = ordenadas.filter(
      (f) => !cubiertaHasta || f.getTime() > cubiertaHasta.getTime(),
    );

    const vencida = pendientes.find((f) => f.getTime() < dia.getTime());
    if (vencida) {
      return {
        proxima: vencida,
        vencida: true,
        diasDeRetraso: diasDeDiferencia(vencida, dia),
        origen: "fechas",
      };
    }

    return {
      proxima: pendientes[0] ?? null,
      vencida: false,
      diasDeRetraso: 0,
      origen: "fechas",
    };
  }

  // De donde se cuenta: desde la ultima valorizacion, y si no hay ninguna,
  // desde que arranco el encargo.
  const base = aDia(datos.ultimaValorizacion ?? datos.inicioEncargo);

  // --- Nivel 2: el override del contratista --------------------------------
  // `> 0` y no `!= null`: un cero guardado por error daria un periodo de cero
  // dias, o sea «vencida siempre», y el panel se llenaria de rojo perpetuo.
  if (datos.cadenciaDias !== null && datos.cadenciaDias > 0) {
    const proxima = sumarDias(base, datos.cadenciaDias);
    return {
      proxima,
      vencida: proxima.getTime() < dia.getTime(),
      diasDeRetraso: Math.max(0, diasDeDiferencia(proxima, dia)),
      origen: "encargo",
    };
  }

  // --- Nivel 3: lo que herede de la obra -----------------------------------
  const proxima = siguienteDiaDeCorte(base, datos.diaCorteObra);
  return {
    proxima,
    vencida: proxima.getTime() < dia.getTime(),
    diasDeRetraso: Math.max(0, diasDeDiferencia(proxima, dia)),
    origen: "obra",
  };
}

/** Como se explica el origen en pantalla, en un solo sitio. */
export const ETIQUETA_ORIGEN: Record<OrigenCadencia, string> = {
  fechas: "Fechas pactadas con el contratista",
  encargo: "Cadencia propia del contratista",
  obra: "Heredada del corte de la obra",
};
