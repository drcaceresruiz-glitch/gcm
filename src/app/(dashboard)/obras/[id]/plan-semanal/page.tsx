import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { listarPlanesSemanales } from "@/services/plan-semanal.service";
import { puede } from "@/lib/rbac";
import { proximoCorte, semanasAContramano } from "@/lib/plan-semanal";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { hoy } from "@/utils/fechas";
import { NuevaSemana } from "@/components/plan-semanal/NuevaSemana";
import { GraficosPpc } from "@/components/plan-semanal/GraficosPpc";
import { TarjetaSemana } from "@/components/plan-semanal/TarjetaSemana";
import { AnalisisCausa } from "@/components/plan-semanal/AnalisisCausa";
import {
  causasParaAnalizar,
  listarAnalisis,
} from "@/services/causa-raiz.service";

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

  // Las tres consultas del bloque de causa raiz van juntas con la del PPC: se
  // pintan una al lado de la otra, asi que pedirlas en serie solo sumaria
  // esperas.
  const [datos, causas, analisis] = await Promise.all([
    listarPlanesSemanales(sesion, id),
    causasParaAnalizar(sesion, id),
    listarAnalisis(sesion, id),
  ]);
  const puedeGestionar = puede(sesion, "plan_semanal:gestionar");
  const fechaSugerida = proximoCorte(obra.diaCorteSemanal, hoy())
    .toISOString()
    .slice(0, 10);
  const cruzadas = semanasAContramano(datos.semanas);

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

      {/* El numero de una semana es el correlativo de creacion y no mira la
          fecha, asi que puede quedar cruzado con la de al lado. La lista se
          ordena por fecha, de modo que se ve «Semana 2, Semana 3, Semana 1» sin
          explicacion: parece un fallo del sistema y es un dato mal metido. Se
          dice cual es y se enlaza con donde se arregla. */}
      {cruzadas.length > 0 && (
        <div
          className="rounded-lg border p-3 text-sm"
          style={{
            borderColor: "var(--color-alerta)",
            backgroundColor: "color-mix(in srgb, var(--color-alerta) 8%, transparent)",
          }}
        >
          <p className="flex items-start gap-2">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              style={{ color: "var(--color-alerta)" }}
              aria-hidden="true"
            />
            <span>
              {cruzadas.length === 1
                ? `La Semana ${cruzadas[0]!.numero} cierra antes que una semana de número menor.`
                : `Hay ${cruzadas.length} semanas que cierran antes que otra de número menor.`}{" "}
              El número lo pone el orden en que se crearon, no la fecha. El número
              no se cambia —está citado en actas y correos—; lo que se corrige es
              el día de cierre:{" "}
              {cruzadas.map((s, i) => (
                <span key={s.numero}>
                  {i > 0 && ", "}
                  <Link
                    href={`/obras/${id}/plan-semanal/${s.id}`}
                    className="font-medium underline"
                  >
                    abrir la Semana {s.numero}
                  </Link>
                </span>
              ))}
              .
            </span>
          </p>
        </div>
      )}

      <GraficosPpc tendencia={datos.tendencia} pareto={datos.pareto} />

      <AnalisisCausa
        obraId={id}
        pendientes={causas.pendientes}
        analisis={analisis.map((a) => ({
          id: a.id,
          causa: a.causa,
          porQue: a.porQue,
          accion: a.accion,
          responsable: a.responsable,
          cerrado: a.cerradoAt !== null,
        }))}
        puedeGestionar={puedeGestionar}
      />

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
