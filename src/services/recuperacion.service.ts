import "server-only";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { generateToken, hashToken } from "@/lib/tokens";
import { validarClaveNueva } from "@/lib/claves";
import { env } from "@/lib/env";
import { cerrarTodasLasSesiones } from "@/services/sesion.service";
import { enviarCorreo, correoRecuperacion } from "@/services/mailer.service";

/**
 * Recuperacion de clave por correo, para quien no puede entrar.
 *
 * Dos propiedades gobiernan este archivo:
 *
 * 1. **No revela quien tiene cuenta.** `solicitarRecuperacion` responde lo
 *    mismo exista o no el correo. Si dijera "ese correo no esta registrado",
 *    cualquiera podria ir probando direcciones hasta dibujar la plantilla de
 *    la empresa, que es justo lo que se protege en `iniciarSesion`.
 *
 * 2. **El enlace es de un solo uso y caduca.** En la base vive el SHA-256 del
 *    token, nunca el token: un volcado de la base no permite entrar a nadie.
 */

/** Vigencia del enlace. Corta a proposito: se pide y se usa en el momento. */
const VIGENCIA_MINUTOS = 60;

/**
 * No recibe ni audita la IP a proposito. El enum `AuditAction` no tiene un
 * valor para "pidio el enlace", y reutilizar `PASSWORD_RESET` mezclaria la
 * peticion con el cambio de clave real, que es el que de verdad importa en la
 * traza. Anadir el valor exige migracion; cuando toque, este es su sitio.
 */
export async function solicitarRecuperacion(email: string): Promise<void> {
  /**
   * UN CORREO PUEDE ABRIR VARIAS CUENTAS desde el 20/08/2026: la misma persona
   * en dos constructoras. Se manda UN ENLACE POR CUENTA, cada uno con su token.
   *
   * No se pregunta cual, y es a proposito: preguntar obligaria a decir en que
   * constructoras tiene cuenta ese correo ANTES de comprobar que quien lo pide
   * es su dueno, y el formulario de recuperacion se convertiria en el detector
   * de cuentas que esta misma cabecera dice que no puede ser. Quien controla
   * el buzon recibe los enlaces y ya sabe cuales son suyos; quien no lo
   * controla no recibe nada.
   *
   * Cada correo dice de que constructora es. Sin eso, dos mensajes identicos
   * en la bandeja son una moneda al aire.
   */
  const cuentas = await prisma.user.findMany({
    where: { email: email.trim().toLowerCase() },
    select: {
      id: true,
      nombres: true,
      email: true,
      estado: true,
      company: { select: { razonSocial: true } },
    },
  });

  for (const usuario of cuentas) {
    // Silencio deliberado: una cuenta desactivada no recibe enlace, y quien lo
    // pidio ve el mismo mensaje que si existiera.
    if (usuario.estado !== "ACTIVO") continue;

    // Los enlaces anteriores mueren al pedir uno nuevo. Si no, pedir el enlace
    // tres veces dejaria tres llaves vivas y bastaria con que se filtrara la
    // primera —la mas antigua y la que mas tiempo lleva en la bandeja—.
    await prisma.passwordResetToken.deleteMany({
      where: { userId: usuario.id, usedAt: null },
    });

    const token = generateToken();

    await prisma.passwordResetToken.create({
      data: {
        userId: usuario.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + VIGENCIA_MINUTOS * 60_000),
      },
    });

    const enlace = `${env.APP_URL.replace(/\/$/, "")}/recuperar-clave/${token}`;

    await enviarCorreo({
      para: usuario.email,
      ...correoRecuperacion({
        nombre: usuario.nombres,
        enlace,
        minutos: VIGENCIA_MINUTOS,
        constructora: usuario.company.razonSocial,
      }),
    });
  }
}

/**
 * Comprueba que el enlace sirva, para decidir si se pinta el formulario o el
 * aviso de caducado. NO consume el token: solo mira.
 */
export async function tokenRecuperacionValido(token: string): Promise<boolean> {
  const fila = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, usedAt: true, user: { select: { estado: true } } },
  });

  return Boolean(
    fila &&
      fila.usedAt === null &&
      fila.expiresAt > new Date() &&
      fila.user.estado === "ACTIVO",
  );
}

export type ResultadoRestablecer = { ok: true } | { ok: false; error: string };

const ENLACE_INVALIDO =
  "Este enlace ya no sirve: caduco o ya se uso. Pide uno nuevo.";

/**
 * Fija la clave nueva a partir del enlace.
 *
 * El token se marca usado DENTRO de la misma transaccion que cambia la clave:
 * si se hiciera en dos pasos, dos peticiones simultaneas con el mismo enlace
 * podrian colarse las dos.
 */
export async function restablecerConToken(
  token: string,
  claveNueva: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<ResultadoRestablecer> {
  const validacion = validarClaveNueva(claveNueva);
  if (!validacion.ok) return validacion;

  const fila = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { id: true, companyId: true, estado: true } },
    },
  });

  if (!fila || fila.usedAt !== null || fila.expiresAt <= new Date()) {
    return { ok: false, error: ENLACE_INVALIDO };
  }
  if (fila.user.estado !== "ACTIVO") {
    return { ok: false, error: ENLACE_INVALIDO };
  }

  const hash = await hashPassword(claveNueva);

  await prisma.$transaction([
    // `usedAt: null` en el WHERE es la condicion de carrera: si otra peticion
    // llego antes, actualiza cero filas y la transaccion entera se cae.
    prisma.passwordResetToken.updateMany({
      where: { id: fila.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: fila.user.id },
      data: {
        passwordHash: hash,
        // Quien llega por aqui ya eligio su clave: no tiene sentido obligarle
        // a cambiarla otra vez nada mas entrar.
        mustChangePassword: false,
        // Recuperar la clave levanta el bloqueo por intentos fallidos, que es
        // justo lo que suele traer a alguien a esta pantalla.
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
  ]);

  await prisma.auditLog
    .create({
      data: {
        companyId: fila.user.companyId,
        userId: fila.user.id,
        entidad: "User",
        entidadId: fila.user.id,
        accion: "PASSWORD_RESET",
        ip: meta.ip?.slice(0, 45) ?? null,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
      },
    })
    .catch(() => {});

  // Cambiar la clave por haberla olvidado —o por sospecha de que otro la
  // sabia— tiene que echar de todas partes a quien estuviera dentro.
  await cerrarTodasLasSesiones(fila.user.id);

  return { ok: true };
}
