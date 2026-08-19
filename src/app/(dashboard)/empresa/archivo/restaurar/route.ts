import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { revalidatePath } from "next/cache";

import { env } from "@/lib/env";
import { obtenerSesion } from "@/services/sesion.service";
import { restaurarObra } from "@/services/restauracion.service";

/**
 * Sube el respaldo de una obra y la recarga.
 *
 * RUTA Y NO ACCION DE SERVIDOR, igual que la importacion de una constructora
 * y por el mismo motivo: una accion tiene tope de cuerpo —24 MB en
 * `next.config.ts`— y aqui llega una obra con sus fotos.
 *
 * Y era un techo que MENTIA: la accion anterior comprobaba 40 MB y devolvia un
 * mensaje claro por encima de eso, pero cualquier archivo entre 24 y 40 moria
 * antes contra el framework, con un error opaco. Es exactamente el fallo que
 * el comentario de `next.config.ts` daba por resuelto para el `.mpp`, repetido
 * en la unica subida que ese inventario no conto.
 *
 * El zip se escribe a disco SEGUN LLEGA y se procesa desde alli: cargarlo
 * entero en memoria es justo lo que este hosting no aguanta. El temporal se
 * borra pase lo que pase.
 */
export async function POST(peticion: Request) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const datos = await peticion.formData();
  const archivo = datos.get("respaldo");

  if (!(archivo instanceof File) || archivo.size === 0) {
    return new Response("Elige el archivo .zip del respaldo.", { status: 400 });
  }

  const carpeta = join(env.STORAGE_ROOT, "tmp");
  const ruta = join(carpeta, `respaldo-${randomUUID()}.zip`);

  try {
    await mkdir(carpeta, { recursive: true });
    await pipeline(
      Readable.fromWeb(archivo.stream() as never),
      createWriteStream(ruta),
    );

    const r = await restaurarObra(sesion, ruta);

    if (!r.ok) return new Response(r.error, { status: 400 });

    // La obra restaurada aparece en el panel. Lo hacia la accion; ahora toca
    // hacerlo aqui o la lista se queda como estaba hasta la siguiente visita.
    revalidatePath("/panel");
    return Response.json(r.datos);
  } catch (e) {
    console.error("[restauracion] fallo no previsto", e);
    return new Response(
      "No se pudo restaurar. Si el archivo es el correcto y vuelve a fallar, " +
        "avisa: puede haber quedado una obra a medias.",
      { status: 500 },
    );
  } finally {
    await rm(ruta, { force: true }).catch(() => {});
  }
}
