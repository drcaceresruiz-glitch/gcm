import "server-only";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { env } from "@/lib/env";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Evidencia fotografica (Last Planner): la foto adosada al dato donde se
 * decide.
 *
 * Reglas que este servicio hace cumplir y nadie mas:
 * - El archivo fisico vive en STORAGE_ROOT, FUERA del arbol de la app: un
 *   despliegue (que extrae un tar encima, y manana hara un swap atomico)
 *   jamas puede llevarse las fotos por delante.
 * - El registro en base es evidencia de auditoria: se crea, no se edita ni
 *   se borra. La purga futura eliminara el ARCHIVO y marcara `purgadaAt`.
 * - Nada se sirve por URL adivinable: leer un archivo pasa por aqui, con
 *   sesion, permiso y EMPRESA comprobados (multiempresa no se negocia).
 * - La compresion ocurre en el NAVEGADOR antes de llegar (LiteSpeed mata
 *   procesos lentos); aqui solo se valida tamano y tipo.
 */

/// 5 MB. La compresion del navegador deja ~150-400 KB; esto es la red de
/// seguridad para el que sube desde un navegador sin canvas.
export const TAMANO_MAXIMO = 5 * 1024 * 1024;

const MIMES_PERMITIDOS = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

export interface FotoResumen {
  id: string;
  nota: string | null;
  nombreOriginal: string;
  subidaPor: string;
  createdAt: Date;
  /// true = el archivo fisico ya no existe (purgado); queda solo el registro.
  purgada: boolean;
}

export type DestinoEvidencia =
  | { restriccionId: string }
  | { compromisoId: string };

export type ResultadoSubida =
  | { ok: true; id: string }
  | { ok: false; error: string };

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

/**
 * Resuelve el destino y devuelve la obra a la que pertenece, comprobando
 * permiso y EMPRESA. Devuelve null si no existe, no es de esta empresa o no
 * hay permiso: los tres casos se responden igual para no revelar que existe.
 */
async function resolverDestino(
  sesion: SesionActiva,
  destino: DestinoEvidencia,
): Promise<{ obraId: string } | null> {
  if ("restriccionId" in destino) {
    // La evidencia de una restriccion la sube quien gestiona el Lookahead.
    if (!puede(sesion, "lookahead:gestionar")) return null;

    const r = await prisma.restriccion.findFirst({
      where: {
        id: destino.restriccionId,
        tarea: { project: { companyId: sesion.companyId } },
      },
      select: { tarea: { select: { projectId: true } } },
    });
    return r ? { obraId: r.tarea.projectId } : null;
  }

  // La de un compromiso (causa de no cumplimiento), quien gestiona el PTS.
  if (!puede(sesion, "plan_semanal:gestionar")) return null;

  const c = await prisma.compromisoSemanal.findFirst({
    where: {
      id: destino.compromisoId,
      plan: { project: { companyId: sesion.companyId } },
    },
    select: { plan: { select: { projectId: true } } },
  });
  return c ? { obraId: c.plan.projectId } : null;
}

/** Raiz absoluta del almacen. */
function raizAlmacen(): string {
  return resolve(env.STORAGE_ROOT);
}

export async function subirEvidencia(
  sesion: SesionActiva,
  destino: DestinoEvidencia,
  archivo: File,
  nota?: string,
): Promise<ResultadoSubida> {
  const objetivo = await resolverDestino(sesion, destino);
  if (!objetivo) {
    return { ok: false, error: "No tienes permiso para subir evidencia aqui." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, objetivo.obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const extension = MIMES_PERMITIDOS.get(archivo.type);
  if (!extension) {
    return {
      ok: false,
      error: "Solo se aceptan fotos JPG, PNG o WebP.",
    };
  }

  if (archivo.size === 0) {
    return { ok: false, error: "El archivo llego vacio." };
  }
  if (archivo.size > TAMANO_MAXIMO) {
    return {
      ok: false,
      error: "La foto supera los 5 MB. Vuelve a intentarlo: el navegador deberia comprimirla solo.",
    };
  }

  const contenido = Buffer.from(await archivo.arrayBuffer());
  const hash = createHash("sha256").update(contenido).digest("hex");

  // Primero el registro (para tener el id que nombra al archivo), despues el
  // archivo, y si el disco falla se borra el registro: nunca queda un
  // registro que apunte a un archivo que no existe... salvo por purga, que
  // es explicita y queda marcada.
  const foto = await prisma.fotoEvidencia.create({
    data: {
      projectId: objetivo.obraId,
      restriccionId: "restriccionId" in destino ? destino.restriccionId : null,
      compromisoId: "compromisoId" in destino ? destino.compromisoId : null,
      ruta: "", // se completa abajo, cuando se conoce el id
      nombreOriginal: archivo.name.slice(0, 255) || `foto${extension}`,
      mimeType: archivo.type,
      tamano: archivo.size,
      hash,
      nota: nota?.trim().slice(0, 300) || null,
      subidaPor: quien(sesion),
    },
  });

  const rutaRelativa = join("evidencia", objetivo.obraId, `${foto.id}${extension}`);
  const rutaAbsoluta = join(raizAlmacen(), rutaRelativa);

  try {
    await fs.mkdir(join(raizAlmacen(), "evidencia", objetivo.obraId), {
      recursive: true,
    });
    await fs.writeFile(rutaAbsoluta, contenido);
    await prisma.fotoEvidencia.update({
      where: { id: foto.id },
      data: { ruta: rutaRelativa.replaceAll("\\", "/") },
    });
  } catch (e) {
    await prisma.fotoEvidencia.delete({ where: { id: foto.id } });
    console.error("[evidencia] No se pudo guardar el archivo:", e);
    return {
      ok: false,
      error: "No se pudo guardar la foto en el servidor. Intentalo de nuevo.",
    };
  }

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: objetivo.obraId,
      entidad: "FotoEvidencia",
      entidadId: foto.id,
      accion: "CREATE",
      despues: {
        destino: "restriccionId" in destino ? "restriccion" : "compromiso",
        hash,
        tamano: archivo.size,
      },
    },
  });

  return { ok: true, id: foto.id };
}

/**
 * Las fotos de un conjunto de restricciones o compromisos, agrupadas por su
 * ancla. Una consulta para toda la pantalla, no una por celda.
 */
export async function fotosPorDestino(
  sesion: SesionActiva,
  obraId: string,
  destinos: { restricciones?: string[]; compromisos?: string[] },
): Promise<Map<string, FotoResumen[]>> {
  const salida = new Map<string, FotoResumen[]>();

  const fotos = await prisma.fotoEvidencia.findMany({
    where: {
      projectId: obraId,
      project: { companyId: sesion.companyId },
      OR: [
        { restriccionId: { in: destinos.restricciones ?? [] } },
        { compromisoId: { in: destinos.compromisos ?? [] } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, restriccionId: true, compromisoId: true, nota: true,
      nombreOriginal: true, subidaPor: true, createdAt: true, purgadaAt: true,
    },
  });

  for (const f of fotos) {
    const clave = f.restriccionId ?? f.compromisoId;
    if (!clave) continue;
    const lista = salida.get(clave) ?? [];
    lista.push({
      id: f.id,
      nota: f.nota,
      nombreOriginal: f.nombreOriginal,
      subidaPor: f.subidaPor,
      createdAt: f.createdAt,
      purgada: f.purgadaAt !== null,
    });
    salida.set(clave, lista);
  }

  return salida;
}

/**
 * El archivo de una foto, para servirlo. Valida sesion implicita (quien
 * llama ya la tiene), EMPRESA y existencia fisica. Ver la evidencia solo
 * exige poder LEER el Lookahead o el plan semanal.
 */
export async function archivoEvidencia(
  sesion: SesionActiva,
  fotoId: string,
): Promise<{ contenido: Buffer; mimeType: string } | { error: "no" | "purgada" }> {
  if (!puede(sesion, "lookahead:leer") && !puede(sesion, "plan_semanal:leer")) {
    return { error: "no" };
  }

  const foto = await prisma.fotoEvidencia.findFirst({
    where: { id: fotoId, project: { companyId: sesion.companyId } },
    select: { ruta: true, mimeType: true, purgadaAt: true },
  });

  if (!foto || !foto.ruta) return { error: "no" };
  if (foto.purgadaAt) return { error: "purgada" };

  try {
    const contenido = await fs.readFile(join(raizAlmacen(), foto.ruta));
    return { contenido, mimeType: foto.mimeType };
  } catch {
    // El archivo no esta donde el registro dice: se responde como purgada
    // (el registro sigue siendo valido) y se deja rastro en el log.
    console.error(`[evidencia] Archivo ausente para la foto ${fotoId}`);
    return { error: "purgada" };
  }
}
