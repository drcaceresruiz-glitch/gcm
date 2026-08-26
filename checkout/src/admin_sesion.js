/**
 * admin_sesion.js — Quién puede entrar al panel.
 *
 * FALLA CERRADO. Sin `ADMIN_PASSWORD` en el `.env`, el panel no existe: devuelve
 * 503 y no se puede entrar de ninguna manera. Es deliberado. Un panel que
 * enseña nombres, documentos, correos y teléfonos de compradores no puede
 * quedarse abierto porque alguien olvidó rellenar una variable — el fallo por
 * omisión tiene que ser «cerrado», nunca «abierto para todos».
 *
 * LA SESIÓN NO SE GUARDA EN NINGÚN SITIO. La cookie es `caduca.firma`, donde la
 * firma es un HMAC-SHA256 de la fecha de caducidad hecho con un secreto del
 * servidor. Con eso se comprueba sin tener que guardar una lista de sesiones
 * abiertas: si la firma cuadra y la fecha no ha pasado, la cookie la emitimos
 * nosotros. Cambiar la contraseña invalida todas las sesiones de golpe, porque
 * el secreto se deriva de ella cuando no hay uno propio.
 *
 * LA COMPARACIÓN ES EN TIEMPO CONSTANTE. Comparar contraseñas con `===` filtra,
 * por lo que tarda, cuántos caracteres iniciales acertó quien lo intenta. Con
 * suficientes intentos eso se convierte en la contraseña entera.
 *
 * Y SE LIMITAN LOS INTENTOS. Una contraseña que alguien eligió a mano se
 * adivina a fuerza de probar; sin freno, en un rato. Cinco fallos por dirección
 * IP y quince minutos de espera. El contador vive en memoria: se pierde al
 * reiniciar, y aun así estorba lo suficiente. Guardarlo en disco sería darle a
 * cualquiera una forma de llenarnos el disco escribiendo desde IP inventadas.
 */

const crypto = require('node:crypto');

const HORAS_DE_SESION = 8;
const FALLOS_PERMITIDOS = 5;
const MINUTOS_DE_CASTIGO = 15;
const COOKIE = 'panel_gcm';

const intentos = new Map();   // ip -> { fallos, hasta }

function claveConfigurada() {
  return process.env.ADMIN_PASSWORD || '';
}

/**
 * El secreto con el que se firman las cookies. Si no se declara uno propio se
 * deriva de la contraseña: así cambiar la contraseña cierra las sesiones
 * abiertas, que es justo lo que se espera al cambiarla porque se filtró.
 */
function secreto() {
  return process.env.ADMIN_SECRET
    || crypto.createHmac('sha256', 'panel-gcm').update(claveConfigurada()).digest('hex');
}

function iguales(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function firmar(caduca) {
  return crypto.createHmac('sha256', secreto()).update(String(caduca)).digest('hex');
}

/** Lee una cookie del encabezado sin necesitar una librería para ello. */
function leerCookie(req, nombre) {
  const crudo = req.headers?.cookie;
  if (!crudo) return null;
  for (const trozo of crudo.split(';')) {
    const igual = trozo.indexOf('=');
    if (igual < 0) continue;
    if (trozo.slice(0, igual).trim() === nombre) {
      return decodeURIComponent(trozo.slice(igual + 1).trim());
    }
  }
  return null;
}

/** ¿Esta petición trae una sesión válida del panel? */
function sesionValida(req) {
  if (!claveConfigurada()) return false;
  const galleta = leerCookie(req, COOKIE);
  if (!galleta) return false;
  const punto = galleta.lastIndexOf('.');
  if (punto < 0) return false;

  const caduca = galleta.slice(0, punto);
  const firma = galleta.slice(punto + 1);
  if (!/^\d+$/.test(caduca)) return false;
  if (Number(caduca) < Date.now()) return false;
  return iguales(firma, firmar(caduca));
}

/** La cabecera `Set-Cookie` que abre la sesión. */
function cookieDeEntrada() {
  const caduca = Date.now() + HORAS_DE_SESION * 3600_000;
  const valor = `${caduca}.${firmar(caduca)}`;
  // Secure porque el panel solo tiene sentido por HTTPS; HttpOnly para que
  // ningún script pueda leerla; SameSite=Strict para que la cookie no viaje en
  // peticiones nacidas en otra web —que es lo que evita que un enlace ajeno
  // dispare acciones del panel en nombre de quien está dentro—.
  return `${COOKIE}=${encodeURIComponent(valor)}; Path=/; Max-Age=${HORAS_DE_SESION * 3600}; HttpOnly; Secure; SameSite=Strict`;
}

/** La cabecera que la cierra. */
function cookieDeSalida() {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function quienEs(req) {
  return req.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'desconocido';
}

/** ¿Esta IP está castigada por fallar demasiadas veces? */
function frenado(req) {
  const registro = intentos.get(quienEs(req));
  if (!registro) return 0;
  if (registro.hasta && registro.hasta > Date.now()) {
    return Math.ceil((registro.hasta - Date.now()) / 60000);
  }
  return 0;
}

function anotarFallo(req) {
  const ip = quienEs(req);
  const registro = intentos.get(ip) || { fallos: 0, hasta: 0 };
  registro.fallos += 1;
  if (registro.fallos >= FALLOS_PERMITIDOS) {
    registro.hasta = Date.now() + MINUTOS_DE_CASTIGO * 60000;
    registro.fallos = 0;
  }
  intentos.set(ip, registro);
}

function olvidarFallos(req) {
  intentos.delete(quienEs(req));
}

/** ¿La contraseña que han escrito es la buena? */
function claveCorrecta(escrita) {
  const buena = claveConfigurada();
  if (!buena) return false;
  return iguales(escrita ?? '', buena);
}

module.exports = {
  claveConfigurada,
  sesionValida,
  cookieDeEntrada,
  cookieDeSalida,
  claveCorrecta,
  frenado,
  anotarFallo,
  olvidarFallos,
  iguales,
  MINUTOS_DE_CASTIGO,
  HORAS_DE_SESION,
};
