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
