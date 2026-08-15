import { obtenerSesion } from "@/services/sesion.service";
import {
  archivoGaleria,
  archivoGaleriaPublico,
} from "@/services/galeria.service";

/**
 * Sirve una foto de la galeria.
 *
 * Mismo principio que `/api/evidencia`: nada de URLs adivinables ni carpetas
 * publicas; las fotos viven fuera del arbol y este es el unico camino.
 *
 * Dos puertas, probadas en orden y nunca mezcladas:
 *
 * - **Sesion de usuario**: exige `galeria:leer` y filtra por EMPRESA. Ve la
 *   galeria completa, publicada o no.
 * - **Enlace del cliente** (`?g=<slug>`): sin permisos que mirar; el slug
 *   tiene que estar ACTIVO y la foto PUBLICADA. Despublicar una foto o rotar
 *   el enlace cierran esta puerta en el acto.
 *
 * El slug viaja en la query y no en una cabecera porque quien lo manda es un
 * `<img>` de una pagina publica: no hay JavaScript que pueda poner cabeceras,
 * y la URL de la pagina ya contiene el mismo slug un segmento mas arriba.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const sesion = await obtenerSesion();
  if (sesion) {
    // Con sesion pero sin acceso NO se cae a la puerta publica: seria darle
    // al usuario interno la vista del cliente y confundir dos autorizaciones.
    return responder(await archivoGaleria(sesion, id));
  }

  const slug = new URL(req.url).searchParams.get("g");
  if (slug) return responder(await archivoGaleriaPublico(slug, id));

  return new Response("No autorizado", { status: 401 });
}

type Resultado = { contenido: Buffer; mimeType: string } | { error: "no" };

function responder(resultado: Resultado): Response {
  if ("error" in resultado) {
    return new Response("No encontrada", { status: 404 });
  }

  return new Response(new Uint8Array(resultado.contenido), {
    headers: {
      "Content-Type": resultado.mimeType,
      // Privada e inmutable: el archivo de una foto no cambia nunca (borrar
      // la foto la hace desaparecer, no cambiar).
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
