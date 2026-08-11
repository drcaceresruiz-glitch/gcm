import "server-only";

import { prisma } from "@/lib/prisma";
import type { EventoAviso } from "@/generated/prisma/enums";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * La bandeja de avisos de una persona: la campanita.
 *
 * No lleva permiso porque no hay nada que permitir: cada quien ve LO SUYO, y
 * el filtro es su propio `userId`. Un permiso aqui solo podria quitarle a
 * alguien sus propios avisos.
 *
 * El "leido" es una columna y no `localStorage`, al contrario que en Actividad
 * reciente. Alli es una preferencia de quien mira; aqui es un hecho que hay
 * que poder consultar: si el aviso ya se vio, el reloj no tiene que insistir
 * por otro canal. Con localStorage, quien entra desde el movil y desde la
 * caseta tendria dos verdades distintas.
 */

const POR_PAGINA = 50;

export interface AvisoBandeja {
  id: string;
  evento: EventoAviso;
  titulo: string;
  cuerpo: string;
  /// Ruta absoluta a donde se arregla, ya montada con la obra.
  camino: string;
  obra: string;
  leido: boolean;
  createdAt: Date;
}

/**
 * Cuantos avisos sin leer tiene quien mira.
 *
 * Corre en CADA carga del area privada, asi que es un `count` con el indice
 * hecho a medida (`userId, leidoAt, createdAt`) y nada mas.
 */
export async function contarAvisosSinLeer(
  sesion: SesionActiva,
): Promise<number> {
  return prisma.aviso.count({
    where: { userId: sesion.userId, leidoAt: null },
  });
}

/** Los avisos de quien mira, lo mas nuevo primero. */
export async function misAvisos(
  sesion: SesionActiva,
): Promise<AvisoBandeja[]> {
  const filas = await prisma.aviso.findMany({
    where: { userId: sesion.userId },
    orderBy: { createdAt: "desc" },
    take: POR_PAGINA,
    select: {
      id: true,
      projectId: true,
      evento: true,
      titulo: true,
      cuerpo: true,
      camino: true,
      leidoAt: true,
      createdAt: true,
      project: { select: { nombreObra: true } },
    },
  });

  return filas.map((f) => ({
    id: f.id,
    evento: f.evento,
    titulo: f.titulo,
    cuerpo: f.cuerpo,
    camino: `/obras/${f.projectId}${f.camino}`,
    obra: f.project.nombreObra,
    leido: f.leidoAt !== null,
    createdAt: f.createdAt,
  }));
}

/**
 * Marca como leidos los avisos de quien mira.
 *
 * El `userId` va en el `where` y no se comprueba despues: asi, pasar el id de
 * un aviso ajeno no marca nada en vez de marcar el de otro. Y `leidoAt: null`
 * evita reescribir la fecha de lo que ya estaba leido, que borraria cuando se
 * vio de verdad.
 */
export async function marcarAvisosLeidos(
  sesion: SesionActiva,
  ids?: readonly string[],
): Promise<{ marcados: number }> {
  const { count } = await prisma.aviso.updateMany({
    where: {
      userId: sesion.userId,
      leidoAt: null,
      ...(ids && ids.length > 0 ? { id: { in: [...ids] } } : {}),
    },
    data: { leidoAt: new Date() },
  });
  return { marcados: count };
}
