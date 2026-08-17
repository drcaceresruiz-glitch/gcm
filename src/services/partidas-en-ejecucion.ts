import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Que partidas de una obra YA SE ESTAN EJECUTANDO.
 *
 * «Ejecutandose» significa que alguien reporto avance contra ellas desde obra,
 * y eso convierte a la partida en historia: hay trabajo hecho y un contratista
 * al que pagarle, y ese pago sale del presupuesto. Una partida en ejecucion
 * que desaparece del presupuesto es dinero que se debe y no esta en ninguna
 * parte.
 *
 * SE AVERIGUA EN DOS SALTOS, y no hay atajo. El avance no cuelga de la partida
 * por clave ajena: se ancla al `uid` de la tarea del cronograma —para
 * sobrevivir a que se sustituya la version entera del cronograma— y lo que une
 * ese uid con la partida es `MapeoTareaPartida`, POR CODIGO. Por eso la base
 * no puede impedirlo sola y hay que preguntarlo aqui.
 *
 * Vive en su propio archivo porque lo necesitan tres sitios que no deben
 * depender entre si: borrar una partida, reemplazar el presupuesto entero, y
 * sincronizar la EDT.
 */
export async function partidasEnEjecucion(
  projectId: string,
  codigos?: readonly string[],
): Promise<string[]> {
  const mapeos = await prisma.mapeoTareaPartida.findMany({
    where: {
      projectId,
      ...(codigos ? { codigoPartida: { in: [...codigos] } } : {}),
    },
    select: { uid: true, codigoPartida: true },
  });

  if (mapeos.length === 0) return [];

  const conAvance = await prisma.avanceTarea.findMany({
    where: { projectId, uid: { in: mapeos.map((m) => m.uid) } },
    select: { uid: true },
    distinct: ["uid"],
  });

  if (conAvance.length === 0) return [];

  const vivos = new Set(conAvance.map((a) => a.uid));

  return [
    ...new Set(mapeos.filter((m) => vivos.has(m.uid)).map((m) => m.codigoPartida)),
  ].sort();
}

/**
 * Las partidas en ejecucion que NO estan en el conjunto de codigos entrante.
 *
 * Es la pregunta que se hace antes de reemplazar el presupuesto por un archivo
 * nuevo, o antes de sincronizar la EDT: de lo que ya se esta ejecutando, ¿que
 * se quedaria fuera?
 */
export async function partidasEnEjecucionQueDesaparecen(
  projectId: string,
  codigosQueSobreviven: ReadonlySet<string>,
): Promise<string[]> {
  const enMarcha = await partidasEnEjecucion(projectId);
  return enMarcha.filter((c) => !codigosQueSobreviven.has(c));
}
