import "server-only";
import { prisma } from "@/lib/prisma";
import { limpiarSesionesExpiradas } from "@/services/sesion.service";

/**
 * Purga de credenciales caducadas, para colgar del reloj de /api/reloj.
 *
 * Todas estas tablas crecen sin tope: cada intento de entrar deja un
 * CodigoAcceso, cada enlace de recuperacion un PasswordResetToken, cada pase
 * que entra una SesionPase de un ano, y cada codigo de pase un CodigoPase. Una
 * fila CADUCADA no sirve para nada -ni para entrar ni para contar-, asi que
 * borrarla es seguro: no se pierde nada reversible.
 *
 * En paralelo porque son borrados independientes; devuelve cuantas cayeron de
 * cada tabla para poder verlo en la respuesta del reloj.
 */
export interface ResumenPurga {
  sesiones: number;
  codigosAcceso: number;
  tokensRecuperacion: number;
  sesionesPase: number;
  codigosPase: number;
}

export async function purgarCredencialesExpiradas(): Promise<ResumenPurga> {
  const ahora = new Date();

  const [sesiones, codigosAcceso, tokensRecuperacion, sesionesPase, codigosPase] =
    await Promise.all([
      // La sesion tiene su propia funcion, ya probada; aqui se reusa.
      limpiarSesionesExpiradas(),
      prisma.codigoAcceso
        .deleteMany({ where: { expiresAt: { lt: ahora } } })
        .then((r) => r.count),
      prisma.passwordResetToken
        .deleteMany({ where: { expiresAt: { lt: ahora } } })
        .then((r) => r.count),
      prisma.sesionPase
        .deleteMany({ where: { expiresAt: { lt: ahora } } })
        .then((r) => r.count),
      prisma.codigoPase
        .deleteMany({ where: { expiresAt: { lt: ahora } } })
        .then((r) => r.count),
    ]);

  return { sesiones, codigosAcceso, tokensRecuperacion, sesionesPase, codigosPase };
}
