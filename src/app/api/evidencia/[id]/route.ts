import { obtenerSesion } from "@/services/sesion.service";
import { obtenerPaseVigente } from "@/services/pase.service";
import {
  archivoEvidencia,
  archivoEvidenciaDePase,
} from "@/services/evidencia.service";

/**
 * Sirve una foto de evidencia.
 *
 * Nada de URLs adivinables ni carpetas publicas: cada lectura pasa por una de
 * las DOS puertas y por el filtro que le corresponde. Las fotos viven fuera
 * del arbol de la app, asi que este es el UNICO camino hacia ellas.
 *
 * Las dos puertas se prueban en orden y nunca se mezclan:
 *
 * - **Sesion de usuario**: filtra por EMPRESA y exige poder leer el Lookahead
 *   o el plan semanal.
 * - **Pase de obra**: no tiene permisos que mirar; filtra por la OBRA del
 *   pase, que sale de su fila en la base y jamas de la peticion.
 *
 * Se prueba primero la sesion porque quien la tiene ve mas: un residente que
 * ademas tuviera un pase abierto en el mismo navegador no debe quedarse con
 * la vista mas estrecha de las dos.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const sesion = await obtenerSesion();
  if (sesion) return responder(await archivoEvidencia(sesion, id));

  const pase = await obtenerPaseVigente();
  if (pase) return responder(await archivoEvidenciaDePase(pase.obraId, id));

  return new Response("No autorizado", { status: 401 });
}

type Resultado =
  | { contenido: Buffer; mimeType: string }
  | { error: "no" | "purgada" };

function responder(resultado: Resultado): Response {
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
