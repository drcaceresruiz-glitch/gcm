import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerOrdenParaImpresion } from "@/services/ordenes.service";
import { DocumentoOrden } from "@/components/ordenes/DocumentoOrden";
import { BarraImpresion } from "@/components/ui/BarraImpresion";

export const metadata: Metadata = { title: "Orden" };

/**
 * La orden en formato documento, lista para imprimir o guardar como PDF.
 *
 * Se puede abrir en cualquier estado. Un borrador hay que poder revisarlo
 * antes de aprobarlo, y de una anulada conviene guardar copia; es el propio
 * documento el que avisa de en cual esta, con un sello que tambien se imprime.
 */

export default async function ImprimirOrdenPage({
  params,
}: {
  params: Promise<{ id: string; ordenId: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id, ordenId } = await params;

  // `obtenerOrdenParaImpresion` ya filtra por empresa y por obra, y devuelve
  // null tanto si la orden no existe como si es de otra empresa. Un 404 en
  // los dos casos: distinguirlos confirmaria que ese id existe en otro sitio.
  const orden = await obtenerOrdenParaImpresion(sesion, id, ordenId);
  if (!orden) notFound();

  return (
    <div className="py-2 print:py-0">
      <BarraImpresion
        volverA={`/obras/${id}/ordenes`}
        volverTexto="Volver a las órdenes"
      />
      <DocumentoOrden orden={orden} />
    </div>
  );
}
