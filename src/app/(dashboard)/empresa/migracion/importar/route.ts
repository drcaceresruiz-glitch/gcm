import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { env } from "@/lib/env";
import { obtenerSesion } from "@/services/sesion.service";
import { importarEmpresa } from "@/services/importacion-empresa.service";

/**
 * Sube el archivo de migracion y mete la constructora.
 *
 * RUTA Y NO ACCION DE SERVIDOR, por dos motivos que se suman:
 *
 * - Una accion de servidor tiene tope de tamano en el cuerpo, y aqui puede
 *   llegar una constructora con las fotos de treinta obras.
 * - La frase viaja en el cuerpo. En un GET iria en la barra de direcciones y
 *   de ahi al historial del navegador y al registro del servidor.
 *
 * El zip se escribe a disco SEGUN LLEGA y se procesa desde alli: cargarlo
 * entero en memoria es justo lo que este hosting no aguanta. El temporal se
 * borra pase lo que pase.
 */
export async function POST(peticion: Request) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const datos = await peticion.formData();
  const frase = String(datos.get("frase") ?? "");
  const archivo = datos.get("archivo");

  if (!(archivo instanceof File) || archivo.size === 0) {
    return new Response("Elige el archivo .zip de la migración.", {
      status: 400,
    });
  }

  const carpeta = join(env.STORAGE_ROOT, "tmp");
  const ruta = join(carpeta, `migracion-${randomUUID()}.zip`);

  try {
    await mkdir(carpeta, { recursive: true });
    await pipeline(
      Readable.fromWeb(archivo.stream() as never),
      createWriteStream(ruta),
    );

    const r = await importarEmpresa(sesion, ruta, frase);

    if (!r.ok) return new Response(r.error, { status: 400 });

    return Response.json(r.datos);
  } catch (e) {
    console.error("[migracion] fallo no previsto al importar", e);
    return new Response(
      "No se pudo importar. Lo que se hubiera escrito se ha deshecho, así que " +
        "puedes volver a intentarlo. Si vuelve a fallar con el mismo archivo, " +
        "avisa antes de seguir.",
      { status: 500 },
    );
  } finally {
    await rm(ruta, { force: true }).catch(() => {});
  }
}
