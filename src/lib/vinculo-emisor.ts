/**
 * Lo que hay que hacer en el telefono para que empiece a mandar los SMS.
 *
 * UNA sola lista de pasos, de la que salen tanto la pantalla como el mensaje
 * que se le manda a ese telefono. Escribirlos dos veces es la forma tipica de
 * que la pantalla diga una cosa y el WhatsApp otra en cuanto cambie la app.
 *
 * POR QUE POR WHATSAPP Y NO POR SMS, que seria lo natural: para el PRIMER
 * telefono no hay SMS que valga —el canal de SMS es justo lo que se esta
 * creando—, y ademas un SMS con un enlace lo marcan como spam las operadoras.
 * WhatsApp no necesita canal: lo manda quien administra desde SU telefono.
 */

export interface DatosDeVinculo {
  /// El token en claro. Se ve UNA vez: no se guarda, solo su hash.
  token: string;
  /// A donde pregunta el telefono. La misma para todas las empresas.
  direccionCola: string;
  /// De donde se baja el instalador.
  urlInstalador: string;
}

/**
 * Los pasos, en orden y en imperativo.
 *
 * El ahorro de bateria va con paso propio y no como nota al pie: es LA causa
 * de casi todos los telefonos que aparecen dormidos, y una advertencia
 * enterrada al final no la lee nadie.
 */
export function pasosDeVinculo(d: DatosDeVinculo): string[] {
  return [
    `Descarga el instalador: ${d.urlInstalador}`,
    "Ábrelo. Android avisará de que viene de un origen desconocido: es correcto, dale a permitir esa vez.",
    "Abre la aplicación «Emisor SMS GCM» y concede los permisos que pida (SMS y notificaciones).",
    `Pega esta dirección de la cola: ${d.direccionCola}`,
    `Pega este token: ${d.token}`,
    "Pulsa «Encender».",
    "Pulsa «Quitar el ahorro de batería» y acepta. Sin esto Android duerme la aplicación al apagar la pantalla y los SMS dejan de salir.",
    "Listo: en menos de un minuto este teléfono aparecerá como «Preguntando» en GCM.",
  ];
}

/**
 * El mensaje que se le manda a ese telefono, con los pasos numerados.
 *
 * TERMINA PIDIENDO QUE SE BORRE, y esa linea no es cortesia. El token es la
 * llave de la cola de SMS de la empresa, y por esa cola viajan los codigos EN
 * CLARO, incluidos los del segundo factor. Mandarlo por WhatsApp lo deja
 * escrito en el historial de dos telefonos para siempre; quien tenga despues
 * ese aparato lo lee. Se acepta porque la alternativa real —dictar cuarenta y
 * tres caracteres por telefono— acaba en un token mal copiado, pero conviene
 * saber lo que se cambia: si el chat se filtra, se revoca y se vincula otro,
 * que cuesta un minuto.
 */
export function mensajeDeVinculo(d: DatosDeVinculo): string {
  const pasos = pasosDeVinculo(d)
    .map((paso, i) => `${i + 1}. ${paso}`)
    .join("\n\n");

  return [
    "*Configurar este teléfono para que mande los SMS de la obra*",
    "",
    pasos,
    "",
    "⚠️ Cuando termines, borra este mensaje: el token de aquí arriba es la llave de los SMS de la empresa.",
  ].join("\n");
}
