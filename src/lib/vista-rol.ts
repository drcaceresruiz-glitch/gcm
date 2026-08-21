import type { Permiso } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/enums";

/**
 * Vista previa de rol: la MISMA cuenta viendo GCM como lo veria otro rol,
 * sin cerrar sesion ni tener una cuenta aparte.
 *
 * Pensada para quien es gerente y administrador general a la vez con una
 * sola cuenta al empezar, y para que el propio administrador pueda probar
 * como se comporta la app para cada rol antes de dar de alta a nadie.
 *
 * LA REGLA DE ORO, y la unica que importa para la seguridad de esto: los
 * permisos de la vista previa son la INTERSECCION entre los del rol
 * simulado y los REALES de la cuenta, nunca una sustitucion. Consecuencia
 * verificable: como ADMIN tiene TODOS los permisos, intersectar con
 * cualquier rol da exactamente los permisos de ESE rol. Pero si alguien
 * manipulara la cookie a mano siendo, por ejemplo, RESIDENTE,
 * "previsualizar ADMIN" solo le devolveria sus propios permisos de
 * RESIDENTE de vuelta: nunca se gana privilegio por esta via, se pueda o no
 * tocar la cookie. Es lo que hace que `quien puede activarla` (en
 * `sesion.service.ts`) sea una decision de producto y no la frontera de
 * seguridad — esa ya la pone esta funcion.
 */

export const COOKIE_VISTA_ROL = "gcm-vista-rol";

export interface SesionReal {
  rol: Role;
  permisos: readonly Permiso[];
  obrasAsignadas: readonly string[] | null;
}

export interface VistaEfectiva {
  rol: Role;
  permisos: Permiso[];
  obrasAsignadas: string[] | null;
}

/**
 * Calcula la sesion EFECTIVA cuando hay una vista previa de rol activa.
 *
 * Sin `rolSimulado` (o si coincide con el real, que no es una simulacion de
 * nada) devuelve `real` tal cual, copiado para no compartir referencia.
 *
 * `obrasAsignadas` se calcula igual que en una sesion real de ese rol
 * —`null` si `veTodasLasObrasDelSimulado` es cierto, si no
 * `obrasPropiasDelUsuario`— y LUEGO se intersecta con `real.obrasAsignadas`:
 * si la cuenta real no alcanzaba todas las obras, la vista previa no puede
 * ensenarle ninguna de mas.
 */
export function vistaEfectiva(
  real: SesionReal,
  rolSimulado: Role | null,
  permisosDelSimulado: (rol: Role) => readonly Permiso[],
  veTodasLasObrasDelSimulado: (rol: Role) => boolean,
  obrasPropiasDelUsuario: readonly string[],
): VistaEfectiva {
  if (rolSimulado === null || rolSimulado === real.rol) {
    return {
      rol: real.rol,
      permisos: [...real.permisos],
      obrasAsignadas: real.obrasAsignadas === null ? null : [...real.obrasAsignadas],
    };
  }

  const permisosSimulados = permisosDelSimulado(rolSimulado);
  const permisos = permisosSimulados.filter((p) => real.permisos.includes(p));

  const obrasSimuladas = veTodasLasObrasDelSimulado(rolSimulado)
    ? null
    : [...obrasPropiasDelUsuario];

  const obrasAsignadas =
    real.obrasAsignadas === null
      ? obrasSimuladas
      : obrasSimuladas === null
        ? [...real.obrasAsignadas]
        : obrasSimuladas.filter((id) => real.obrasAsignadas!.includes(id));

  return { rol: rolSimulado, permisos, obrasAsignadas };
}
