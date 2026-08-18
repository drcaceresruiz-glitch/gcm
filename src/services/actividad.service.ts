import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import {
  describirActividad,
  type ActividadLegible,
} from "@/lib/actividad";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Lo ultimo que ha pasado en la empresa.
 *
 * `AuditLog` guarda desde el primer dia quien hizo que y cuando, y **ninguna
 * pantalla lo leia**. De ahi sale el registro de actividad del panel, sin
 * anadir una sola tabla.
 */

export interface ActividadReciente extends ActividadLegible {
  id: string;
  cuando: Date;
  /// Quien lo hizo. Null si la fila no guardo usuario, o si ese usuario ya no
  /// existe: la auditoria sobrevive a las altas y bajas de personas.
  autor: string | null;
  /// La obra a la que pertenece, si la accion fue dentro de una.
  obra: { id: string; nombre: string } | null;
}

/**
 * Las acciones que NO son actividad de obra —ingresos, cambios de clave— se
 * descartan en la consulta y no despues: con cinco personas entrando cada
 * manana, filtrarlas en memoria obligaria a pedir cientos de filas para
 * quedarse con diez.
 */
const ACCIONES_DE_SESION = [
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_CHANGE",
  "PASSWORD_RESET",
] as const;

export async function listarActividad(
  sesion: SesionActiva,
  limite = 8,
): Promise<ActividadReciente[]> {
  // Sin permiso para ver obras no hay nada que contar: la actividad son
  // acciones sobre ellas.
  if (!puede(sesion, "obra:leer")) return [];

  const filas = await prisma.auditLog.findMany({
    where: {
      companyId: sesion.companyId,
      accion: { notIn: [...ACCIONES_DE_SESION] },
      /**
       * El alcance por obra tambien manda aqui, y NO es un detalle: la
       * actividad nombra la obra en cada linea. Sin esto, un residente sin
       * ninguna obra asignada veia un panel sin obras y debajo una lista
       * diciendo que en CRIOCORD se aprobo la meta y se contrato a un
       * proveedor. Lo cazo la comprobacion en el navegador; ni el typecheck
       * ni las pruebas de servicio miran esta pantalla.
       *
       * Los apuntes SIN obra (`projectId: null`) se quedan: son de empresa
       * —el catalogo de contratistas, que si es compartido, o los datos de la
       * constructora— y no cuentan nada de una obra ajena.
       */
      ...(sesion.obrasAsignadas === null
        ? {}
        : {
            OR: [
              { projectId: null },
              { projectId: { in: sesion.obrasAsignadas } },
            ],
          }),
    },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      userId: true,
      projectId: true,
      entidad: true,
      accion: true,
      antes: true,
      despues: true,
      createdAt: true,
    },
  });

  if (filas.length === 0) return [];

  // `AuditLog` no declara relaciones con `User` ni con `Project` —guarda los
  // identificadores sueltos para que la auditoria sobreviva al borrado de lo
  // auditado—, asi que los nombres se resuelven aparte y en una sola consulta
  // por tipo, no una por fila.
  const [autores, obras] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: { in: [...new Set(filas.map((f) => f.userId).filter(Boolean))] as string[] },
      },
      select: { id: true, nombres: true, apellidos: true },
    }),
    prisma.project.findMany({
      where: {
        id: { in: [...new Set(filas.map((f) => f.projectId).filter(Boolean))] as string[] },
        companyId: sesion.companyId,
      },
      select: { id: true, nombreObra: true, codigoObra: true },
    }),
  ]);

  const autorPorId = new Map(
    autores.map((u) => [u.id, `${u.nombres} ${u.apellidos}`.trim()]),
  );
  const obraPorId = new Map(obras.map((o) => [o.id, o]));

  return filas.map((f) => {
    const obra = f.projectId ? obraPorId.get(f.projectId) : undefined;

    return {
      id: f.id,
      cuando: f.createdAt,
      autor: f.userId ? (autorPorId.get(f.userId) ?? null) : null,
      obra: obra
        ? { id: obra.id, nombre: obra.codigoObra ?? obra.nombreObra }
        : null,
      ...describirActividad({
        entidad: f.entidad,
        accion: f.accion,
        antes: f.antes,
        despues: f.despues,
      }),
    };
  });
}
