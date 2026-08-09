import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { obtenerCronograma } from "@/services/cronograma.service";
import { puede } from "@/lib/rbac";
import { fechaLarga } from "@/utils/fechas";
import { Volver } from "@/components/ui/Volver";
import { Gantt } from "@/components/cronograma/Gantt";
import type { TareaGantt } from "@/lib/gantt";

export const metadata: Metadata = { title: "Diagrama de Gantt" };

export default async function GanttPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "cronograma:leer")) redirect(`/obras/${id}`);

  const cronograma = await obtenerCronograma(sesion, id);
  if (!cronograma) redirect(`/obras/${id}/cronograma`);

  // Del cronograma medido a la forma minima que dibuja el Gantt. Las fechas
  // viajan como Date por RSC sin problema; el %real es el que ya cruzo el
  // servicio con los reportes de obra.
  const tareas: TareaGantt[] = cronograma.tareas.map((t) => ({
    uid: t.uid,
    fila: t.fila,
    codigo: t.codigo,
    nombre: t.nombre,
    nivel: t.nivel,
    esResumen: t.esResumen,
    esHito: t.esHito,
    esCritico: t.esCritico,
    inicio: t.inicio,
    fin: t.fin,
    duracionDias: t.duracionDias,
    porcentajePlaneado: t.porcentajePlaneado,
    porcentajeReal: t.porcentajeReal,
  }));

  return (
    <div className="space-y-4">
      <Volver href={`/obras/${id}/cronograma`}>Volver al cronograma</Volver>

      <div>
        <h2 className="text-lg font-semibold">Diagrama de Gantt</h2>
        <p className="mt-0.5 text-sm opacity-70">
          El plan de la obra en el tiempo · corte del{" "}
          {fechaLarga(cronograma.fechaCorte)} · {tareas.length} tareas
        </p>
      </div>

      <Gantt tareas={tareas} fechaCorte={cronograma.fechaCorte} />
    </div>
  );
}
