/**
 * Reglas del telefono emisor de SMS que no necesitan base de datos.
 *
 * El emisor es el movil de la empresa que recoge los mensajes de la cola y
 * los manda con su SIM. GCM no le llama: el telefono pregunta cada ~20
 * segundos. De ahi sale lo unico interesante que se puede calcular sin
 * consultar nada: si ese telefono sigue vivo.
 */

/**
 * A quien sirve un emisor que acaba de presentar su credencial.
 *
 * `empresa` es lo normal: un token vinculado a una constructora, que solo ve
 * los mensajes de esa constructora.
 *
 * `respaldo` es la TRANSICION, y esta pensada para desaparecer. Hasta el 12
 * de agosto de 2026 habia un unico `SMS_COLA_TOKEN` para toda la plataforma;
 * si se hubiera apagado de golpe, el telefono ya configurado habria dejado de
 * mandar hasta que alguien lo reconfigurara. Con este alcance sigue sirviendo
 * —pero SOLO a las empresas que todavia no tienen emisor propio—, asi que en
 * cuanto cada una registra el suyo deja de alcanzarla. Cuando no quede
 * ninguna sin emisor, la variable de entorno se puede borrar.
 */
export type AlcanceCola =
  | { tipo: "empresa"; companyId: string; emisorId: string }
  | { tipo: "respaldo" };

/**
 * Cada cuanto pregunta un emisor sano.
 *
 * Lo fija la app (`movil/emisor-sms`), que consulta cada veinte segundos.
 */
export const LATIDO_ESPERADO_SEGUNDOS = 20;

/**
 * A partir de cuando se le da por dormido.
 *
 * Seis latidos, no uno: una consulta puede perderse por cobertura mala sin
 * que pase nada, y avisar al primer fallo seria enseñar una alarma que casi
 * siempre miente. Dos minutos de silencio, en cambio, ya no son normales.
 */
export const SILENCIO_SOSPECHOSO_SEGUNDOS = LATIDO_ESPERADO_SEGUNDOS * 6;

export type EstadoEmisor = "nunca" | "vivo" | "dormido";

/**
 * Si un emisor sigue despierto, mirando cuando pregunto por ultima vez.
 *
 * Es LA pregunta del canal SMS, y hasta ahora solo se podia responder mirando
 * la notificacion del propio telefono: «si la hora no avanza, la app esta
 * dormida». Android duerme la aplicacion cuando se apaga la pantalla si no se
 * quita el ahorro de bateria, y entonces los codigos dejan de salir sin que
 * nada avise. Con esto, la pantalla del administrador lo dice.
 *
 * `nunca` no es lo mismo que `dormido`: recien vinculado y todavia sin
 * preguntar significa que falta terminar de configurar el telefono, no que se
 * haya dormido, y el consejo que hay que dar es otro.
 */
export function estadoDelEmisor(
  ultimaConsultaAt: Date | null,
  ahora: Date,
): EstadoEmisor {
  if (!ultimaConsultaAt) return "nunca";

  const silencio = ahora.getTime() - ultimaConsultaAt.getTime();

  return silencio <= SILENCIO_SOSPECHOSO_SEGUNDOS * 1000 ? "vivo" : "dormido";
}

/**
 * La etiqueta con la que se distingue un telefono de otro.
 *
 * Obligatoria: con dos emisores y sin nombre, revocar es una tirada de dados.
 */
export function validarEtiquetaEmisor(
  entrada: string,
): { ok: true; etiqueta: string } | { ok: false; error: string } {
  const etiqueta = entrada.trim().replace(/\s+/g, " ");

  if (!etiqueta) {
    return {
      ok: false,
      error: "Ponle un nombre al teléfono, para saber cuál es cuando haya dos.",
    };
  }

  return { ok: true, etiqueta: etiqueta.slice(0, 80) };
}
