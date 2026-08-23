import { obtenerSesion } from "@/services/sesion.service";
import { componerInforme } from "@/services/informe.service";
import { generarInformePdf } from "@/services/informe-pdf.service";
import { nombreArchivoInforme } from "@/lib/informe-documento";
import { bytesDelLogo } from "@/services/logo.service";
import { archivoEvidencia } from "@/services/evidencia.service";
import { clavesDeLaBitacora } from "@/lib/informe-hoja-bitacora";

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

  /**
   * Las fotos de la bitacora, leidas AQUI y no dentro del generador.
   *
   * Mismo reparto que el logo: el modulo del PDF no sabe nada de la sesion ni
   * del disco. Y se leen SOLO las que la bitacora va a dibujar —de eso
   * responde `clavesDeLaBitacora`, que sale de la misma funcion que decide la
   * maquetacion—: una obra con seiscientas fotos no puede leerlas todas de
   * disco para acabar imprimiendo dieciocho.
   *
   * Cada lectura pasa por `archivoEvidencia`, con su filtro de empresa y su
   * permiso: que la foto salga en un PDF no la saca del control de acceso.
   */
  const claves = clavesDeLaBitacora({
    obra: datos.obra,
    empresa: datos.empresa,
    fechaCorte: datos.fechaCorte,
    activas: datos.activas,
    fotosPorUid: datos.fotosPorUid,
  });

  const bytes = new Map<string, { contenido: Buffer; mime: string }>();
  for (const clave of claves) {
    const archivo = await archivoEvidencia(sesion, clave);
    // Una foto purgada o sin permiso simplemente no viaja: el informe sale
    // igual y su marco queda vacio, que es mas honesto que no generar nada.
    if ("error" in archivo) continue;
    bytes.set(clave, { contenido: archivo.contenido, mime: archivo.mimeType });
  }

  const pdf = await generarInformePdf(
    datos,
    new Date(),
    await bytesDelLogo(sesion.companyId),
    { fotosPorUid: datos.fotosPorUid, bytes },
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
