/**
 * El buzon propio de una constructora: que datos hacen falta y cuales cuadran.
 *
 * Puro y sin base, como el resto de validaciones de la casa. Lo que se
 * comprueba aqui es lo que se puede comprobar SIN intentar conectar; lo unico
 * que decide de verdad si un buzon funciona es un envio de prueba, y por eso
 * existe el boton de probar.
 */

export interface DatosRemitente {
  host: string;
  /// Como llega del formulario: texto. Se valida aqui.
  puerto: string;
  usuario: string;
  /// Vacio al editar = «deja la que ya estaba». Ver `guardarRemitente`.
  clave: string;
  remitenteNombre: string;
  remitenteCorreo: string;
}

export interface RemitenteValido {
  host: string;
  puerto: number;
  seguro: boolean;
  usuario: string;
  clave: string;
  remitenteNombre: string;
  remitenteCorreo: string;
}

export type ResultadoValidacion =
  | { ok: true; datos: RemitenteValido }
  | { ok: false; error: string };

const PARECE_CORREO = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/// Un nombre de servidor, sin protocolo ni barras. Se comprueba lo justo para
/// atrapar el error de tecleo evidente —pegar «https://...»— y nada mas.
const PARECE_HOST = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

/**
 * El puerto decide el modo de conexion, y no al reves.
 *
 * 465 es SMTPS: TLS desde el primer byte. 587 y 25 usan STARTTLS, que
 * nodemailer negocia solo cuando `secure` va en falso. Preguntarlo aparte en
 * el formulario seria pedirle al usuario que acierte una casilla cuyo valor
 * ya determina el puerto que acaba de escribir, y equivocarse ahi da un fallo
 * de conexion opaco.
 */
export function seguroSegunPuerto(puerto: number): boolean {
  return puerto === 465;
}

export function validarRemitente(
  datos: DatosRemitente,
  /// true al crear: entonces la clave es obligatoria. Al editar puede venir
  /// vacia, y significa «conserva la que ya estaba guardada».
  exigeClave: boolean,
): ResultadoValidacion {
  const host = datos.host.trim().toLowerCase();
  if (!host) return { ok: false, error: "Indica el servidor de salida (SMTP)." };
  if (!PARECE_HOST.test(host)) {
    return {
      ok: false,
      error: `"${datos.host.trim()}" no parece un servidor. Se escribe solo el nombre, sin https:// ni barras — por ejemplo mail.tuempresa.pe`,
    };
  }

  const puerto = Number(datos.puerto.trim());
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    return { ok: false, error: "El puerto es un número entre 1 y 65535. Lo habitual es 465." };
  }

  const usuario = datos.usuario.trim();
  if (!usuario) {
    return { ok: false, error: "Indica el usuario del buzón. Casi siempre es la propia dirección de correo." };
  }

  const clave = datos.clave;
  if (exigeClave && clave.length === 0) {
    return { ok: false, error: "Indica la contraseña del buzón." };
  }

  const remitenteNombre = datos.remitenteNombre.trim();
  if (!remitenteNombre) {
    return { ok: false, error: "Indica el nombre que verá quien reciba el correo." };
  }

  const remitenteCorreo = datos.remitenteCorreo.trim();
  if (!PARECE_CORREO.test(remitenteCorreo)) {
    return { ok: false, error: `"${remitenteCorreo}" no parece un correo válido.` };
  }

  return {
    ok: true,
    datos: {
      host,
      puerto,
      seguro: seguroSegunPuerto(puerto),
      usuario,
      clave,
      remitenteNombre,
      remitenteCorreo,
    },
  };
}

/**
 * Como se escribe el remitente en la cabecera del correo.
 *
 * El nombre va entre comillas: sin ellas, una razon social con coma
 * —«CONSTRUCTORA X, S.A.C.»— parte la cabecera en dos direcciones y el envio
 * se rechaza o llega a medias.
 */
export function cabeceraRemitente(nombre: string, correo: string): string {
  return `"${nombre.replace(/"/g, "")}" <${correo}>`;
}
