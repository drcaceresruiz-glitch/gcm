/**
 * Reglas del pase de obra que no necesitan base de datos.
 *
 * El pase es el personal de campo que documenta sin ser usuario de GCM: se
 * identifica con su celular o su correo y recibe un codigo de un solo uso.
 * De eso, aqui vive lo unico que se puede probar sin navegador ni base: las
 * reglas del alta.
 */

/// Cuanto vive el codigo y cuantos se pueden pedir. Se reusan las constantes
/// del segundo factor (`@/lib/dosFactores`): es el mismo problema y ya estan
/// probadas.
export {
  LONGITUD_CODIGO,
  VIGENCIA_CODIGO_MINUTOS,
  MAX_INTENTOS_CODIGO,
  MAX_CODIGOS_POR_VENTANA,
  VENTANA_CODIGOS_MINUTOS,
  normalizarCodigo,
  codigoBienFormado,
} from "@/lib/dosFactores";

/// Reconocer y normalizar un contacto vive en `@/lib/contacto` desde que el
/// segundo factor de los usuarios tambien lo necesita. Se reexporta para no
/// tocar a quien ya lo importaba de aqui.
///
/// El `import` de debajo NO sobra: `export ... from` reexporta pero no deja
/// el nombre en el ambito de este archivo, y `validarAltaPase` los usa.
export {
  normalizarCelular,
  normalizarEmail,
  reconocerContacto,
  type Contacto,
} from "@/lib/contacto";

import { normalizarCelular, normalizarEmail } from "@/lib/contacto";

/**
 * Cuanto dura el telefono reconocido. Un ano es un TECHO, no el control:
 * quien manda es `PaseObra.activo` y el estado de la obra, que se miran en
 * cada peticion. Esto solo evita que una cookie olvidada viva para siempre.
 */
export const VIGENCIA_PASE_DIAS = 365;

export interface DatosAltaPase {
  nombres: string;
  apellidos: string;
  cargo: string;
  empresa: string;
  celular: string;
  email: string;
}

export interface PaseSaneado {
  nombres: string;
  apellidos: string;
  cargo: string | null;
  empresa: string | null;
  celular: string | null;
  email: string | null;
}

export type ValidacionPase =
  | { ok: true; datos: PaseSaneado }
  | { ok: false; error: string };

/**
 * Valida y sanea el alta de un pase.
 *
 * La regla que no se puede saltar: AL MENOS un contacto. Un pase sin correo
 * ni celular no podria recibir nunca un codigo, asi que no seria un pase,
 * seria una fila muerta.
 */
export function validarAltaPase(d: DatosAltaPase): ValidacionPase {
  const nombres = d.nombres.trim().replace(/\s+/g, " ");
  const apellidos = d.apellidos.trim().replace(/\s+/g, " ");

  if (!nombres) return { ok: false, error: "Escribe los nombres." };
  if (!apellidos) return { ok: false, error: "Escribe los apellidos." };

  const celularBruto = d.celular.trim();
  const emailBruto = d.email.trim();

  if (!celularBruto && !emailBruto) {
    return {
      ok: false,
      error: "Escribe al menos un celular o un correo: es por donde recibirá su código.",
    };
  }

  let celular: string | null = null;
  if (celularBruto) {
    celular = normalizarCelular(celularBruto);
    if (!celular) {
      return {
        ok: false,
        error: "El celular debe tener nueve cifras y empezar por 9.",
      };
    }
  }

  let email: string | null = null;
  if (emailBruto) {
    email = normalizarEmail(emailBruto);
    if (!email) return { ok: false, error: "El correo no parece válido." };
  }

  return {
    ok: true,
    datos: {
      nombres: nombres.slice(0, 100),
      apellidos: apellidos.slice(0, 100),
      cargo: d.cargo.trim().slice(0, 100) || null,
      empresa: d.empresa.trim().slice(0, 150) || null,
      celular,
      email,
    },
  };
}

/** Nombre completo, como se graba en `subidaPor` de cada foto. */
export function nombreDePase(pase: {
  nombres: string;
  apellidos: string;
}): string {
  return `${pase.nombres} ${pase.apellidos}`.trim().slice(0, 150);
}
