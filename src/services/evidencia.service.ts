import "server-only";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { env } from "@/lib/env";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import { motivoNoAdmiteCambios } from "@/lib/obras";
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
  | { compromisoId: string }
  /// Una tarea del cronograma, por su uid. `obraId` viaja explicito porque el
  /// uid no es una FK de la que derivar la obra —es estable entre versiones—,
  /// asi que la pertenencia se comprueba contra el (obraId, companyId), no
  /// siguiendo una relacion. `fecha` es el dia que documenta (el del parte).
  | { obraId: string; uid: number; fecha: string };

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

  // La foto de una tarea (parte del dia / partida en ejecucion) la sube quien
  // reporta avance. El obraId viene en el destino y se verifica contra la
  // empresa: es lo unico que impide adosar en una obra ajena.
  if ("uid" in destino) {
    if (!puede(sesion, "avance:registrar")) return null;

    const obra = await prisma.project.findFirst({
      where: { id: destino.obraId, companyId: sesion.companyId },
      select: { id: true },
    });
    return obra ? { obraId: obra.id } : null;
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
    return { ok: false, error: "No tienes permiso para subir evidencia aquí." };
  }

  // Subir evidencia documenta trabajo que ya estaba en curso, no abre nada
  // nuevo: se permite en obra paralizada.
  const cerrada = await motivoSiObraCerrada(sesion, objetivo.obraId, {
    permiteEnParalizada: true,
  });
  if (cerrada) return { ok: false, error: cerrada };

  return guardarFoto(
    {
      companyId: sesion.companyId,
      obraId: objetivo.obraId,
      autor: quien(sesion),
      userId: sesion.userId,
      paseId: null,
    },
    destino,
    archivo,
    nota,
  );
}

/**
 * Sube evidencia con un PASE DE OBRA, no con una sesion de usuario.
 *
 * Es una puerta aparte a proposito. El pase no tiene rol ni permisos —ni
 * siquiera encaja en `puede()`—, asi que aqui no se comprueba ninguno: su
 * derecho ES adjuntar fotos, y lo unico que hay que verificar es que el
 * destino pertenezca a SU obra. Compartir la funcion con la de arriba
 * obligaria a mezclar dos modelos de autorizacion en el mismo `if`, que es
 * como se cuelan los agujeros.
 */
export async function subirEvidenciaConPase(
  pase: { paseId: string; obraId: string; companyId: string; nombre: string },
  destino: DestinoEvidencia,
  archivo: File,
  nota?: string,
): Promise<ResultadoSubida> {
  // Un pase de obra documenta restricciones y compromisos, no reporta avance:
  // el parte del dia lo llena el residente, con sesion. Cerrar esta puerta
  // aqui evita que un pase escriba fotos de progreso sin el permiso que si se
  // exige por la via normal.
  if ("uid" in destino) {
    return { ok: false, error: "Un pase de obra no reporta avance de tareas." };
  }

  // Que el destino sea de SU obra. El `projectId` sale de la fila del pase,
  // nunca de la peticion: es lo unico que impide que un pase de una obra
  // adjunte en otra cambiando un id en el formulario.
  const suyo =
    "restriccionId" in destino
      ? await prisma.restriccion.findFirst({
          where: {
            id: destino.restriccionId,
            tarea: { projectId: pase.obraId },
          },
          select: { id: true },
        })
      : await prisma.compromisoSemanal.findFirst({
          where: {
            id: destino.compromisoId,
            plan: { projectId: pase.obraId },
          },
          select: { id: true },
        });

  if (!suyo) {
    return { ok: false, error: "Esa tarea no es de tu obra." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: pase.obraId },
    select: {
      estado: true,
      archivadaEn: true,
      company: { select: { enMigracionAt: true } },
    },
  });
  const noAdmite =
    obra &&
    motivoNoAdmiteCambios(
      {
        estado: obra.estado,
        archivadaEn: obra.archivadaEn,
        empresaEnMigracion: obra.company.enMigracionAt !== null,
      },
      // Mismo criterio que `subirEvidencia`: documenta, no abre.
      { permiteEnParalizada: true },
    );
  if (noAdmite) return { ok: false, error: noAdmite };

  return guardarFoto(
    {
      companyId: pase.companyId,
      obraId: pase.obraId,
      autor: pase.nombre,
      userId: null,
      paseId: pase.paseId,
    },
    destino,
    archivo,
    nota,
  );
}

/**
 * El nucleo compartido: validar el archivo, guardarlo fuera del arbol y
 * dejar el rastro. Quien llama ya comprobo que puede.
 */
async function guardarFoto(
  autor: {
    companyId: string;
    obraId: string;
    /// Nombre que queda firmando la foto.
    autor: string;
    /// Uno de los dos, nunca los dos.
    userId: string | null;
    paseId: string | null;
  },
  destino: DestinoEvidencia,
  archivo: File,
  nota?: string,
): Promise<ResultadoSubida> {
  const objetivo = { obraId: autor.obraId };
  const sesion = { companyId: autor.companyId, userId: autor.userId };

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
      uid: "uid" in destino ? destino.uid : null,
      // `@db.Date`: solo el dia. Se ancla a medianoche UTC como el resto de
      // fechas de obra, para que no baile de dia segun la zona horaria.
      fecha:
        "uid" in destino ? new Date(`${destino.fecha}T00:00:00.000Z`) : null,
      ruta: "", // se completa abajo, cuando se conoce el id
      nombreOriginal: archivo.name.slice(0, 255) || `foto${extension}`,
      mimeType: archivo.type,
      tamano: archivo.size,
      hash,
      nota: nota?.trim().slice(0, 300) || null,
      subidaPor: autor.autor,
      paseId: autor.paseId,
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
      // Vacio cuando la subio un pase de obra: no es un usuario. La columna
      // no tiene clave foranea, asi que es legitimo, y el nombre queda en
      // `despues` y en `subidaPor`.
      userId: sesion.userId,
      projectId: objetivo.obraId,
      entidad: "FotoEvidencia",
      entidadId: foto.id,
      accion: "CREATE",
      despues: {
        destino:
          "restriccionId" in destino
            ? "restriccion"
            : "compromisoId" in destino
              ? "compromiso"
              : "tarea",
        hash,
        tamano: archivo.size,
        ...(autor.paseId
          ? { paseId: autor.paseId, subidaPor: autor.autor }
          : {}),
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

  return agrupar(fotos);
}

/**
 * Las fotos ancladas a un conjunto de TAREAS (por uid), agrupadas por uid.
 *
 * Alimenta dos vistas con la misma consulta: el parte del dia (fotos de la
 * jornada) y la partida en ejecucion (todas las suyas). El filtro opcional por
 * fecha lo decide quien llama: el parte pasa el dia, la partida no pasa nada.
 */
export async function fotosDeTareas(
  sesion: SesionActiva,
  obraId: string,
  uids: number[],
  dia?: string,
): Promise<Map<number, FotoResumen[]>> {
  if (uids.length === 0) return new Map();

  const fotos = await prisma.fotoEvidencia.findMany({
    where: {
      projectId: obraId,
      project: { companyId: sesion.companyId },
      uid: { in: uids },
      ...(dia ? { fecha: new Date(`${dia}T00:00:00.000Z`) } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, uid: true, nota: true, nombreOriginal: true,
      subidaPor: true, createdAt: true, purgadaAt: true,
    },
  });

  const salida = new Map<number, FotoResumen[]>();
  for (const f of fotos) {
    if (f.uid === null) continue;
    const lista = salida.get(f.uid) ?? [];
    lista.push({
      id: f.id,
      nota: f.nota,
      nombreOriginal: f.nombreOriginal,
      subidaPor: f.subidaPor,
      createdAt: f.createdAt,
      purgada: f.purgadaAt !== null,
    });
    salida.set(f.uid, lista);
  }
  return salida;
}

/** Agrupa por su ancla (restriccion o compromiso). */
function agrupar(
  fotos: readonly {
    id: string; restriccionId: string | null; compromisoId: string | null;
    nota: string | null; nombreOriginal: string; subidaPor: string;
    createdAt: Date; purgadaAt: Date | null;
  }[],
): Map<string, FotoResumen[]> {
  const salida = new Map<string, FotoResumen[]>();

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
 * Las fotos de un conjunto de destinos, para un PASE.
 *
 * Sin comprobar permisos y filtrando por la obra del pase, que sale de su
 * fila y no de la peticion. Se decidio con el usuario que el personal de
 * campo vea tambien lo que subieron otros: evita que cuatro personas
 * fotografien el mismo frente y deja comprobar que la suya entro.
 */
export async function fotosPorDestinoDePase(
  obraId: string,
  destinos: { restricciones?: string[]; compromisos?: string[] },
): Promise<Map<string, FotoResumen[]>> {
  const fotos = await prisma.fotoEvidencia.findMany({
    where: {
      projectId: obraId,
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

  return agrupar(fotos);
}

/**
 * El archivo de una foto para un PASE: solo si es de SU obra.
 *
 * Puerta aparte por lo mismo que la subida: el pase no tiene permisos que
 * comprobar, tiene una obra.
 */
export async function archivoEvidenciaDePase(
  obraId: string,
  fotoId: string,
): Promise<{ contenido: Buffer; mimeType: string } | { error: "no" | "purgada" }> {
  const foto = await prisma.fotoEvidencia.findFirst({
    where: { id: fotoId, projectId: obraId },
    select: { ruta: true, mimeType: true, purgadaAt: true },
  });

  return leerArchivo(foto, fotoId);
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

  return leerArchivo(foto, fotoId);
}

/** Lee el archivo de disco. Comun a la sesion y al pase. */
async function leerArchivo(
  foto: { ruta: string; mimeType: string; purgadaAt: Date | null } | null,
  fotoId: string,
): Promise<{ contenido: Buffer; mimeType: string } | { error: "no" | "purgada" }> {
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
