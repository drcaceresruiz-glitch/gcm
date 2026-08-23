import { obtenerSesion } from "@/services/sesion.service";
import {
  generarPresupuestoPdf,
  type DocumentoPresupuesto,
} from "@/services/presupuesto-pdf.service";

/**
 * Los presupuestos en PDF, para imprimir, guardar o adjuntar.
 *
 * Tres documentos en una sola ruta porque son el mismo dato con distinto
 * destinatario, y el parametro dice cual:
 *
 * - `contractual`: el que se firma con el cliente. Sin una sola cifra de
 *   costo.
 * - `meta`: interno. Lo que cuesta construir, con sus gastos generales.
 * - `comparativa`: los dos enfrentados, con la bolsa. Interno.
 *
 * Se generan al vuelo y no se guarda ningun archivo: un presupuesto es lo que
 * dice la base HOY, y guardarlo crearia una copia que se queda vieja sin que
 * nadie se entere.
 *
 * `inline` abre el PDF en el visor del navegador -desde donde se imprime con
 * Ctrl+P- y sin el se descarga. El boton de imprimir y el de descargar son la
 * misma ruta con distinto parametro.
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

  const r = await generarPresupuestoPdf(sesion, id, documento);
  if (!r.ok) return new Response(r.error, { status: r.estado });

  const enLinea = url.searchParams.get("ver") === "1";

  return new Response(new Uint8Array(r.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${enLinea ? "inline" : "attachment"}; filename="${r.nombre}"`,
      // Un presupuesto cambia en cuanto alguien corrige una partida: servir
      // una copia guardada seria enviar al cliente una cifra que ya no es.
      "Cache-Control": "no-store",
    },
  });
}
