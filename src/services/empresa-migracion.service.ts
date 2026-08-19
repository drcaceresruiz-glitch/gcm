import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * El estado «en migracion»: la constructora congelada mientras sale.
 *
 * POR QUE HACE FALTA. Exportar una empresa entera son decenas de consultas
 * seguidas —cuarenta y tantas tablas, mas las fotos leidas del disco— y NO
 * se envuelven en una transaccion: una de ese tamano se lleva por delante el
 * tope de Prisma y ademas clava una conexion del pool durante minutos. Sin
 * congelar, el archivo saldria desgarrado —las partidas de un instante y las
 * valorizaciones de otro— y nada avisaria: es un zip que se abre y cuadra
 * mal seis meses despues, en la instalacion nueva, sin nadie a quien
 * preguntar.
 *
 * ES LA DOCTRINA DE «OBRA CERRADA», UN PISO MAS ARRIBA. El respaldo de obra
 * resuelve esto mismo exigiendo que la obra este CERRADA; aqui no vale,
 * porque una empresa no se cierra. El congelado es su equivalente: temporal,
 * explicito y reversible.
 *
 * NO ES LO MISMO QUE SUSPENDER. Una empresa suspendida no deja entrar a
 * nadie suyo —lo impide `auth.service`—, y entonces su propio ADMIN no
 * podria exportarla. En migracion se entra y se ve todo; lo unico que no se
 * puede es escribir.
 */

/**
 * Lo que ve la pantalla.
 *
 * `desde` es null cuando no esta congelada. Se devuelve la marca de tiempo y
 * no un booleano porque lo que hay que ensenar es «congelada desde las
 * 14:05», no «congelada»: un congelado que alguien dejo puesto ayer y nadie
 * recuerda es indistinguible de uno que empezo hace un minuto, y de los dos
 * casos solo uno es normal.
 */
export interface EstadoMigracion {
  enMigracion: boolean;
  desde: Date | null;
}

export type ResultadoMigracion = { ok: true } | { ok: false; error: string };

const SIN_PERMISO =
  "Solo el administrador de la empresa puede congelarla para migrarla.";

export async function leerEstadoMigracion(
  sesion: SesionActiva,
): Promise<EstadoMigracion> {
  const fila = await prisma.company.findUnique({
    where: { id: sesion.companyId },
    select: { enMigracionAt: true },
  });

  return {
    enMigracion: fila?.enMigracionAt != null,
    desde: fila?.enMigracionAt ?? null,
  };
}

/**
 * Congela la empresa.
 *
 * Es idempotente a proposito y NO refresca la marca si ya estaba congelada:
 * la fecha que interesa es cuando EMPEZO el congelado, y pisarla en cada
 * intento borraria justo el dato que delata uno olvidado.
 */
export async function congelarEmpresa(
  sesion: SesionActiva,
): Promise<ResultadoMigracion> {
  if (!puede(sesion, "empresa:migrar")) return { ok: false, error: SIN_PERMISO };

  // `enMigracionAt: null` viaja EN el filtro del update y no en una consulta
  // previa: asi dos pulsaciones a la vez no se pueden colar entre el leer y
  // el escribir, y la marca de la primera es la que queda.
  const { count } = await prisma.company.updateMany({
    where: { id: sesion.companyId, enMigracionAt: null },
    data: { enMigracionAt: new Date() },
  });

  // count === 0 significa que ya estaba congelada. No es un error: quien
  // pulso queria la empresa congelada, y la empresa esta congelada.
  if (count > 0) await apuntar(sesion, "congelar");

  return { ok: true };
}

/**
 * Descongela la empresa.
 *
 * Sin confirmacion ni segundo paso, y es deliberado: la puerta con guarda es
 * la de congelar, porque es la que para el trabajo de todos. Descongelar
 * devuelve la aplicacion a su estado normal, que es el lado seguro del fallo.
 */
export async function descongelarEmpresa(
  sesion: SesionActiva,
): Promise<ResultadoMigracion> {
  if (!puede(sesion, "empresa:migrar")) return { ok: false, error: SIN_PERMISO };

  const { count } = await prisma.company.updateMany({
    where: { id: sesion.companyId, enMigracionAt: { not: null } },
    data: { enMigracionAt: null },
  });

  if (count > 0) await apuntar(sesion, "descongelar");

  return { ok: true };
}

/**
 * La guarda de empresa congelada, para las escrituras que NO son de obra.
 *
 * POR QUE HACE FALTA APARTE. `motivoSiObraCerrada` ya cubre las setenta y
 * seis escrituras de obra, y ahi el congelado entra gratis porque el estado
 * de la empresa viaja en la misma consulta. Pero crear un usuario, dar de
 * alta un contratista o guardar una forma de pago no pasan por alli, y esas
 * tres tablas SI viajan en el archivo.
 *
 * LO QUE PASARIA SIN ESTO, que es peor que un dato de mas: la exportacion lee
 * los contratistas al principio y las partidas cuarenta consultas despues. Un
 * contratista dado de alta en medio no estaria en el archivo, pero SI la
 * partida que lo nombra. En destino, esa partida apunta a alguien que no
 * llego. No es una fila de menos: es una referencia rota que aparece semanas
 * despues, en otra instalacion, sin nadie a quien preguntar.
 *
 * Devuelve el mensaje o `null`, igual que su hermana de obra, para que ningun
 * servicio se invente su propia forma de explicarlo.
 */
export async function motivoSiEmpresaEnMigracion(
  companyId: string,
): Promise<string | null> {
  const fila = await prisma.company.findUnique({
    where: { id: companyId },
    select: { enMigracionAt: true },
  });

  if (fila?.enMigracionAt == null) return null;

  return (
    "La empresa está en migración: se está sacando entera para llevarla a " +
    "otra instalación, y mientras dura no admite cambios. Cuando termine, " +
    "el administrador la saca de ese estado."
  );
}

/**
 * El apunte de auditoria.
 *
 * Cuelga del `count` y no de la pulsacion: un apunte por cada clic llenaria
 * la auditoria de «congelar» repetidos que no congelaron nada, y encontrar
 * el que si lo hizo costaria mas que no tener el apunte.
 */
async function apuntar(
  sesion: SesionActiva,
  evento: "congelar" | "descongelar",
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "Company",
      entidadId: sesion.companyId,
      accion: "UPDATE",
      despues: { evento, por: `${sesion.nombres} ${sesion.apellidos}`.trim() },
    },
  });
}
