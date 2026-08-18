import type { Role } from "@/generated/prisma/enums";

/**
 * Que obras alcanza cada quien DENTRO de su empresa.
 *
 * El aislamiento por `companyId` impide ver la cartera de otra constructora.
 * Esto es la capa de dentro: dentro de una misma empresa, un residente no
 * tiene por que ver —ni abrir— las obras que no gestiona.
 *
 * Vive en `lib/` y no en la capa de servicios por la misma razon que `rbac`:
 * se resuelve UNA vez por peticion al abrir la sesion y a partir de ahi la
 * pregunta es sincrona y no toca la base. Eso es lo que permite ponerla en
 * los sitios calientes —cada escritura, cada apertura de obra— sin pagar una
 * consulta por comprobacion.
 *
 * El sujeto se tipa de forma ESTRUCTURAL, igual que `ConPermisos`: `lib/` no
 * puede depender de `services/`, que es `server-only`.
 */

/**
 * Los roles que ven TODA la cartera de su empresa.
 *
 * Solo ADMIN, que es el gerente general: en GCM no existe un rol
 * `GERENTE_GENERAL`, el control total sobre la empresa es justo lo que
 * define a ADMIN (`MATRIZ.ADMIN = PERMISOS`).
 *
 * Todos los demas —residente, administrador de obra, almacenero y
 * consultor— ven SOLO lo que se les asigne. Es denegar por defecto, el mismo
 * principio que gobierna la matriz de permisos: un rol nuevo no ve nada
 * mientras no se le ponga aqui de forma consciente.
 *
 * El CONSULTOR importa especialmente: es el perfil del cliente y de la
 * supervision externa. Sin esta capa, el cliente de una obra veia el nombre,
 * el presupuesto y el comprometido de las obras de los demas clientes de la
 * constructora.
 */
export const VE_TODAS_LAS_OBRAS: readonly Role[] = ["ADMIN"];

export function veTodasLasObras(role: Role): boolean {
  return VE_TODAS_LAS_OBRAS.includes(role);
}

/**
 * El alcance ya resuelto de quien pregunta.
 *
 * `null` significa SIN RESTRICCION —toda la empresa—, y no «ninguna»: son
 * dos cosas opuestas y confundirlas abre el agujero entero. La lista vacia
 * es la que significa ninguna, y es el estado normal de un usuario recien
 * creado al que aun no le han asignado obra.
 */
export interface ConAlcance {
  obrasAsignadas: readonly string[] | null;
}

/** Si este sujeto puede ver y tocar esta obra. Sincrono: no consulta nada. */
export function alcanzaObra(sujeto: ConAlcance, obraId: string): boolean {
  if (sujeto.obrasAsignadas === null) return true;
  return sujeto.obrasAsignadas.includes(obraId);
}

/**
 * El fragmento de `where` de Prisma que acota una consulta sobre `Project`.
 *
 * Se compone con el filtro de empresa, NO lo sustituye:
 *
 *     where: { companyId: sesion.companyId, ...filtroDeObras(sesion) }
 *
 * Devuelve `{}` cuando no hay restriccion para que componer sea inocuo. Con
 * la lista vacia devuelve `{ id: { in: [] } }`, que no trae nada: es lo
 * correcto —a quien no le han asignado ninguna obra no le corresponde
 * ninguna— y es distinto de no filtrar.
 */
export function filtroDeObras(
  sujeto: ConAlcance,
): { id?: { in: string[] } } {
  if (sujeto.obrasAsignadas === null) return {};
  return { id: { in: [...sujeto.obrasAsignadas] } };
}

/**
 * Lo mismo, para las consultas que no van sobre `Project` sino sobre algo que
 * cuelga de el por `projectId` (partidas, ordenes, tareas...).
 *
 *     where: { projectId: obraId, ...filtroDeProjectId(sesion) }  // NO
 *     where: { ...filtroDeProjectId(sesion), project: { companyId } }
 *
 * Ojo: si la consulta ya fija un `projectId` concreto, esto NO se compone
 * —la segunda clave pisaria a la primera—. En ese caso lo que toca es
 * `alcanzaObra` antes de consultar, que ademas se ahorra el viaje.
 */
export function filtroDeProjectId(
  sujeto: ConAlcance,
): { projectId?: { in: string[] } } {
  if (sujeto.obrasAsignadas === null) return {};
  return { projectId: { in: [...sujeto.obrasAsignadas] } };
}

/** Lo que se le dice a quien pide una obra que no le corresponde. */
export const FUERA_DE_ALCANCE = "No tienes acceso a esta obra.";

/**
 * Lo que se contesta al intentar asignar una obra a quien ya las ve todas.
 *
 * No es un error del usuario: es que la fila no haria nada. Decirlo evita
 * creer que se ha acotado a un administrador cuando no se ha acotado nada.
 */
export const ETIQUETA_ALCANCE_TOTAL =
  "El administrador ya ve todas las obras de la empresa: no hace falta asignárselas.";
