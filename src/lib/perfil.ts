/**
 * Reglas del perfil de usuario, sin base de datos.
 *
 * Se separan del servicio para poder probarlas: son decisiones —que campos
 * se pueden cambiar, que documento es valido, que propone de verdad una
 * solicitud— y no consultas.
 */

/**
 * Los campos de identidad que NO se cambian solos: se solicitan y un ADMIN
 * los aprueba. En un solo sitio porque gobiernan el formulario, el servicio y
 * la pantalla de revision a la vez; tenerlos por triplicado los haria
 * divergir.
 *
 * El celular NO esta aqui a proposito: es el unico que se guarda directo.
 * El correo tampoco: no se edita desde ninguna via (es el identificador de
 * acceso, y un error de tecleo dejaria a alguien fuera).
 */
export const CAMPOS_CONTROLADOS = [
  "nombres",
  "apellidos",
  "cargo",
  "tipoDoc",
  "numDoc",
] as const;

export type CampoControlado = (typeof CAMPOS_CONTROLADOS)[number];

/** Como se escribe cada campo en pantalla. */
export const ETIQUETA_CAMPO: Record<CampoControlado, string> = {
  nombres: "Nombres",
  apellidos: "Apellidos",
  cargo: "Cargo",
  tipoDoc: "Tipo de documento",
  numDoc: "Numero de documento",
};

/**
 * Tipos de documento admitidos.
 *
 * `tipoDoc` es `VarChar(10)` libre en la base; se acota aqui, en la
 * aplicacion, sin necesidad de migracion. Son los de uso corriente en Peru.
 */
export const TIPOS_DOC = ["DNI", "CE", "PASAPORTE"] as const;
export type TipoDoc = (typeof TIPOS_DOC)[number];

export const ETIQUETA_TIPO_DOC: Record<TipoDoc, string> = {
  DNI: "DNI",
  CE: "Carne de extranjeria",
  PASAPORTE: "Pasaporte",
};

export function tipoDocValido(valor: string | null | undefined): valor is TipoDoc {
  return TIPOS_DOC.includes(valor as TipoDoc);
}

/**
 * Valida documento segun su tipo. Reglas peruanas, del mismo estilo que el
 * RUC de proveedores:
 *   - DNI: exactamente 8 digitos.
 *   - CE: hasta 12 alfanumericos.
 *   - PASAPORTE: hasta 12 alfanumericos.
 */
export function validarDocumento(
  tipo: string,
  numero: string,
): { ok: true } | { ok: false; error: string } {
  const limpio = numero.trim();

  if (!tipoDocValido(tipo)) {
    return { ok: false, error: "Tipo de documento no valido." };
  }

  if (!limpio) {
    return { ok: false, error: "Indica el numero de documento." };
  }

  if (tipo === "DNI") {
    if (!/^\d{8}$/.test(limpio)) {
      return { ok: false, error: "El DNI debe tener 8 digitos." };
    }
    return { ok: true };
  }

  // CE y PASAPORTE: alfanumericos, hasta 12.
  if (!/^[A-Za-z0-9]{1,12}$/.test(limpio)) {
    return {
      ok: false,
      error: "El documento debe ser alfanumerico y de hasta 12 caracteres.",
    };
  }

  return { ok: true };
}

/** Los datos de identidad actuales del usuario. */
export interface PerfilActual {
  nombres: string;
  apellidos: string;
  cargo: string | null;
  tipoDoc: string;
  numDoc: string;
}

/** Lo que llega del formulario: cada campo, tal cual, ya como texto. */
export type PropuestaPerfil = Record<CampoControlado, string>;

/**
 * Solo los campos que DE VERDAD cambian, ya recortados.
 *
 * Un campo que quede igual que el actual no se incluye: sin esto se crearian
 * solicitudes vacias que el admin tendria que aprobar para nada. `cargo`
 * puede quedar en null (se borra), el resto no puede quedar vacio.
 */
export type CambiosPropuestos = Partial<Record<CampoControlado, string | null>>;

export type ValidacionPropuesta =
  | { ok: true; cambios: CambiosPropuestos }
  | { ok: false; error: string };

/**
 * Compara lo propuesto con lo actual y devuelve solo lo que cambia.
 *
 * - Normaliza espacios antes de comparar, para que "  Ana " y "Ana" no cuenten
 *   como cambio.
 * - `cargo` vacio significa borrarlo (null); los demas no pueden quedar vacios.
 * - Si el documento cambia (tipo o numero), se valida el par completo.
 * - Si nada cambia, es un error: no hay solicitud que crear.
 */
export function validarPropuesta(
  actual: PerfilActual,
  propuesta: PropuestaPerfil,
): ValidacionPropuesta {
  const norm = (v: string) => v.trim().replace(/\s+/g, " ");

  const nombres = norm(propuesta.nombres);
  const apellidos = norm(propuesta.apellidos);
  const cargo = norm(propuesta.cargo);
  const tipoDoc = propuesta.tipoDoc.trim();
  const numDoc = propuesta.numDoc.trim();

  const cambios: CambiosPropuestos = {};

  if (nombres !== norm(actual.nombres)) {
    if (!nombres) return { ok: false, error: "Los nombres no pueden quedar vacios." };
    cambios.nombres = nombres;
  }

  if (apellidos !== norm(actual.apellidos)) {
    if (!apellidos) return { ok: false, error: "Los apellidos no pueden quedar vacios." };
    cambios.apellidos = apellidos;
  }

  // El cargo si puede quedar vacio: eso significa borrarlo.
  const cargoActual = norm(actual.cargo ?? "");
  if (cargo !== cargoActual) {
    cambios.cargo = cargo === "" ? null : cargo;
  }

  const cambiaTipo = tipoDoc !== actual.tipoDoc.trim();
  const cambiaNumero = numDoc !== actual.numDoc.trim();

  if (cambiaTipo || cambiaNumero) {
    // Se valida el PAR completo aunque solo cambie uno: un numero valido para
    // DNI no lo es para el tipo que quede finalmente.
    const doc = validarDocumento(tipoDoc, numDoc);
    if (!doc.ok) return doc;

    if (cambiaTipo) cambios.tipoDoc = tipoDoc;
    if (cambiaNumero) cambios.numDoc = numDoc;
  }

  if (Object.keys(cambios).length === 0) {
    return { ok: false, error: "No hay ningun cambio que solicitar." };
  }

  return { ok: true, cambios };
}
