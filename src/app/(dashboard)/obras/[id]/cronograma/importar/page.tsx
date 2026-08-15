import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FileDown } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { historialCronogramas } from "@/services/cronograma.service";
import { puedeConvertirMpp } from "@/services/mpp.service";
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

      {/* La plantilla, antes del importador: quien llega sin MS Project
          necesita saber que existe ANTES de pelearse con su Excel. Es un <a>
          normal y no un Link: es una descarga, no una navegacion, y el
          prefetch de Link no pinta nada aqui. */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">¿Sin MS Project? Descarga la plantilla</h3>
          <p className="mt-0.5 text-sm opacity-70">
            Un Excel con la obra, sus capítulos y sus partidas de ejemplo, y las
            instrucciones en la segunda hoja. Llénala, guarda y súbela aquí
            mismo. No trae ruta crítica: para eso hace falta el archivo de MS
            Project.
          </p>
        </div>
        <a
          href="/plantilla-cronograma"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          <FileDown className="size-4" aria-hidden="true" />
          Descargar plantilla
        </a>
      </div>

      <ImportadorCronograma
        obraId={obra.id}
        admiteMpp={puedeConvertirMpp()}
        // Las fechas de corte se guardan como fecha de calendario a
        // medianoche UTC, asi que el trozo ISO es el dia correcto sin pasar
        // por la zona horaria del navegador.
        cortesCargados={historial.map((c) => c.fechaCorte.toISOString().slice(0, 10))}
      />
    </div>
  );
}
