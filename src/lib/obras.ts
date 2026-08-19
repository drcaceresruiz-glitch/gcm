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
 * No es una lista de deseos: una obra avanza, no salta ni retrocede. Se
 * planifica, arranca, quiza se paraliza y se reanuda, y termina cerrada. No
 * se paraliza lo que no empezo, no se vuelve a planificar lo ya iniciado, y
 * de CERRADA no se sale —el resultado de una obra cerrada es historia y
 * reabrirla lo falsearia—. Cancelar antes de empezar es pasar de planificacion
 * a cerrada directamente.
 */
export const TRANSICIONES_OBRA: Record<EstadoObra, EstadoObra[]> = {
  PLANIFICACION: ["EN_EJECUCION", "CERRADA"],
  EN_EJECUCION: ["PARALIZADA", "CERRADA"],
  PARALIZADA: ["EN_EJECUCION", "CERRADA"],
  CERRADA: [],
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
  clave: "presupuesto" | "cronograma" | "linea_base";
  /// Que falta, en una linea.
  falta: string;
  /// Que NO va a funcionar si se arranca sin esto.
  consecuencia: string;
  /// Si impide arrancar o solo se avisa.
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
    // Solo se menciona si HAY cronograma: decirle a alguien que no ha cargado
    // el plan que ademas no lo ha congelado es ruido.
    faltan.push({
      clave: "linea_base",
      falta: "El cronograma no tiene linea base fijada.",
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
 */
export function obraAdmiteCambios(obra: ObraParaEscribir): boolean {
  return motivoNoAdmiteCambios(obra) === null;
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
 */
export function motivoNoAdmiteCambios(obra: ObraParaEscribir): string | null {
  // La empresa entera congelada manda sobre el estado de la obra: da igual que
  // esta este viva si lo que se esta haciendo es sacar una copia coherente de
  // TODA la constructora. Va primero porque es el motivo mas general y el
  // unico que explica por que una obra en ejecucion no admite cambios.
  if (obra.empresaEnMigracion) return EMPRESA_EN_MIGRACION;
  if (obra.archivadaEn) return OBRA_ARCHIVADA;
  if (obra.estado === "CERRADA") return OBRA_CERRADA;
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
 * "Iniciar ejecucion" y "Reanudar" llevan al MISMO estado (EN_EJECUCION) pero
 * se leen distinto segun de donde se venga: arrancar por primera vez no es lo
 * mismo que retomar algo parado, y el boton debe decir lo que de verdad hace.
 */
export function etiquetaTransicionObra(desde: EstadoObra, hacia: EstadoObra): string {
  if (hacia === "EN_EJECUCION") {
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
