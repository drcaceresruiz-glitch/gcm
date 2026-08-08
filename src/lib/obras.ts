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
