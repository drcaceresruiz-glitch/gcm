import { dividir, sumar } from "./decimal";

/**
 * Con que peso cuenta cada tarea en el avance de la obra.
 *
 * Hasta ahora siempre la DURACION: una partida de S/ 200.000 y otra de S/ 2.000
 * que duren lo mismo pesaban igual en el avance. Es una aproximacion razonable
 * cuando no se sabe cuanto vale cada tarea, y una mentira en cuanto se sabe.
 *
 * El sistema llevaba prometiendo lo otro desde el principio —`lib/evm.ts` lo
 * dice literalmente: «el %avance puede venir ponderado por DURACION (lo que
 * trae el archivo) o por DINERO (cuando el mapeo tarea-partida pasa del 60%)»—
 * y no estaba construido. Se construyo el 23 de agosto de 2026, y el 24 se
 * conecto a las tres cifras que faltaban: el informe semanal, su periodo y el
 * ritmo. Quien decide el peso de una obra es `pesoDeLaObra`, en
 * `services/cronograma.service`, y lo decide UNA vez.
 *
 * LO QUE SIGUE POR DURACION, con motivo: la tabla de capitulos
 * (`lib/control-avance`). Su planeado se LEE del archivo de MS Project, que
 * consolida por duracion; pesar el real por dinero restaria dos varas
 * distintas, que es justo lo que la regla de oro de abajo prohibe.
 *
 * **La regla de oro: el PLAN y el REAL se pesan IGUAL.** Un plan pesado por
 * duracion contra un real pesado por dinero no se pueden restar: la desviacion
 * que sale de ahi no significa nada. Por eso el criterio se decide UNA vez por
 * obra y se aplica a los dos lados, y por eso esta funcion vive aparte de
 * quien la usa.
 *
 * Logica pura, sin base de datos.
 */

export type CriterioPeso = "DURACION" | "DINERO";

/**
 * A partir de que cobertura del mapeo se pondera por dinero.
 *
 * El 60 % no es un numero elegido hoy: es el que el manual y los comentarios
 * del codigo llevan prometiendo desde el principio. Por debajo, el importe
 * conocido describe menos de dos tercios de la obra y pesar con el seria
 * cambiar una aproximacion honesta por una precision falsa.
 */
export const UMBRAL_DINERO = 60;

export function criterioDePeso(coberturaPct: number): CriterioPeso {
  return coberturaPct >= UMBRAL_DINERO ? "DINERO" : "DURACION";
}

export interface EnlaceTareaPartida {
  uid: number;
  codigoPartida: string;
}

export interface PartidaConImporte {
  codigo: string;
  /// null en los capitulos y en las partidas sin costear.
  parcial: string | null;
}

/**
 * Cuanto PESA cada tarea en dinero, por su uid.
 *
 * NO SE LLAMA `importePorTarea`, y el nombre es la mitad del arreglo. Habia
 * otra funcion con ese nombre exacto en `lib/mapeo-partidas`, con la misma
 * forma de entrada y de salida, que decide lo CONTRARIO sobre el reparto: alla
 * una partida enlazada a dos tareas cuenta entera en las dos, aqui se parte.
 * Las dos decisiones son correctas para lo suyo -aquella dice que CUBRE una
 * tarea, esta cuanto PESA- pero compartiendo nombre nadie podia saber cual
 * estaba usando, y la diferencia es que los pesos sumen el presupuesto o el
 * doble.
 *
 * **El importe de una partida se REPARTE entre las tareas que la cubren.** Si
 * tres tareas ejecutan la misma partida y se le diera el importe entero a cada
 * una, esa partida pesaria el triple que las demas y el avance de la obra
 * quedaria gobernado por la que mas veces se mapeo. Es el mismo cuidado que ya
 * tiene `cobertura`, que cuenta cada partida una sola vez.
 *
 * Se reparte A PARTES IGUALES y no en proporcion a la duracion: cuanto de la
 * partida ejecuta cada tarea es un dato que nadie tiene, y repartir por
 * duracion mezclaria los dos criterios justo en la funcion que existe para
 * separarlos. En el caso normal —una partida, una tarea— el reparto es exacto.
 */
export function pesoEnDineroPorTarea(
  enlaces: readonly EnlaceTareaPartida[],
  partidas: readonly PartidaConImporte[],
): Map<number, string> {
  const importeDe = new Map<string, string>();
  for (const p of partidas) {
    if (p.parcial !== null) importeDe.set(p.codigo, p.parcial);
  }

  /// Cuantas tareas cubren cada partida, para repartir su importe.
  const tareasPorPartida = new Map<string, number>();
  for (const e of enlaces) {
    if (!importeDe.has(e.codigoPartida)) continue;
    tareasPorPartida.set(
      e.codigoPartida,
      (tareasPorPartida.get(e.codigoPartida) ?? 0) + 1,
    );
  }

  const pesos = new Map<number, string>();

  for (const e of enlaces) {
    const importe = importeDe.get(e.codigoPartida);
    if (importe === undefined) continue;

    const cuantas = tareasPorPartida.get(e.codigoPartida) ?? 1;
    // Cuatro decimales en el reparto: son pesos, no importes que se cobren, y
    // acumular a dos arrastraria decimas en una obra de trescientas partidas.
    const parte = dividir(importe, String(cuantas), 4);
    if (parte === null) continue;

    // Una tarea puede cubrir VARIAS partidas: se suman sus trozos.
    const yaTiene = pesos.get(e.uid);
    pesos.set(e.uid, yaTiene === null || yaTiene === undefined ? parte : (sumar([yaTiene, parte], 4)));
  }

  return pesos;
}

export interface PesoDeTarea {
  criterio: CriterioPeso;
  /// El peso de una tarea por su uid y su duracion.
  peso: (t: { uid: number; duracionDias: string }) => string;
  /// Cuantas tareas se quedan a peso CERO por no tener partida mapeada.
  sinPeso: number;
}

/**
 * La funcion de peso que le toca a esta obra, y cuantas tareas se quedan
 * fuera con ella.
 *
 * **Una tarea sin partida mapeada pesa CERO cuando se pondera por dinero**, y
 * eso hay que decirlo, no esconderlo: su avance deja de contar. Es la
 * consecuencia honesta de pesar por dinero —lo que no tiene importe conocido
 * no tiene peso— pero significa que parte del trabajo desaparece de la cuenta,
 * y quien lee la cifra tiene derecho a saber cuanto.
 */
export function pesoDeTarea(
  criterio: CriterioPeso,
  importes: ReadonlyMap<number, string>,
  tareas: readonly { uid: number; esResumen: boolean }[],
): PesoDeTarea {
  if (criterio === "DURACION") {
    return {
      criterio,
      peso: (t) => t.duracionDias,
      sinPeso: 0,
    };
  }

  return {
    criterio,
    peso: (t) => importes.get(t.uid) ?? "0",
    sinPeso: tareas.filter((t) => !t.esResumen && !importes.has(t.uid)).length,
  };
}
