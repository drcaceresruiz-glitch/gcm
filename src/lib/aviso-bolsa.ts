import {
  dividir,
  esNegativo,
  esPositivo,
  multiplicar,
  restar,
} from "@/lib/decimal";
import { soles } from "@/utils/formato";

/**
 * Cuando avisar de que la bolsa de la obra se esta acabando.
 *
 * PEDIDO ASI, con estas palabras: «deberia haber avisos cuando la bolsa se vea
 * comprometida, se acerca o se pone en negativo, que permita configurar estos
 * avisos. EN VEZ DE ASUMIRLO A SABIENDAS, QUE LO PUEDE PERMITIR».
 *
 * Esa ultima frase es la que manda sobre todo el modulo. GCM deja hacer casi
 * todo -comprometer sin liberar, valorizar sin cronograma, paralizar una obra
 * con encargos vivos- y esa eleccion no se toca. Lo que no puede pasar es que
 * la bolsa se coma sin que nadie se entere hasta que ya no hay con que pagar.
 *
 * QUE BOLSA. La COMPROMETIDA, no la prevista. La prevista es contractual menos
 * meta: el margen que planificaste, y no se mueve nunca -si se moviera, el
 * plan se reescribiria para encajar con la realidad y siempre pareceria que
 * se va justo-. La comprometida es esa misma bolsa menos las desviaciones de
 * los contratos YA FIRMADOS, o sea lo que de verdad queda. Es la que baja con
 * cada adenda aprobada, y por tanto la unica sobre la que tiene sentido
 * avisar. Ver `lib/bolsa-comprometida.ts`.
 *
 * SUENA EN EL CRUCE, NO MIENTRAS DURE. Es la decision de forma mas importante
 * de aqui. Un aviso que se repite cada dia porque la obra lleva un mes en rojo
 * se ignora a la semana, y entonces tampoco se lee el dia que pasa algo nuevo
 * -es lo mismo que ya documenta `lib/pendientes` sobre lo que parpadea-. Asi
 * que se avisa solo cuando el estado EMPEORA, y solo del escalon nuevo.
 *
 * Y SE REARMA SOLO. Si la bolsa se recupera -un deductivo, un frente que se
 * cierra por debajo- el estado vuelve a bajar y el aviso puede volver a sonar
 * si se estropea otra vez. Sin esto, una obra que se pone en rojo, se arregla
 * y se vuelve a poner en rojo solo avisaria la primera vez, que es justo la
 * menos grave de las dos.
 */

export type EstadoBolsa = "holgada" | "cerca" | "roja";

/// El escalon de cada estado. Un estado solo avisa si su numero es MAYOR que
/// el del ultimo avisado: es lo que convierte «esta en rojo» en «acaba de
/// ponerse en rojo».
const ESCALON: Record<EstadoBolsa, number> = {
  holgada: 0,
  cerca: 1,
  roja: 2,
};

/**
 * Cuanto tiene que quedar de la bolsa prevista para que todavia no avise.
 *
 * 25 % por defecto, no 10: a un 10 % ya no queda margen de maniobra para
 * renegociar nada con un contratista, y el aviso llegaria cuando la unica
 * salida es asumirlo. El numero se configura por obra, que es lo que se pidio.
 */
export const UMBRAL_BOLSA_POR_DEFECTO = 25;

export const UMBRAL_BOLSA_MIN = 0;
export const UMBRAL_BOLSA_MAX = 90;

/**
 * En que estado esta la bolsa comprometida de la obra.
 *
 * `roja` cuando ya no queda nada: cero o negativo. El cero entra en rojo a
 * proposito -«te queda 0,00 de bolsa» no es una buena noticia que merezca
 * ambar-.
 *
 * `cerca` cuando lo que queda esta por debajo del umbral. El umbral es un
 * PORCENTAJE DE LA PREVISTA, no un importe: una obra de 50.000 y otra de
 * 5.000.000 no se preocupan por la misma cifra, y pedir un importe por obra
 * seria pedir un dato que nadie va a mantener.
 *
 * CON UNA PREVISTA QUE NO ES POSITIVA solo existe `roja` o `holgada`, sin
 * escalon intermedio: el porcentaje de una bolsa que nacio en cero o en
 * negativo no significa nada, y calcularlo igual daria un «te queda el 40 %»
 * de algo que nunca existio. Una obra planificada sin margen no esta cerca de
 * quedarse sin bolsa: es que no tenia.
 */
export function estadoDeLaBolsa(
  comprometida: string,
  prevista: string,
  umbralPorcentaje: number,
): EstadoBolsa {
  // `!esPositivo` y no `esNegativo`: el cero tambien es rojo. «Te queda 0,00
  // de bolsa» no es una buena noticia que merezca ambar.
  if (!esPositivo(comprometida)) return "roja";

  // 0 apaga el escalon intermedio sin apagar el rojo: quien no quiere que le
  // avisen «te queda poco» normalmente si quiere que le avisen «no queda».
  if (umbralPorcentaje <= 0) return "holgada";
  if (!esPositivo(prevista)) return "holgada";

  const limite = dividir(
    multiplicar(prevista, String(umbralPorcentaje), 6) ?? "0",
    "100",
    2,
  );
  if (limite === null) return "holgada";

  // `restar` y no `Number`: son importes, y en este sistema el dinero no pasa
  // por coma flotante ni para una comparacion.
  const margen = restar(comprometida, limite);
  return margen !== null && esPositivo(margen) ? "holgada" : "cerca";
}

/**
 * Si toca avisar, dado lo ultimo que se aviso.
 *
 * Solo hacia arriba. `null` = nunca se aviso de esta obra: entonces avisa
 * cualquier estado que no sea `holgada`, porque el sistema no puede callarse
 * un rojo con la excusa de que es la primera vez que mira.
 */
export function tocaAvisar(
  ultimoAvisado: EstadoBolsa | null,
  ahora: EstadoBolsa,
): boolean {
  if (ahora === "holgada") return false;
  if (ultimoAvisado === null) return true;
  return ESCALON[ahora] > ESCALON[ultimoAvisado];
}

export interface TextoAvisoBolsa {
  titulo: string;
  cuerpo: string;
}

/**
 * Que se le dice a quien lo recibe.
 *
 * Con el IMPORTE dentro, no solo el estado: «la bolsa esta en riesgo» no mueve
 * a nadie, «te quedan 12.400 de los 84.000 que habias previsto» si. Es la
 * misma linea del panel «Que falta» y del paso siguiente.
 *
 * Y con la SALIDA nombrada, que es lo que convierte el aviso en instruccion.
 * En rojo la salida no es «mira la bolsa»: es que alguien decida algo, y las
 * dos cosas que se pueden decidir son renegociar con un contratista o pedir
 * que se deduzca de los costos propios.
 */
export function textoDelAviso(
  estado: EstadoBolsa,
  comprometida: string,
  prevista: string,
): TextoAvisoBolsa {
  if (estado === "roja") {
    const pasada = esNegativo(comprometida)
      ? `Te has pasado en ${soles(comprometida.replace("-", ""))}.`
      : "No queda nada.";

    return {
      titulo: "La bolsa de esta obra se acabó",
      cuerpo:
        `${pasada} Lo que se lleve de aquí en adelante sale del margen de la ` +
        `obra. Mira qué frente se la comió: lo que se puede hacer es ` +
        `renegociar con ese contratista o pedir que se deduzca de los costos ` +
        `propios.`,
    };
  }

  return {
    titulo: "Queda poca bolsa en esta obra",
    cuerpo:
      `Quedan ${soles(comprometida)} de los ${soles(prevista)} previstos. ` +
      `Todavía hay margen para renegociar; con la bolsa en cero ya no lo hay.`,
  };
}
