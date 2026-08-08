import "server-only";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { validarClaveNueva } from "@/lib/claves";
import { crearSesion, cerrarTodasLasSesiones } from "@/services/sesion.service";
import type { AuditAction } from "@/generated/prisma/enums";

/**
 * Autenticacion y gestion de credenciales.
 *
 * Todas las respuestas de error al usuario son deliberadamente vagas
 * ("credenciales invalidas"). Distinguir entre "ese correo no existe" y
 * "la clave es incorrecta" le regala a un atacante la lista de correos
 * validos de la empresa.
 */

/** Intentos fallidos antes de bloquear la cuenta. */
const MAX_INTENTOS = 5;
const BLOQUEO_MINUTOS = 15;

export type ResultadoLogin =
  | { ok: true; mustChangePassword: boolean }
  | { ok: false; error: string };

interface MetadatosPeticion {
  ip?: string;
  userAgent?: string;
}

async function auditar(datos: {
  companyId: string;
  userId?: string;
  accion: AuditAction;
  entidad: string;
  entidadId: string;
  meta?: MetadatosPeticion;
}): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        companyId: datos.companyId,
        userId: datos.userId ?? null,
        entidad: datos.entidad,
        entidadId: datos.entidadId,
        accion: datos.accion,
        ip: datos.meta?.ip?.slice(0, 45) ?? null,
        userAgent: datos.meta?.userAgent?.slice(0, 255) ?? null,
      },
    })
    // La auditoria nunca debe tumbar la operacion que audita.
    .catch(() => {});
}

export async function iniciarSesion(
  email: string,
  clave: string,
  meta: MetadatosPeticion = {},
): Promise<ResultadoLogin> {
  const ERROR_GENERICO = "Correo o contrasena incorrectos.";

  const usuario = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: {
      id: true,
      companyId: true,
      passwordHash: true,
      estado: true,
      mustChangePassword: true,
      failedLoginCount: true,
      lockedUntil: true,
    },
  });

  if (!usuario) {
    // Se verifica una clave ficticia igualmente para que el tiempo de
    // respuesta no delate si el correo existe o no.
    await verifyPassword(clave, "scrypt$16384$8$1$AAAA$AAAA");
    return { ok: false, error: ERROR_GENERICO };
  }

  if (usuario.estado !== "ACTIVO") {
    return { ok: false, error: "Esta cuenta esta desactivada." };
  }

  if (usuario.lockedUntil && usuario.lockedUntil > new Date()) {
    const minutos = Math.ceil(
      (usuario.lockedUntil.getTime() - Date.now()) / 60000,
    );
    return {
      ok: false,
      error: `Cuenta bloqueada por intentos fallidos. Reintenta en ${minutos} minuto(s).`,
    };
  }

  const claveCorrecta = await verifyPassword(clave, usuario.passwordHash);

  if (!claveCorrecta) {
    const intentos = usuario.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: usuario.id },
      data: {
        failedLoginCount: intentos,
        lockedUntil:
          intentos >= MAX_INTENTOS
            ? new Date(Date.now() + BLOQUEO_MINUTOS * 60000)
            : null,
      },
    });

    await auditar({
      companyId: usuario.companyId,
      userId: usuario.id,
      accion: "LOGIN_FAILED",
      entidad: "User",
      entidadId: usuario.id,
      meta,
    });

    return { ok: false, error: ERROR_GENERICO };
  }

  await prisma.user.update({
    where: { id: usuario.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await crearSesion(usuario.id, meta);

  await auditar({
    companyId: usuario.companyId,
    userId: usuario.id,
    accion: "LOGIN",
    entidad: "User",
    entidadId: usuario.id,
    meta,
  });

  return { ok: true, mustChangePassword: usuario.mustChangePassword };
}

export type ResultadoCambioClave =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Cambio de contrasena por el propio usuario.
 *
 * Al terminar se cierran TODAS sus sesiones, incluida la actual. Si alguien
 * cambia la clave es porque sospecha que otro la conocia: dejar viva una
 * sesion abierta con la clave antigua anularia el sentido del cambio.
 */
export async function cambiarClave(
  userId: string,
  claveActual: string,
  claveNueva: string,
): Promise<ResultadoCambioClave> {
  const politica = validarClaveNueva(claveNueva, claveActual);
  if (!politica.ok) return politica;

  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, companyId: true, passwordHash: true },
  });

  if (!usuario) return { ok: false, error: "Usuario no encontrado." };

  if (!(await verifyPassword(claveActual, usuario.passwordHash))) {
    return { ok: false, error: "La contrasena actual no es correcta." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(claveNueva),
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  await auditar({
    companyId: usuario.companyId,
    userId: usuario.id,
    accion: "PASSWORD_CHANGE",
    entidad: "User",
    entidadId: usuario.id,
  });

  await cerrarTodasLasSesiones(userId);

  return { ok: true };
}
