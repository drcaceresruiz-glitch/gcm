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
  /// A donde pregunta el telefono. La misma para todas las empresas.
  direccionCola: string;
  /// De donde se baja el instalador.
  urlInstalador: string;
}

/**
 * EL TOKEN NO VA AQUI, y no es un olvido.
 *
 * WhatsApp copia el MENSAJE ENTERO: manteniendo pulsado no se puede seleccionar
 * un trozo. Con el token dentro de la lista de pasos, quien lo recibia se
 * llevaba al portapapeles las ocho instrucciones y tenia que recortar a mano
 * cuarenta y tres caracteres aleatorios en el campo de la aplicacion —que es
 * justo donde un caracter de mas no da error, solo deja el telefono mudo—.
 *
 * Por eso son DOS mensajes: estos pasos, y otro con el token y nada mas. Asi
 * «copiar» sobre el segundo devuelve exactamente el token.
 */

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
    "Pega el token. Va en un mensaje aparte, con el token y nada más: mantén pulsado ese mensaje, dale a copiar y pégalo aquí.",
    "Pulsa «Encender».",
    "Pulsa «Quitar el ahorro de batería» y acepta. Sin esto Android duerme la aplicación al apagar la pantalla y los SMS dejan de salir.",
    "Listo: en menos de un minuto este teléfono aparecerá como «Preguntando» en GCM.",
  ];
}

/** El primero de los dos mensajes: los pasos numerados, sin el token. */
export function mensajeDeVinculo(d: DatosDeVinculo): string {
  const pasos = pasosDeVinculo(d)
    .map((paso, i) => `${i + 1}. ${paso}`)
    .join("\n\n");

  return [
    "*Configurar este teléfono para que mande los SMS de la obra*",
    "",
    pasos,
    "",
    "⚠️ Cuando termines, borra el mensaje del token: es la llave de los SMS de la empresa.",
  ].join("\n");
}

/**
 * El segundo mensaje: el token y NADA MAS.
 *
 * Ni un rotulo, ni comillas, ni un emoji. Cualquier cosa que se anada acaba en
 * el portapapeles junto al token, y el campo de la aplicacion no avisa de un
 * caracter de mas: simplemente el telefono nunca llega a autenticarse y se
 * queda mudo. Por eso esta funcion parece una tonteria y no lo es —existe para
 * que nadie «mejore» este mensaje anadiendole contexto—.
 *
 * SOBRE MANDAR EL TOKEN POR WHATSAPP: es la llave de la cola de SMS de la
 * empresa, y por esa cola viajan los codigos EN CLARO, incluidos los del
 * segundo factor. Queda escrito en el historial de dos telefonos. Se acepta
 * porque la alternativa real —dictar cuarenta y tres caracteres— acaba en un
 * token mal copiado; si el chat se filtra, se revoca y se vincula otro.
 */
export function mensajeDelToken(token: string): string {
  return token;
}
