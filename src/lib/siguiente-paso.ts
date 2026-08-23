/**
 * El paso siguiente de la obra: UNO, con su boton.
 *
 * Generaliza lo que `AvisoCriterio` hacia para un solo caso —la decision de
 * los gastos generales— y lo convierte en el anclaje de continuidad de toda
 * la obra: se pinta arriba de TODAS sus pantallas y dice que toca ahora.
 *
 * DEVUELVE UNO, NUNCA UNA LISTA. El tablero ya tiene el panel «Que falta»,
 * que es donde vive la lista entera y ordenada. Un anclaje que se pinta en
 * las 20 pantallas de la obra tiene que caber en una linea: si enumerara,
 * seria un segundo panel peor colocado, y a la tercera navegacion se deja de
 * leer. La urgencia se transmite con el ORDEN, como en `lib/pendientes`.
 *
 * EL ORDEN ES EL DEL TRABAJO REAL, y tiene una razon por escalon:
 *
 *   1. Lo que BLOQUEA una lectura correcta del dinero (el criterio de gastos
 *      generales). No es un paso del alta: es una decision sin la cual
 *      cualquier margen que se enseñe estaria calculado con un criterio que
 *      nadie confirmo.
 *   2. El ALTA de la obra: presupuesto -> cronograma -> equipo -> linea base.
 *      Es «completar un registro», el unico sitio donde encadenar aporta de
 *      verdad: son cuatro pasos con un final, no un flujo de exploracion.
 *   3. Lo que quedo a medias y ya vencio. Aqui NO se encadena nada: se
 *      recuerda donde se quedo uno.
 *
 * LO QUE ESTE MODULO NO HACE, y es deliberado:
 *
 * - **No bloquea.** Ninguna pantalla deja de funcionar por tener un paso
 *   pendiente. Es la misma linea de `lib/pendientes`: quien esta en obra sabe
 *   cosas que el sistema no.
 * - **No navega solo.** Sugerir no es llevar. Aprobar una revision, aprobar
 *   un movimiento o cerrar una obra son IRREVERSIBLES, y auto-navegar justo
 *   despues de una de ellas enseña a encadenar sin leer. Quien decide dar el
 *   paso es quien pulsa.
 * - **No propone lo que quien mira no puede hacer.** Un aviso que pide cargar
 *   el presupuesto a quien solo tiene lectura es ruido que ademas no se puede
 *   quitar haciendo la tarea. Los permisos entran como bandera.
 *
 * Puro y sin base a proposito: aqui vive SOLO la decision de que paso toca.
 * Quien consulta es el layout, que ya tenia estas cifras en la mano.
 */

export type GravedadPaso = "bloqueante" | "sugerencia";

export interface PasoSiguiente {
  /// Estable: identifica el paso para poder aplazarlo durante la sesion.
  clave: string;
  gravedad: GravedadPaso;
  /// Que falta, en una linea.
  titulo: string;
  /**
   * Que se rompe si no se hace. Es lo que mueve a alguien, no el hecho.
   *
   * UNA FRASE, y es un limite medido en pantalla, no una manía: con dos, el
   * anclaje ocupaba tres lineas en una caja que quiere ser discreta y pesaba
   * mas que el contenido de la pantalla que encabeza. Lo que no cabe aqui va
   * en la pantalla de destino, que es donde se actua.
   */
  consecuencia: string;
  /// El texto del boton, nombrando la accion real.
  accion: string;
  /// Ruta relativa a la obra. Nunca vacia: el anclaje se esconde cuando ya
  /// estas en ella, y una cadena vacia haria de prefijo de todas.
  camino: string;
  /**
   * El SEGUNDO tramo, cuando el camino tiene dos y enseñar solo el primero
   * deja a medias.
   *
   * Existe por el presupuesto: desde el 20/08 entra en dos pasos -primero el
   * real, y de el se genera el contractual-. Con un solo boton, quien llega
   * nuevo carga la meta y se queda sin saber que aun falta un tramo.
   */
  despues?: {
    accion: string;
    camino: string;
  };
}

/** Que pasos del alta estan dados. Salen de `hitosDeObra`. */
export interface EstadoAlta {
  /// El contractual: el arbol de partidas contra el que se mide la obra.
  presupuesto: boolean;
  /// El real u operativo. Es de donde sale el contractual, asi que decide
  /// cual de los dos tramos toca sugerir.
  meta: boolean;
  cronograma: boolean;
  equipo: boolean;
  lineaBase: boolean;
  /**
   * Hay alguien a quien asignar: al menos un usuario ACTIVO cuyo rol NO ve
   * ya todas las obras (un ADMIN las ve sin asignacion). NO es un paso dado,
   * es la precondicion del paso equipo: en una empresa de solo ADMIN nadie
   * es asignable, la pantalla no tiene boton que ofrecer, y sugerir «asigna
   * el equipo» seria empujar a un callejon sin salida.
   */
  equipoAsignable: boolean;
}

/**
 * Que puede HACER quien esta mirando.
 *
 * No es lo mismo que ver la seccion: para proponer «carga el presupuesto»
 * hace falta poder importarlo, no poder leerlo.
 */
export interface PuedeHacer {
  presupuesto: boolean;
  cronograma: boolean;
  equipo: boolean;
  lineaBase: boolean;
  lookahead: boolean;
  planSemanal: boolean;
}

/**
 * Lo que ya vencio, contado barato.
 *
 * Sale de `avisosDeSeccion`, que el layout ya pide para las insignias del
 * menu. NO se usa la lista completa de `lib/pendientes` a proposito: esa se
 * calcula leyendo el cronograma entero, y esto corre en CADA navegacion
 * dentro de la obra sobre un hosting donde eso ya tumbo produccion dos veces.
 * El panel «Que falta» del tablero sigue siendo el sitio de la lista larga.
 */
export interface AvisosVivos {
  restriccionesVencidas: number;
  semanasSinCerrar: number;
}

function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

export function siguientePaso(
  alta: EstadoAlta,
  puede: PuedeHacer,
  avisos: AvisosVivos,
): PasoSiguiente | null {
  // 1. El alta, en el orden en que se hace.
  // El presupuesto entra en DOS tramos: primero el REAL, con la plantilla, y
  // de el se genera el contractual inflando cada capitulo. Enseñar solo el
  // primero deja a medias a quien llega nuevo: carga la meta, ve desaparecer
  // el aviso y no se entera de que el contractual sigue sin existir.
  if (!alta.presupuesto && puede.presupuesto) {
    if (!alta.meta) {
      return {
        clave: "alta-presupuesto",
        gravedad: "sugerencia",
        titulo: "Esta obra todavía no tiene presupuesto",
        consecuencia:
          "Son dos pasos: primero entra el presupuesto meta con la plantilla, y de él se genera el contractual.",
        accion: "Cargar el presupuesto meta",
        camino: "/meta",
        despues: { accion: "Generar el contractual", camino: "/contractual" },
      };
    }

    // El real ya esta: el tramo que falta es el otro, y pedir el primero otra
    // vez seria mandar a una pantalla donde no queda nada por hacer.
    return {
      clave: "alta-contractual",
      gravedad: "sugerencia",
      titulo: "Falta generar el contractual",
      consecuencia:
        "Sale del real inflando cada capítulo, y es contra él contra lo que se miden el avance y la desviación.",
      accion: "Generar el contractual",
      camino: "/contractual",
    };
  }

  if (!alta.cronograma && puede.cronograma) {
    return {
      clave: "alta-cronograma",
      gravedad: "sugerencia",
      titulo: "Falta el cronograma",
      consecuencia:
        "Sin fechas no hay curva S, ni atrasos, ni Lookahead: GCM sabe lo que cuesta cada partida, no cuándo toca.",
      accion: "Cargar el cronograma",
      camino: "/cronograma/importar",
    };
  }

  if (!alta.equipo && alta.equipoAsignable && puede.equipo) {
    return {
      clave: "alta-equipo",
      gravedad: "sugerencia",
      titulo: "Nadie tiene asignada esta obra",
      consecuencia:
        "Quien no sea ADMIN entra a un panel vacío y no la ve, y no parece un permiso mal puesto sino una avería.",
      accion: "Asignar el equipo",
      camino: "/equipo",
    };
  }

  if (!alta.lineaBase && puede.lineaBase) {
    return {
      clave: "alta-linea-base",
      gravedad: "sugerencia",
      titulo: "El presupuesto sigue siendo un borrador",
      consecuencia:
        "Es la referencia contra la que se miden los movimientos y el valor ganado, y fijarla tarde deja un atraso que siempre parecerá pequeño.",
      accion: "Ver revisiones",
      camino: "/revisiones",
    };
  }

  // 3. Lo que quedo a medias. No es una secuencia: es retomar el hilo.
  if (avisos.restriccionesVencidas > 0 && puede.lookahead) {
    const n = avisos.restriccionesVencidas;
    return {
      clave: "restricciones-vencidas",
      gravedad: "sugerencia",
      titulo: `${n} ${plural(n, "restricción con la fecha ya pasada", "restricciones con la fecha ya pasada")}`,
      consecuencia:
        "Lo que dependa de ellas se comprometerá igual, y el viernes será una causa de no cumplimiento que el martes ya se sabía.",
      accion: "Ver el Lookahead",
      camino: "/lookahead",
    };
  }

  if (avisos.semanasSinCerrar > 0 && puede.planSemanal) {
    const n = avisos.semanasSinCerrar;
    return {
      clave: "semanas-sin-cerrar",
      gravedad: "sugerencia",
      titulo: `${n} ${plural(n, "semana sin cerrar", "semanas sin cerrar")} con el corte ya pasado`,
      consecuencia:
        "Un compromiso sin evaluar cuenta como incumplido: no cerrar la semana no sube el PPC, solo lo deja sin causas.",
      accion: "Ver el plan semanal",
      camino: "/plan-semanal",
    };
  }

  // La obra esta al dia: el anclaje desaparece. Que no haya nada que sugerir
  // es el estado normal de una obra en marcha, no un hueco que rellenar.
  return null;
}
