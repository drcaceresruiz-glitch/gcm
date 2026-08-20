import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { alcanzaObra } from "@/lib/alcance-obras";
import type { SesionActiva } from "@/services/sesion.service";
import { sumar, dividir } from "@/lib/decimal";
import { cobertura } from "@/lib/mapeo-partidas";
import {
  cruceFisicoEconomico,
  type CapituloDelCruce,
  type PartidaDelCruce,
} from "@/lib/fisico-vs-economico";
import { obtenerCronograma } from "@/services/cronograma.service";
import { obtenerComprometido } from "@/services/ordenes.service";

export interface CruceDeObra {
  capitulos: CapituloDelCruce[];
  /// Que parte del presupuesto tiene tarea enlazada. Sin esto, los
  /// porcentajes se leen como si cubrieran la obra entera.
  coberturaPct: number;
  partidasSinTarea: number;
  /// Sin `orden:leer` no hay cifra de gasto, y decir «0 gastado» seria
  /// mentir: se dice que falta el permiso.
  sinPermisoDeCosto: boolean;
}

/**
 * Avance fisico contra avance economico, capitulo a capitulo.
 *
 * Junta tres fuentes que hoy no se hablan: el presupuesto (`WbsItem`), lo
 * imputado a ordenes aprobadas (`OrdenImputacion`) y el avance reportado desde
 * obra (`AvanceTarea`, via `obtenerCronograma`, que ya resuelve el desempate
 * por `createdAt` de la tabla append-only).
 *
 * El puente entre presupuesto y cronograma es `MapeoTareaPartida`, N:M y sin
 * campo de proporcion. Cuando una partida cuelga de varias tareas se toma la
 * MEDIA SIMPLE de sus avances: repartir por importe exigiria saber en que
 * proporcion cada tarea ejecuta la partida, y ese dato no existe. Es una
 * aproximacion, y por eso la cobertura se devuelve siempre al lado.
 */
export async function cruceDeObra(
  sesion: SesionActiva,
  obraId: string,
): Promise<CruceDeObra | null> {
  if (!puede(sesion, "partida:leer")) return null;
  if (!alcanzaObra(sesion, obraId)) return null;

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return null;

  const filas = await prisma.wbsItem.findMany({
    where: { projectId: obraId },
    select: { id: true, codigoPartida: true, descripcion: true, parcial: true },
  });
  if (filas.length === 0) return null;

  const partidas: PartidaDelCruce[] = filas.map((f) => ({
    codigo: f.codigoPartida,
    nombre: f.descripcion,
    parcial: f.parcial?.toString() ?? null,
  }));

  // --- El dinero: de id de partida a codigo, que es como indexa el cruce ---
  // `obtenerComprometido` trae LA definicion completa: encargos vigentes
  // repartidos mas ordenes sueltas aprobadas. Asi el cruce dice lo mismo que
  // la pantalla de ordenes, que es la unica forma de que ambos sean creibles.
  const codigoPorId = new Map(filas.map((f) => [f.id, f.codigoPartida]));
  const puedeCosto = puede(sesion, "orden:leer");
  const gastoPorCodigo = new Map<string, string>();
  if (puedeCosto) {
    for (const c of await obtenerComprometido(sesion, obraId)) {
      const codigo = codigoPorId.get(c.wbsItemId);
      if (!codigo) continue;
      // Una partida puede recibir varias lineas; `obtenerComprometido` ya
      // agrupa por partida, pero sumar es barato y no depende de eso.
      gastoPorCodigo.set(
        codigo,
        sumar([gastoPorCodigo.get(codigo) ?? "0.00", c.comprometido]),
      );
    }
  }

  // --- El avance fisico: mapeo tarea-partida cruzado con lo reportado ---
  const enlaces = await prisma.mapeoTareaPartida.findMany({
    where: { projectId: obraId },
    select: { uid: true, codigoPartida: true },
  });

  const avancePorCodigo = new Map<string, string>();
  if (enlaces.length > 0) {
    const vigente = await obtenerCronograma(sesion, obraId);
    if (vigente) {
      // Los resumenes no se miden: su porcentaje es un reflejo de sus hijas y
      // contarlo aqui seria contar el mismo trabajo dos veces.
      const pctPorUid = new Map(
        vigente.tareas
          .filter((t) => !t.esResumen)
          .map((t) => [t.uid, t.porcentajeReal]),
      );

      const porPartida = new Map<string, string[]>();
      for (const e of enlaces) {
        const pct = pctPorUid.get(e.uid);
        if (pct === undefined) continue;
        const previo = porPartida.get(e.codigoPartida);
        if (previo) previo.push(pct);
        else porPartida.set(e.codigoPartida, [pct]);
      }

      for (const [codigo, pcts] of porPartida) {
        const media = dividir(sumar(pcts), String(pcts.length), 2);
        if (media !== null) avancePorCodigo.set(codigo, media);
      }
    }
  }

  // `cobertura` habla el vocabulario del presupuesto (`descripcion`) y el
  // cruce el de la pantalla (`nombre`): son la misma fila con dos nombres.
  const cob = cobertura(
    enlaces,
    filas.map((f) => ({
      codigo: f.codigoPartida,
      descripcion: f.descripcion,
      parcial: f.parcial?.toString() ?? null,
    })),
  );

  return {
    capitulos: cruceFisicoEconomico(partidas, gastoPorCodigo, avancePorCodigo),
    coberturaPct: cob.porcentaje,
    partidasSinTarea: cob.partidasSinTarea,
    sinPermisoDeCosto: !puedeCosto,
  };
}
