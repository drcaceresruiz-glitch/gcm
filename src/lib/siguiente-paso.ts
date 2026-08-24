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
 *   2. El ALTA de la obra, EN EL MISMO ORDEN QUE EL RIEL DEL MENU:
 *      meta -> contractual -> congelarlo -> cronograma -> equipo. Es
 *      «completar un registro», el unico sitio donde encadenar aporta de
 *      verdad: son cinco pasos con un final, no un flujo de exploracion.
 *   3. Lo que espera una FIRMA de gerencia: primero la adenda -que tiene a
 *      alguien bloqueado, no se le puede pagar al contratista- y despues la
 *      deduccion de costos propios, que no bloquea nada pero deja a alguien
 *      esperando una respuesta.
 *   4. Lo que quedo a medias y ya vencio. Aqui NO se encadena nada: se
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
  /// Firmar adendas. Es de gerencia: quien registra el adicional no es quien
  /// lo aprueba, y a quien no puede firmar no se le propone que firme.
  adendas: boolean;
  /// Firmar deducciones de costos propios. Es un permiso distinto del de las
  /// adendas: una empresa puede repartir las dos firmas en dos personas.
  deducciones: boolean;
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
  /// Adendas registradas por obra y todavia sin la firma de gerencia.
  adendasPorFirmar: number;
  /// Deducciones de costos propios pedidas por obra y sin firmar.
  deduccionesPorFirmar: number;
}

function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

export function siguientePaso(
  alta: EstadoAlta,
  puede: PuedeHacer,
  avisos: AvisosVivos,
): PasoSiguiente | null {
  /*
   * 1. EL ALTA, EN EL ORDEN DEL MENU DE LA OBRA. Que es lo mismo que decir:
   *    en el orden del trabajo real.
   *
   *        meta -> contractual -> congelarlo -> cronograma -> equipo
   *
   * HASTA EL 24 DE AGOSTO DE 2026 ESTE ORDEN ERA OTRO, y lo dijo el usuario
   * mirando la pantalla: «¿cómo me va a pedir que cargue el cronograma si aún
   * no se ha congelado el presupuesto, si aún no se ha terminado de definir?».
   * Tenia razon, y ademas GCM se contradecia a si mismo: el riel de la obra
   * ordena Meta, Presupuesto, Revisiones y DESPUES Cronograma -su propio
   * comentario explica que el cronograma va al final «detras de todo el hilo
   * del dinero: su EDT sale del presupuesto»- mientras este anclaje pedia el
   * cronograma antes de congelar nada. El manual da por hecho que el riel es
   * el indice de la obra, asi que el que estaba mal era este.
   *
   * Y no es solo estetica: la EDT del cronograma SE GENERA desde las partidas.
   * Planificar sobre un presupuesto que todavia se esta tocando es planificar
   * sobre algo que va a cambiar, y el mapeo tarea-partida se rompe con el.
   */

  /*
   * LA META VA PRIMERA, Y SE PIDE AUNQUE EL CONTRACTUAL YA EXISTA.
   *
   * Este era el agujero de verdad, el que no se veia. La condicion era
   * `!alta.presupuesto`, o sea que la meta SOLO se pedia mientras no hubiera
   * partidas. Quien cargaba el contractual directamente -por Excel, que es
   * como entra una obra nueva- se quedaba con `presupuesto` hecho y `meta`
   * sin hacer, y el anclaje no se lo volvia a mencionar NUNCA: pasaba de
   * largo al cronograma.
   *
   * Sin meta no hay bolsa. Y sin bolsa no hay margen, ni aviso cuando se
   * acaba, ni deduccion de costos propios que pedir: se queda fuera la mitad
   * del control economico de la obra, en silencio.
   */
  if (!alta.meta && puede.presupuesto) {
    return {
      clave: "alta-presupuesto",
      gravedad: "sugerencia",
      titulo: "Esta obra todavía no tiene presupuesto meta",
      consecuencia:
        "La meta es lo que a la empresa le cuesta la obra, y sin ella no hay bolsa: ni margen, ni aviso cuando se acabe.",
      accion: "Cargar el presupuesto meta",
      camino: "/meta",
      // El segundo tramo solo se ofrece si de verdad falta. Con el contractual
      // ya cargado, mandar a generarlo seria mandar a una pantalla donde no
      // queda nada por hacer.
      ...(alta.presupuesto
        ? {}
        : { despues: { accion: "Generar el contractual", camino: "/contractual" } }),
    };
  }

  if (!alta.presupuesto && puede.presupuesto) {
    // La meta ya esta: el tramo que falta es el otro.
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

  /*
   * ESTA es la linea base del PRESUPUESTO, no la del cronograma.
   *
   * Las dos existen y las dos se llaman igual. Este aviso y el de requisitos
   * (`requisitosParaEjecutar`) salen en la misma pantalla, asi que ninguno de
   * los dos puede decir «linea base» a secas: hay que nombrar cual.
   */
  if (!alta.lineaBase && puede.lineaBase) {
    return {
      clave: "alta-linea-base",
      gravedad: "sugerencia",
      titulo: "El presupuesto contractual sigue siendo un borrador",
      consecuencia:
        "Congelarlo es lo que fija la referencia contra la que se miden los adicionales y el valor ganado; y el cronograma se planifica sobre esas partidas, así que hacerlo antes es planificar sobre algo que aún puede cambiar.",
      accion: "Ver revisiones",
      camino: "/revisiones",
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

  /*
   * 2. LO QUE ESPERA UNA FIRMA, y por eso tiene la obra parada por dentro.
   *
   * Va con las bloqueantes y no con las sugerencias, y no se puede aplazar:
   * mientras la adenda siga pendiente, el contrato del contratista vale lo
   * de antes. No se le puede pagar por encima de lo firmado -desde el
   * 23/08 el pago se rechaza nombrando justo esta salida-, y el
   * comprometido de la obra no cuenta ese dinero. O sea que el residente
   * esta bloqueado y el numero que mira gerencia esta corto, las dos cosas
   * a la vez, por una firma que nadie recuerda que falta.
   *
   * Se propone SOLO a quien puede firmar. Al residente que la registro no
   * se le dice «firma esto», porque no puede: para el, la adenda pendiente
   * es la insignia del menu de Proveedores, que informa sin pedir nada.
   *
   * Y va DESPUES del alta: si la obra todavia no tiene presupuesto, lo que
   * toca antes es eso. En la practica no se cruzan -no hay contratistas con
   * adicionales en una obra sin presupuesto-, pero el orden tiene que
   * decidirlo alguien y no el azar.
   */
  if (avisos.adendasPorFirmar > 0 && puede.adendas) {
    const n = avisos.adendasPorFirmar;
    return {
      clave: "adendas-por-firmar",
      gravedad: "bloqueante",
      titulo: `${n} ${plural(n, "adicional espera tu firma", "adicionales esperan tu firma")}`,
      consecuencia:
        "Hasta que se firme, el contrato del contratista vale lo de antes: no se le puede pagar de más y ese dinero no cuenta como comprometido en la obra.",
      accion: "Ver los contratistas",
      camino: "/proveedores",
    };
  }

  /*
   * La deduccion va DESPUES de la adenda, y no al mismo nivel.
   *
   * La adenda tiene a alguien BLOQUEADO: sin ella no se le puede pagar al
   * contratista. La deduccion no bloquea nada -la obra sigue trabajando-, lo
   * que hay es alguien esperando una respuesta. Por eso es sugerencia y se
   * puede aplazar con «Ahora no»: sigue estando en la bandeja de gerencia y en
   * la insignia de Meta, que es donde no se pierde.
   */
  if (avisos.deduccionesPorFirmar > 0 && puede.deducciones) {
    const n = avisos.deduccionesPorFirmar;
    return {
      clave: "deducciones-por-firmar",
      gravedad: "sugerencia",
      titulo: `${n} ${plural(n, "deducción espera tu firma", "deducciones esperan tu firma")}`,
      consecuencia:
        "La obra pide gastar menos en un costo propio para recuperar bolsa; hasta que lo firmes, ese dinero sigue comprometido.",
      accion: "Ver el presupuesto meta",
      camino: "/meta",
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
