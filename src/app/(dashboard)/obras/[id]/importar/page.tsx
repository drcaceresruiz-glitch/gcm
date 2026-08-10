import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FileDown, Lock } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra, listarPartidas } from "@/services/obras.service";
import { analizarRiesgoDeReemplazo } from "@/services/importacion.service";
import { puede } from "@/lib/rbac";
import { Volver } from "@/components/ui/Volver";
import { ImportadorPresupuesto } from "@/components/importador/ImportadorPresupuesto";

export const metadata: Metadata = { title: "Importar presupuesto" };

export default async function ImportarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "partida:importar")) {
    redirect(`/obras/${id}`);
  }

  const { totalPartidas } = await listarPartidas(sesion, id);

  // Que se perderia al reemplazar y ningun archivo puede devolver. Solo se
  // consulta si hay algo que reemplazar.
  const enRiesgo =
    totalPartidas > 0 ? await analizarRiesgoDeReemplazo(sesion, id) : null;

  return (
    <div className="space-y-6">
      <div>
        <Volver href={`/obras/${id}`}>Volver al presupuesto</Volver>

        <h2 className="mt-3 text-xl font-semibold tracking-tight">
          Importar presupuesto
        </h2>
      </div>

      {obra.lineaBaseVersion !== null ? (
        <div
          className="flex items-start gap-3 rounded-xl border p-5"
          style={{
            borderColor: "var(--color-alerta)",
            backgroundColor: "color-mix(in oklab, var(--color-alerta) 10%, transparent)",
          }}
        >
          <Lock className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold">Presupuesto congelado</h2>
            <p className="mt-1 text-sm">
              Esta obra tiene la línea base v{obra.lineaBaseVersion} aprobada.
              El presupuesto contractual ya no se puede reemplazar, porque los
              indicadores de avance y costo se calculan contra él.
            </p>
            <p className="mt-2 text-sm">
              Los cambios posteriores se registran como adicionales o
              deductivos, que suman sobre la línea base sin alterarla.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* La plantilla, antes del importador: quien llega por primera vez
              sin archivo necesita saber que existe ANTES de pelearse con su
              Excel. Es un <a> normal y no un Link: es una descarga, no una
              navegacion, y el prefetch de Link no pinta nada aqui. */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
          >
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">¿Primera vez? Descarga la plantilla</h3>
              <p className="mt-0.5 text-sm opacity-70">
                Trae ejemplos de capítulos, partidas a precios unitarios y a
                suma alzada, con las instrucciones en la segunda hoja. Llénala,
                guarda y súbela aquí. También se aceptan los Excel exportados
                de S10.
              </p>
            </div>
            <a
              href="/plantilla-presupuesto"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              <FileDown className="size-4" aria-hidden="true" />
              Descargar plantilla
            </a>
          </div>

          <ImportadorPresupuesto
            obraId={obra.id}
            nombreObra={obra.nombreObra}
            partidasExistentes={totalPartidas}
            enRiesgo={enRiesgo}
          />
        </>
      )}
    </div>
  );
}
