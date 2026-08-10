/**
 * Validacion del alta de una constructora cliente.
 *
 * Vive aparte del servicio y sin base de datos para poder probarse sola, como
 * `validarAltaUsuario`. Los limites de longitud son los de las columnas: que
 * salten aqui, con un mensaje legible, y no como un error de la base a mitad
 * de la transaccion.
 */

/// Mensaje del correo ya tomado. Ver `MOTIVO_CORREO` mas abajo.
export const CORREO_NO_DISPONIBLE =
  "No se puede usar ese correo para el administrador. Indica otra direccion.";

/**
 * Por que ese texto y no "ya existe".
 *
 * `User.email` es unico en TODO GCM, no por empresa. Si al dar de alta a una
 * constructora se dijera "ese correo ya esta registrado", se estaria
 * confirmando que esa persona es cliente —informacion de un tercero, y ademas
 * sondeable tecleando correos hasta acertar—. El texto no dice existe, ni
 * registrado, ni en uso, y vale igual si el correo estuviera vetado por
 * cualquier otro motivo.
 */
export const MOTIVO_CORREO = "privacidad entre clientes";

export interface DatosAltaEmpresa {
  razonSocial: string;
  ruc: string;
  direccion: string;
  telefono: string;
  email: string;
}

/// Ya limpios y validos, listos para el servicio.
export interface AltaEmpresaLimpia {
  razonSocial: string;
  ruc: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
}

export type ValidacionEmpresa =
  | { ok: true; datos: AltaEmpresaLimpia }
  | { ok: false; error: string };

/// Vacio y ausente son lo mismo: ninguno de estos campos es obligatorio.
function opcional(valor: string, maximo: number): string | null {
  const limpio = valor.trim();
  return limpio === "" ? null : limpio.slice(0, maximo);
}

export function validarAltaEmpresa(d: DatosAltaEmpresa): ValidacionEmpresa {
  const razonSocial = d.razonSocial.trim().replace(/\s+/g, " ");
  const ruc = d.ruc.trim();

  if (!razonSocial) {
    return { ok: false, error: "Indica la razon social de la constructora." };
  }
  if (razonSocial.length > 200) {
    return { ok: false, error: "La razon social no puede pasar de 200 caracteres." };
  }
  // El RUC peruano son 11 digitos exactos. Se rechazan guiones y espacios
  // internos en vez de limpiarlos: un RUC con separadores suele ser un numero
  // copiado de otro sitio, y conviene que la persona lo mire.
  if (!/^\d{11}$/.test(ruc)) {
    return { ok: false, error: "El RUC son 11 digitos, sin espacios ni guiones." };
  }

  return {
    ok: true,
    datos: {
      razonSocial,
      ruc,
      direccion: opcional(d.direccion, 255),
      telefono: opcional(d.telefono, 30),
      email: opcional(d.email, 150),
    },
  };
}
