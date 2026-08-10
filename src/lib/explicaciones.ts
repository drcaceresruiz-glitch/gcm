import type { TextoExplicacion } from "@/components/ui/Explicacion";

/**
 * Los textos de las acciones delicadas, juntos y en un solo sitio.
 *
 * Viven aqui y no repartidos por los componentes por dos razones. La primera
 * es poder LEERLOS SEGUIDOS: es la unica forma de notar que dos pantallas
 * explican lo mismo de manera distinta, que es peor que no explicarlo. La
 * segunda es que se puedan corregir sin abrir el componente que los pinta.
 *
 * Como se escriben:
 *
 *   - `titulo` es la DUDA, no el tema: "¿Que significa congelar?" y no
 *     "Informacion sobre la linea base". Quien tiene la duda reconoce la suya.
 *   - `queEs` es una frase, en lenguaje de obra. Si hace falta un parrafo, es
 *     que el concepto no esta entendido todavia.
 *   - `paraQue` explica el POR QUE. Es lo que convierte una instruccion en
 *     algo que se entiende, y sin ello la gente memoriza pasos y se equivoca
 *     en cuanto cambia el contexto.
 *   - `consecuencias` dice tambien QUE SE ROMPE si se hace a destiempo. Un
 *     texto que solo cuenta el camino feliz no protege de nada.
 */

/**
 * Congelar el cronograma.
 *
 * Es re-fijable a proposito: fijar otra version limpia la anterior. Se
 * diferencia de la revision del presupuesto, que si es irreversible.
 */
export const CONGELAR_CRONOGRAMA: TextoExplicacion = {
  titulo: "¿Que significa fijar la linea base?",
  queEs:
    "Es marcar esta version del cronograma como el plan oficial: la foto del " +
    "plazo con el que arrancas, guardada para poder compararte con ella.",
  paraQue:
    "Sin una referencia congelada, la palabra atraso no significa nada. Si el " +
    "cronograma se actualiza cada semana, siempre vas al dia, porque el plan " +
    "se reescribio para que lo estuvieras. La linea base clava el liston: a " +
    "partir de ahi el SPI y el valor planeado (PV) se miden contra ella y no " +
    "contra el ultimo corte que subiste.",
  requisitos: [
    "Que el cronograma cargado sea el plan con el que de verdad vas a empezar, no un borrador.",
    "Que las fechas cuadren con el plazo de la ficha de la obra: si difieren, arriba aparece el aviso de desajuste.",
  ],
  consecuencias: [
    "El valor ganado pasa a medir el plazo contra esta version. Hoy, sin linea base, se mide contra el corte vigente: contra ti mismo.",
    "Los cortes que cargues despues NO la cambian. Puedes seguir subiendo avance sin tocar la referencia.",
    "Si la fijas tarde, con la obra empezada, estaras congelando un plan que ya incorpora lo que salio mal, y medira poco.",
  ],
  reversible: true,
  comoSeDeshace:
    "Puedes fijar otra version cuando quieras: la anterior deja de ser la base " +
    "automaticamente. Solo hay una a la vez.",
};

/**
 * Congelar el presupuesto.
 *
 * Aqui SI es irreversible: la revision aprobada copia cada partida a una tabla
 * aparte y es la referencia contractual de la que cuelgan los movimientos.
 */
export const CONGELAR_PRESUPUESTO: TextoExplicacion = {
  titulo: "¿Que significa congelar el presupuesto?",
  queEs:
    "Es sacar una fotocopia del presupuesto entero —cada partida con su " +
    "metrado, su precio y su importe— y guardarla intacta como la version " +
    "contractual.",
  paraQue:
    "Es lo que permite responder a la pregunta que hace el cliente: ¿esto " +
    "estaba en el contrato o se anadio despues? Sin una copia congelada, " +
    "comparar el gasto de hoy contra el presupuesto de hoy da siempre cero " +
    "desviacion, porque el liston se mueve contigo.",
  requisitos: [
    "Que el presupuesto este revisado: los precios, los metrados y las modalidades de cada partida.",
    "Que esten puestos los porcentajes comerciales de esta revision: descuentos, gastos generales, utilidad e IGV.",
    "Hacerlo ANTES de empezar a ejecutar. Congelar con la obra avanzada es congelar un plan que ya recoge lo que salio mal.",
  ],
  consecuencias: [
    "La copia no se toca nunca mas. Editar una partida despues no cambia la revision congelada.",
    "A partir de aqui, todo cambio entra como movimiento —adicional o deductivo— POR ENCIMA de la linea base. De ahi salen las tres cifras: BASE, AJUSTES y VIGENTE.",
    "Se habilita la pestana de Movimientos, que hasta entonces no tiene contra que medir.",
  ],
  reversible: false,
  comoSeDeshace:
    "Si el contrato cambia de verdad, se congela una revision NUEVA. La " +
    "anterior se conserva para poder comparar las dos.",
};

/**
 * Modalidad de contratacion de una partida.
 *
 * No estaba explicada en ningun sitio, y decide quien asume el riesgo del
 * metrado: es de las cosas que mas dinero mueven en una obra.
 */
export const MODALIDAD_PARTIDA: TextoExplicacion = {
  titulo: "¿Que cambia entre precios unitarios, suma alzada y alcance?",
  queEs:
    "Es como esta contratada la partida. No es una etiqueta: decide si el " +
    "importe se recalcula cuando cambia el metrado, y por tanto quien asume " +
    "el riesgo si en obra sale mas cantidad de la prevista.",
  paraQue:
    "Es la diferencia entre poder cobrar el exceso de metrado o tener que " +
    "asumirlo. Marcar como precios unitarios algo pactado a suma alzada hace " +
    "que el sistema recalcule un importe que en el contrato es fijo.",
  consecuencias: [
    "PRECIOS UNITARIOS: importe = metrado x precio. Si en obra sale mas cantidad, el importe sube y se valoriza. El riesgo es del cliente.",
    "SUMA ALZADA: precio cerrado por todo el alcance. El metrado es referencial; aunque se ejecute mas, el importe pactado no cambia. El riesgo es del contratista.",
    "ALCANCE: una linea que solo describe QUE incluye una partida a suma alzada. No tiene importe propio; el dinero esta en su partida padre. Si le pones importe, lo estaras contando dos veces.",
  ],
  reversible: true,
  comoSeDeshace:
    "Se puede cambiar en cualquier momento pulsando la celda de modalidad, " +
    "mientras el presupuesto no este congelado.",
};
