import { obtenerSesion } from "@/services/sesion.service";
import { componerInforme } from "@/services/informe.service";
import { generarCsv } from "@/lib/csv";
import { filasDelInformeCsv, nombreArchivoInformeCsv } from "@/lib/informe-csv";

/**
 * El informe al corte, en hoja de calculo.
 *
 * Misma fecha, mismos datos y mismo permiso que la pagina que lo imprime: el
 * `?corte=` de la URL es el de la pantalla, y el informe lo compone la MISMA
 * funcion, asi que el archivo descargado no puede decir algo distinto de lo
 * que se estaba mirando.
 *
 * Se genera al vuelo, sin guardar nada. Un informe no es un documento que se
 * archive aqui: es una foto de la obra a una fecha, y esa foto se puede volver
 * a tomar igual siempre que se pida la misma fecha.
 */
export async function GET(
  peticion: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const corte = new URL(peticion.url).searchParams.get("corte") ?? undefined;

  const informe = await componerInforme(sesion, id, corte);

  if (informe.estado === "sin-permiso") {
    return new Response("Sin permiso", { status: 403 });
  }
  if (informe.estado === "sin-obra") {
    return new Response("No encontrada", { status: 404 });
  }
  if (informe.estado === "sin-cronograma") {
    return new Response("La obra no tiene cronograma", { status: 404 });
  }

  const datos = informe.datos;
  const csv = generarCsv(filasDelInformeCsv(datos, new Date()));
  const nombre = nombreArchivoInformeCsv(datos.obra, datos.fechaCorte);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
