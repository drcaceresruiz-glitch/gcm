import { Readable } from "node:stream";

import { obtenerSesion } from "@/services/sesion.service";
import { generarRespaldoDeObra } from "@/services/respaldo.service";

/**
 * Descarga el respaldo completo de una obra cerrada.
 *
 * Ruta y no accion de servidor: una accion devuelve su resultado por el
 * payload de React, y por ahi no caben cientos de MB de fotos. Es el mismo
 * camino que ya usan el informe en PDF y la plantilla de presupuesto.
 *
 * La respuesta se TRANSMITE segun se arma el zip. Importa en este hosting:
 * LiteSpeed corta por lo que se tarda en EMPEZAR a responder, no por lo que
 * dure una respuesta que ya esta fluyendo.
 */
export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const resultado = await generarRespaldoDeObra(sesion, id);

  if (!resultado.ok) {
    // El texto sale del servicio: es el que explica si falta permiso, si la
    // obra no existe, o si todavia no esta cerrada.
    return new Response(resultado.error, { status: 400 });
  }

  const { archivo, nombreArchivo } = resultado.respaldo;

  return new Response(
    Readable.toWeb(archivo as Readable) as ReadableStream<Uint8Array>,
    {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
        // Un respaldo lleva la obra entera: no debe quedarse en ninguna cache
        // intermedia.
        "Cache-Control": "no-store",
      },
    },
  );
}
