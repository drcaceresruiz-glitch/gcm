import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerPropuesta } from "@/services/propuesta.service";
import { PanelPropuesta } from "@/components/propuesta/PanelPropuesta";
import { Volver } from "@/components/ui/Volver";

export const metadata: Metadata = { title: "Propuesta" };

/**
 * La propuesta economica de la obra, lista para imprimir, guardar como PDF o
 * descargar en Excel.
 *
 * Sin `?rev=` sale la revision APROBADA, que es la que compromete. Si todavia
 * no hay ninguna aprobada sale la ultima que haya, con su sello de borrador:
 * poder verla en papel antes de aprobarla es justo lo que hace falta para
 * decidir si se aprueba.
 *
 * La pagina solo LEE y entrega los datos: que se enseña y como se factura lo
 * decide el panel, ya en el navegador, para que se vea al momento.
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
    <div>
      <div className="mx-auto mb-4 w-full max-w-[210mm]">
        <Volver href={`/obras/${id}/revisiones`}>Volver a las revisiones</Volver>
      </div>
      <PanelPropuesta propuesta={propuesta} />
    </div>
  );
}
