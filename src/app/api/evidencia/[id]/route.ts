import { obtenerSesion } from "@/services/sesion.service";
import { archivoEvidencia } from "@/services/evidencia.service";

/**
 * Sirve una foto de evidencia.
 *
 * Nada de URLs adivinables ni carpetas publicas: cada lectura pasa por la
 * sesion y por el filtro de EMPRESA del servicio. Las fotos viven fuera del
 * arbol de la app, asi que este es el UNICO camino hacia ellas.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const resultado = await archivoEvidencia(sesion, id);

  if ("error" in resultado) {
    return resultado.error === "purgada"
      ? new Response(
          "La foto fue purgada del disco; su registro de auditoria se conserva.",
          { status: 410 },
        )
      : new Response("No encontrada", { status: 404 });
  }

  return new Response(new Uint8Array(resultado.contenido), {
    headers: {
      "Content-Type": resultado.mimeType,
      // Privada e inmutable: una foto de evidencia no cambia jamas (la
      // purga la hace desaparecer, no cambiar).
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
