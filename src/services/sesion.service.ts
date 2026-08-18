import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken } from "@/lib/tokens";
import { env, isProduction } from "@/lib/env";
import { resolverPermisos, type Permiso } from "@/lib/rbac";
import { veTodasLasObras } from "@/lib/alcance-obras";
import { parsearOperadores, esCorreoOperador } from "@/lib/operador";
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

/**
 * La sesion caduca por INACTIVIDAD, no a las ocho horas cuente lo que cuente.
 *
 * - `IDLE_MS`: sin ninguna peticion durante media hora, la sesion muere. Cada
 *   peticion valida la renueva (expiracion deslizante), asi que quien trabaja
 *   no se ve expulsado; quien deja el equipo, si.
 * - `MAX_ABSOLUTO_MS`: un techo que la renovacion nunca supera. Pase lo que
 *   pase, a la jornada hay que volver a autenticarse: una sesion eterna en un
 *   equipo compartido es un riesgo por si sola.
 * - `RENOVAR_SI_GANA_MS`: solo se reescribe la expiracion si con ello gana mas
 *   de un minuto. Sin este freno, una pantalla que refresca sola escribiria en
 *   la base en cada peticion.
 */
const IDLE_MS = 30 * 60 * 1000;
const MAX_ABSOLUTO_MS = 8 * 60 * 60 * 1000;
const RENOVAR_SI_GANA_MS = 60 * 1000;

export interface SesionActiva {
  sesionId: string;
  userId: string;
  companyId: string;
  role: Role;
  /**
   * Permisos EFECTIVOS: la plantilla del rol con las excepciones de su
   * empresa aplicadas. Se resuelven aqui, una vez por peticion, para que
   * `puede()` siga siendo una comprobacion sincrona sin tocar la base.
   *
   * Al recalcularse en cada peticion, un cambio de permisos surte efecto en
   * la siguiente: no hay que cerrar sesiones ni esperar a que caduquen.
   */
  permisos: Permiso[];
  /**
   * Las obras que alcanza DENTRO de su empresa, o `null` si las alcanza
   * todas. Ver `@/lib/alcance-obras`: `null` es «sin restriccion», la lista
   * vacia es «ninguna», y son cosas opuestas.
   *
   * Se resuelve aqui, una vez por peticion y sin consulta adicional —viaja
   * en el mismo `findUnique` de la sesion—, para que `alcanzaObra()` sea
   * sincrona y quepa en los sitios calientes: cada apertura de obra y cada
   * escritura.
   *
   * Al recalcularse en cada peticion, asignar o quitar una obra surte efecto
   * en la siguiente, igual que los permisos: no hay que cerrar sesiones.
   */
  obrasAsignadas: string[] | null;
  nombres: string;
  apellidos: string;
  email: string;
  mustChangePassword: boolean;
  /**
   * Opera GCM: puede dar de alta constructoras clientes y suspenderlas.
   *
   * DERIVADO de una variable de entorno, no guardado: no hay columna ni rol
   * que conceda esto, solo la lista del servidor. Ver `@/lib/operador`.
   *
   * No concede NI UN permiso del dominio: dentro de su empresa el operador es
   * un usuario corriente y `puede()` sigue mandando.
   */
  esOperador: boolean;
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
      // Nace con la ventana de inactividad; cada peticion la ira deslizando.
      expiresAt: new Date(Date.now() + IDLE_MS),
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
    // La cookie vive hasta el tope absoluto; la sesion de la base puede morir
    // antes por inactividad, y entonces la cookie apunta a una fila que ya no
    // existe y no hay sesion. El tope manda.
    maxAge: MAX_ABSOLUTO_MS / 1000,
  });
}

/**
 * Devuelve la sesion vigente o null.
 *
 * Verifica en cada peticion que el usuario siga ACTIVO. Esto es lo que hace
 * que desactivar a alguien surta efecto de inmediato, sin esperar a que
 * caduque nada.
 *
 * Va envuelta en `cache()` porque la llaman el layout y ademas cada pagina,
 * y con el layout de obra son ya tres veces por peticion. La deduplicacion
 * es POR PETICION: no hay memoria entre peticiones y la comprobacion de que
 * el usuario sigue activo se sigue haciendo en todas, que es de lo que
 * depende que desactivarlo surta efecto en la siguiente.
 */
export const obtenerSesion = cache(async function obtenerSesion(): Promise<SesionActiva | null> {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_SESION)?.value;
  if (!token) return null;

  const sesion = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      createdAt: true,
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
          // Las obras asignadas, en la MISMA consulta: es una lectura por
          // indice sobre una tabla de una fila por obra y persona, y traerla
          // aparte costaria una ida y vuelta mas en cada peticion. Se pide
          // siempre —tambien para el ADMIN, que no la usa— porque separarla
          // por rol exigiria conocer el rol antes de consultar, que es la
          // fila de al lado.
          memberships: { select: { projectId: true } },
          // Las excepciones de permisos de su empresa, en la misma consulta.
          // Se traen todas y se filtran por rol en memoria: son como mucho
          // cinco roles por los permisos que existan, y filtrar aqui exigiria
          // una segunda consulta porque el rol vive en la fila de al lado.
          company: {
            select: {
              // Si la empresa esta suspendida, sus usuarios no entran. Va en
              // esta consulta, que ya se hace, para no pagar otra.
              activa: true,
              permisos: {
                select: { role: true, permiso: true, concedido: true },
              },
            },
          },
        },
      },
    },
  });

  if (!sesion) return null;

  const ahora = Date.now();

  const esOperador = esCorreoOperador(
    sesion.user.email,
    parsearOperadores(env.GCM_OPERADORES),
  );

  // Suspender una empresa tiene que echar tambien a quien YA estaba dentro:
  // comprobarlo solo al entrar dejaria viva su sesion hasta que caducara. Al
  // vivir aqui, corta paginas, acciones de servidor y API a la vez.
  //
  // El operador se salta el bloqueo: si no, suspender su empresa por error lo
  // dejaria fuera sin nadie que pudiera devolverlo.
  const empresaSuspendida = !sesion.user.company.activa && !esOperador;

  if (
    sesion.expiresAt.getTime() < ahora ||
    sesion.user.estado !== "ACTIVO" ||
    empresaSuspendida
  ) {
    await prisma.session.delete({ where: { id: sesion.id } }).catch(() => {});
    return null;
  }

  // Expiracion deslizante: se empuja la caducidad a `ahora + IDLE`, sin pasar
  // del tope absoluto medido desde que nacio la sesion. Solo se escribe si el
  // avance vale la pena, para no tocar la base en cada peticion.
  const tope = sesion.createdAt.getTime() + MAX_ABSOLUTO_MS;
  const nuevaExpira = Math.min(ahora + IDLE_MS, tope);
  if (nuevaExpira - sesion.expiresAt.getTime() > RENOVAR_SI_GANA_MS) {
    await prisma.session
      .update({
        where: { id: sesion.id },
        data: { expiresAt: new Date(nuevaExpira) },
      })
      .catch(() => {});
  }

  const excepciones = sesion.user.company.permisos.filter(
    (p) => p.role === sesion.user.role,
  );

  return {
    sesionId: sesion.id,
    userId: sesion.user.id,
    companyId: sesion.user.companyId,
    role: sesion.user.role,
    permisos: resolverPermisos(sesion.user.role, excepciones),
    // `null` = sin restriccion, y solo para el rol que ve toda la cartera.
    // Para los demas, EXACTAMENTE lo asignado: si no tienen ninguna obra la
    // lista sale vacia, que es lo correcto y no lo mismo que `null`.
    obrasAsignadas: veTodasLasObras(sesion.user.role)
      ? null
      : sesion.user.memberships.map((m) => m.projectId),
    nombres: sesion.user.nombres,
    apellidos: sesion.user.apellidos,
    email: sesion.user.email,
    mustChangePassword: sesion.user.mustChangePassword,
    esOperador,
  };
});

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
