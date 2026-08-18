/**
 * Cuanto avance se gano en cada tramo, y de que capitulo salio.
 *
 * La curva S dice DONDE esta la obra; esto dice a que velocidad se mueve y
 * quien la mueve. Son preguntas distintas: una obra puede ir al 45% y estar
 * parada desde hace tres semanas, y en la curva acumulada eso se ve como una
 * meseta que hay que interpretar. Aqui se lee directo —una barra corta— y
 * ademas se ve que capitulo tira y cual frena, que la curva no separa.
 *
 * Se alimenta del parte del dia: `AvanceTarea` es lo unico que entra diario y
 * desde obra.
 *
 * ## La trampa que hay que respetar
 *
 * `AvanceTarea` es una tabla que solo crece y NO tiene unicidad por tarea y
 * dia: el residente corrige por la tarde lo que dijo por la manana, y manda
 * el ultimo. El desempate va por `createdAt` EN LA LECTURA, y quien no lo
 * replique cuenta el mismo avance dos veces. Aqui no se reimplementa: se usa
 * `ultimoAvancePorTarea`, que es donde vive esa regla.
 */

import { ultimoAvancePorTarea, type AvanceReportado } from "@/lib/cronograma";
import { ponderarPorDuracion, type TareaParaCurva } from "@/lib/curva-s";
import { sumar } from "@/lib/decimal";

export interface TareaDelRitmo extends TareaParaCurva {
  /// Nombre del capitulo del que cuelga, ya resuelto por quien llama.
  capitulo: string;
}

export interface CapituloEnTramo {
  capitulo: string;
  /// Avance propio del capitulo al cerrar el tramo, 0..100.
  avance: number;
  /// Puntos de SU PROPIO avance ganados en el tramo.
  ganado: number;
  /**
   * Puntos de avance DE LA OBRA que aporto en el tramo.
   *
   * No es lo mismo que `ganado`, y confundirlos es el error facil: un capitulo
   * pequeno que pasa de 0 a 100 gana cien puntos suyos y quiza aporta dos a la
   * obra. `ganado` responde «cuanto se movio»; `aporte` responde «cuanto de la
   * obra se debe a el», y solo los aportes suman el avance total del tramo.
   */
  aporte: number;
}

export interface TramoDeRitmo {
  desde: Date;
  hasta: Date;
  /// Puntos de avance de la obra ganados en el tramo. Es la suma de aportes.
  ganado: number;
  /// Avance acumulado de la obra al cerrar el tramo.
  acumulado: number;
  capitulos: CapituloEnTramo[];
}

/// Avance ponderado de un grupo de tareas en una fecha dada.
function avanceEn(
  tareas: readonly TareaDelRitmo[],
  avances: readonly AvanceReportado[],
  fecha: Date,
): number {
  // Lo VIGENTE en esa fecha, no lo de hoy: el tramo cuenta lo que se sabia
  // entonces. Sin reporte manda el porcentaje que traia el archivo.
  const vigentes = ultimoAvancePorTarea(
    avances.filter((a) => a.fecha.getTime() <= fecha.getTime()),
  );
  return (
    Number(
      ponderarPorDuracion(
        tareas,
        (t) => vigentes.get(t.uid)?.porcentaje ?? t.porcentajeArchivo,
      ),
    ) || 0
  );
}

/**
 * El ritmo, tramo a tramo.
 *
 * `fechas` son los cortes ordenados: con N fechas salen N-1 tramos, cada uno
 * del corte anterior al siguiente. Quien llama decide la cadencia —semanal
 * para el seguimiento, libre para un rango que se pide a mano—, porque la
 * pregunta «cuanto avanzamos» no tiene una unica ventana correcta.
 */
export function ritmoPorTramos(
  tareas: readonly TareaDelRitmo[],
  avances: readonly AvanceReportado[],
  fechas: readonly Date[],
): TramoDeRitmo[] {
  if (fechas.length < 2) return [];

  const medibles = tareas.filter((t) => !t.esResumen);
  if (medibles.length === 0) return [];

  const porCapitulo = new Map<string, TareaDelRitmo[]>();
  for (const t of medibles) {
    const previo = porCapitulo.get(t.capitulo);
    if (previo) previo.push(t);
    else porCapitulo.set(t.capitulo, [t]);
  }

  /*
   * Cuanto pesa cada capitulo dentro de la obra.
   *
   * Con la duracion, que es la misma vara que usa la curva S. Usar otra aqui
   * daria dos cifras de avance para la misma obra en dos pantallas, que es el
   * modo de fallo que este proyecto ya conoce.
   */
  const duracionTotal = Number(sumar(medibles.map((t) => t.duracionDias), 4)) || 0;
  const peso = new Map<string, number>();
  for (const [capitulo, suyas] of porCapitulo) {
    const suma = Number(sumar(suyas.map((t) => t.duracionDias), 4)) || 0;
    peso.set(capitulo, duracionTotal > 0 ? suma / duracionTotal : 0);
  }

  const ordenadas = [...fechas].sort((a, b) => a.getTime() - b.getTime());

  return ordenadas.slice(1).map((hasta, i) => {
    const desde = ordenadas[i]!;

    const capitulos: CapituloEnTramo[] = [...porCapitulo.entries()].map(
      ([capitulo, suyas]) => {
        const antes = avanceEn(suyas, avances, desde);
        const despues = avanceEn(suyas, avances, hasta);
        const ganado = redondear(despues - antes);
        return {
          capitulo,
          avance: redondear(despues),
          ganado,
          aporte: redondear(ganado * (peso.get(capitulo) ?? 0)),
        };
      },
    );

    return {
      desde,
      hasta,
      // La suma de aportes, no el total recalculado: asi la barra apilada
      // coincide EXACTAMENTE con su propio total y no queda un hueco de
      // redondeo que nadie sabe explicar.
      ganado: redondear(capitulos.reduce((s, c) => s + c.aporte, 0)),
      acumulado: avanceEn(medibles, avances, hasta),
      capitulos: capitulos.sort((a, b) => b.aporte - a.aporte),
    };
  });
}

/// Dos decimales. Son coordenadas de un dibujo y puntos de porcentaje, no
/// dinero: aqui la coma flotante vale, igual que en `curvaPlaneada`.
function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
