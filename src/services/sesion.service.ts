import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken } from "@/lib/tokens";
import { isProduction } from "@/lib/env";
import type { Role } from "@/generated/prisma/enums";

/**
 * Sesiones respaldadas por base de datos.
 *
 * Se usan tokens opacos en lugar de JWT porque necesitamos revocar el acceso
 * al instante: al desactivar un usuario, su sesion debe morir en la siguiente
 * peticion. Con un JWT habria que esperar a que caduque o mantener una lista
 * de revocados, que es justamente la tabla que ya tenemos aqui.
 */

const COOKIE_SESION = "gcm_sesion";

/** Ocho horas: una jornada de obra. Obliga a reautenticar cada dia. */
const DURACION_MS = 8 * 60 * 60 * 1000;

export interface SesionActiva {
  sesionId: string;
  userId: string;
  companyId: string;
  role: Role;
  nombres: string;
  apellidos: string;
  email: string;
  mustChangePassword: boolean;
}

export async function crearSesion(
  userId: string,
  datos: { ip?: string; userAgent?: string } = {},
): Promise<void> {
  const token = generateToken();

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + DURACION_MS),
      ip: datos.ip?.slice(0, 45) ?? null,
      userAgent: datos.userAgent?.slice(0, 255) ?? null,
    },
  });

  const almacen = await cookies();
  almacen.set(COOKIE_SESION, token, {
    httpOnly: true, // inaccesible desde JavaScript: mitiga el robo por XSS
    secure: isProduction,
    sameSite: "lax", // mitiga CSRF sin romper la navegacion normal
    path: "/",
    maxAge: DURACION_MS / 1000,
  });
}

/**
 * Devuelve la sesion vigente o null.
 *
 * Verifica en cada peticion que el usuario siga ACTIVO. Esto es lo que hace
 * que desactivar a alguien surta efecto de inmediato, sin esperar a que
 * caduque nada.
 */
export async function obtenerSesion(): Promise<SesionActiva | null> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_SESION)?.value;
  if (!token) return null;

  const sesion = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          companyId: true,
          role: true,
          nombres: true,
          apellidos: true,
          email: true,
          estado: true,
          mustChangePassword: true,
        },
      },
    },
  });

  if (!sesion) return null;

  if (sesion.expiresAt < new Date() || sesion.user.estado !== "ACTIVO") {
    await prisma.session.delete({ where: { id: sesion.id } }).catch(() => {});
    return null;
  }

  return {
    sesionId: sesion.id,
    userId: sesion.user.id,
    companyId: sesion.user.companyId,
    role: sesion.user.role,
    nombres: sesion.user.nombres,
    apellidos: sesion.user.apellidos,
    email: sesion.user.email,
    mustChangePassword: sesion.user.mustChangePassword,
  };
}

export async function cerrarSesion(): Promise<void> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_SESION)?.value;

  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => {});
  }

  almacen.delete(COOKIE_SESION);
}

/** Cierra todas las sesiones de un usuario. Se llama al desactivarlo o al
 *  cambiar su contrasena: un cambio de clave debe expulsar a quien la tuviera. */
export async function cerrarTodasLasSesiones(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Purga de sesiones caducadas. Pensada para una tarea programada. */
export async function limpiarSesionesExpiradas(): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
