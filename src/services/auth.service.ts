import "server-only";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { validarClaveNueva } from "@/lib/claves";
import { crearSesion, cerrarTodasLasSesiones } from "@/services/sesion.service";
import { crearDesafio } from "@/services/dosFactores.service";
import { env } from "@/lib/env";
import { parsearOperadores, esCorreoOperador } from "@/lib/operador";
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

/**
 * Y el otro limite, el de la CONEXION, que hacia falta por dos motivos.
 *
 * El bloqueo de arriba es por cuenta, y una defensa que solo cuenta por cuenta
 * deja dos agujeros:
 *
 *   1. **Rociado de credenciales.** Probar una clave comun contra mil cuentas
 *      distintas no se acerca al umbral de ninguna. Cinco intentos por cuenta,
 *      infinitas cuentas, cero friccion.
 *   2. **Dejar fuera a un cliente a proposito.** El correo del ADMIN de una
 *      constructora es adivinable; con fallar cinco veces cada cuarto de hora
 *      se le mantiene fuera de su propio sistema indefinidamente. Contra un
 *      cliente de pago eso no es una molestia, es un incidente.
 *
 * Se cuenta sobre `AuditLog`, que ya escribia la IP de cada `LOGIN_FAILED` y
 * tiene indice por `(accion, createdAt)`. No hace falta tabla nueva.
 *
 * DOS COSAS QUE NO HACE, y conviene decirlas:
 *
 * - Los fallos contra un correo que NO EXISTE no se auditan (no hay empresa a
 *   la que colgarlos) y por tanto no cuentan aqui. Da igual: quien prueba
 *   correos inventados no obtiene nada. Lo que se quiere frenar es el rociado
 *   contra cuentas REALES, y esas si quedan registradas.
 * - Si la escritura de auditoria falla, este limite no ve nada y deja pasar.
 *   Es el mismo trato que ya tenia la traza —nunca tumbar la operacion que
 *   audita— y se prefiere a que un fallo de base cierre el acceso a todos.
 *
 * OJO AL NAT: una oficina entera sale por una sola IP. Veinte fallos en un
 * cuarto de hora es mucho para gente que se equivoca de contrasena y poco para
 * quien prueba listas.
 *
 * DE DONDE SALE LA IP, que es lo que decide si este limite sirve de algo. Hasta
 * el 17/08 se leia la PRIMERA entrada de `x-forwarded-for`, que es justo la que
 * escribe quien llama: bastaba cambiarla en cada peticion para que este contador
 * no llegara nunca a veinte. Ahora la elige `lib/ip-peticion`, que toma la que
 * puso nuestro proxy. Si se pone un CDN delante hay que tocar `SALTOS_DE_PROXY`
 * o todo el mundo caera en el mismo cubo.
 *
 * Y LO QUE ESTO SIGUE SIN SER: una defensa contra un atacante decidido. Queda
 * un supuesto sin comprobar —que el proxy escriba esa cabecera en vez de dejar
 * pasar la del cliente—, y eso no se arregla desde la aplicacion sino en la
 * configuracion del servidor. Debajo sigue el bloqueo POR CUENTA.
 */
const MAX_FALLOS_POR_IP = 20;
const VENTANA_IP_MINUTOS = 15;

export type ResultadoLogin =
  | { ok: true; requiere2FA: true }
  | { ok: true; requiere2FA?: false; mustChangePassword: boolean }
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
  /// Para distinguir un fallo de otro (clave mala vs empresa suspendida).
  despues?: Record<string, string>;
}): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        companyId: datos.companyId,
        userId: datos.userId ?? null,
        entidad: datos.entidad,
        entidadId: datos.entidadId,
        accion: datos.accion,
        despues: datos.despues ?? undefined,
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

  // El limite de la conexion va ANTES de mirar la cuenta, y por eso funciona
  // contra el rociado: corta a quien prueba muchas cuentas, no a quien insiste
  // en una. Sin IP no se puede atribuir nada y no se comprueba: mejor dejar
  // pasar que cortarle el acceso a todo el mundo porque falte una cabecera.
  if (meta.ip) {
    const desde = new Date(Date.now() - VENTANA_IP_MINUTOS * 60000);
    const fallosDeLaIp = await prisma.auditLog.count({
      where: {
        accion: "LOGIN_FAILED",
        ip: meta.ip.slice(0, 45),
        createdAt: { gt: desde },
      },
    });

    if (fallosDeLaIp >= MAX_FALLOS_POR_IP) {
      // Aqui SI se dice lo que pasa, al contrario que en el error generico.
      // No delata ninguna cuenta —habla de la conexion, no del correo— y a
      // quien de verdad se equivoco de contrasena le ahorra creer que su clave
      // dejo de valer.
      return {
        ok: false,
        error:
          `Demasiados intentos fallidos desde esta conexion. ` +
          `Espera ${VENTANA_IP_MINUTOS} minutos y vuelve a intentarlo.`,
      };
    }
  }

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
      dosFactoresActivo: true,
      canal2FA: true,
      celular: true,
      celularVerificadoAt: true,
      nombres: true,
      email: true,
      company: { select: { activa: true } },
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
    // EL CASTIGO SE CUMPLE Y SE ACABA. El contador solo se ponia a cero al
    // acertar, y de ahi salia el peor comportamiento de todo esto: una cuenta
    // que llegara a cinco fallos quedaba a merced de cualquiera para siempre,
    // porque a partir de ahi CADA fallo suelto volvia a bloquearla otro cuarto
    // de hora. Cinco intentos una vez, y despues uno cada quince minutos, era
    // suficiente para que el administrador de una constructora no volviera a
    // entrar en su sistema.
    //
    // Si habia un bloqueo y ya vencio, se empieza de cero: quien quiera
    // repetirlo tiene que volver a acertar cinco veces seguidas, no una.
    const bloqueoVencido =
      usuario.lockedUntil !== null && usuario.lockedUntil <= new Date();
    const previos = bloqueoVencido ? 0 : usuario.failedLoginCount;
    const intentos = previos + 1;

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
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  // Empresa suspendida: no entra nadie suyo.
  //
  // Va DESPUES de comprobar la clave a proposito. Si fuera antes, el formulario
  // de acceso se convertiria en un detector de que constructoras estan
  // suspendidas para cualquiera que supiera un correo.
  //
  // El operador se salta el bloqueo: si no, suspender su empresa por error lo
  // dejaria fuera y no habria quien lo devolviera.
  const esOperador = esCorreoOperador(
    usuario.email,
    parsearOperadores(env.GCM_OPERADORES),
  );
  if (!usuario.company.activa && !esOperador) {
    await auditar({
      companyId: usuario.companyId,
      userId: usuario.id,
      accion: "LOGIN_FAILED",
      entidad: "User",
      entidadId: usuario.id,
      meta,
      despues: { motivo: "empresa_suspendida" },
    });

    return {
      ok: false,
      error:
        "El acceso de tu empresa esta suspendido. Contacta con el administrador de GCM.",
    };
  }

  // Con dos pasos activos la clave sola no abre nada: se manda el codigo y
  // aqui se acaba. No hay sesion todavia, y por eso `lastLoginAt` y el
  // registro de LOGIN se dejan para cuando el codigo acierte: si no,
  // constaria como entrada alguien que quiza nunca llego a entrar.
  if (usuario.dosFactoresActivo) {
    // Por donde sale el codigo lo decide `crearDesafio` a partir de lo que la
    // persona eligio en su perfil. Aqui no se mira: el login no tiene por que
    // saber si hay SMS configurado.
    await crearDesafio({
      id: usuario.id,
      companyId: usuario.companyId,
      nombres: usuario.nombres,
      email: usuario.email,
      celular: usuario.celular,
      canal2FA: usuario.canal2FA,
      celularVerificadoAt: usuario.celularVerificadoAt,
    });
    return { ok: true, requiere2FA: true };
  }

  await prisma.user.update({
    where: { id: usuario.id },
    data: { lastLoginAt: new Date() },
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

/**
 * Segundo tramo del acceso, cuando el codigo ya acerto.
 *
 * Va aparte de `iniciarSesion` y no dentro del servicio de dos factores para
 * que las sesiones se abran en un unico sitio de todo el sistema.
 */
export async function completarAccesoConCodigo(
  userId: string,
  meta: MetadatosPeticion = {},
): Promise<{ mustChangePassword: boolean } | null> {
  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, companyId: true, estado: true, mustChangePassword: true },
  });

  if (!usuario || usuario.estado !== "ACTIVO") return null;

  await prisma.user.update({
    where: { id: usuario.id },
    data: { lastLoginAt: new Date() },
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

  return { mustChangePassword: usuario.mustChangePassword };
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
