import { obtenerSesion } from "@/services/sesion.service";
import { cronogramaXmlDeObra } from "@/services/plantilla-cronograma.service";

/**
 * La EDT de la obra en XML de MS Project, para planificarla en ProjectLibre.
 *
 * Hermana de `./plantilla`, que da lo mismo en Excel. Existen las dos porque
 * ProjectLibre no abre el Excel y quien planifica en una hoja de calculo no
 * quiere un XML.
 *
 * El permiso y el filtro por empresa los pone el servicio, que es la frontera.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const r = await cronogramaXmlDeObra(sesion, id);

  // 409 y no 404: la obra existe y se alcanza; lo que falta es su presupuesto.
  if (!r.ok) return new Response(r.error, { status: 409 });

  return new Response(r.contenido, {
    headers: {
      // `application/xml` y no `text/xml`: el navegador tiene que descargarlo,
      // no intentar pintarlo.
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${r.nombreArchivo}"`,
      // Lleva datos de la obra: que no se quede en ninguna cache intermedia.
      "Cache-Control": "no-store",
    },
  });
}
