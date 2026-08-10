import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { listarPlanesSemanales } from "@/services/plan-semanal.service";
import { puede } from "@/lib/rbac";
import { proximoCorte } from "@/lib/plan-semanal";
import { hoy } from "@/utils/fechas";
import { NuevaSemana } from "@/components/plan-semanal/NuevaSemana";
import { GraficosPpc } from "@/components/plan-semanal/GraficosPpc";
import { TarjetaSemana } from "@/components/plan-semanal/TarjetaSemana";

export const metadata: Metadata = { title: "Plan Semanal" };

export default async function PlanSemanalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) redirect("/panel");
  if (!puede(sesion, "plan_semanal:leer")) redirect(`/obras/${id}`);

  const datos = await listarPlanesSemanales(sesion, id);
  const puedeGestionar = puede(sesion, "plan_semanal:gestionar");
  const fechaSugerida = proximoCorte(obra.diaCorteSemanal, hoy())
    .toISOString()
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Plan Semanal</h2>
          <p className="mt-0.5 max-w-2xl text-sm opacity-70">
            El corto plazo del Last Planner: lo que se compromete cada semana y si
            se cumple (PPC). Las causas de lo no cumplido alimentan la mejora.
          </p>
        </div>
        {puedeGestionar && <NuevaSemana obraId={id} fechaSugerida={fechaSugerida} />}
      </div>

      <GraficosPpc tendencia={datos.tendencia} pareto={datos.pareto} />

      {datos.semanas.length === 0 ? (
        <p className="text-sm opacity-60">
          Aún no hay semanas.{" "}
          {puedeGestionar ? "Crea la primera con «Nueva semana»." : ""}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {datos.semanas.map((s) => (
            <TarjetaSemana key={s.id} obraId={id} semana={s} />
          ))}
        </div>
      )}
    </div>
  );
}
