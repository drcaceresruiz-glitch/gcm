/**
 * Reglas del pase de obra que no necesitan base de datos.
 *
 * El pase es el personal de campo que documenta sin ser usuario de GCM: se
 * identifica con su celular o su correo y recibe un codigo de un solo uso.
 * De eso, aqui vive lo unico que se puede probar sin navegador ni base:
 * reconocer que escribio y dejarlo en forma canonica.
 *
 * Por que importa la forma canonica: el mismo celular se escribe de cinco
 * maneras (+51 987 654 321, 987-654-321, 51987654321...). Si no se guardara
 * siempre igual, la persona teclearia su numero de otra forma un martes y el
 * sistema le diria que no esta registrada.
 */

/// Cuanto vive el codigo. Se reusan las constantes del segundo factor
/// (`@/lib/dosFactores`): es el mismo problema y ya estan probadas.
export { LONGITUD_CODIGO, VIGENCIA_CODIGO_MINUTOS, MAX_INTENTOS_CODIGO, normalizarCodigo, codigoBienFormado } from "@/lib/dosFactores";

/**
 * Cuanto dura el telefono reconocido. Un ano es un TECHO, no el control:
 * quien manda es `PaseObra.activo` y el estado de la obra, que se miran en
 * cada peticion. Esto solo evita que una cookie olvidada viva para siempre.
 */
export const VIGENCIA_PASE_DIAS = 365;

/// Cuantos codigos puede pedir una misma persona seguidos, y en cuanto rato.
/// Sin esto, un correo se puede usar para bombardear un buzon —y el dia que
/// haya SMS, para gastar dinero ajeno—.
export const MAX_CODIGOS_POR_VENTANA = 3;
export const VENTANA_CODIGOS_MINUTOS = 15;

export type Contacto =
  | { tipo: "email"; valor: string }
  | { tipo: "celular"; valor: string };

/**
 * Deja un celular peruano en nueve cifras.
 *
 * Acepta como lo escribe la gente: con +51, con 51 delante, con espacios,
 * guiones o parentesis. Devuelve null si lo que queda no es un movil peruano
 * (nueve cifras empezando por 9).
 *
 * Se guarda sin prefijo de pais a proposito: es lo que la persona teclea
 * cuando se lo piden, y anadirlo obligaria a adivinar si el 51 del principio
 * es el pais o parte del numero.
 */
export function normalizarCelular(entrada: string): string | null {
  const cifras = entrada.replace(/\D/g, "");

  // 51 delante: puede ser el prefijo de pais, pero solo se quita si lo que
  // queda es un movil valido. Un numero que ya empieza por 9 no se toca.
  const sinPrefijo =
    cifras.length === 11 && cifras.startsWith("51") ? cifras.slice(2) : cifras;

  return /^9\d{8}$/.test(sinPrefijo) ? sinPrefijo : null;
}

/**
 * Correo en minusculas y sin espacios.
 *
 * La comprobacion es deliberadamente laxa, la misma que el alta de usuarios
 * (`@/lib/usuarios`): validar correos con una expresion estricta rechaza
 * direcciones legitimas, y quien se equivoque simplemente no recibira el
 * codigo.
 */
export function normalizarEmail(entrada: string): string | null {
  const limpio = entrada.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio) ? limpio : null;
}

/**
 * Que escribio quien quiere entrar: un correo o un celular.
 *
 * Se decide por la arroba y no preguntandole a la persona: en obra, un campo
 * menos es un error menos.
 */
export function reconocerContacto(entrada: string): Contacto | null {
  const bruto = entrada.trim();
  if (!bruto) return null;

  if (bruto.includes("@")) {
    const valor = normalizarEmail(bruto);
    return valor ? { tipo: "email", valor } : null;
  }

  const valor = normalizarCelular(bruto);
  return valor ? { tipo: "celular", valor } : null;
}

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
      error: "Escribe al menos un celular o un correo: es por donde recibira su codigo.",
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
    if (!email) return { ok: false, error: "El correo no parece valido." };
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
