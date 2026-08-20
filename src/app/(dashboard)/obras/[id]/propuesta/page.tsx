import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerPropuesta } from "@/services/propuesta.service";
import { DocumentoPropuesta } from "@/components/propuesta/DocumentoPropuesta";
import { BarraImpresion } from "@/components/ui/BarraImpresion";

export const metadata: Metadata = { title: "Propuesta" };

/**
 * La propuesta economica de la obra, lista para imprimir o guardar como PDF.
 *
 * Sin `?rev=` sale la revision APROBADA, que es la que compromete. Si todavia
 * no hay ninguna aprobada sale la ultima que haya, con su sello de borrador:
 * poder verla en papel antes de aprobarla es justo lo que hace falta para
 * decidir si se aprueba.
 */
export default async function PropuestaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rev?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const { rev } = await searchParams;

  // `obtenerPropuesta` ya filtra por empresa, y devuelve null tanto si la obra
  // no existe como si es de otra empresa, si falta el permiso o si la obra
  // aun no tiene ninguna revision. Un 404 en todos los casos: distinguirlos
  // confirmaria que ese id existe en algun otro sitio.
  const propuesta = await obtenerPropuesta(sesion, id, rev);
  if (!propuesta) notFound();

  return (
    <div className="py-2 print:py-0">
      <BarraImpresion
        volverA={`/obras/${id}/revisiones`}
        volverTexto="Volver a las revisiones"
      />
      <DocumentoPropuesta propuesta={propuesta} />
    </div>
  );
}
