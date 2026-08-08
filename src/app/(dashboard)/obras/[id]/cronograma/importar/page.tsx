import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { historialCronogramas } from "@/services/cronograma.service";
import { puede } from "@/lib/rbac";
import { Volver } from "@/components/ui/Volver";
import { ImportadorCronograma } from "@/components/cronograma/ImportadorCronograma";

export const metadata: Metadata = { title: "Cargar cronograma" };

export default async function ImportarCronogramaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "cronograma:importar")) {
    redirect(`/obras/${id}/cronograma`);
  }

  const historial = await historialCronogramas(sesion, id);

  return (
    <div className="space-y-6">
      <div>
        <Volver href={`/obras/${id}/cronograma`}>Volver al cronograma</Volver>

        <h2 className="mt-3 text-xl font-semibold tracking-tight">
          Cargar cronograma
        </h2>
        <p className="mt-1 text-sm opacity-70">
          MS Project manda sobre el plan; GCM, sobre el avance real. Cargar un
          corte nuevo actualiza fechas, duraciones y porcentaje planeado sin
          tocar nada de lo que se haya reportado desde obra.
        </p>
      </div>

      <ImportadorCronograma
        obraId={obra.id}
        // Las fechas de corte se guardan como fecha de calendario a
        // medianoche UTC, asi que el trozo ISO es el dia correcto sin pasar
        // por la zona horaria del navegador.
        cortesCargados={historial.map((c) => c.fechaCorte.toISOString().slice(0, 10))}
      />
    </div>
  );
}
