import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { listarPases } from "@/services/pase.service";
import { puede } from "@/lib/rbac";
import { PanelPersonal } from "@/components/pase/PanelPersonal";

export const metadata: Metadata = { title: "Personal de campo" };

/**
 * El personal con pase de obra.
 *
 * Manda `lookahead:gestionar`: quien analiza las restricciones es quien sabe
 * a quien hay que dejar documentarlas. No se invento un permiso propio para
 * esto porque cada permiso nuevo hay que concederlo empresa por empresa, y uno
 * que en la practica siempre acompana a otro solo sirve para que un dia falte.
 */
export default async function PersonalObraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) redirect("/panel");
  if (!puede(sesion, "lookahead:gestionar")) redirect(`/obras/${id}`);

  const pases = await listarPases(sesion, id);

  return <PanelPersonal obraId={id} pases={pases} />;
}
