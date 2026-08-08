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
