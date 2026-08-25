import "server-only";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { env } from "@/lib/env";
import { generateToken } from "@/lib/tokens";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import type { AgrupacionGaleria } from "@/lib/galeria";
import type { SesionActiva } from "@/services/sesion.service";
import { alcanzaObra, FUERA_DE_ALCANCE } from "@/lib/alcance-obras";

/**
 * La galeria de la obra: fotos PARA ENSENAR, curadas, con enlace de cliente.
 *
 * Es deliberadamente un mundo aparte de `evidencia.service`, aunque comparta
 * disciplina de almacen (archivo en STORAGE_ROOT, nada por URL adivinable).
 * La evidencia es registro probatorio inmutable; la galeria SE CURA: se
 * describe, se publica foto a foto y, si una salio mal, se borra. Compartir
 * codigo entre las dos habria atado el escaparate al archivo probatorio.
 *
 * Reglas que este servicio hace cumplir y nadie mas:
 * - Toda lectura interna filtra por la EMPRESA de la sesion.
 * - La pagina publica solo existe con enlace ACTIVO, y solo ensena fotos
 *   con `visibleCliente`: publicar es decision de gerencia, foto a foto.
 * - Al cliente jamas se le dice QUIEN subio cada foto: los nombres del
 *   personal no son parte del escaparate.
 */

/// 5 MB, igual que la evidencia pero constante PROPIA: son mundos separados
/// y un cambio de tope en uno no debe arrastrar al otro sin decision.
export const TAMANO_MAXIMO_GALERIA = 5 * 1024 * 1024;

const MIMES_PERMITIDOS = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

function raizAlmacen(): string {
  return resolve(env.STORAGE_ROOT);
}

// ---------------------------------------------------------------------------
// Lectura interna
// ---------------------------------------------------------------------------

export interface FotoDeGaleria {
  id: string;
  titulo: string | null;
  descripcion: string | null;
  uid: number | null;
  visibleCliente: boolean;
  subidaPor: string;
  createdAt: Date;
}

export interface GaleriaDeObra {
  fotos: FotoDeGaleria[];
  agrupacion: AgrupacionGaleria;
  /// Solo con `galeria:publicar`; null para el resto. El slug es la URL del
  /// cliente y quien no decide sobre ella no necesita conocerla.
  enlace: { slug: string; activo: boolean } | null;
}

/** La galeria entera de una obra, para la pantalla interna. */
export async function listarGaleria(
  sesion: SesionActiva,
  obraId: string,
): Promise<GaleriaDeObra | null> {
  if (!puede(sesion, "galeria:leer")) return null;

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return null;

  const [fotos, config] = await Promise.all([
    prisma.fotoGaleria.findMany({
      where: { projectId: obraId, project: { companyId: sesion.companyId } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        titulo: true,
        descripcion: true,
        uid: true,
        visibleCliente: true,
        subidaPor: true,
        createdAt: true,
      },
    }),
    prisma.galeriaObra.findFirst({
      where: { projectId: obraId, project: { companyId: sesion.companyId } },
      select: { slug: true, activo: true, agrupacion: true },
    }),
  ]);

  return {
    fotos,
    agrupacion: config?.agrupacion ?? "SEMANA",
    enlace:
      config && puede(sesion, "galeria:publicar")
        ? { slug: config.slug, activo: config.activo }
        : null,
  };
}

// ---------------------------------------------------------------------------
// Subida y curaduria
// ---------------------------------------------------------------------------

export type ResultadoGaleria =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function subirFotoGaleria(
  sesion: SesionActiva,
  obraId: string,
  archivo: File,
  descripcion?: string,
): Promise<ResultadoGaleria> {
  if (!puede(sesion, "galeria:gestionar")) {
    return { ok: false, error: "No tienes permiso para subir fotos aquí." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) {
    return { ok: false, error: "No tienes permiso para subir fotos aquí." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const extension = MIMES_PERMITIDOS.get(archivo.type);
  if (!extension) {
    return { ok: false, error: "Solo se aceptan fotos JPG, PNG o WebP." };
  }
  if (archivo.size === 0) {
    return { ok: false, error: "El archivo llegó vacío." };
  }
  if (archivo.size > TAMANO_MAXIMO_GALERIA) {
    return {
      ok: false,
      error:
        "La foto supera los 5 MB. Vuelve a intentarlo: el navegador debería comprimirla solo.",
    };
  }

  const contenido = Buffer.from(await archivo.arrayBuffer());
  const hash = createHash("sha256").update(contenido).digest("hex");

  // Primero el registro (para tener el id que nombra al archivo), despues el
  // archivo, y si el disco falla se borra el registro. Mismo orden que la
  // evidencia y por el mismo motivo: nunca una fila que apunte a la nada.
  const foto = await prisma.fotoGaleria.create({
    data: {
      projectId: obraId,
      ruta: "", // se completa abajo, cuando se conoce el id
      nombreOriginal: archivo.name.slice(0, 255) || `foto${extension}`,
      mimeType: archivo.type,
      tamano: archivo.size,
      hash,
      descripcion: descripcion?.trim().slice(0, 500) || null,
      subidaPor: quien(sesion),
    },
  });

  const rutaRelativa = join("galeria", obraId, `${foto.id}${extension}`);

  try {
    await fs.mkdir(join(raizAlmacen(), "galeria", obraId), { recursive: true });
    await fs.writeFile(join(raizAlmacen(), rutaRelativa), contenido);
    await prisma.fotoGaleria.update({
      where: { id: foto.id },
      data: { ruta: rutaRelativa.replaceAll("\\", "/") },
    });
  } catch (e) {
    await prisma.fotoGaleria.delete({ where: { id: foto.id } });
    console.error("[galeria] No se pudo guardar el archivo:", e);
    return {
      ok: false,
      error: "No se pudo guardar la foto en el servidor. Inténtalo de nuevo.",
    };
  }

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "FotoGaleria",
      entidadId: foto.id,
      accion: "CREATE",
      despues: { hash, tamano: archivo.size },
    },
  });

  return { ok: true, id: foto.id };
}

/** Titulo y descripcion de una foto. La galeria se cura; esto es curarla. */
export async function editarFotoGaleria(
  sesion: SesionActiva,
  fotoId: string,
  datos: { titulo?: string; descripcion?: string },
): Promise<ResultadoGaleria> {
  if (!puede(sesion, "galeria:gestionar")) {
    return { ok: false, error: "No tienes permiso para editar la galería." };
  }

  const foto = await prisma.fotoGaleria.findFirst({
    where: { id: fotoId, project: { companyId: sesion.companyId } },
    select: { id: true, projectId: true },
  });
  if (!foto) return { ok: false, error: "Esa foto no existe." };

  /*
   * EL ALCANCE, sobre la obra de la FOTO y no sobre un id que venga de fuera.
   *
   * El `companyId` de arriba para en la puerta de la empresa; esto para en la
   * de la obra. `subirFotoGaleria` ya lo comprobaba —via `motivoSiObraCerrada`,
   * que lleva el alcance dentro— y sus hermanas no: un residente podia borrar
   * o retitular fotos de obras de su empresa que no gestiona.
   */
  if (!alcanzaObra(sesion, foto.projectId)) {
    return { ok: false, error: FUERA_DE_ALCANCE };
  }

  /*
   * ALTERAR EL REGISTRO de una obra cerrada es lo que la propia guarda dice
   * que no se puede: «el resultado de una obra cerrada es historia,
   * modificarlo falsearia lo que de verdad paso». Una foto borrada o
   * retitulada despues del cierre cambia lo que el expediente cuenta.
   *
   * `subirFotoGaleria` ya lo comprobaba; estas dos no, y esa incoherencia se
   * vio recorriendo la aplicacion el 24 de agosto de 2026: subir se rechazaba
   * y borrar pasaba.
   *
   * NO se cierran `marcarVisibleCliente` ni `gestionarEnlaceGaleria`: esas no
   * tocan el registro, deciden que se COMPARTE. Dejar de publicar una foto o
   * revocar el enlace del cliente tiene que funcionar siempre —son la salida
   * de privacidad, y una obra cerrada es justo cuando se usan—.
   */
  const cerrada = await motivoSiObraCerrada(sesion, foto.projectId);
  if (cerrada) return { ok: false, error: cerrada };

  await prisma.fotoGaleria.update({
    where: { id: foto.id },
    data: {
      titulo: datos.titulo?.trim().slice(0, 150) || null,
      descripcion: datos.descripcion?.trim().slice(0, 500) || null,
    },
  });

  return { ok: true, id: foto.id };
}

/**
 * Borra una foto: la fila Y el archivo.
 *
 * Al reves que la evidencia —que es probatoria y jamas se borra—, la galeria
 * es un escaparate: una foto movida, repetida o equivocada se quita. La fila
 * cae primero y el archivo despues; si el disco falla queda un archivo
 * huerfano, que es recuperable, y no una fila que apunta a la nada.
 */
export async function eliminarFotoGaleria(
  sesion: SesionActiva,
  fotoId: string,
): Promise<ResultadoGaleria> {
  if (!puede(sesion, "galeria:gestionar")) {
    return { ok: false, error: "No tienes permiso para editar la galería." };
  }

  const foto = await prisma.fotoGaleria.findFirst({
    where: { id: fotoId, project: { companyId: sesion.companyId } },
    select: { id: true, projectId: true, ruta: true, hash: true, nombreOriginal: true },
  });
  if (!foto) return { ok: false, error: "Esa foto no existe." };

  /*
   * EL ALCANCE, sobre la obra de la FOTO y no sobre un id que venga de fuera.
   *
   * El `companyId` de arriba para en la puerta de la empresa; esto para en la
   * de la obra. `subirFotoGaleria` ya lo comprobaba —via `motivoSiObraCerrada`,
   * que lleva el alcance dentro— y sus hermanas no: un residente podia borrar
   * o retitular fotos de obras de su empresa que no gestiona.
   */
  if (!alcanzaObra(sesion, foto.projectId)) {
    return { ok: false, error: FUERA_DE_ALCANCE };
  }

  await prisma.fotoGaleria.delete({ where: { id: foto.id } });

  if (foto.ruta) {
    await fs.rm(join(raizAlmacen(), foto.ruta), { force: true }).catch(() => {});
  }

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: foto.projectId,
      entidad: "FotoGaleria",
      entidadId: foto.id,
      accion: "DELETE",
      // La huella y el nombre quedan en el rastro: se borro el archivo, no
      // la memoria de que existio.
      antes: { hash: foto.hash, nombreOriginal: foto.nombreOriginal },
    },
  });

  return { ok: true, id: foto.id };
}

// ---------------------------------------------------------------------------
// Publicacion: que ve el cliente
// ---------------------------------------------------------------------------

/** Marca o desmarca una foto como visible en el enlace del cliente. */
export async function marcarVisibleCliente(
  sesion: SesionActiva,
  fotoId: string,
  visible: boolean,
): Promise<ResultadoGaleria> {
  if (!puede(sesion, "galeria:publicar")) {
    return { ok: false, error: "Publicar al cliente es una decisión de gerencia." };
  }

  const foto = await prisma.fotoGaleria.findFirst({
    where: { id: fotoId, project: { companyId: sesion.companyId } },
    select: { id: true, projectId: true },
  });
  if (!foto) return { ok: false, error: "Esa foto no existe." };

  /*
   * EL ALCANCE, sobre la obra de la FOTO y no sobre un id que venga de fuera.
   *
   * El `companyId` de arriba para en la puerta de la empresa; esto para en la
   * de la obra. `subirFotoGaleria` ya lo comprobaba —via `motivoSiObraCerrada`,
   * que lleva el alcance dentro— y sus hermanas no: un residente podia borrar
   * o retitular fotos de obras de su empresa que no gestiona.
   */
  if (!alcanzaObra(sesion, foto.projectId)) {
    return { ok: false, error: FUERA_DE_ALCANCE };
  }

  /*
   * ALTERAR EL REGISTRO de una obra cerrada es lo que la propia guarda dice
   * que no se puede: «el resultado de una obra cerrada es historia,
   * modificarlo falsearia lo que de verdad paso». Una foto borrada o
   * retitulada despues del cierre cambia lo que el expediente cuenta.
   *
   * Ver el comentario de `editarFotoGaleria`: misma razon.
   */
  const cerrada = await motivoSiObraCerrada(sesion, foto.projectId);
  if (cerrada) return { ok: false, error: cerrada };

  await prisma.fotoGaleria.update({
    where: { id: foto.id },
    data: { visibleCliente: visible },
  });

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: foto.projectId,
      entidad: "FotoGaleria",
      entidadId: foto.id,
      accion: "UPDATE",
      despues: { visibleCliente: visible },
    },
  });

  return { ok: true, id: foto.id };
}

export type ResultadoEnlace =
  | { ok: true; slug: string; activo: boolean }
  | { ok: false; error: string };

/**
 * Enciende, apaga o rota el enlace publico de la galeria.
 *
 * `rotar` genera un slug nuevo: el enlace viejo muere en el acto, que es lo
 * que se quiere cuando se compartio con quien ya no debe verlo. La fila se
 * crea aqui la primera vez; la galeria interna nunca la necesito.
 */
export async function gestionarEnlaceGaleria(
  sesion: SesionActiva,
  obraId: string,
  orden: "activar" | "desactivar" | "rotar",
): Promise<ResultadoEnlace> {
  if (!puede(sesion, "galeria:publicar")) {
    return { ok: false, error: "El enlace del cliente es una decisión de gerencia." };
  }

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true },
  });
  if (!obra) return { ok: false, error: "Esa obra no existe." };

  const existente = await prisma.galeriaObra.findFirst({
    where: { projectId: obraId },
    select: { id: true, slug: true, activo: true },
  });

  let slug = existente?.slug ?? generateToken();
  let activo: boolean;

  if (orden === "rotar") {
    slug = generateToken();
    // Rotar deja el enlace ENCENDIDO: quien rota esta repartiendo la llave
    // nueva, no cerrando la puerta. Para cerrarla esta "desactivar".
    activo = true;
  } else {
    activo = orden === "activar";
  }

  if (existente) {
    await prisma.galeriaObra.update({
      where: { id: existente.id },
      data: { slug, activo },
    });
  } else {
    await prisma.galeriaObra.create({
      data: { projectId: obraId, slug, activo },
    });
  }

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "GaleriaObra",
      entidadId: obraId,
      accion: "UPDATE",
      // El slug NO va al rastro: el registro diria la URL secreta a quien
      // lea auditoria, que puede ver mas gente que la que publica.
      despues: { orden, activo },
    },
  });

  return { ok: true, slug, activo };
}

// ---------------------------------------------------------------------------
// El lado publico: lo que ve el cliente con su enlace
// ---------------------------------------------------------------------------

export interface FotoPublica {
  id: string;
  titulo: string | null;
  descripcion: string | null;
  createdAt: Date;
}

export interface GaleriaPublica {
  obraNombre: string;
  agrupacion: AgrupacionGaleria;
  fotos: FotoPublica[];
}

/**
 * La galeria que abre el enlace del cliente. Sin sesion: la llave es el slug.
 *
 * Solo con el enlace ACTIVO, y solo fotos marcadas visibles. Y a proposito
 * NO devuelve `subidaPor`: los nombres del personal de obra no son parte del
 * escaparate y el cliente no los necesita.
 */
export async function galeriaPublica(
  slug: string,
): Promise<GaleriaPublica | null> {
  if (!slug) return null;

  const config = await prisma.galeriaObra.findFirst({
    where: { slug, activo: true },
    select: {
      projectId: true,
      agrupacion: true,
      project: { select: { nombreObra: true } },
    },
  });
  if (!config) return null;

  const fotos = await prisma.fotoGaleria.findMany({
    where: { projectId: config.projectId, visibleCliente: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, titulo: true, descripcion: true, createdAt: true },
  });

  return {
    obraNombre: config.project.nombreObra,
    agrupacion: config.agrupacion,
    fotos,
  };
}

// ---------------------------------------------------------------------------
// Servir el archivo
// ---------------------------------------------------------------------------

type Archivo =
  | { contenido: Buffer; mimeType: string }
  | { error: "no" };

/** El archivo de una foto, para un usuario con sesion. */
export async function archivoGaleria(
  sesion: SesionActiva,
  fotoId: string,
): Promise<Archivo> {
  if (!puede(sesion, "galeria:leer")) return { error: "no" };

  const foto = await prisma.fotoGaleria.findFirst({
    where: { id: fotoId, project: { companyId: sesion.companyId } },
    select: { ruta: true, mimeType: true },
  });

  return leerArchivo(foto, fotoId);
}

/**
 * El archivo de una foto, para el ENLACE del cliente. Puerta aparte, como la
 * del pase en evidencia: aqui no hay permisos que comprobar, hay un slug que
 * tiene que estar activo y una foto que tiene que estar publicada. Cambiar
 * la visibilidad de la foto cierra esta puerta en el acto.
 */
export async function archivoGaleriaPublico(
  slug: string,
  fotoId: string,
): Promise<Archivo> {
  if (!slug) return { error: "no" };

  const config = await prisma.galeriaObra.findFirst({
    where: { slug, activo: true },
    select: { projectId: true },
  });
  if (!config) return { error: "no" };

  const foto = await prisma.fotoGaleria.findFirst({
    where: { id: fotoId, projectId: config.projectId, visibleCliente: true },
    select: { ruta: true, mimeType: true },
  });

  return leerArchivo(foto, fotoId);
}

/** Lee el archivo de disco. Comun a la sesion y al enlace publico. */
async function leerArchivo(
  foto: { ruta: string; mimeType: string } | null,
  fotoId: string,
): Promise<Archivo> {
  if (!foto || !foto.ruta) return { error: "no" };

  try {
    const contenido = await fs.readFile(join(raizAlmacen(), foto.ruta));
    return { contenido, mimeType: foto.mimeType };
  } catch {
    console.error(`[galeria] Archivo ausente para la foto ${fotoId}`);
    return { error: "no" };
  }
}
