import { NextResponse, type NextRequest } from "next/server";
import { conSiguiente, rutaActual } from "@/lib/siguiente";

/**
 * Proteccion de rutas por denegacion: todo requiere sesion salvo lo que
 * figure explicitamente en la lista publica.
 *
 * (En Next 16 este archivo sustituye al antiguo `middleware.ts`.)
 *
 * IMPORTANTE — esto NO es la frontera de seguridad. Se ejecuta en el runtime
 * Edge, donde no hay acceso a la base de datos, asi que solo puede comprobar
 * que la cookie EXISTA, no que sea valida. Una cookie falsificada pasaria
 * por aqui sin problema.
 *
 * La verificacion real (token vigente, usuario activo, permisos del rol)
 * ocurre en `obtenerSesion()` y en la capa de servicios, que corren en cada
 * peticion. Esto de aqui solo evita mostrarle a un usuario sin sesion una
 * pantalla que igualmente no podria cargar: es comodidad de interfaz.
 */

const COOKIE_SESION = "gcm_sesion";

/** Rutas accesibles sin sesion. */
const RUTAS_PUBLICAS = [
  "/login",
  "/recuperar-clave",
  // Segundo paso del acceso: quien esta aqui acerto la clave pero aun no
  // tiene sesion, asi que la cookie de sesion todavia no existe.
  "/verificar-codigo",
  "/api/health",
  // PASE DE OBRA: el personal de campo documenta sin ser usuario de GCM, asi
  // que jamas tendra `gcm_sesion`. Su identidad viaja en `gcm_pase` y la
  // comprueba `obtenerPase()` en cada pantalla, contra la base y en cada
  // peticion.
  "/pase",
  // Y por la misma razon la ruta que SIRVE las fotos: sin esto, un telefono
  // con pase pedira cada miniatura, se le respondera con una redireccion al
  // login y la pantalla saldra con todos los huecos en blanco. No abre nada:
  // el route handler exige sesion o pase antes de leer un solo byte, y filtra
  // por empresa o por obra. Recuerdese que este archivo NO es la frontera de
  // seguridad (ver la cabecera): quitar una ruta de aqui no protege nada, y
  // ponerla no desprotege nada.
  "/api/evidencia",
  // GALERIA DEL CLIENTE: el dueño de la obra mira su avance con un enlace,
  // sin cuenta de GCM, asi que jamas tendra `gcm_sesion`. La pagina no abre
  // nada por si misma: `galeriaPublica()` exige un slug ACTIVO y solo
  // devuelve fotos publicadas una a una por gerencia.
  "/galeria",
  // Y la ruta que sirve sus fotos, por lo mismo que `/api/evidencia`: cada
  // `<img>` de la pagina publica la pide sin cookie. El route handler exige
  // sesion o slug activo antes de leer un byte.
  "/api/galeria",
  // La cola de SMS: la consulta un telefono con MacroDroid o Tasker, que
  // jamas va a tener cookie de sesion. Se identifica con su propio token en
  // la cabecera `Authorization`, que comprueba el route handler.
  "/api/sms",
  // El reloj de los avisos: lo llama un cron de cPanel con curl, que tampoco
  // va a tener cookie nunca. Se identifica con `AVISOS_CRON_TOKEN` en la
  // cabecera `Authorization`, y sin el la ruta responde 401 SIEMPRE.
  //
  // Faltar aqui no daba error: daba un 307 al login, o sea un cron en verde y
  // cero avisos, para siempre. Se descubrio el 12/08/2026 haciendo `curl` a
  // produccion despues de desplegar, y es justo el fallo silencioso que
  // `/api/health` existe para delatar.
  "/api/reloj",
];

export default function proxy(peticion: NextRequest) {
  const { pathname } = peticion.nextUrl;

  const esPublica = RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
  );
  if (esPublica) return NextResponse.next();

  if (peticion.cookies.has(COOKIE_SESION)) return NextResponse.next();

  // Adonde volver tras entrar. Sin esto, un enlace de correo a una obra
  // concreta aterrizaba en /login y de ahi SIEMPRE a /panel: quien lo abria
  // tenia que volver a navegar a mano hasta donde el correo lo mandaba.
  const destino = new URL("/login", peticion.url);
  conSiguiente(
    destino,
    rutaActual(peticion.nextUrl.pathname, peticion.nextUrl.search),
  );

  return NextResponse.redirect(destino);
}

export const config = {
  /**
   * Se excluyen los recursos estaticos y los archivos con extension: no
   * tiene sentido pagar el coste de este filtro por cada imagen o script.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
