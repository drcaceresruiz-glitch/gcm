import "server-only";

import { prisma } from "@/lib/prisma";
import { puede, ETIQUETA_ROL } from "@/lib/rbac";
import { veTodasLasObras, ETIQUETA_ALCANCE_TOTAL } from "@/lib/alcance-obras";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { Role } from "@/generated/prisma/enums";
import type { SesionActiva } from "@/services/sesion.service";
import { alcanzaObra } from "@/lib/alcance-obras";

/**
 * Quien trabaja en cada obra.
 *
 * Es la otra mitad del alcance por obra (`@/lib/alcance-obras`): alli se
 * decide que ve cada quien, aqui se decide quien. Sin esta pantalla, la
 * tabla `project_memberships` existia en el esquema desde el principio y no
 * habia forma de escribir una sola fila en ella.
 *
 * El rol de la fila NO gobierna permisos. Se guarda el rol de empresa que la
 * persona tiene el dia de la asignacion, y sirve para leerlo en la lista y
 * en la auditoria. Un rol EFECTIVO por obra —que alguien fuera residente en
 * una obra y consultor en otra— exigiria resolver los permisos por obra, y
 * hoy `SesionActiva.permisos` se resuelve una vez para toda la peticion, sin
 * saber que obra se esta mirando. Guardar un rol distinto aqui daria una
 * fila que dice una cosa y un sistema que hace otra.
 */

export interface MiembroObra {
  userId: string;
  nombre: string;
  email: string;
  role: Role;
  etiquetaRol: string;
  /// Si esta persona ya tiene esta obra asignada.
  asignado: boolean;
  /**
   * Ve la obra sin necesidad de asignacion, por su rol de empresa. Se marca
   * para que la lista no invite a asignar a quien ya lo ve todo: seria una
   * fila sin efecto, y de esas nace la sensacion de que la pantalla no
   * funciona.
   */
  veTodo: boolean;
  /// Cuando se le asigno. Null si no esta asignado.
  desde: Date | null;
}

export type ResultadoEquipo = { ok: true } | { ok: false; error: string };

/** Solo quien reparte el trabajo toca esta pantalla. */
function puedeRepartir(sesion: SesionActiva): boolean {
  return puede(sesion, "obra:asignar_equipo");
}

/**
 * El equipo de la obra y el resto de la empresa, en una sola lista.
 *
 * Van juntos y no en dos listas a proposito: la pregunta que se hace quien
 * abre esto es «quien esta y quien falta», y con dos tablas hay que cruzarlas
 * a ojo. Los usuarios INACTIVOS quedan fuera: no pueden entrar, asi que
 * ofrecerlos solo ensucia.
 */
export async function listarEquipo(
  sesion: SesionActiva,
  obraId: string,
): Promise<MiembroObra[]> {

  // El alcance por obra, con la misma respuesta que «no tienes permiso». Ver
  // la regla 4 en `gcm-limites-de-capas`.
  if (!alcanzaObra(sesion, obraId)) return [];

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return [];

  const [usuarios, miembros] = await Promise.all([
    prisma.user.findMany({
      where: { companyId: sesion.companyId, estado: "ACTIVO" },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        email: true,
        role: true,
      },
      orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
    }),
    prisma.projectMembership.findMany({
      where: { projectId: obraId },
      select: { userId: true, createdAt: true },
    }),
  ]);

  const asignadoDesde = new Map(miembros.map((m) => [m.userId, m.createdAt]));

  return usuarios.map((u) => ({
    userId: u.id,
    nombre: `${u.nombres} ${u.apellidos}`.trim(),
    email: u.email,
    role: u.role,
    etiquetaRol: ETIQUETA_ROL[u.role],
    asignado: asignadoDesde.has(u.id),
    veTodo: veTodasLasObras(u.role),
    desde: asignadoDesde.get(u.id) ?? null,
  }));
}

/**
 * Asigna una persona a la obra.
 *
 * Idempotente: repetir la asignacion no falla ni duplica —la clave unica
 * `(userId, projectId)` no lo permitiria— y se contesta que si, porque el
 * estado que el usuario pedia es el que queda.
 */
export async function asignarAObra(
  sesion: SesionActiva,
  obraId: string,
  userId: string,
): Promise<ResultadoEquipo> {
  if (!puedeRepartir(sesion)) {
    return { ok: false, error: "No tienes permiso para repartir el equipo." };
  }

  // Asignar es ABRIR: dar acceso nuevo a alguien. Sin excepcion en
  // PARALIZADA, igual que crear cualquier otra cosa.
  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  // Las dos comprobaciones son de EMPRESA y van juntas: sin la del usuario,
  // mandando un id ajeno se podria meter en la obra a alguien de otra
  // constructora, que es el aislamiento que sostiene todo lo demas.
  const [obra, usuario] = await Promise.all([
    prisma.project.findFirst({
      where: { id: obraId, companyId: sesion.companyId },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: { id: userId, companyId: sesion.companyId },
      select: { id: true, role: true, estado: true, nombres: true, apellidos: true },
    }),
  ]);

  if (!obra) return { ok: false, error: "No se encontró la obra." };
  if (!usuario) return { ok: false, error: "No se encontró a esa persona." };

  if (usuario.estado !== "ACTIVO") {
    return {
      ok: false,
      error: "Esa persona está desactivada: reactívala antes de asignarle obra.",
    };
  }

  // Asignar a quien ya lo ve todo no es un error, pero tampoco hace nada:
  // decirlo evita que alguien crea que ha restringido a un administrador.
  if (veTodasLasObras(usuario.role)) {
    return { ok: false, error: ETIQUETA_ALCANCE_TOTAL };
  }

  const yaEsta = await prisma.projectMembership.findUnique({
    where: { userId_projectId: { userId, projectId: obraId } },
    select: { id: true },
  });
  if (yaEsta) return { ok: true };

  await prisma.$transaction(async (tx) => {
    const fila = await tx.projectMembership.create({
      // El rol se copia del de empresa: ver la nota de arriba sobre por que
      // NO es un rol efectivo por obra.
      data: { userId, projectId: obraId, role: usuario.role },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "ProjectMembership",
        entidadId: fila.id,
        accion: "CREATE",
        despues: {
          usuario: `${usuario.nombres} ${usuario.apellidos}`.trim(),
          userId,
          role: usuario.role,
        },
      },
    });
  });

  return { ok: true };
}

/**
 * Quita a una persona de la obra.
 *
 * Deja de verla en la peticion siguiente, sin cerrarle la sesion: el alcance
 * se resuelve en cada peticion, igual que los permisos.
 *
 * Lo que se hizo NO se va con ella: los avances, las valorizaciones y los
 * apuntes de auditoria siguen firmados con su nombre. Quitar a alguien del
 * equipo es decir que ya no trabaja aqui, no que nunca trabajo.
 */
export async function quitarDeObra(
  sesion: SesionActiva,
  obraId: string,
  userId: string,
): Promise<ResultadoEquipo> {
  if (!puedeRepartir(sesion)) {
    return { ok: false, error: "No tienes permiso para repartir el equipo." };
  }

  // Quitar es CERRAR: revocar un acceso que ya estaba, no abrir nada. Se
  // permite en obra paralizada, mismo criterio que aprobarMovimiento.
  const cerrada = await motivoSiObraCerrada(sesion, obraId, {
    permiteEnParalizada: true,
  });
  if (cerrada) return { ok: false, error: cerrada };

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "No se encontró la obra." };

  const fila = await prisma.projectMembership.findUnique({
    where: { userId_projectId: { userId, projectId: obraId } },
    select: { id: true, user: { select: { nombres: true, apellidos: true, companyId: true } } },
  });

  // Ya no esta: el estado pedido es el que hay.
  if (!fila) return { ok: true };

  // La fila podria ser de un usuario de otra empresa si alguien manipulo el
  // id; se comprueba antes de borrar nada.
  if (fila.user.companyId !== sesion.companyId) {
    return { ok: false, error: "No se encontró a esa persona." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectMembership.delete({ where: { id: fila.id } });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "ProjectMembership",
        entidadId: fila.id,
        accion: "DELETE",
        antes: {
          usuario: `${fila.user.nombres} ${fila.user.apellidos}`.trim(),
          userId,
        },
      },
    });
  });

  return { ok: true };
}
