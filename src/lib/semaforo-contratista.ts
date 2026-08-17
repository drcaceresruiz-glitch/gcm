/**
 * Si un contratista tiene trabajo contratado AHORA en la obra que se mira.
 *
 * Es lo que se pinta en cada fila del catalogo, y responde a la pregunta que se
 * hace de verdad delante de esa lista: «este, ¿esta trabajando conmigo en esta
 * obra o no?». Sin esto el catalogo es una guia de telefonos.
 *
 * SE MIRA CONTRA UNA OBRA, no contra la empresa. Un contratista puede estar
 * vigente en una obra y no haber pisado la otra, y un semaforo de empresa
 * diria «verde» al lado de alguien que no tiene nada que ver con lo que se
 * esta mirando. Sin obra elegida no se pinta nada, que es distinto de pintar
 * gris.
 */

/**
 * Lo que se sabe de un encargo para decidir el color. Deliberadamente poco: la
 * consulta no tiene que traer montos ni partidas para pintar un punto.
 *
 * El estado se declara aqui como union de textos y NO se importa de Prisma: en
 * `lib/` no entra la base de datos, y asi esto se puede probar sin generar el
 * cliente. Si algun dia se anade un estado al enum, el servicio dejara de
 * compilar contra esta firma, que es justo donde se quiere el aviso.
 */
export interface EncargoParaSemaforo {
  estado: "VIGENTE" | "CERRADO" | "ANULADO";
  fechaInicio: Date | null;
  fechaFin: Date | null;
}

export type EstadoContrato =
  /// Tiene un encargo en marcha hoy.
  | "vigente"
  /// Tiene un encargo que todavia no empieza.
  | "proximo"
  /// Sin encargo, pero se le ha comprado algo en esta obra.
  | "soloCompras"
  /// Nada en esta obra.
  | "ninguno";

/**
 * De un encargo suelto, si cuenta y como.
 *
 * ANULADO no cuenta jamas: es un encargo que se deshizo. CERRADO tampoco cuenta
 * como vigente aunque sus fechas abarquen hoy —cerrarlo es decir que se
 * acabo—, y por eso el estado se mira ANTES que las fechas.
 *
 * SIN FECHAS CUENTA COMO VIGENTE, y es la decision que mas se puede discutir.
 * Las dos fechas son opcionales en la base y hay encargos ya cargados sin
 * ellas; tratar «no lo anotaron» como «no hay contrato» borraria del semaforo
 * justo a los que llevan mas tiempo en la obra. Se prefiere pecar de verde
 * declarado que de gris silencioso.
 */
function estadoDe(encargo: EncargoParaSemaforo, hoy: Date): EstadoContrato {
  if (encargo.estado !== "VIGENTE") return "ninguno";

  // Solo la parte de fecha: un encargo que empieza hoy esta vigente hoy, y
  // comparar con la hora dejaria fuera toda la mañana.
  const dia = (f: Date) => Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
  const ahora = dia(hoy);

  if (encargo.fechaInicio && dia(encargo.fechaInicio) > ahora) return "proximo";
  if (encargo.fechaFin && dia(encargo.fechaFin) < ahora) return "ninguno";

  return "vigente";
}

/**
 * El color de una fila del catalogo.
 *
 * El orden de preferencia no es casual: **vigente gana a proximo, y proximo
 * gana a compras**. Quien tiene un frente en marcha y ademas otro firmado para
 * el mes que viene esta trabajando, y decir «proximo» de el seria enseñar la
 * cita mas lejana de las dos.
 *
 * `tieneOrdenes` entra al final y a proposito: comprarle material a alguien no
 * es tenerlo contratado —lo pidio el usuario para no perder de vista a quien ya
 * factura en la obra—, asi que se enseña distinto y nunca como contrato.
 */
export function estadoDelContrato(
  encargos: readonly EncargoParaSemaforo[],
  tieneOrdenes: boolean,
  hoy: Date,
): EstadoContrato {
  const estados = encargos.map((e) => estadoDe(e, hoy));

  if (estados.includes("vigente")) return "vigente";
  if (estados.includes("proximo")) return "proximo";

  return tieneOrdenes ? "soloCompras" : "ninguno";
}

/** Como se lee cada estado. El color nunca va solo: siempre lleva su palabra. */
export const ROTULO_CONTRATO: Record<
  EstadoContrato,
  { texto: string; ayuda: string; color: string }
> = {
  vigente: {
    texto: "Con contrato",
    ayuda: "Tiene un frente en marcha en esta obra.",
    color: "var(--color-exito)",
  },
  proximo: {
    texto: "Por empezar",
    ayuda: "Tiene un frente contratado que todavía no empieza.",
    color: "var(--color-alerta)",
  },
  soloCompras: {
    texto: "Solo compras",
    ayuda: "No tiene frente contratado, pero se le ha comprado en esta obra.",
    color: "var(--color-marca-600)",
  },
  ninguno: {
    texto: "Sin contrato",
    ayuda: "No tiene nada asignado en esta obra.",
    color: "var(--texto-suave)",
  },
};
