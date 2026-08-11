import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { listarPases } from "@/services/pase.service";
import { obtenerImplicados } from "@/services/avisos.service";
import { puede } from "@/lib/rbac";
import { PanelPersonal } from "@/components/pase/PanelPersonal";
import { PanelAvisos } from "@/components/avisos/PanelAvisos";

export const metadata: Metadata = { title: "Personal y avisos" };

/**
 * Quien es quien en esta obra.
 *
 * Dos cosas que son la misma pregunta: quien documenta en campo (el pase) y
 * quien tiene que enterarse de lo que falta (los avisos de restricciones).
 * Van juntas para no partir en dos pantallas la misma libreta de personas.
 *
 * Manda `lookahead:gestionar`: quien analiza las restricciones es quien sabe
 * a quien hay que dejar documentarlas, y quien responde de cada flujo. No se
 * invento un permiso propio para esto porque cada permiso nuevo hay que
 * concederlo empresa por empresa, y uno que en la practica siempre acompana a
 * otro solo sirve para que un dia falte.
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

  // En paralelo: son dos consultas independientes y la pantalla las pinta
  // juntas.
  const [pases, implicados] = await Promise.all([
    listarPases(sesion, id),
    obtenerImplicados(sesion, id),
  ]);

  return (
    <div className="space-y-6">
      <PanelPersonal obraId={id} pases={pases} />
      {implicados && <PanelAvisos obraId={id} datos={implicados} />}
    </div>
  );
}
