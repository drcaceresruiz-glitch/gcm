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
  companyId: string;
  nombres: string;
  apellidos: string;
}

/**
 * Que se le dice a quien intenta usar un correo que ya existe.
 *
 * EL CORREO ES UNICO EN TODA LA INSTALACION, no por empresa, y no es un
 * descuido: el login identifica a la persona SOLO por su correo, sin preguntar
 * de que constructora es (`auth.service`, `findUnique({ where: { email } })`).
 * Si dos empresas pudieran repetirlo, al entrar no habria forma de saber cual
 * de las dos cuentas es.
 *
 * POR QUE ESTA REGLA VIVE AQUI Y NO EN EL SERVICIO. Estaba escrita dos veces:
 * `editarUsuario` distinguia los dos casos y lo decia bien, y `crearUsuario`
 * soltaba un «Ya existe un usuario con ese correo» a secas. El 20/08/2026 eso
 * costo una hora: al dar de alta a alguien en una constructora nueva, el
 * administrador leyo que el usuario «ya existe», fue a su lista, no lo
 * encontro —porque estaba en OTRA empresa— y penso que GCM le estaba
 * ensenando los usuarios de todos sus clientes a la vez. No era verdad, pero
 * el mensaje daba pie a creerlo, que en un producto multiempresa es lo peor
 * que puede insinuar una pantalla.
 *
 * QUE SE CUENTA Y QUE NO:
 *
 * - Mismo empresa: se dice DE QUIEN es. Es lo util y es gente suya.
 * - Otra empresa: NO se dice de quien —seria contar que esa persona existe
 *   aqui— pero SI se dice que esta fuera de su constructora. Esto ultimo no
 *   revela nada nuevo: el mensaje ya admitia que el correo esta en uso en GCM,
 *   y que no sea de su empresa lo comprueba el administrador mirando su propia
 *   lista, que las ensena todas. Lo que anade es la unica frase que evita la
 *   busqueda inutil y la sospecha.
 */
export function mensajeCorreoEnUso(
  duenno: DuennoDelCorreo,
  companyIdDeLaSesion: string,
): string {
  if (duenno.companyId === companyIdDeLaSesion) {
    return `Ese correo ya es de ${`${duenno.nombres} ${duenno.apellidos}`.trim()}.`;
  }

  return (
    "Ese correo ya esta en uso en GCM, en otra constructora, y por eso no " +
    "aparece en tu lista de usuarios. El correo es la llave de acceso y es " +
    "unica en toda la instalacion: una misma persona no puede tener cuenta " +
    "en dos constructoras. Usa otro correo."
  );
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
