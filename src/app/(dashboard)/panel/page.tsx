import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, MapPin, CalendarDays } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { listarObras } from "@/services/obras.service";
import { soles } from "@/utils/formato";
import { fechaCorta, avanceCalendario } from "@/utils/fechas";
import { porcentaje } from "@/utils/formato";

export const metadata: Metadata = { title: "Panel" };

export default async function PanelPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obras = await listarObras(sesion);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Obras</h1>
        <p className="mt-1 text-sm opacity-70">
          {obras.length === 0
            ? "Aun no hay obras registradas."
            : `${obras.length} obra(s) en tu empresa.`}
        </p>
      </div>

      {obras.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-10 text-center"
          style={{ borderColor: "var(--borde)" }}
        >
          <Building2 className="mx-auto size-8 opacity-40" aria-hidden="true" />
          <p className="mt-3 text-sm opacity-70">
            Crea tu primera obra para empezar a cargar el presupuesto.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {obras.map((obra) => {
            const avance = avanceCalendario(
              obra.fechaInicio,
              obra.fechaFinProgramada,
            );

            return (
              <li key={obra.id}>
                <Link
                  href={`/obras/${obra.id}`}
                  className="block rounded-xl border p-4 transition-shadow hover:shadow-md"
                  style={{
                    borderColor: "var(--borde)",
                    backgroundColor: "var(--superficie)",
                  }}
                >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium opacity-60">
                    {obra.codigoObra ?? "Sin codigo"}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor:
                        "color-mix(in oklab, var(--color-marca-500) 15%, transparent)",
                    }}
                  >
                    {obra.estado.replace("_", " ")}
                  </span>
                </div>

                <h2 className="mt-2 text-sm font-semibold text-balance">
                  {obra.nombreObra}
                </h2>

                {obra.ubicacion && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs opacity-70">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>{obra.ubicacion}</span>
                  </p>
                )}

                <p className="mt-1.5 flex items-center gap-1.5 text-xs opacity-70">
                  <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                  {fechaCorta(obra.fechaInicio)} &ndash;{" "}
                  {fechaCorta(obra.fechaFinProgramada)}
                </p>

                <dl
                  className="mt-4 grid grid-cols-2 gap-3 border-t pt-3"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <div>
                    <dt className="text-xs opacity-60">Presupuesto</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                      {soles(obra.presupuestoTotal)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs opacity-60">Partidas</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                      {obra.totalPartidas}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs opacity-60">
                    <span>Avance de calendario</span>
                    <span className="tabular-nums">{porcentaje(avance)}</span>
                  </div>
                  <div
                    className="mt-1 h-1.5 overflow-hidden rounded-full"
                    style={{ backgroundColor: "var(--borde)" }}
                    role="progressbar"
                    aria-valuenow={Math.round(avance)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Avance de calendario"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${avance}%`,
                        backgroundColor: "var(--color-marca-500)",
                      }}
                    />
                  </div>
                </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
