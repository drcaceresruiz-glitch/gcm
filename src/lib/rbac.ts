import type { Role } from "@/generated/prisma/enums";

/**
 * Matriz de permisos declarativa.
 *
 * Principio de denegacion por defecto: un permiso que no aparece
 * explicitamente en la lista de un rol, no se concede. Anadir un permiso
 * nuevo no abre nada hasta que se asigna a un rol de forma consciente.
 *
 * Esta matriz gobierna la capa de servicios, que es donde se toma la
 * decision real. El middleware solo evita que el usuario navegue a una
 * pantalla que no le corresponde: es comodidad de interfaz, no una
 * frontera de seguridad.
 */

export const PERMISOS = [
  "empresa:leer",
  "empresa:editar",

  "usuario:leer",
  "usuario:crear",
  "usuario:editar",
  "usuario:desactivar",
  "usuario:resetear_clave",

  "obra:leer",
  "obra:crear",
  "obra:editar",
  "obra:eliminar",
  "obra:asignar_equipo",

  "partida:leer",
  "partida:crear",
  "partida:editar",
  "partida:eliminar",
  "partida:importar",

  "linea_base:leer",
  "linea_base:crear",
  "linea_base:aprobar",

  "movimiento:leer",
  "movimiento:crear",
  "movimiento:aprobar",

  "auditoria:leer",
] as const;

export type Permiso = (typeof PERMISOS)[number];

/** Solo lectura: base comun de todos los roles no administrativos. */
const SOLO_LECTURA: Permiso[] = [
  "empresa:leer",
  "obra:leer",
  "partida:leer",
  "linea_base:leer",
  "movimiento:leer",
];

const MATRIZ: Record<Role, readonly Permiso[]> = {
  /// Control total sobre su empresa. Unico rol que aprueba la linea base:
  /// congelar el presupuesto es un acto contractual, no operativo.
  ADMIN: PERMISOS,

  /// Responsable tecnico de obra: construye y mantiene el presupuesto,
  /// pero no lo aprueba ni administra usuarios.
  RESIDENTE: [
    ...SOLO_LECTURA,
    "usuario:leer",
    "obra:editar",
    "partida:crear",
    "partida:editar",
    "partida:eliminar",
    "partida:importar",
    "linea_base:crear",
    "movimiento:crear",
  ],

  /// Administrador de obra: perfil economico-administrativo. Consulta el
  /// presupuesto pero no lo modifica. En fases posteriores recibira los
  /// permisos de ordenes de compra, abonos y caja chica.
  ///
  /// Si redacta movimientos presupuestales aunque no edite partidas: mover
  /// dinero entre partidas o pedir un adicional es una negociacion con el
  /// cliente, no una decision tecnica. Aprobarlos sigue siendo de ADMIN.
  ADMIN_OBRA: [...SOLO_LECTURA, "usuario:leer", "movimiento:crear"],

  /// Almacen: necesita ver las partidas para imputar movimientos de
  /// materiales, nada mas.
  ALMACENERO: ["obra:leer", "partida:leer"],

  /// Consulta externa (cliente, supervision): estrictamente lectura.
  CONSULTOR: SOLO_LECTURA,
};

export function puede(role: Role, permiso: Permiso): boolean {
  return MATRIZ[role].includes(permiso);
}

export function puedeTodos(role: Role, permisos: Permiso[]): boolean {
  return permisos.every((p) => puede(role, p));
}

export function permisosDe(role: Role): readonly Permiso[] {
  return MATRIZ[role];
}
