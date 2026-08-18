import { obtenerSesion } from "@/services/sesion.service";
import { componerInforme } from "@/services/informe.service";
import { generarInformePdf } from "@/services/informe-pdf.service";
import { nombreArchivoInforme } from "@/lib/informe-documento";
import { bytesDelLogo } from "@/services/logo.service";

/**
 * El informe al corte en PDF, completo.
 *
 * Es el mismo documento que la hoja de calculo —sale de `documentoDelInforme`—
 * pero maquetado y firmado con el pie de la obra. Se genera al vuelo: no se
 * guarda ningun archivo, porque un informe es una foto a una fecha y siempre
 * se puede volver a tomar igual pidiendo esa fecha.
 *
 * El «Imprimir / Guardar PDF» del navegador sigue estando y no sobra: aquel
 * imprime LA PANTALLA —con sus graficos— y este trae las tablas completas, que
 * en la pantalla van recortadas a lo que cabe.
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
  // El logo se lee del disco aqui, no dentro del generador: asi el modulo del
  // PDF no necesita saber nada de la sesion ni de la base.
  const pdf = await generarInformePdf(
    datos,
    new Date(),
    await bytesDelLogo(sesion.companyId),
  );
  const nombre = nombreArchivoInforme(datos.obra, datos.fechaCorte, "pdf");

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
