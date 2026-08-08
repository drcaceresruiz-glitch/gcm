import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra, listarPartidas } from "@/services/obras.service";
import { puede } from "@/lib/rbac";
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

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/obras/${id}`}
          className="inline-flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a la obra
        </Link>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Importar presupuesto
        </h1>
        <p className="mt-1 text-sm text-pretty opacity-70">{obra.nombreObra}</p>
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
              Esta obra tiene la linea base v{obra.lineaBaseVersion} aprobada.
              El presupuesto contractual ya no se puede reemplazar, porque los
              indicadores de avance y costo se calculan contra el.
            </p>
            <p className="mt-2 text-sm">
              Los cambios posteriores se registran como adicionales o
              deductivos, que suman sobre la linea base sin alterarla.
            </p>
          </div>
        </div>
      ) : (
        <ImportadorPresupuesto
          obraId={obra.id}
          nombreObra={obra.nombreObra}
          partidasExistentes={totalPartidas}
        />
      )}
    </div>
  );
}
