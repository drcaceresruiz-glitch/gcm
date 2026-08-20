/**
 * Reglas de la gestion de usuarios, sin base de datos.
 *
 * Se separan del servicio para poder probarlas: son decisiones —que este
 * correo vale, que este rol existe, que estos datos bastan para dar de alta—
 * y no consultas.
 */

import { ROLES, ETIQUETA_ROL } from "@/lib/rbac";
import { validarDocumento } from "@/lib/perfil";
import type { Role } from "@/generated/prisma/enums";

// La etiqueta de cada rol vive en `rbac.ts`, junto a los roles, para que el
// alta de usuarios y la matriz de permisos usen exactamente el mismo nombre.
// Se re-exporta para que quien ya la importaba desde aqui no tenga que cambiar.
export { ETIQUETA_ROL };

/** Que hace cada rol, en una linea, para el desplegable del alta. */
export const DESCRIPCION_ROL: Record<Role, string> = {
  ADMIN: "Control total de la empresa: usuarios, permisos y aprobaciones.",
  RESIDENTE: "Construye y mantiene el presupuesto; no lo aprueba ni gestiona usuarios.",
  ADMIN_OBRA: "Lleva proveedores y ordenes; redacta movimientos.",
  ALMACENERO: "Solo consulta obras y partidas.",
  CONSULTOR: "Consulta externa: estrictamente lectura.",
};

export function rolValido(valor: string | null | undefined): valor is Role {
  return ROLES.includes(valor as Role);
}

/**
 * Validacion de correo, deliberadamente laxa.
 *
 * No se intenta abarcar el RFC entero: basta con exigir algo@algo.algo sin
 * espacios. Un correo mal tecleado que pase este filtro se detecta al primer
 * intento de acceso; uno rechazado de mas es una cuenta que no se puede crear.
 */
export function correoValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/// Quien ya tiene un correo, para poder explicar el choque.
export interface DuennoDelCorreo {
  nombres: string;
  apellidos: string;
}

/**
 * Que se le dice a quien intenta usar un correo que ya existe.
 *
 * El correo es unico DENTRO DE LA EMPRESA, asi que un choque siempre es con
 * alguien de casa y siempre se puede decir de quien.
 *
 * ESTO ERA MAS COMPLICADO ESTA MISMA MANANA, y merece quedar escrito porque
 * explica por que la funcion es tan corta. El correo era unico en TODA la
 * instalacion, de modo que el choque podia ser con alguien de otra
 * constructora; entonces no se podia decir de quien —seria contar que esa
 * persona existe aqui— y habia que explicar por que no aparecia en su lista.
 * El 20/08/2026 eso costo una hora a un administrador, que leyo «ya existe un
 * usuario con ese correo», fue a su lista, no lo encontro y penso que GCM le
 * ensenaba los usuarios de todos sus clientes a la vez.
 *
 * Ese mensaje se arreglo por la manana y por la tarde dejo de hacer falta: al
 * volverse el correo unico POR EMPRESA, el caso que obligaba a callar
 * desaparecio, y con el la unica frase de GCM que admitia algo de otra
 * constructora. Ver [[correo-por-empresa]].
 *
 * La funcion se queda igualmente. La regla —que un choque se explica con
 * nombre y apellidos— la comparten crear y editar, y estuvo escrita dos veces
 * con una de las dos mal.
 */
export function mensajeCorreoEnUso(duenno: DuennoDelCorreo): string {
  return `Ese correo ya es de ${`${duenno.nombres} ${duenno.apellidos}`.trim()}.`;
}

export interface DatosAltaUsuario {
  nombres: string;
  apellidos: string;
  email: string;
  tipoDoc: string;
  numDoc: string;
  cargo: string;
  celular: string;
  role: string;
}

/** Los datos ya limpios y validos, listos para el servicio. */
export interface AltaUsuarioLimpia {
  nombres: string;
  apellidos: string;
  email: string;
  tipoDoc: string;
  numDoc: string;
  cargo: string | null;
  celular: string | null;
  role: Role;
}

export type ValidacionAlta =
  | { ok: true; datos: AltaUsuarioLimpia }
  | { ok: false; error: string };

/**
 * Comprueba y normaliza los datos de alta. El correo se guarda en minusculas
 * porque es el identificador de acceso y "Ana@X" y "ana@x" son la misma
 * persona; el login ya normaliza asi.
 */
export function validarAltaUsuario(d: DatosAltaUsuario): ValidacionAlta {
  const nombres = d.nombres.trim().replace(/\s+/g, " ");
  const apellidos = d.apellidos.trim().replace(/\s+/g, " ");
  const email = d.email.trim().toLowerCase();
  const tipoDoc = d.tipoDoc.trim();
  const numDoc = d.numDoc.trim();

  if (!nombres) return { ok: false, error: "Indica los nombres." };
  if (!apellidos) return { ok: false, error: "Indica los apellidos." };
  if (!correoValido(email)) return { ok: false, error: "El correo no es valido." };

  const doc = validarDocumento(tipoDoc, numDoc);
  if (!doc.ok) return doc;

  if (!rolValido(d.role)) return { ok: false, error: "El rol no es valido." };

  const cargo = d.cargo.trim();
  const celular = d.celular.trim();

  return {
    ok: true,
    datos: {
      nombres,
      apellidos,
      email,
      tipoDoc,
      numDoc,
      cargo: cargo === "" ? null : cargo.slice(0, 100),
      celular: celular === "" ? null : celular.slice(0, 30),
      role: d.role as Role,
    },
  };
}
