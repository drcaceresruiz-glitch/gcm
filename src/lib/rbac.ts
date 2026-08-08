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
 *
 * Desde la gestion de permisos por empresa, la matriz es la PLANTILLA y no
 * la ultima palabra: cada empresa puede conceder o revocar permisos sueltos
 * encima de ella (`company_permissions`). Quien decide es
 * `resolverPermisos`, que se ejecuta una vez por peticion al abrir la sesion
 * y deja el resultado en `SesionActiva.permisos`. Por eso `puede` recibe un
 * sujeto con sus permisos ya resueltos y no un rol: desde aqui, el rol solo
 * dice de donde se parte.
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

  "permiso:leer",
  "permiso:editar",

  "auditoria:leer",
] as const;

export type Permiso = (typeof PERMISOS)[number];

/**
 * Permisos que NO se pueden reconfigurar por empresa.
 *
 * Los dos `*:aprobar` son actos contractuales irreversibles que mueven la
 * cifra contra la que se mide la obra. Si se volvieran configurables,
 * cualquier dia alguien se los concede a quien no debe y el sistema pierde
 * la garantia que lo hace fiable.
 *
 * Los dos `permiso:*` reparten todos los demas. Si se pudieran conceder, un
 * ADMIN podria darselos a un CONSULTOR y ese repartirse a si mismo el resto:
 * seria una escalada de privilegios con dos clics. Repartir permisos es un
 * acto de administracion, no una tarea delegable.
 */
export const INNEGOCIABLES: readonly Permiso[] = [
  "linea_base:aprobar",
  "movimiento:aprobar",
  "permiso:leer",
  "permiso:editar",
];

/** Los que si admiten excepcion por empresa. Es lo que dibuja la pantalla. */
export const EDITABLES: readonly Permiso[] = PERMISOS.filter(
  (p) => !INNEGOCIABLES.includes(p),
);

export function esInnegociable(permiso: string): boolean {
  return INNEGOCIABLES.includes(permiso as Permiso);
}

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

/**
 * Los roles, en el orden en que se presentan.
 *
 * Sale de las claves de MATRIZ y no de una lista aparte: anadir un rol ya
 * obliga a darle permisos ahi, y una segunda lista solo podria olvidarse.
 */
export const ROLES = Object.keys(MATRIZ) as Role[];

/** Lo que la plantilla del rol concede, antes de excepciones. */
export function permisosDe(role: Role): readonly Permiso[] {
  return MATRIZ[role];
}

/** Una excepcion tal como viene de `company_permissions`. */
export interface ExcepcionPermiso {
  permiso: string;
  concedido: boolean;
}

/**
 * Permisos efectivos de un rol en una empresa: la plantilla, con las
 * excepciones aplicadas encima.
 *
 * Se ignora en silencio toda excepcion que recaiga sobre un INNEGOCIABLE, y
 * tambien la que nombre un permiso que ya no existe en el codigo. Lo primero
 * es defensa en profundidad: el servicio ya rechaza guardarlas, pero una fila
 * insertada a mano en la base tampoco debe surtir efecto. Lo segundo evita
 * que renombrar un permiso deje filas huerfanas concediendo algo indefinido.
 */
export function resolverPermisos(
  role: Role,
  excepciones: readonly ExcepcionPermiso[] = [],
): Permiso[] {
  const efectivos = new Set<Permiso>(MATRIZ[role]);

  for (const excepcion of excepciones) {
    const permiso = excepcion.permiso as Permiso;
    if (!PERMISOS.includes(permiso)) continue;
    if (esInnegociable(permiso)) continue;

    if (excepcion.concedido) efectivos.add(permiso);
    else efectivos.delete(permiso);
  }

  // Se devuelve en el orden de PERMISOS y no en el de insercion del Set: la
  // lista se lee en pantallas y en la auditoria, y un orden estable evita
  // diferencias que no son diferencias.
  return PERMISOS.filter((p) => efectivos.has(p));
}

/**
 * Lo que se pregunta en cada frontera: sujeto y permiso.
 *
 * Recibe los permisos YA resueltos, no un rol, porque desde que son
 * configurables por empresa el rol no basta para responder. Se tipa de forma
 * estructural para que `lib/` no dependa de la capa de servicios, que es
 * `server-only`.
 */
export interface ConPermisos {
  permisos: readonly Permiso[];
}

export function puede(sujeto: ConPermisos, permiso: Permiso): boolean {
  return sujeto.permisos.includes(permiso);
}

export function puedeTodos(sujeto: ConPermisos, permisos: Permiso[]): boolean {
  return permisos.every((p) => puede(sujeto, p));
}
