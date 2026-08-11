/**
 * Codigos QR de la evidencia fotografica.
 *
 * La idea es de obra, no de oficina: se imprime una hoja, se recorta y se pega
 * un codigo en cada frente de trabajo. Quien esta ahi lo escanea con el movil
 * y cae directo en el sitio donde se adjunta la foto, sin navegar por menus
 * con las manos sucias.
 *
 * Ningun enlace apunta a `/api/evidencia`: escanear no ensena una sola foto.
 * Los de grano fino (tarea y restriccion) llevan a la aplicacion normal, que
 * sin sesion pasa por el login. El de la OBRA lleva a la puerta del pase,
 * donde quien no es usuario de GCM se identifica con su celular o su correo y
 * un codigo de un solo uso.
 *
 * Aqui solo vive la aritmetica de los enlaces y del troquelado de la hoja, que
 * es lo que se puede probar sin navegador ni base de datos.
 */

/**
 * Cuanto grano lleva la hoja.
 *
 * - `obra`: UN solo codigo. Se pega en la caseta y lleva al menu, donde se
 *   elige la tarea y la restriccion desde el propio telefono. Es el modo por
 *   defecto y casi siempre el correcto: una obra de 20 tareas son 140
 *   restricciones, y 140 stickers no los pega ni los mantiene nadie.
 * - `tarea`: un codigo por frente de trabajo, para pegarlo donde se trabaja.
 * - `restriccion`: el detalle, uno por flujo. Existe para casos puntuales;
 *   la hoja avisa de cuantos va a imprimir antes de gastar papel.
 */
export const MODOS_CODIGO = ["obra", "tarea", "restriccion"] as const;
export type ModoCodigo = (typeof MODOS_CODIGO)[number];

export function normalizarModo(valor?: string | null): ModoCodigo {
  return valor === "tarea" || valor === "restriccion" ? valor : "obra";
}

export type DestinoCodigo =
  | { obra: true }
  | { uid: number }
  | { restriccionId: string };

/**
 * El enlace que lleva el QR.
 *
 * `base` es la URL publica de la aplicacion (`APP_URL`). Se le quita la barra
 * final si la trae, para no acabar con `//obras`, que en algunos servidores
 * redirige y en otros no.
 */
export function enlaceEvidencia(
  base: string,
  obraId: string,
  destino: DestinoCodigo,
): string {
  const raiz = base.replace(/\/+$/, "");

  // El codigo de la obra lleva a la puerta del PASE, y no a la pantalla de
  // dentro. Es el que se pega en la caseta, o sea el que escanea el personal
  // de campo, que NO es usuario de GCM: mandarlo a `/obras/...` lo dejaba en
  // el login, delante de una clave que nadie le ha dado. Quien SI tiene
  // sesion no lo nota: `/pase/[obraId]` lo reenvia a la pantalla de siempre.
  //
  // Detras, la pantalla que se pinta es un MENU pensado para un telefono a pie
  // de obra, no la matriz del Lookahead: siete columnas no se tocan con el
  // dedo.
  if ("obra" in destino) return `${raiz}/pase/${obraId}`;

  const lookahead = `${raiz}/obras/${obraId}/lookahead`;
  return "uid" in destino
    ? `${lookahead}?tarea=${destino.uid}`
    : `${lookahead}?evidencia=${encodeURIComponent(destino.restriccionId)}`;
}

/**
 * Reparte los codigos en paginas de `porPagina`.
 *
 * El corte se hace aqui y no con CSS porque `break-inside` se comporta distinto
 * en cada navegador, y una hoja de codigos partida por la mitad es papel
 * tirado: el QR cortado no lo lee ningun telefono.
 */
export function enPaginas<T>(codigos: readonly T[], porPagina: number): T[][] {
  if (porPagina < 1) return codigos.length ? [[...codigos]] : [];

  const paginas: T[][] = [];
  for (let i = 0; i < codigos.length; i += porPagina) {
    paginas.push(codigos.slice(i, i + porPagina));
  }
  return paginas;
}

/// Cuantos codigos entran en una A4 segun el modo. El de la obra va solo y
/// grande: se pega en la caseta y tiene que leerse de lejos y con polvo.
export const POR_PAGINA: Record<ModoCodigo, number> = {
  obra: 1,
  tarea: 12,
  restriccion: 20,
};
