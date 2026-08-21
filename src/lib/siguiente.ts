/**
 * Adonde volver despues de entrar, cuando la sesion falta y hay que pasar por
 * el login primero.
 *
 * El caso que motiva esto: un aviso por correo enlaza a una obra concreta
 * (`/obras/{id}/lookahead`, por ejemplo). Quien lo abre sin sesion activa
 * aterrizaba en `/login` y de ahi SIEMPRE a `/panel`, asi que tenia que volver
 * a navegar a mano hasta la obra. El 21 de agosto de 2026 no existia ningun
 * `?siguiente=` en el proyecto para evitarlo.
 */

const PARAMETRO = "siguiente";

/**
 * Valida que `valor` sea una ruta INTERNA segura para redirigir tras el
 * acceso. Devuelve `undefined` si no lo es, para que quien llama caiga al
 * destino por defecto sin tener que decidir nada mas.
 *
 * Esto es la unica frontera de seguridad de todo el mecanismo: `siguiente`
 * viaja en la URL de un correo y vuelve como parametro de formulario, asi que
 * es UN DATO QUE PONE QUIEN VISITA EL ENLACE, no la aplicacion. Sin esta
 * comprobacion seria una redireccion abierta: cualquiera podria mandar
 * `.../login?siguiente=https://otro-sitio` y usar el dominio de confianza de
 * GCM como trampolin de phishing.
 *
 * Por eso se exige que empiece por UNA SOLA barra. `//evil.com` y `/\evil.com`
 * el navegador los interpreta como protocolo-relativos —es decir, como si
 * dijeran otro host— aunque a simple vista parezcan una ruta local.
 */
export function rutaSiguienteSegura(valor: unknown): string | undefined {
  if (typeof valor !== "string" || valor.length === 0) return undefined;
  if (!valor.startsWith("/")) return undefined;
  if (valor.startsWith("//") || valor.startsWith("/\\")) return undefined;
  return valor;
}

/** El `pathname` + `search` de una peticion, tal como lo necesita `siguiente`. */
export function rutaActual(pathname: string, search: string): string {
  return search ? `${pathname}${search}` : pathname;
}

/** Añade `?siguiente=` a una URL de destino, solo si hay adonde volver. */
export function conSiguiente(url: URL, siguiente: string | undefined): URL {
  if (siguiente) url.searchParams.set(PARAMETRO, siguiente);
  return url;
}

/**
 * Igual que `conSiguiente`, para las rutas de string que usan los Server
 * Actions. `ruta` puede traer ya su propia cadena de busqueda (por ejemplo
 * `/login?codigo=expirado`), asi que el separador se decide mirando si ya
 * hay un `?` puesto, no asumiendo que no lo hay.
 */
export function rutaConSiguiente(ruta: string, siguiente: string | undefined): string {
  if (!siguiente) return ruta;
  const separador = ruta.includes("?") ? "&" : "?";
  return `${ruta}${separador}${PARAMETRO}=${encodeURIComponent(siguiente)}`;
}
