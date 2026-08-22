import { obtenerSesion } from "@/services/sesion.service";
import { archivoAdjuntoNota } from "@/services/notas.service";

/**
 * Sirve un adjunto de una Nota.
 *
 * Mismo criterio que `api/evidencia/[id]`: nada de URLs adivinables ni
 * carpetas publicas. El archivo vive fuera del arbol de la app
 * (STORAGE_ROOT), asi que esta es la UNICA puerta hacia el. A diferencia de
 * evidencia, no hay flujo de pase de obra: adjuntar a una Nota es una accion
 * de sesion, no de campo con QR.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const resultado = await archivoAdjuntoNota(sesion, id);
  if ("error" in resultado) {
    return new Response("No encontrado", { status: 404 });
  }

  return new Response(new Uint8Array(resultado.contenido), {
    headers: {
      "Content-Type": resultado.mimeType,
      // El nombre original, para que al descargar no quede el id crudo.
      "Content-Disposition": `inline; filename="${resultado.nombreOriginal.replaceAll('"', "")}"`,
      // Privado e inmutable: un adjunto no cambia una vez subido.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
