import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { esPositivo } from "@/lib/decimal";
import {
  cobertura,
  importeCubiertoPorTarea,
  proponerPartidas,
  type Cobertura,
  type PartidaMapeable,
  type Propuesta,
} from "@/lib/mapeo-partidas";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Que partidas del presupuesto cubre cada tarea del cronograma.
 *
 * Es lo que permite ponderar el avance POR DINERO en vez de por duracion. La
 * logica de propuesta y de cobertura vive en `lib/mapeo-partidas`, que es pura
 * y se prueba sin base de datos; aqui solo queda lo que toca datos.
 *
 * Las propuestas NO SE GUARDAN: se calculan al vuelo cada vez. Que exista una
 * fila en la tabla significa que una persona la reviso y la acepto, y esa
 * distincion es justamente lo que hace fiable al mapeo.
 */

export interface TareaParaMapear {
  uid: number;
  codigo: string | null;
  nombre: string;
  nivel: number;
  esResumen: boolean;
  /// Lo ya confirmado para esta tarea.
  enlazadas: { codigo: string; descripcion: string; parcial: string | null }[];
  /// Importe que suma lo enlazado. Es el peso que aporta al avance.
  importe: string | null;
  /// Lo que GCM propone, calculado al vuelo. Nunca se guarda.
  propuestas: Propuesta[];
}

export interface MapeoDeObra {
  tareas: TareaParaMapear[];
  cobertura: Cobertura;
  /// Partidas costeables del presupuesto, para el buscador de la pantalla.
  partidas: PartidaMapeable[];
  fechaCorte: Date | null;
}

export async function obtenerMapeo(
  sesion: SesionActiva,
  obraId: string,
): Promise<MapeoDeObra | null> {
  if (!puede(sesion, "cronograma:leer") || !puede(sesion, "partida:leer")) {
    return null;
  }

  const cronograma = await prisma.cronograma.findFirst({
    where: { projectId: obraId, project: { companyId: sesion.companyId } },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: {
      fechaCorte: true,
      tareas: {
        orderBy: { fila: "asc" },
        select: {
          uid: true, codigo: true, nombre: true, nivel: true,
          esResumen: true, esHito: true,
        },
      },
    },
  });

  if (!cronograma) return null;

  const [items, enlaces] = await Promise.all([
    prisma.wbsItem.findMany({
      where: { projectId: obraId },
      orderBy: { orden: "asc" },
      select: { codigoPartida: true, descripcion: true, parcial: true },
    }),
    prisma.mapeoTareaPartida.findMany({
      where: { projectId: obraId },
      select: { uid: true, codigoPartida: true },
    }),
  ]);

  /**
   * Solo las partidas con importe POSITIVO.
   *
   * Los capitulos y las lineas de alcance no llevan importe propio, asi que no
   * son dinero que repartir. Y las de importe negativo —los «DESCUENTO
   * COMERCIAL» del presupuesto real— tampoco: no son trabajo que nadie
   * ejecute, sino un ajuste de precio. Ademas, un peso negativo en una media
   * ponderada esta roto de raiz: restaria avance en vez de sumarlo.
   *
   * Sin este filtro, la propuesta ofrecia «DESCUENTO COMERCIAL TRABAJOS
   * PRELIMINARES» como la partida que cubre el hito «Fin de trabajos
   * preliminares», que es exactamente el error que este modulo existe para
   * evitar.
   */
  const partidas: PartidaMapeable[] = items
    .filter((i) => i.parcial !== null && esPositivo(i.parcial.toString()))
    .map((i) => ({
      codigo: i.codigoPartida,
      descripcion: i.descripcion,
      parcial: i.parcial!.toString(),
    }));

  const porCodigo = new Map(partidas.map((p) => [p.codigo, p]));
  const importes = importeCubiertoPorTarea(enlaces, partidas);

  const porUid = new Map<number, string[]>();
  for (const e of enlaces) {
    porUid.set(e.uid, [...(porUid.get(e.uid) ?? []), e.codigoPartida]);
  }

  const tareas = cronograma.tareas
    /**
     * Ni resumenes ni hitos.
     *
     * El resumen no se mapea porque su dinero es el de sus hijas, y enlazarlo
     * contaria el mismo importe dos veces. El hito tampoco: dura cero dias y
     * marca un acontecimiento —«Fin de trabajos preliminares»—, no trabajo que
     * alguien ejecute. Proponiendoles partidas, los trece hitos de CRIOCORD
     * salian emparejados con lo primero que se les parecia de nombre.
     */
    .filter((t) => !t.esResumen && !t.esHito)
    .map((t) => {
      const codigos = porUid.get(t.uid) ?? [];
      const enlazadas = codigos
        .map((c) => porCodigo.get(c))
        .filter((p): p is PartidaMapeable => p !== undefined);

      return {
        uid: t.uid,
        codigo: t.codigo,
        nombre: t.nombre,
        nivel: t.nivel,
        esResumen: t.esResumen,
        enlazadas,
        importe: importes.get(t.uid) ?? null,
        // Solo se proponen partidas a las tareas que aun no tienen nada: con
        // algo confirmado, la lista de sugerencias estorba mas que ayuda.
        propuestas: codigos.length === 0 ? proponerPartidas(t, partidas) : [],
      };
    });

  return {
    tareas,
    cobertura: cobertura(enlaces, partidas),
    partidas,
    fechaCorte: cronograma.fechaCorte,
  };
}

export type ResultadoMapeo = { ok: true } | { ok: false; error: string };

/**
 * Confirma que una tarea cubre una partida.
 *
 * Es un acto de una PERSONA, y por eso se guarda quien y cuando: que la fila
 * exista significa que alguien lo reviso. La propuesta automatica no basta,
 * porque un mapeo equivocado no da ningun sintoma —la curva sale bonita y
 * miente— y en los archivos reales dos de cada tres coincidencias de codigo
 * apuntaban a otra partida.
 */
export async function confirmarEnlace(
  sesion: SesionActiva,
  obraId: string,
  uid: number,
  codigoPartida: string,
): Promise<ResultadoMapeo> {
  if (!puede(sesion, "cronograma:importar")) {
    return { ok: false, error: "No tienes permiso para editar el mapeo." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });

  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const [tarea, partida] = await Promise.all([
    prisma.tareaCronograma.findFirst({
      where: { uid, cronograma: { projectId: obraId } },
      select: { esResumen: true },
    }),
    prisma.wbsItem.findFirst({
      where: { projectId: obraId, codigoPartida },
      select: { parcial: true },
    }),
  ]);

  if (!tarea) return { ok: false, error: "Esa tarea no esta en el cronograma." };
  if (!partida) return { ok: false, error: "Esa partida no esta en el presupuesto." };

  if (tarea.esResumen) {
    return {
      ok: false,
      error:
        "Las tareas resumen no se mapean: su importe es el de sus tareas hijas, " +
        "y enlazarlas contaria el mismo dinero dos veces.",
    };
  }

  if (partida.parcial === null) {
    return {
      ok: false,
      error: "Esa partida no tiene importe propio, asi que no aporta peso al avance.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.mapeoTareaPartida.upsert({
      where: { projectId_uid_codigoPartida: { projectId: obraId, uid, codigoPartida } },
      update: { confirmadoPor: quien(sesion), confirmadoAt: new Date() },
      create: {
        projectId: obraId,
        uid,
        codigoPartida,
        confirmadoPor: quien(sesion),
      },
    });

    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        projectId: obraId,
        entidad: "MapeoTareaPartida",
        entidadId: `${uid}-${codigoPartida}`.slice(0, 40),
        accion: "CREATE",
        despues: { uid, codigoPartida },
      },
    });
  });

  return { ok: true };
}

export async function quitarEnlace(
  sesion: SesionActiva,
  obraId: string,
  uid: number,
  codigoPartida: string,
): Promise<ResultadoMapeo> {
  if (!puede(sesion, "cronograma:importar")) {
    return { ok: false, error: "No tienes permiso para editar el mapeo." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  // El filtro por empresa va en el borrado mismo: sin el, bastaria con
  // cambiar el identificador de obra para deshacer el mapeo de otro cliente.
  const { count } = await prisma.mapeoTareaPartida.deleteMany({
    where: {
      projectId: obraId,
      uid,
      codigoPartida,
      project: { companyId: sesion.companyId },
    },
  });

  if (count === 0) return { ok: false, error: "Ese enlace ya no existe." };

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "MapeoTareaPartida",
      entidadId: `${uid}-${codigoPartida}`.slice(0, 40),
      accion: "DELETE",
      antes: { uid, codigoPartida },
    },
  });

  return { ok: true };
}

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}
