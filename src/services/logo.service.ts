import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { puede } from "@/lib/rbac";
import { medirImagen } from "@/lib/imagen";
import type { SesionActiva } from "./sesion.service";

/**
 * El logo de la constructora.
 *
 * Calca la disciplina de `galeria.service` —el MIME decide la extension, se
 * hashea el contenido, el archivo vive fuera del arbol de la aplicacion— pero
 * **invierte el orden de escritura**, y conviene saber por que: alli la fila
 * se crea primero porque su `id` es lo que nombra al archivo. Aqui la fila ya
 * existe (es la empresa), asi que se escribe el archivo ANTES y solo despues
 * se apunta en la base. Si fallara el disco, la base seguiria apuntando al
 * logo viejo, que sigue estando; al reves quedaria apuntando a la nada.
 *
 * SOLO PNG Y JPG. No es gusto: el informe lo dibuja `pdf-lib`, que no sabe
 * incrustar nada mas, y en este hosting no hay con que convertir. Aceptar SVG
 * daria ademas un archivo que puede llevar scripts dentro.
 */

/// Lo que se acepta, y con que extension se guarda cada uno.
export const MIMES_LOGO: ReadonlyMap<string, string> = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
]);

/**
 * Un megabyte, no cinco como la galeria.
 *
 * Un logo son cuatro formas planas; lo que pesa mas que esto es una foto
 * disfrazada de logo. Y este viaja DENTRO de cada correo que manda la
 * empresa, asi que su peso se paga en cada envio, no una vez.
 */
export const TAMANO_MAXIMO_LOGO = 1024 * 1024;

export type ResultadoLogo = { ok: true } | { ok: false; error: string };

function raizAlmacen(): string {
  return resolve(env.STORAGE_ROOT);
}

export interface LogoEmpresa {
  /// Para pintarlo en el navegador. Lleva el hash como version para que al
  /// cambiarlo no se vea el viejo por la cache.
  src: string;
  alt: string;
  /// El tamano real. Se le pasa al `<img>` para que el navegador reserve el
  /// hueco correcto antes de descargarlo y la cabecera no pegue un salto.
  ancho: number;
  alto: number;
}

/** Lo que necesita la cabecera: la direccion del logo, o null si no hay. */
export async function logoDeEmpresa(sesion: SesionActiva): Promise<LogoEmpresa | null> {
  const empresa = await prisma.company.findUnique({
    where: { id: sesion.companyId },
    select: {
      razonSocial: true,
      logoRuta: true,
      logoHash: true,
      logoAncho: true,
      logoAlto: true,
    },
  });

  if (!empresa?.logoRuta || !empresa.logoHash) return null;

  return {
    src: `/api/logo?v=${empresa.logoHash.slice(0, 12)}`,
    alt: empresa.razonSocial,
    // Los logos subidos antes de que se midieran no tienen medida. Se cae a
    // una proporcion neutra en vez de a cero, que dejaria el hueco vacio.
    ancho: empresa.logoAncho ?? 160,
    alto: empresa.logoAlto ?? 48,
  };
}

/**
 * Los bytes del logo, para quien no puede pedirlos por HTTP.
 *
 * El PDF y el correo se arman en el servidor y no tienen sesion con la que
 * llamar a la ruta: leen el archivo directamente. Devuelve null sin ruido si
 * no hay logo o si el archivo se perdio —un informe sin logo es un informe;
 * un informe que revienta, no—.
 */
export async function bytesDelLogo(
  companyId: string,
): Promise<{ contenido: Buffer; mime: string } | null> {
  const empresa = await prisma.company.findUnique({
    where: { id: companyId },
    select: { logoRuta: true, logoMime: true },
  });

  if (!empresa?.logoRuta || !empresa.logoMime) return null;

  try {
    const contenido = await readFile(join(raizAlmacen(), empresa.logoRuta));
    return { contenido, mime: empresa.logoMime };
  } catch {
    // El archivo se perdio (un despliegue, un borrado a mano). La base sigue
    // diciendo que hay logo, pero no se puede leer: se sigue sin el.
    return null;
  }
}

/**
 * Con que se rotula un correo de esta empresa: su nombre y, si lo tiene, su
 * logo listo para incrustar.
 *
 * VAN JUNTOS a proposito. El nombre es lo que de verdad manda —el logo puede
 * no cargar, o no existir— y separarlos invitaria a poner el logo de una
 * empresa junto al nombre de otra.
 *
 * El logo en base64 porque es lo que espera nodemailer, y con nombre de
 * archivo porque un adjunto sin nombre lo ensenan algunos clientes como
 * «noname».
 */
export async function marcaParaCorreo(companyId: string): Promise<{
  razonSocial: string;
  logo: { nombre: string; contenido: string; tipo: string } | null;
} | null> {
  const empresa = await prisma.company.findUnique({
    where: { id: companyId },
    select: { razonSocial: true },
  });
  if (!empresa) return null;

  const logo = await bytesDelLogo(companyId);

  return {
    razonSocial: empresa.razonSocial,
    logo: logo
      ? {
          nombre: logo.mime === "image/png" ? "logo.png" : "logo.jpg",
          contenido: logo.contenido.toString("base64"),
          tipo: logo.mime,
        }
      : null,
  };
}

/** El logo servido por la ruta, con sesion y empresa ya comprobadas. */
export async function archivoLogo(
  sesion: SesionActiva,
): Promise<{ contenido: Buffer; mime: string } | null> {
  // Cualquiera que tenga sesion en la empresa ve su propio logo: sale en la
  // cabecera de todas las pantallas, asi que exigir un permiso para verlo
  // dejaria la cabecera rota a media plantilla.
  return bytesDelLogo(sesion.companyId);
}

export async function subirLogo(
  sesion: SesionActiva,
  archivo: File,
): Promise<ResultadoLogo> {
  if (!puede(sesion, "empresa:editar")) {
    return { ok: false, error: "No tienes permiso para cambiar el logo." };
  }

  // El MIME manda sobre el nombre: `logo.png.exe` se llama .exe y dice
  // llamarse .png.
  const extension = MIMES_LOGO.get(archivo.type);
  if (!extension) {
    return {
      ok: false,
      error:
        "El logo tiene que ser PNG o JPG. Son los únicos que también salen en el PDF del informe.",
    };
  }

  if (archivo.size === 0) return { ok: false, error: "El archivo está vacío." };
  if (archivo.size > TAMANO_MAXIMO_LOGO) {
    return {
      ok: false,
      error: `El logo no puede pasar de 1 MB, y este pesa ${(archivo.size / (1024 * 1024)).toFixed(1)} MB.`,
    };
  }

  const contenido = Buffer.from(await archivo.arrayBuffer());

  // LO QUE MANDA SON LOS BYTES, no `archivo.type`: ese lo pone el cliente y
  // renombrar un archivo cambia lo que dice ser. Aqui se comprueba que de
  // verdad es un PNG o un JPEG, y de paso se mide —la proporcion hace falta
  // para colocarlo sin deformarlo—.
  const medida = medirImagen(contenido);
  if (!medida) {
    return {
      ok: false,
      error: "Ese archivo no es un PNG ni un JPEG válido, aunque lo parezca por el nombre.",
    };
  }

  const esperado = medida.tipo === "png" ? "image/png" : "image/jpeg";
  if (esperado !== archivo.type) {
    return {
      ok: false,
      error: `El archivo dice ser ${archivo.type} pero por dentro es ${esperado}. Vuelve a exportarlo.`,
    };
  }

  const hash = createHash("sha256").update(contenido).digest("hex");

  const anterior = await prisma.company.findUnique({
    where: { id: sesion.companyId },
    select: { logoRuta: true },
  });

  const ruta = join("logos", `${sesion.companyId}${extension}`).replaceAll("\\", "/");
  const destino = join(raizAlmacen(), ruta);

  await mkdir(join(raizAlmacen(), "logos"), { recursive: true });
  await writeFile(destino, contenido);

  await prisma.company.update({
    where: { id: sesion.companyId },
    data: {
      logoRuta: ruta,
      logoMime: archivo.type,
      logoHash: hash,
      logoAncho: medida.ancho,
      logoAlto: medida.alto,
    },
  });

  // Si antes era .png y ahora es .jpg, el viejo se queda ocupando sitio y
  // ademas confunde a quien mire la carpeta. Se borra DESPUES de que la base
  // apunte al nuevo, nunca antes.
  if (anterior?.logoRuta && anterior.logoRuta !== ruta) {
    await rm(join(raizAlmacen(), anterior.logoRuta), { force: true }).catch(() => {});
  }

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "Company",
      entidadId: sesion.companyId,
      accion: "UPDATE",
      despues: { logo: "cambiado", hash, tamano: archivo.size },
    },
  });

  return { ok: true };
}

export async function quitarLogo(sesion: SesionActiva): Promise<ResultadoLogo> {
  if (!puede(sesion, "empresa:editar")) {
    return { ok: false, error: "No tienes permiso para cambiar el logo." };
  }

  const empresa = await prisma.company.findUnique({
    where: { id: sesion.companyId },
    select: { logoRuta: true },
  });

  // Primero la fila y despues el archivo: al reves, un fallo al actualizar
  // dejaria la base apuntando a un archivo ya borrado, y la cabecera con la
  // imagen rota. Un archivo huerfano no se ve.
  await prisma.company.update({
    where: { id: sesion.companyId },
    data: {
      logoRuta: null,
      logoMime: null,
      logoHash: null,
      logoAncho: null,
      logoAlto: null,
    },
  });

  if (empresa?.logoRuta) {
    await rm(join(raizAlmacen(), empresa.logoRuta), { force: true }).catch(() => {});
  }

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "Company",
      entidadId: sesion.companyId,
      accion: "UPDATE",
      despues: { logo: "quitado" },
    },
  });

  return { ok: true };
}
