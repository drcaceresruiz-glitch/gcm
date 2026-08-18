import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { listarEquipo } from "@/services/equipo.service";
import { puede } from "@/lib/rbac";
import { PanelEquipo } from "@/components/equipo/PanelEquipo";

export const metadata: Metadata = { title: "Equipo de la obra" };

/**
 * Quien tiene esta obra asignada.
 *
 * Manda `obra:asignar_equipo`, que existia en la matriz de permisos desde el
 * principio y no lo usaba nadie: repartir el trabajo entre las obras es un
 * acto de administracion, no de campo.
 *
 * `obtenerObra` va primero y ya aplica el alcance: quien no tenga la obra
 * asignada no llega aqui ni sabiendose el enlace.
 */
export default async function EquipoObraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) redirect("/panel");
  if (!puede(sesion, "obra:asignar_equipo")) redirect(`/obras/${id}`);

  const personas = await listarEquipo(sesion, id);

  return <PanelEquipo obraId={id} personas={personas} />;
}
