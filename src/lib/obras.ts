/**
 * Reglas de una obra, sin base de datos.
 *
 * Se separan del servicio para poder probarlas: son decisiones —esta fecha
 * vale, este estado existe, este plazo es coherente— y no consultas.
 */

/** Los estados del enum `ProjectState` del esquema. */
export const ESTADOS_OBRA = [
  "PLANIFICACION",
  "EN_EJECUCION",
  "PARALIZADA",
  "CERRADA",
] as const;

export type EstadoObra = (typeof ESTADOS_OBRA)[number];

/**
 * Como se escriben los estados en pantalla.
 *
 * En un solo sitio porque el panel los pinta en la tarjeta y ademas los
 * ofrece en el desplegable del filtro: separados, uno acabaria diciendo
 * «EN EJECUCION» y el otro «En ejecucion».
 */
export const ETIQUETA_ESTADO_OBRA: Record<EstadoObra, string> = {
  PLANIFICACION: "Planificacion",
  EN_EJECUCION: "En ejecucion",
  PARALIZADA: "Paralizada",
  CERRADA: "Cerrada",
};

/**
 * De que color va cada estado en pantalla.
 *
 * Al lado de la etiqueta y no en el componente: si el mapa de colores vive en
 * la pantalla, la siguiente que muestre obras elegira otros y el mismo estado
 * saldra de dos colores en dos sitios. Los valores son tonos de `ui/Chip`.
 */
export const TONO_ESTADO_OBRA: Record<
  EstadoObra,
  "neutro" | "curso" | "exito" | "alerta" | "peligro"
> = {
  // La que esta viva es la que se mira: lleva el color de marca.
  EN_EJECUCION: "curso",
  PLANIFICACION: "neutro",
  PARALIZADA: "alerta",
  // Cerrada no es un fallo, es el final natural: verde, no rojo.
  CERRADA: "exito",
};

/**
 * Que estados puede tomar una obra a partir del que tiene ahora.
 *
 * No es una lista de deseos: una obra avanza, no salta ni retrocede en la
 * mayoria de los casos. Se planifica, arranca, quiza se paraliza y se
 * reanuda, y termina cerrada. No se paraliza lo que no empezo, no se vuelve
 * a planificar lo ya iniciado. Cancelar antes de empezar es pasar de
 * planificacion a cerrada directamente.
 *
 * CERRADA SI admite una salida, desde el 21 de agosto de 2026: reabrir,
 * para la obra que se cerro por error. No es la puerta trasera que parece
 * —exige el permiso `obra:reabrir`, innegociable y solo del ADMIN, mas una
 * confirmacion explicita en la pantalla (ver `EstadoObra.tsx`)—, y por
 * fuera de esa puerta la garantia sigue siendo la misma: el resultado de
 * una obra cerrada es historia, y modificarlo sin pasar por aqui la
 * falsearia. Reabrir SIEMPRE vuelve a EN_EJECUCION, nunca a PLANIFICACION
 * ni a PARALIZADA: la obra ya tuvo gasto real, y "planificacion" dejaria
 * de significar lo que dice.
 */
export const TRANSICIONES_OBRA: Record<EstadoObra, EstadoObra[]> = {
  PLANIFICACION: ["EN_EJECUCION", "CERRADA"],
  EN_EJECUCION: ["PARALIZADA", "CERRADA"],
  PARALIZADA: ["EN_EJECUCION", "CERRADA"],
  CERRADA: ["EN_EJECUCION"],
};

/** Los estados a los que se puede pasar desde el actual. */
export function transicionesDeObra(desde: string): EstadoObra[] {
  return TRANSICIONES_OBRA[desde as EstadoObra] ?? [];
}

/** Si el paso de un estado a otro es uno de los permitidos. */
export function puedeTransicionarObra(desde: string, hacia: string): boolean {
  return transicionesDeObra(desde).includes(hacia as EstadoObra);
}

/**
 * Los estados en los que una obra sigue teniendo EXPOSICION real de dinero y
 * de plazo: cuanto hay comprometido, y si la fecha fin ya paso.
 *
 * Auditoria del 21 de agosto de 2026: `gerencia.service.ts` y
 * `avisos-reloj.ts` ya contaban PARALIZADA como obra viva (SPI/atraso,
 * recordatorios), pero `obras.service.ts` la excluia de las cifras de
 * dinero del panel —solo miraba `EN_EJECUCION`—. Consecuencia real: al
 * paralizar una obra con encargos vigentes, ese dinero desaparecia de
 * inmediato del panel aunque la deuda con el proveedor seguia existiendo.
 * Paralizar bloquea trabajo NUEVO (`motivoNoAdmiteCambios`), no borra lo que
 * ya se debe ni mueve la fecha de fin.
 *
 * PLANIFICACION se queda fuera A PROPOSITO, y eso NO es lo que estaba
 * desalineado: una obra en planificacion puede tener presupuesto cargado
 * —es requisito para arrancar— pero nada empezo a gastarse todavia, y el
 * panel ensena "la exposicion de HOY", no la cartera completa. CERRADA es
 * historia. Ninguna de las dos entra aqui, y eso no cambia con esta
 * constante: solo unifica el tratamiento de PARALIZADA entre los tres
 * sitios que ya decidian cada uno por su cuenta.
 */
export const ESTADOS_OBRA_CON_EXPOSICION: readonly EstadoObra[] = [
  "EN_EJECUCION",
  "PARALIZADA",
];

/**
 * Que le falta a una obra para poder ponerse en marcha.
 *
 * Hasta el 10 de agosto de 2026 no se comprobaba NADA: bastaba con que la
 * transicion fuera legal. Una obra recien creada, con cero partidas y sin
 * cronograma, podia pasar a "En ejecucion" y quedarse ahi produciendo
 * indicadores vacios que en el panel no se distinguen de una obra que va mal:
 * 0% de avance y S/ 0.00 de presupuesto se leen igual esten vacios o sean
 * reales.
 *
 * EL PRESUPUESTO ES OBLIGATORIO y lo demas no, y la diferencia no es de
 * grado. Sin partidas no hay contra que imputar una orden de compra ni contra
 * que medir nada: el BAC es cero y todo el control economico se cae. El
 * cronograma y la linea base, en cambio, pueden llegar despues sin romper
 * nada; la obra real a veces arranca mientras se termina de montar el plan, y
 * una puerta demasiado rigida solo consigue que alguien cargue datos de
 * relleno para pasarla, que es peor que no tener puerta.
 */
export interface RequisitoObra {
  clave:
    | "presupuesto"
    | "cronograma"
    | "linea_base_cronograma"
    | "valorizaciones"
    | "movimientos_borrador"
    | "pendientes_criticos";
  /// Que falta, en una linea.
  falta: string;
  /// Que NO va a funcionar si se arranca (o se cierra) sin esto.
  consecuencia: string;
  /// Si impide la transicion o solo se avisa.
  bloqueante: boolean;
}

export interface EstadoObraParaArrancar {
  partidas: number;
  tieneCronograma: boolean;
  tieneLineaBase: boolean;
}

export function requisitosParaEjecutar(
  estado: EstadoObraParaArrancar,
): RequisitoObra[] {
  const faltan: RequisitoObra[] = [];

  if (estado.partidas === 0) {
    faltan.push({
      clave: "presupuesto",
      falta: "El presupuesto no tiene ninguna partida.",
      consecuencia:
        "Sin partidas no hay contra que imputar las ordenes de compra ni con " +
        "que calcular el valor ganado: el presupuesto de control seria cero.",
      bloqueante: true,
    });
  }

  if (!estado.tieneCronograma) {
    faltan.push({
      clave: "cronograma",
      falta: "No hay cronograma cargado.",
      consecuencia:
        "No habra curva de avance, ni SPI, ni Lookahead, ni Plan Semanal: " +
        "todo el Last Planner se apoya en las tareas del cronograma.",
      bloqueante: false,
    });
  } else if (!estado.tieneLineaBase) {
    /*
     * DICE «DEL CRONOGRAMA», y no es un adorno.
     *
     * En GCM hay DOS lineas base y las dos se llaman igual: la del
     * PRESUPUESTO (`Baseline.aprobadaAt`, que congela contra que se miden los
     * adicionales) y la del CRONOGRAMA (`Cronograma.lineaBaseAt`, que congela
     * contra que se mide el plazo). Hasta el 23 de agosto de 2026 este aviso
     * decia «linea base» a secas y salia en la MISMA pantalla que el anclaje
     * de continuidad, que con esas dos palabras se refiere a la otra. Quien
     * lo leia no sabia cual de las dos le faltaba, y desde ahi ya no hay
     * forma de entender el orden de nada.
     */
    faltan.push({
      clave: "linea_base_cronograma",
      falta: "El cronograma no tiene su linea base fijada.",
      consecuencia:
        "El plazo se medira contra el ultimo corte cargado, es decir, contra " +
        "si mismo: siempre parecera que la obra va al dia.",
      bloqueante: false,
    });
  }

  return faltan;
}

/** Si algo impide arrancar. Lo demas son avisos que se pueden aceptar. */
export function puedeArrancar(faltan: readonly RequisitoObra[]): boolean {
  return !faltan.some((r) => r.bloqueante);
}

/**
 * Que le falta a una obra para poder cerrarse, simetrico a
 * `requisitosParaEjecutar`.
 *
 * Dos cosas SI bloquean, porque cerrar la obra las vuelve irresolubles para
 * siempre —cerrada es historia, nadie puede ya aprobar un borrador ni saldar
 * una deuda contra una obra que ya no admite escrituras—: valorizaciones con
 * saldo por pagar, y movimientos presupuestales sin decidir. Los pendientes
 * del tablero (tareas, restricciones) NO bloquean: esa lista ya se declara
 * "informa, no bloquea" en `lib/pendientes.ts`, y convertirla en puerta de
 * golpe rompería esa doctrina para cualquiera que la mire desde el tablero.
 */
export interface EstadoObraParaCerrar {
  /// Encargos VIGENTES con saldo por pagar (valorizado - pagado > 0).
  valorizacionesPendientes: number;
  /// MovimientoPresupuestal en estado BORRADOR.
  movimientosBorrador: number;
  /// Pendientes del tablero (`lib/pendientes.ts`) de gravedad "critica".
  pendientesCriticos: number;
}

export function requisitosParaCerrar(
  estado: EstadoObraParaCerrar,
): RequisitoObra[] {
  const faltan: RequisitoObra[] = [];

  if (estado.valorizacionesPendientes > 0) {
    faltan.push({
      clave: "valorizaciones",
      falta:
        estado.valorizacionesPendientes === 1
          ? "Hay un encargo con saldo por pagar."
          : `Hay ${estado.valorizacionesPendientes} encargos con saldo por pagar.`,
      consecuencia:
        "Cerrar la obra sin saldar la deuda con el proveedor la esconde: " +
        "quedaria historia sin poder corregirse.",
      bloqueante: true,
    });
  }

  if (estado.movimientosBorrador > 0) {
    faltan.push({
      clave: "movimientos_borrador",
      falta:
        estado.movimientosBorrador === 1
          ? "Hay un movimiento presupuestal sin aprobar."
          : `Hay ${estado.movimientosBorrador} movimientos presupuestales sin aprobar.`,
      consecuencia:
        "Un borrador es una decision sin tomar; cerrada la obra nadie " +
        "puede ya aprobarlo ni rechazarlo.",
      bloqueante: true,
    });
  }

  if (estado.pendientesCriticos > 0) {
    faltan.push({
      clave: "pendientes_criticos",
      falta:
        estado.pendientesCriticos === 1
          ? "Queda una cosa pendiente en el tablero."
          : `Quedan ${estado.pendientesCriticos} cosas pendientes en el tablero.`,
      consecuencia:
        "Se puede cerrar igual: esta lista informa, no impide — revisala " +
        "antes por si algo merece resolverse primero.",
      bloqueante: false,
    });
  }

  return faltan;
}

/** Alias de `puedeArrancar`: la regla es la misma, "si algo bloquea". */
export const puedeCerrar = puedeArrancar;

/**
 * Si una obra admite cambios.
 *
 * Hasta el 10 de agosto de 2026 la pantalla decia "Cerrada: no admite mas
 * cambios" y era MENTIRA: `CERRADA` solo impedia cambiar de estado. En una
 * obra cerrada se podia seguir importando presupuesto, editando partidas,
 * creando ordenes de compra y registrando avance. Un cartel que no se cumple
 * es peor que no ponerlo: ensena a no creerse los carteles.
 *
 * Se declara aqui, en logica pura, para que el mismo criterio valga en la
 * pantalla y en el servidor. La comprobacion que MANDA es la del servidor: la
 * de la pantalla solo evita ofrecer un boton que va a fallar.
 *
 * El segundo parametro se propaga tal cual a `motivoNoAdmiteCambios` — ver su
 * comentario. `avisos-reloj.ts` y `gerencia.service.ts` lo usan con
 * `{ permiteEnParalizada: true }` para seguir tratando una obra paralizada
 * como "viva" a efectos de avisos y alertas de atraso, que es el
 * comportamiento que ya tenian antes de esta guarda y que esta entrega no
 * cambia a proposito.
 */
export function obraAdmiteCambios(
  obra: ObraParaEscribir,
  opciones: { permiteEnParalizada?: boolean } = {},
): boolean {
  return motivoNoAdmiteCambios(obra, opciones) === null;
}

/**
 * Lo minimo que hay que saber de una obra para decidir si se puede escribir
 * en ella. Es un tipo estructural a proposito: cada servicio ya trae la obra
 * cargada con su propio `select`, y asi le vale el que tenga.
 */
export interface ObraParaEscribir {
  estado: string;
  /// Con fecha, es una copia restaurada para auditoria. Opcional para que un
  /// `select` que no la pida siga compilando; ausente se lee como null.
  archivadaEn?: Date | null;
  /**
   * La EMPRESA esta congelada para exportarla. Opcional por lo mismo que
   * `archivadaEn`: un `select` que no la pida sigue compilando.
   *
   * No es un estado de la obra pero se decide aqui, porque la pregunta que
   * contesta esta funcion es «se puede cambiar algo» y la respuesta tambien
   * depende de un piso mas arriba. Ponerlo en cada servicio seria repartir la
   * misma comprobacion por setenta y seis escrituras.
   */
  empresaEnMigracion?: boolean;
}

/**
 * Por que esta obra no admite cambios, o `null` si si los admite.
 *
 * Se devuelve el MOTIVO y no un booleano porque los dos casos se explican
 * distinto y quien se topa con ellos necesita saber en cual esta: una obra
 * cerrada podria en teoria reabrirse si el negocio lo decidiera; una copia de
 * auditoria no es una obra, y no hay nada que reabrir.
 *
 * El orden importa: se mira primero `archivadaEn` porque una copia restaurada
 * SIEMPRE viene ademas en estado CERRADA, y decir "esta cerrada" cuando lo que
 * pasa es que estas mirando un respaldo confunde mas de lo que ayuda.
 *
 * PARALIZADA es distinta de las otras dos: no bloquea todo-o-nada. Una obra
 * parada admite seguir CERRANDO lo que ya estaba en curso (aprobar un
 * movimiento en borrador, subir evidencia, cerrar la semana abierta, resolver
 * restricciones) pero no ABRIR trabajo nuevo (una orden, un encargo, un
 * compromiso). El default de `opciones.permiteEnParalizada` es `false` a
 * proposito —mismo principio deny-by-default que `rbac.ts`—: de las
 * escrituras que llaman a esta guarda, la inmensa mayoria son "crear algo
 * nuevo", y con el default restrictivo quedan protegidas sin tocarlas. Solo
 * las pocas excepciones conocidas piden `{ permiteEnParalizada: true }`
 * explicitamente.
 */
export function motivoNoAdmiteCambios(
  obra: ObraParaEscribir,
  opciones: { permiteEnParalizada?: boolean } = {},
): string | null {
  // La empresa entera congelada manda sobre el estado de la obra: da igual que
  // esta este viva si lo que se esta haciendo es sacar una copia coherente de
  // TODA la constructora. Va primero porque es el motivo mas general y el
  // unico que explica por que una obra en ejecucion no admite cambios.
  if (obra.empresaEnMigracion) return EMPRESA_EN_MIGRACION;
  if (obra.archivadaEn) return OBRA_ARCHIVADA;
  if (obra.estado === "CERRADA") return OBRA_CERRADA;
  if (obra.estado === "PARALIZADA" && !opciones.permiteEnParalizada) {
    return OBRA_PARALIZADA;
  }
  return null;
}

/**
 * El motivo, para no repetirlo distinto en cada servicio.
 *
 * Nombra la salida: sin ella, quien se topa con esto no sabe si ha hecho algo
 * mal o si el sistema esta roto.
 */
export const OBRA_CERRADA =
  "La obra esta cerrada y no admite cambios. El resultado de una obra " +
  "cerrada es historia: modificarlo falsearia lo que de verdad paso.";

/**
 * Igual que `OBRA_CERRADA` pero para PARALIZADA: aqui si se puede seguir
 * cerrando lo que ya estaba en curso, asi que el mensaje lo dice — no es un
 * candado total.
 */
export const OBRA_PARALIZADA =
  "La obra esta paralizada: no se puede abrir trabajo nuevo mientras dure. " +
  "Se puede seguir cerrando lo que ya estaba en curso (aprobar movimientos " +
  "pendientes, subir evidencia, cerrar la semana abierta, resolver " +
  "restricciones).";

/**
 * La empresa entera esta congelada porque se esta exportando.
 *
 * Dice que es temporal y quien lo levanta, que es lo que separa esto de un
 * fallo: quien se topa con el mensaje tiene que saber que no ha roto nada y
 * que hay alguien que puede devolverlo a la normalidad.
 */
export const EMPRESA_EN_MIGRACION =
  "La constructora esta en migracion: se esta sacando una copia completa de " +
  "sus datos y nadie puede escribir mientras dure, para que el archivo no " +
  "salga con unas cifras de un momento y otras de otro. Lo levanta el " +
  "administrador cuando la exportacion termine.";

/**
 * Lo mismo, para una copia restaurada de un respaldo.
 *
 * Se separa de `OBRA_CERRADA` porque no es el mismo hecho: aqui no se esta
 * mirando la obra, se esta mirando una FOTO de la obra. Nada de lo que se
 * escribiera encima significaria nada, porque el original ya no existe.
 */
export const OBRA_ARCHIVADA =
  "Esto es una copia restaurada de un respaldo, abierta solo para revisarla. " +
  "No admite cambios: lo que se escribiera aqui no le pasaria a ninguna obra.";

/**
 * El verbo del boton que hace la transicion, no el nombre del estado destino.
 *
 * "Iniciar ejecucion", "Reanudar" y "Reabrir" llevan las tres al MISMO
 * estado (EN_EJECUCION) pero se leen distinto segun de donde se venga:
 * arrancar por primera vez, retomar algo parado y deshacer un cierre por
 * error son tres actos distintos, y el boton debe decir cual de los tres
 * es.
 */
export function etiquetaTransicionObra(desde: EstadoObra, hacia: EstadoObra): string {
  if (hacia === "EN_EJECUCION") {
    if (desde === "CERRADA") return "Reabrir";
    return desde === "PARALIZADA" ? "Reanudar" : "Iniciar ejecucion";
  }
  if (hacia === "PARALIZADA") return "Paralizar";
  if (hacia === "CERRADA") return "Cerrar obra";
  return ETIQUETA_ESTADO_OBRA[hacia];
}

/**
 * Una obra nueva nace en planificacion salvo que se diga otra cosa.
 *
 * Un valor fuera del enum cae aqui en vez de romper: viene de un desplegable,
 * y ante una peticion manipulada lo que menos sorprende es el estado inicial.
 */
export function estadoDeObra(valor: string | undefined): EstadoObra {
  return ESTADOS_OBRA.includes(valor as EstadoObra)
    ? (valor as EstadoObra)
    : "PLANIFICACION";
}

/**
 * Una fecha `YYYY-MM-DD` como la manda un `<input type="date">`, o null.
 *
 * Se fija a medianoche UTC porque la columna es `@db.Date`: construir la
 * fecha en la zona local desplazaria el dia en la mitad del planeta.
 */
export function fechaDeObra(valor: string | undefined): Date | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;

  const fecha = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return null;

  // `new Date("2026-02-31")` no falla: rueda al 3 de marzo. Comparar contra
  // lo que se pidio descarta los dias que no existen.
  return fecha.toISOString().slice(0, 10) === valor ? fecha : null;
}

/**
 * El correlativo de obra a partir de su numero: `OB-000001`.
 *
 * Seis digitos con ceros a la izquierda para que ordene igual como texto que
 * como numero —"OB-000009" antes que "OB-000010"— y quepan casi un millon de
 * obras antes de crecer. El prefijo lo hace reconocible de un vistazo en una
 * busqueda o una auditoria.
 */
export function formatearCorrelativoObra(numero: number): string {
  return `OB-${String(numero).padStart(6, "0")}`;
}

export interface PlazoObra {
  inicio: Date;
  fin: Date;
}

export type ValidacionObra =
  | { ok: true; plazo: PlazoObra }
  | { ok: false; error: string };

/** Nombre obligatorio y un plazo que no vaya hacia atras. */
export function validarObra(datos: {
  nombreObra: string;
  fechaInicio: string;
  fechaFinProgramada: string;
}): ValidacionObra {
  if (!datos.nombreObra.trim()) {
    return { ok: false, error: "Indica el nombre de la obra." };
  }

  const inicio = fechaDeObra(datos.fechaInicio);
  const fin = fechaDeObra(datos.fechaFinProgramada);

  if (!inicio || !fin) {
    return { ok: false, error: "Indica las fechas de inicio y de fin." };
  }

  if (fin < inicio) {
    return {
      ok: false,
      error: "La fecha de fin no puede ser anterior a la de inicio.",
    };
  }

  return { ok: true, plazo: { inicio, fin } };
}
