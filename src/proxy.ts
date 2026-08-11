import { NextResponse, type NextRequest } from "next/server";

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
];

export default function proxy(peticion: NextRequest) {
  const { pathname } = peticion.nextUrl;

  const esPublica = RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
  );
  if (esPublica) return NextResponse.next();

  if (peticion.cookies.has(COOKIE_SESION)) return NextResponse.next();

  return NextResponse.redirect(new URL("/login", peticion.url));
}

export const config = {
  /**
   * Se excluyen los recursos estaticos y los archivos con extension: no
   * tiene sentido pagar el coste de este filtro por cada imagen o script.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
