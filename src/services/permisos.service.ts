import "server-only";
import { prisma } from "@/lib/prisma";
import { motivoSiEmpresaEnMigracion } from "@/services/empresa-migracion.service";
import {
  esInnegociable,
  PERMISOS,
  permisosDe,
  puede,
  resolverPermisos,
  ROLES,
  type Permiso,
} from "@/lib/rbac";
import type { SesionActiva } from "@/services/sesion.service";
import type { Role } from "@/generated/prisma/enums";

/**
 * Gestion de permisos por empresa.
 *
 * La tabla guarda EXCEPCIONES a la plantilla del rol, no la matriz entera.
 * Eso gobierna todo lo que hay aqui: al volver un permiso a su valor por
 * defecto no se guarda una fila que repita la plantilla, se BORRA la que
 * habia. Asi `company_permissions` solo contiene desviaciones reales y se
 * puede leer para saber en que se aparta esta empresa de lo previsto.
 *
 * Hay permisos que este servicio no toca nunca: los dos `*:aprobar`, que son
 * actos contractuales irreversibles, y los dos `permiso:*`, que reparten
 * todos los demas. Se rechazan aqui, y ademas `resolverPermisos` los ignora
 * aunque la fila llegue a existir. Son dos cierres independientes a
 * proposito: este puede fallar por un descuido al anadir una ruta nueva; el
 * otro protege incluso frente a una fila insertada a mano en la base.
 */

export interface CeldaPermiso {
  role: Role;
  /// Lo que concede la plantilla del rol.
  plantilla: boolean;
  /// Lo que esta en vigor hoy en esta empresa.
  efectivo: boolean;
}

export interface FilaPermiso {
  permiso: Permiso;
  /// false en los innegociables: se dibujan, pero bloqueados.
  editable: boolean;
  celdas: CeldaPermiso[];
}

export interface MatrizPermisos {
  roles: Role[];
  filas: FilaPermiso[];
  /// Cuantas casillas se apartan de su plantilla. Responde de un vistazo a
  /// «¿esta empresa tiene algo tocado?», que es lo primero que se pregunta
  /// quien abre esta pantalla sin haberla configurado el.
  totalExcepciones: number;
}

export async function obtenerMatriz(
  sesion: SesionActiva,
): Promise<MatrizPermisos> {
  if (!puede(sesion, "permiso:leer")) {
    throw new Error("No tienes permiso para ver la matriz de permisos.");
  }

  const excepciones = await prisma.companyPermission.findMany({
    where: { companyId: sesion.companyId },
    select: { role: true, permiso: true, concedido: true },
  });

  // Se resuelve rol a rol con la MISMA funcion que usa la sesion. Calcular
  // aqui los efectivos por otra via seria arriesgarse a que la pantalla
  // ensene una cosa y el sistema aplique otra.
  const efectivos = new Map<Role, Set<Permiso>>(
    ROLES.map((role) => [
      role,
      new Set(
        resolverPermisos(
          role,
          excepciones.filter((e) => e.role === role),
        ),
      ),
    ]),
  );

  let totalExcepciones = 0;

  const filas: FilaPermiso[] = PERMISOS.map((permiso) => ({
    permiso,
    editable: !esInnegociable(permiso),
    celdas: ROLES.map((role) => {
      const plantilla = permisosDe(role).includes(permiso);
      const efectivo = efectivos.get(role)!.has(permiso);
      if (plantilla !== efectivo) totalExcepciones++;
      return { role, plantilla, efectivo };
    }),
  }));

  return { roles: [...ROLES], filas, totalExcepciones };
}

// ---------------------------------------------------------------------------
// Guardado
// ---------------------------------------------------------------------------

export interface CambioPermiso {
  role: Role;
  permiso: string;
  /// El valor que debe quedar EN VIGOR, no la excepcion a guardar. Si
  /// coincide con la plantilla, lo que se guarda es la ausencia de fila.
  concedido: boolean;
}

export type ResultadoPermisos =
  | { ok: true; aplicados: number }
  | { ok: false; error: string };

export async function guardarCambios(
  sesion: SesionActiva,
  cambios: CambioPermiso[],
): Promise<ResultadoPermisos> {
  if (!puede(sesion, "permiso:editar")) {
    return {
      ok: false,
      error: "No tienes permiso para editar la matriz de permisos.",
    };
  }

  // `company_permissions` viaja en el archivo de migracion: sin ella, en
  // destino se aplicaria la matriz de fabrica y alguien perderia en silencio
  // un permiso que su empresa le habia dado a mano.
  const congelada = await motivoSiEmpresaEnMigracion(sesion.companyId);
  if (congelada) return { ok: false, error: congelada };

  if (cambios.length === 0) {
    return { ok: false, error: "No hay ningun cambio que guardar." };
  }

  // Si llegan dos cambios sobre la misma casilla, manda el ultimo. Es lo
  // mismo que hace la pantalla al editar, y evita que la clave unica de la
  // tabla decida el resultado por nosotros.
  const porCasilla = new Map<string, CambioPermiso>();
  for (const cambio of cambios) {
    porCasilla.set(`${cambio.role}|${cambio.permiso}`, cambio);
  }
  const pedidos = [...porCasilla.values()];

  // Se valida TODO antes de escribir nada: un movimiento a medias dejaria la
  // matriz en un estado que nadie pidio.
  for (const cambio of pedidos) {
    if (!ROLES.includes(cambio.role)) {
      return { ok: false, error: `El rol "${cambio.role}" no existe.` };
    }
    if (!PERMISOS.includes(cambio.permiso as Permiso)) {
      return { ok: false, error: `El permiso "${cambio.permiso}" no existe.` };
    }
    if (esInnegociable(cambio.permiso)) {
      return {
        ok: false,
        error: `"${cambio.permiso}" no es configurable y esta reservado al administrador. Aprobar y repartir permisos no se delegan.`,
      };
    }
  }

  const aplicados = await prisma.$transaction(async (tx) => {
    let cuenta = 0;

    for (const cambio of pedidos) {
      const permiso = cambio.permiso as Permiso;
      const clave = {
        companyId_role_permiso: {
          companyId: sesion.companyId,
          role: cambio.role,
          permiso,
        },
      };

      const plantilla = permisosDe(cambio.role).includes(permiso);
      const excepcion = await tx.companyPermission.findUnique({
        where: clave,
        select: { concedido: true },
      });

      const antes = excepcion ? excepcion.concedido : plantilla;

      // La pantalla manda el estado completo de la rejilla, no solo lo
      // tocado, asi que la mayoria de los "cambios" no cambian nada. No se
      // auditan: llenarian el registro de ruido y taparian los reales.
      if (antes === cambio.concedido) continue;

      if (cambio.concedido === plantilla) {
        // Vuelve a su valor por defecto: se retira la excepcion en lugar de
        // guardar una que repita lo que ya dice la plantilla.
        await tx.companyPermission.delete({ where: clave });
      } else {
        await tx.companyPermission.upsert({
          where: clave,
          create: {
            companyId: sesion.companyId,
            role: cambio.role,
            permiso,
            concedido: cambio.concedido,
          },
          update: { concedido: cambio.concedido },
        });
      }

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          entidad: "CompanyPermission",
          entidadId: `${cambio.role}:${permiso}`.slice(0, 40),
          accion: "UPDATE",
          // Se guarda tambien si el valor coincidia con la plantilla: sin
          // eso, dentro de un ano no se sabria si el permiso se concedio a
          // proposito o venia de serie con el rol.
          antes: {
            role: cambio.role,
            permiso,
            efectivo: antes,
            segunPlantilla: antes === plantilla,
          },
          despues: {
            role: cambio.role,
            permiso,
            efectivo: cambio.concedido,
            segunPlantilla: cambio.concedido === plantilla,
          },
        },
      });

      cuenta++;
    }

    return cuenta;
  });

  if (aplicados === 0) {
    return { ok: false, error: "Ningun permiso cambio de valor." };
  }

  return { ok: true, aplicados };
}
