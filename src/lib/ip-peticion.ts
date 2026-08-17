/**
 * De donde sale la IP de quien llama, y por que NO es la primera de la lista.
 *
 * `X-Forwarded-For` es una lista que CRECE POR LA DERECHA: cada proxy añade la
 * direccion que el vio. Quien llama puede mandar la cabecera ya escrita, asi
 * que las entradas de la IZQUIERDA son las que controla el cliente y la de la
 * DERECHA es la que puso nuestro proxy.
 *
 * Tomar la primera —lo que se hacia en los tres sitios que leen esto— significa
 * leer justo el dato que elige quien ataca: cambiando esa cabecera en cada
 * peticion, el limite de fallos por IP de `auth.service` no salta jamas. El
 * limite existia y no protegia.
 *
 * Tomar la ULTIMA vale con las dos formas de comportarse que tiene un proxy: si
 * AÑADE a la cabecera, la ultima es la suya; si la REEMPLAZA, la lista tiene un
 * solo elemento y la ultima es tambien la suya.
 *
 * LO QUE SIGUE SIN CUBRIR: un proxy que deje pasar la cabecera del cliente sin
 * tocarla. Entonces no hay dato fiable, y no lo puede arreglar la aplicacion;
 * se arregla en la configuracion del servidor.
 */

/**
 * Cuantos proxies hay entre internet y la aplicacion. Hoy uno, y **medido**: la
 * respuesta de produccion no trae cabeceras de CDN.
 *
 * SI ALGUN DIA SE PONE UN CDN DELANTE (Cloudflare y parecidos), hay que subirlo
 * a 2. Con dos saltos y este valor en 1, la ultima entrada seria la IP del CDN
 * y TODO el mundo caeria en el mismo cubo: el limite pasaria de no cortar a
 * nadie a cortar a todos a la vez.
 */
export const SALTOS_DE_PROXY = 1;

/** Lo justo de `Headers` que hace falta, para poder probarlo sin navegador. */
export interface LectorDeCabeceras {
  get(nombre: string): string | null;
}

export function ipDeLaPeticion(
  cabeceras: LectorDeCabeceras,
  saltos: number = SALTOS_DE_PROXY,
): string | undefined {
  const lista = (cabeceras.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entrada) => entrada.trim())
    .filter((entrada) => entrada.length > 0);

  if (lista.length > 0) {
    // Con un salto, la ultima; con dos, la penultima. Si vienen menos entradas
    // de las esperadas se coge la de mas a la derecha que haya, que es la mas
    // fiable de las disponibles.
    return lista[Math.max(0, lista.length - saltos)];
  }

  // Sin `x-forwarded-for`, `x-real-ip` la escribe el proxy entera y no es una
  // lista: no hay nada que elegir.
  return cabeceras.get("x-real-ip")?.trim() || undefined;
}
