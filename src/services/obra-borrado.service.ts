import "server-only";

import { rm } from "node:fs/promises";
import { join } from "node:path";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { alcanzaObra, FUERA_DE_ALCANCE } from "@/lib/alcance-obras";
import { env } from "@/lib/env";
import { verifyPassword } from "@/lib/password";
import { ORDEN_BORRADO, filtroPorObra } from "@/lib/respaldo-esquema";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Borrar de verdad una obra CERRADA, con todo lo que cuelga de ella.
 *
 * Es la unica operacion de GCM de la que no se vuelve. La auditoria conserva
 * QUE se borro, quien y cuando, pero no lo que habia: eso solo queda en el zip
 * que el administrador tenga guardado. Por eso el camino esta lleno de
 * puertas, y todas se comprueban ANTES de tocar una sola fila.
 *
 * Vive en su propio modulo y no en `obras.service` por lo mismo que
 * `obra-abierta`: para poder leerlo entero de una vez. Un borrado en cascada
 * de treinta tablas hay que poder revisarlo sin tener que saltar por encima de
 * mil doscientas lineas de listados y formularios.
 */

/** Cuanto vale un respaldo antes de considerarlo viejo para borrar. */
const RESPALDO_VIGENTE_HORAS = 24;

export interface ConfirmacionBorrado {
  /// El nombre de la obra, tecleado. Que no se pueda borrar sin escribirlo es
  /// lo que convierte un clic accidental en un acto deliberado.
  nombreEscrito: string;
  /// La contrasena de quien borra. Protege el caso real: la sesion abierta y
  /// el ordenador sin bloquear.
  clave: string;
}

export type ResultadoBorrado =
  | { ok: true; borradas: Record<string, number> }
  | { ok: false; error: string };

export async function eliminarObraCerrada(
  sesion: SesionActiva,
  obraId: string,
  confirmacion: ConfirmacionBorrado,
): Promise<ResultadoBorrado> {
  if (!puede(sesion, "obra:eliminar_cerrada")) {
    return {
      ok: false,
      error: "Solo el administrador de la empresa puede eliminar una obra cerrada.",
    };
  }

  // Hoy este permiso es INNEGOCIABLE y solo lo tiene el ADMIN, que ve todas
  // las obras: la guarda no cambia nada. Se pone igual porque el dia que se
  // delegue —el otro borrado, `obra:eliminar`, ya es delegable— este seria
  // el peor sitio del sistema para descubrir que faltaba.
  if (!alcanzaObra(sesion, obraId)) {
    return { ok: false, error: FUERA_DE_ALCANCE };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: {
      id: true,
      nombreObra: true,
      codigoObra: true,
      correlativo: true,
      estado: true,
      archivadaEn: true,
    },
  });
  if (!obra) return { ok: false, error: "No se encontro la obra." };

  if (obra.estado !== "CERRADA") {
    return {
      ok: false,
      error:
        "Solo se elimina una obra CERRADA. Una obra en planificacion, en " +
        "ejecucion o paralizada no se borra por aqui.",
    };
  }

  if (confirmacion.nombreEscrito.trim() !== obra.nombreObra.trim()) {
    return {
      ok: false,
      error:
        "El nombre no coincide con el de la obra. Escribelo exactamente como " +
        "aparece arriba.",
    };
  }

  const usuario = await prisma.user.findFirst({
    where: { id: sesion.userId, companyId: sesion.companyId },
    select: { passwordHash: true },
  });
  if (!usuario || !(await verifyPassword(confirmacion.clave, usuario.passwordHash))) {
    return { ok: false, error: "La contrasena no es correcta." };
  }

  // La copia de auditoria se salta el respaldo: ya ES un respaldo restaurado,
  // y exigir respaldar una copia para poder cerrarla seria dar vueltas.
  const respaldo = obra.archivadaEn ? null : await respaldoUtilizable(obraId);
  if (!obra.archivadaEn && !respaldo) {
    return {
      ok: false,
      error:
        `Antes de eliminar hay que descargar el respaldo completo de la obra. ` +
        `No consta ninguno de las ultimas ${RESPALDO_VIGENTE_HORAS} horas.`,
    };
  }

  // Se leen ANTES de borrar: despues, las filas ya no estan para decir donde
  // vivian los archivos.
  const [fotos, fotosGaleria, comprobantes] = await Promise.all([
    prisma.fotoEvidencia.findMany({
      where: { projectId: obraId },
      select: { ruta: true },
    }),
    prisma.fotoGaleria.findMany({
      where: { projectId: obraId },
      select: { ruta: true },
    }),
    prisma.comprobantePago.count({
      where: { pago: { encargo: { projectId: obraId } } },
    }),
  ]);

  const borradas = await borrarLaObra(sesion, obra, respaldo);

  // El disco NO participa de la transaccion. Va despues del commit y a
  // proposito: un archivo huerfano se recupera; una fila que apunta a un
  // archivo que ya no esta, no. Si esto falla, la obra ya no existe igual.
  if (fotos.length > 0) {
    await rm(join(env.STORAGE_ROOT, "evidencia", obraId), {
      recursive: true,
      force: true,
    }).catch(() => {});
  }
  if (fotosGaleria.length > 0) {
    await rm(join(env.STORAGE_ROOT, "galeria", obraId), {
      recursive: true,
      force: true,
    }).catch(() => {});
  }
  /**
   * Las constancias de pago.
   *
   * Hasta ahora se quedaban en el disco despues de borrar la obra: no era
   * perdida de datos —al reves— pero si documentos financieros de un
   * contratista sobreviviendo a un borrado que el administrador dio por
   * completo. Ahora que viajan en el zip se pueden limpiar, y la puerta de
   * arriba garantiza que el respaldo las llevaba.
   */
  if (comprobantes > 0) {
    await rm(join(env.STORAGE_ROOT, "pagos", obraId), {
      recursive: true,
      force: true,
    }).catch(() => {});
  }

  return { ok: true, borradas };
}

/**
 * Si consta un respaldo reciente y utilizable de esta obra.
 *
 * Solo para que la pantalla avise ANTES de que alguien teclee su contrasena
 * para nada. La comprobacion que manda es la de `eliminarObraCerrada`.
 */
export async function constaRespaldoReciente(
  sesion: SesionActiva,
  obraId: string,
): Promise<boolean> {
  if (!alcanzaObra(sesion, obraId)) return false;

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { archivadaEn: true },
  });
  if (!obra) return false;
  if (obra.archivadaEn) return true;

  return (await respaldoUtilizable(obraId)) !== null;
}

/** El ultimo respaldo de esta obra, si vale para autorizar el borrado. */
async function respaldoUtilizable(obraId: string) {
  const desde = new Date(Date.now() - RESPALDO_VIGENTE_HORAS * 3600_000);
  const respaldo = await prisma.respaldoObra.findFirst({
    where: { projectId: obraId, createdAt: { gte: desde } },
    orderBy: { createdAt: "desc" },
  });
  if (!respaldo) return null;

  // Un respaldo SIN las fotos no autoriza a borrar una obra QUE TIENE fotos:
  // seria borrar del disco unos archivos que no estan en ningun otro sitio.
  // Cuentan las de evidencia Y las de galeria: `conFotos` dice que las fotos
  // de la obra viajaron en el zip, vengan de donde vengan.
  if (!respaldo.conFotos) {
    const [evidencia, galeria, comprobantes] = await Promise.all([
      prisma.fotoEvidencia.count({
        where: { projectId: obraId, purgadaAt: null },
      }),
      prisma.fotoGaleria.count({ where: { projectId: obraId } }),
      // Las constancias de pago cuentan igual desde que viajan en el zip. Un
      // respaldo anterior a eso NO autoriza a borrar una obra que las tenga:
      // se llevaria del disco los PDF que prueban lo que se pago.
      prisma.comprobantePago.count({
        where: { pago: { encargo: { projectId: obraId } } },
      }),
    ]);
    if (evidencia > 0 || galeria > 0 || comprobantes > 0) return null;
  }

  return respaldo;
}

/** Lo minimo que hace falta de un delegado de Prisma para borrar. */
interface DelegadoBorrado {
  deleteMany: (args: unknown) => Promise<{ count: number }>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
}

interface ObraABorrar {
  id: string;
  nombreObra: string;
  codigoObra: string | null;
  correlativo: string | null;
  estado: string;
}

/**
 * El borrado propiamente dicho, hoja a raiz.
 *
 * Recorre `ORDEN_BORRADO`, que es el inverso EXACTO del orden en que el
 * respaldo monta las tablas —una sola constante, con una prueba que lo
 * comprueba—. Se borra a mano y no se confia en las cascadas: hay cinco
 * `Restrict` que ninguna cascada resuelve, y fiarse del orden en que MariaDB
 * las encadena a traves de treinta tablas es como se consigue un P2003 en
 * produccion un domingo.
 */
async function borrarLaObra(
  sesion: SesionActiva,
  obra: ObraABorrar,
  respaldo: { id: string; hashDatos: string; createdAt: Date; tamano: number } | null,
): Promise<Record<string, number>> {
  const borradas: Record<string, number> = {};

  await prisma.$transaction(
    async (tx) => {
      // El apunte va ANTES del borrado, como en `eliminarObra`: si algo
      // fallara despues, queda el intento registrado y no un borrado mudo.
      //
      // En `despues` viaja la referencia del respaldo, y esa es la parte que
      // importa dentro de un ano: convierte el apunte en el RECIBO que ata la
      // obra que ya no existe con el zip que la contiene.
      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: obra.id,
          entidad: "Project",
          entidadId: obra.id,
          accion: "DELETE",
          antes: {
            nombreObra: obra.nombreObra,
            codigoObra: obra.codigoObra,
            correlativo: obra.correlativo,
            estado: obra.estado,
          },
          despues: respaldo
            ? {
                respaldo: {
                  id: respaldo.id,
                  hashDatos: respaldo.hashDatos,
                  generadoAt: respaldo.createdAt.toISOString(),
                  tamano: respaldo.tamano,
                },
              }
            : { respaldo: null, motivo: "copia de auditoria restaurada" },
        },
      });

      for (const tabla of ORDEN_BORRADO) {
        const delegado = (tx as unknown as Record<string, DelegadoBorrado>)[
          tabla.modelo
        ]!;
        const donde = filtroPorObra(tabla.tabla, obra.id);

        // La jerarquia de partidas se rompe antes de borrarla: `parentId` es
        // autorreferente y `Restrict`, asi que un `deleteMany` sobre filas que
        // se apuntan entre si falla. Es lo mismo que ya hacia `eliminarObra`.
        if (tabla.tabla === "wbs_items") {
          await delegado.updateMany({ where: donde, data: { parentId: null } });
        }

        const { count } = await delegado.deleteMany({ where: donde });
        if (count > 0) borradas[tabla.tabla] = count;
      }

      // Las tres que no estan en el catalogo y hay que atender a mano.
      //
      // `envios_aviso` no tiene clave foranea: si no se borra, su unique
      // (projectId, canal, clave) deja claves RESERVADAS para siempre por una
      // obra que ya no existe.
      const envios = await tx.envioAviso.deleteMany({
        where: { projectId: obra.id },
      });
      if (envios.count > 0) borradas.envios_aviso = envios.count;

      // `mensajes_sms` se ANULA, no se borra: la fila es el registro de lo que
      // la empresa gasto en SMS, y eso se paga. Borrarla haria que la empresa
      // contara de menos. El texto ya se vacio al confirmar el envio.
      const sms = await tx.mensajeSms.updateMany({
        where: { projectId: obra.id },
        data: { projectId: null },
      });
      if (sms.count > 0) borradas.mensajes_sms = sms.count;

      // `mensajes_contratista` tambien se ANULA, por otro motivo: es el
      // historial de lo que se le ha escrito a un CONTRATISTA, y el
      // contratista es de la empresa —sigue trabajando en otras obras cuando
      // esta se cierra—. Borrarlo dejaria su ficha diciendo que nunca se le
      // aviso de nada, que es justo lo contrario de para lo que existe.
      const mensajes = await tx.mensajeContratista.updateMany({
        where: { projectId: obra.id },
        data: { projectId: null },
      });
      if (mensajes.count > 0) borradas.mensajes_contratista = mensajes.count;

      // `audit_logs` NO se borra, y es deliberado: es la prueba de que la obra
      // existio y, sobre todo, de que alguien la borro. Su `projectId` no
      // tiene clave foranea, asi que las filas se quedan apuntando a una obra
      // que ya no esta. La pantalla de actividad lo tiene en cuenta.
    },
    // El mismo techo que el importador de presupuesto: los cinco segundos que
    // Prisma concede por defecto no alcanzan para treinta sentencias sobre una
    // obra real.
    { timeout: 120_000, maxWait: 15_000 },
  );

  return borradas;
}
