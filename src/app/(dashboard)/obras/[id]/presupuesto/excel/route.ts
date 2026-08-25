import { obtenerSesion } from "@/services/sesion.service";
import { generarPresupuestoExcel } from "@/services/presupuesto-excel.service";
import type { DocumentoPresupuesto } from "@/services/presupuesto-documento.service";

/**
 * Los presupuestos en hoja de calculo, para trabajarlos.
 *
 * Misma forma que la ruta del PDF de al lado —los mismos tres documentos, el
 * mismo parametro `doc`, los mismos permisos— porque son el mismo presupuesto
 * con distinto envase. Lo que aqui NO hay es `ver`: un .xlsx no se abre en el
 * navegador, se descarga.
 *
 * Se genera al vuelo y no se guarda ningun archivo: un presupuesto es lo que
 * dice la base HOY, y guardarlo crearia una copia que se queda vieja sin que
 * nadie se entere.
 */

const DOCUMENTOS: DocumentoPresupuesto[] = ["contractual", "meta", "comparativa"];

export async function GET(
  peticion: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const url = new URL(peticion.url);

  const pedido = url.searchParams.get("doc") ?? "contractual";
  const documento = DOCUMENTOS.find((d) => d === pedido);
  if (!documento) return new Response("Documento no válido", { status: 400 });

  const r = await generarPresupuestoExcel(sesion, id, documento);
  if (!r.ok) return new Response(r.error, { status: r.estado });

  return new Response(new Uint8Array(r.bytes), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${r.nombre}"`,
      // Un presupuesto cambia en cuanto alguien corrige una partida: servir
      // una copia guardada seria trabajar sobre una cifra que ya no es.
      "Cache-Control": "no-store",
    },
  });
}
