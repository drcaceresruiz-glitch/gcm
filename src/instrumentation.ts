/**
 * El gancho de errores del servidor: lo que faltaba para poder diagnosticar
 * una pantalla caida sin adivinar.
 *
 * EL PROBLEMA QUE RESUELVE, y costó media mañana el 24 de agosto de 2026. Una
 * pantalla de obra reventó una vez y lo único que quedó fue el código que ve
 * la persona —`81572617`—, que es un HASH que Next calcula sobre el mensaje y
 * la pila. No se puede revertir. La frontera de error es un componente de
 * CLIENTE: en produccion recibe el `digest` y nada mas, porque Next borra el
 * mensaje a proposito para no filtrar detalles del servidor al navegador.
 *
 * Sin esto, la unica forma de saber que paso era pedirle a alguien que entrara
 * al servidor a mirar la salida del proceso, y ahi el mensaje se pierde entre
 * lo demas y no lleva el digest al lado. La obra se borró antes de conseguirlo
 * y el caso quedó abierto.
 *
 * `onRequestError` es el unico sitio donde el digest y el mensaje coinciden.
 * Se imprime con un prefijo fijo para que se pueda buscar por el digest que
 * reporta quien lo sufrio:
 *
 *     grep 'GCM-FALLO 81572617' <la salida del servidor>
 *
 * NO SE MANDA A NINGUN SITIO NI SE GUARDA EN BASE, y es a proposito: escribir
 * el fallo en la base es justo lo que no funciona cuando lo que falla es la
 * base, y mandarlo fuera saca datos de un cliente del servidor sin que nadie
 * lo haya pedido. La salida del proceso ya se recoge en este hosting.
 */
export async function onRequestError(
  error: unknown,
  peticion: { path: string; method: string },
  contexto: { routerKind: string; routePath: string; renderSource?: string },
) {
  const e = error as { digest?: string; message?: string; stack?: string };

  // El digest PRIMERO y en el mismo formato siempre: es la unica pista que
  // trae quien reporta el fallo, y tiene que poder buscarse tal cual.
  console.error(
    `[GCM-FALLO ${e?.digest ?? "sin-digest"}] ${peticion.method} ${peticion.path}\n` +
      `  ruta: ${contexto.routePath} (${contexto.routerKind}` +
      `${contexto.renderSource ? `, ${contexto.renderSource}` : ""})\n` +
      `  mensaje: ${e?.message ?? String(error)}\n` +
      `  pila: ${e?.stack ?? "(sin pila)"}`,
  );
}
