import "server-only";

import { rm } from "node:fs/promises";
import { join } from "node:path";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { verifyPassword } from "@/lib/password";
import {
  TABLAS_MIGRACION,
  filtroPorEmpresa,
} from "@/lib/respaldo-empresa-esquema";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Borrar una constructora entera: sus obras, su gente y sus archivos.
 *
 * Es la operacion mas destructiva de GCM —el borrado de una obra multiplicado
 * por todas las obras, mas la empresa— y de la que menos se vuelve. Vive en su
 * propio modulo, hermano de `obra-borrado`, para poder leerse de una sentada.
 *
 * CINCO PUERTAS, todas comprobadas ANTES de tocar una sola fila:
 *
 *  1. Quien opera GCM. Ningun permiso del dominio abre esto.
 *  2. Nunca la empresa propia: el operador se borraria a si mismo.
 *  3. CONGELADA. Es el equivalente de «obra CERRADA»: una empresa viva sigue
 *     escribiendo mientras se borra.
 *  4. EXPORTADA hace poco, con recibo. Sin esa constancia, borrar es destruir
 *     los datos de un cliente sin que nadie tenga una copia.
 *  5. La razon social tecleada y la contrasena de quien borra.
 *
 * LO QUE SOBREVIVE, por decision expresa (19/08/2026): `audit_logs`, los
 * recibos de respaldo de obra (`respaldos_obra`) y los de exportacion
 * (`exportaciones_empresa`). Las tres carecen de clave foranea a `companies`
 * justamente para eso: son la prueba de que la empresa existio, de que se le
 * entrego su informacion y de que alguien la borro.
 */

/// Cuanto vale una exportacion antes de considerarla vieja para borrar. El
/// mismo numero que el respaldo de una obra: si la empresa siguio trabajando
/// desde entonces, lo exportado ya no es lo que se va a destruir.
export const EXPORTACION_VIGENTE_HORAS = 24;

export interface ConfirmacionBorradoEmpresa {
  /// La razon social, tecleada. Convierte un clic en un acto deliberado.
  razonSocialEscrita: string;
  /// La contrasena de quien borra. Protege el caso real: la sesion abierta y
  /// el ordenador sin bloquear.
  clave: string;
}

export type ResultadoBorradoEmpresa =
  | { ok: true; borradas: Record<string, number> }
  | { ok: false; error: string };

/**
 * Por que esta constructora NO se puede borrar todavia, para pintarlo en la
 * pantalla ANTES de que alguien teclee su contrasena para nada.
 *
 * Devuelve el MISMO motivo que rechazaria el borrado, no uno parecido: si la
 * pantalla explicara una cosa y el servicio otra, la gente probaria a ver.
 * `null` = se puede.
 */
export async function motivoSiNoSePuedeBorrar(
  sesion: SesionActiva,
  empresaId: string,
): Promise<string | null> {
  if (!sesion.esOperador) return "Esto es solo para quien opera GCM.";
  if (empresaId === sesion.companyId) {
    return "No puedes eliminar tu propia empresa.";
  }

  const empresa = await prisma.company.findUnique({
    where: { id: empresaId },
    select: { enMigracionAt: true },
  });
  if (!empresa) return "Constructora no encontrada.";

  if (empresa.enMigracionAt === null) {
    return (
      "Antes de eliminarla hay que ponerla en migración. Mientras no esté " +
      "congelada su gente sigue trabajando, y se estaría borrando algo que " +
      "cambia mientras se borra."
    );
  }

  if ((await exportacionUtilizable(empresaId)) === null) {
    return (
      `No consta que se haya exportado entera en las últimas ` +
      `${EXPORTACION_VIGENTE_HORAS} horas. Sin esa copia, esto destruye los ` +
      `datos de un cliente sin que nadie tenga otra.`
    );
  }

  return null;
}

/** La ultima exportacion, si vale para autorizar el borrado. */
async function exportacionUtilizable(empresaId: string) {
  const desde = new Date(Date.now() - EXPORTACION_VIGENTE_HORAS * 3600_000);
  return prisma.exportacionEmpresa.findFirst({
    where: { companyId: empresaId, createdAt: { gte: desde } },
    orderBy: { createdAt: "desc" },
    select: { id: true, hashManifiesto: true, createdAt: true, tamano: true, obras: true },
  });
}

export async function eliminarConstructora(
  sesion: SesionActiva,
  empresaId: string,
  confirmacion: ConfirmacionBorradoEmpresa,
): Promise<ResultadoBorradoEmpresa> {
  // Las cuatro primeras puertas, en el mismo sitio que las lee la pantalla.
  const motivo = await motivoSiNoSePuedeBorrar(sesion, empresaId);
  if (motivo) return { ok: false, error: motivo };

  const empresa = await prisma.company.findUnique({
    where: { id: empresaId },
    select: { id: true, razonSocial: true, ruc: true, createdAt: true },
  });
  if (!empresa) return { ok: false, error: "Constructora no encontrada." };

  if (confirmacion.razonSocialEscrita.trim() !== empresa.razonSocial.trim()) {
    return {
      ok: false,
      error:
        "La razón social no coincide. Escríbela exactamente como aparece " +
        "arriba.",
    };
  }

  const usuario = await prisma.user.findFirst({
    where: { id: sesion.userId, companyId: sesion.companyId },
    select: { passwordHash: true },
  });
  if (
    !usuario ||
    !(await verifyPassword(confirmacion.clave, usuario.passwordHash))
  ) {
    return { ok: false, error: "La contraseña no es correcta." };
  }

  const exportacion = await exportacionUtilizable(empresaId);
  if (!exportacion) {
    // Solo puede pasar si caduca entre la primera comprobacion y esta.
    return { ok: false, error: "La exportación dejó de ser reciente. Vuelve a exportarla." };
  }

  const obras = await prisma.project.findMany({
    where: { companyId: empresaId },
    select: { id: true },
  });
  const obraIds = obras.map((o) => o.id);

  // Se leen ANTES de borrar: despues, las filas ya no estan para decir donde
  // vivian los archivos. Se cuentan por obra, que es como estan en el disco.
  const [conEvidencia, conGaleria, conComprobantes] = await Promise.all([
    prisma.fotoEvidencia
      .findMany({
        where: { projectId: { in: obraIds } },
        select: { projectId: true },
      })
      .then(soloObras),
    prisma.fotoGaleria
      .findMany({
        where: { projectId: { in: obraIds } },
        select: { projectId: true },
      })
      .then(soloObras),
    prisma.comprobantePago
      .findMany({
        where: { pago: { encargo: { projectId: { in: obraIds } } } },
        select: { pago: { select: { encargo: { select: { projectId: true } } } } },
      })
      .then((filas) => [
        ...new Set(filas.map((f) => f.pago.encargo.projectId)),
      ]),
  ]);

  const borradas = await borrarLaEmpresa(sesion, empresa, obraIds, exportacion);

  // El disco NO participa de la transaccion, igual que en el borrado de una
  // obra: un archivo huerfano se recupera; una fila que apunta a un archivo
  // que ya no esta, no. Si esto falla, la empresa ya no existe igual.
  await borrarDelDisco("evidencia", conEvidencia);
  await borrarDelDisco("galeria", conGaleria);
  await borrarDelDisco("pagos", conComprobantes);

  /**
   * El logo, que es el unico archivo de EMPRESA y no de obra.
   *
   * Se borra a ciegas por extension porque `logoRuta` ya no existe —la fila se
   * fue con la empresa— y leerlo antes solo para esto seria una consulta mas
   * en el camino mas delicado del sistema.
   */
  for (const ext of ["png", "jpg", "jpeg", "webp", "svg"]) {
    await rm(join(env.STORAGE_ROOT, "logos", `${empresaId}.${ext}`), {
      force: true,
    }).catch(() => {});
  }

  return { ok: true, borradas };
}

/// Las obras DISTINTAS que aparecen en unas filas. Lo que hace falta del disco
/// no es cuantos archivos hay, sino que carpetas hay que quitar.
function soloObras(filas: readonly { projectId: string }[]): string[] {
  return [...new Set(filas.map((f) => f.projectId))];
}

async function borrarDelDisco(
  carpeta: string,
  obraIds: readonly string[],
): Promise<void> {
  for (const obraId of obraIds) {
    await rm(join(env.STORAGE_ROOT, carpeta, obraId), {
      recursive: true,
      force: true,
    }).catch(() => {});
  }
}

interface DelegadoBorrado {
  updateMany: (args: unknown) => Promise<{ count: number }>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
}

/**
 * El borrado propiamente dicho, hoja a raiz.
 *
 * Recorre el catalogo de migracion AL REVES, que es el mismo recorrido que usa
 * `deshacer` cuando una importacion falla. Se borra a mano y no se confia en
 * las cascadas: hay cinco `Restrict` hacia `companies` que ninguna cascada
 * resuelve, y fiarse del orden en que MariaDB encadena cuarenta tablas es como
 * se consigue un P2003 en produccion un domingo.
 *
 * A DIFERENCIA de `deshacer`, aqui NO se traga los errores: aquel es un
 * rollback y dejarlo a medias es mejor que no intentarlo; esto es un acto
 * auditable, y una empresa medio borrada tiene que fallar en alto para poder
 * reintentarse.
 */
async function borrarLaEmpresa(
  sesion: SesionActiva,
  empresa: { id: string; razonSocial: string; ruc: string; createdAt: Date },
  obraIds: readonly string[],
  exportacion: { id: string; hashManifiesto: string; createdAt: Date; tamano: number },
): Promise<Record<string, number>> {
  const borradas: Record<string, number> = {};

  await prisma.$transaction(
    async (tx) => {
      /**
       * El apunte va ANTES del borrado, como en el de obra.
       *
       * En `despues` viaja la referencia de la exportacion, y esa es la parte
       * que importa dentro de un ano: convierte el apunte en el RECIBO que ata
       * la constructora que ya no existe con el archivo que la contiene.
       *
       * Va con `companyId` de la empresa BORRADA y no con la del operador:
       * `audit_logs` no tiene clave foranea, asi que la fila sobrevive, y ese
       * companyId es lo unico que permitira volver a encontrarla.
       */
      await tx.auditLog.create({
        data: {
          companyId: empresa.id,
          userId: sesion.userId,
          entidad: "Company",
          entidadId: empresa.id,
          accion: "DELETE",
          antes: {
            razonSocial: empresa.razonSocial,
            ruc: empresa.ruc,
            altaAt: empresa.createdAt.toISOString(),
            obras: obraIds.length,
          },
          despues: {
            evento: "eliminar_constructora",
            exportacion: {
              id: exportacion.id,
              hashManifiesto: exportacion.hashManifiesto,
              generadoAt: exportacion.createdAt.toISOString(),
              tamano: exportacion.tamano,
            },
          },
        },
      });

      // Y otro en la empresa del OPERADOR: sin el, la unica constancia viviria
      // bajo un companyId que ya no corresponde a ninguna empresa, y su
      // pantalla de actividad no la mostraria jamas.
      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          entidad: "Company",
          entidadId: empresa.id,
          accion: "DELETE",
          despues: {
            evento: "eliminar_constructora",
            razonSocial: empresa.razonSocial,
            ruc: empresa.ruc,
          },
        },
      });

      for (const tabla of [...TABLAS_MIGRACION].reverse()) {
        const delegado = (tx as unknown as Record<string, DelegadoBorrado>)[
          tabla.modelo
        ]!;
        const donde = filtroPorEmpresa(tabla.tabla, empresa.id, obraIds);

        // Las jerarquias se rompen ANTES de borrarlas: un campo que apunta a
        // la propia tabla (`wbs_items.parentId`) y es Restrict hace fallar un
        // `deleteMany` sobre filas que se apuntan entre si. Se resuelve
        // generico, con el catalogo, y no tabla por tabla.
        for (const ref of tabla.refs.filter((r) => r.a === tabla.tabla)) {
          await delegado.updateMany({ where: donde, data: { [ref.campo]: null } });
        }

        const { count } = await delegado.deleteMany({ where: donde });
        if (count > 0) borradas[tabla.tabla] = count;
      }

      // Las que ningun catalogo cubre y hay que atender a mano.
      //
      // `envios_aviso` no tiene clave foranea: si no se borra, su unique
      // (projectId, canal, clave) deja claves RESERVADAS para siempre por
      // obras que ya no existen.
      const envios = await tx.envioAviso.deleteMany({
        where: { projectId: { in: [...obraIds] } },
      });
      if (envios.count > 0) borradas.envios_aviso = envios.count;

      // `avisos` tampoco lleva clave foranea a la empresa. Los de obra caen
      // con su obra, pero los que no cuelgan de ninguna se quedarian.
      const avisos = await tx.aviso.deleteMany({
        where: { companyId: empresa.id },
      });
      if (avisos.count > 0) borradas.avisos = avisos.count;

      /**
       * `mensajes_sms` SI se borra aqui, al reves que en el borrado de una
       * obra.
       *
       * Alli se anulaba porque la fila es el registro de lo que la empresa
       * gasto y eso se paga: la empresa seguia existiendo para pagarlo. Aqui
       * la empresa se va, asi que no queda nadie a quien cobrar ni pantalla
       * donde contarlo. Lo que SI se conserva es cuantos fueron, en el apunte
       * de auditoria de arriba, que es lo unico que se podria necesitar
       * despues.
       */
      const sms = await tx.mensajeSms.deleteMany({
        where: { companyId: empresa.id },
      });
      if (sms.count > 0) borradas.mensajes_sms = sms.count;

      // Lo mismo con el historial escrito a los contratistas: son de esta
      // empresa y no de otra.
      const mensajes = await tx.mensajeContratista.deleteMany({
        where: { companyId: empresa.id },
      });
      if (mensajes.count > 0) borradas.mensajes_contratista = mensajes.count;

      // `solicitudes_cambio_perfil` es Restrict hacia `companies`: si no se
      // borra, el `company.delete` de abajo falla con P2003.
      const solicitudes = await tx.solicitudCambioPerfil.deleteMany({
        where: { companyId: empresa.id },
      });
      if (solicitudes.count > 0) borradas.solicitudes_cambio_perfil = solicitudes.count;

      /**
       * Y la empresa. Lo ultimo, y lo unico que se borra por `delete`.
       *
       * Lo que cuelga con Cascade —`emisores_sms`, `remitentes_correo`,
       * `company_permissions`, `formas_pago_plantillas`— cae aqui. Lo que NO
       * cuelga se queda a proposito: `audit_logs`, `respaldos_obra` y
       * `exportaciones_empresa` son la prueba de que esto ocurrio.
       */
      await tx.company.delete({ where: { id: empresa.id } });
      borradas.companies = 1;
    },
    // Una constructora son cuarenta y tantas sentencias sobre TODAS sus obras
    // a la vez, no sobre una. El techo del borrado de obra se queda corto.
    { timeout: 300_000, maxWait: 20_000 },
  );

  return borradas;
}
