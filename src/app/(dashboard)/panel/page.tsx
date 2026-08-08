import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, MapPin, CalendarDays, Plus } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { listarObras } from "@/services/obras.service";
import { puede } from "@/lib/rbac";
import { soles } from "@/utils/formato";
import { fechaCorta, avanceCalendario, diasEntre, hoy } from "@/utils/fechas";
import { FranjaObra, type AlertaObra } from "@/components/obras/FranjaObra";

export const metadata: Metadata = { title: "Panel" };

export default async function PanelPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obras = await listarObras(sesion);
  const puedeCrear = puede(sesion, "obra:crear");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Obras</h1>
          <p className="mt-1 text-sm opacity-70">
            {obras.length === 0
              ? "Aun no hay obras registradas."
              : `${obras.length} obra(s) en tu empresa.`}
          </p>
        </div>

        {puedeCrear && obras.length > 0 && (
          <Link
            href="/obras/nueva"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Nueva obra
          </Link>
        )}
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
          {puedeCrear && (
            <Link
              href="/obras/nueva"
              className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Nueva obra
            </Link>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {obras.map((obra) => {
            const avance = avanceCalendario(
              obra.fechaInicio,
              obra.fechaFinProgramada,
            );

            // Comprometido sobre presupuesto. Sin presupuesto cargado no hay
            // proporcion posible, y se deja en 0 en vez de dividir entre cero.
            const presupuesto = Number(obra.presupuestoTotal);
            const comprometido = Number(obra.comprometido);
            const porcentajeComprometido =
              presupuesto > 0 ? (comprometido / presupuesto) * 100 : 0;

            /**
             * Solo alertas con dato real. El avance fisico y la ruta critica
             * no existen todavia en el sistema, asi que no se inventan: el
             * globo lo dice explicitamente.
             */
            const alertas: AlertaObra[] = [];

            if (obra.partidasSobregiradas > 0) {
              alertas.push({
                clave: "sobregiro",
                texto:
                  obra.partidasSobregiradas === 1
                    ? "1 partida comprometida por encima de su presupuesto"
                    : `${obra.partidasSobregiradas} partidas comprometidas por encima de su presupuesto`,
                detalle:
                  "Se corrige con una reconversion que traiga presupuesto de otra partida, o con un adicional.",
              });
            }

            const diasDeRetraso = diasEntre(obra.fechaFinProgramada, hoy());

            if (diasDeRetraso > 0 && obra.estado === "EN_EJECUCION") {
              alertas.push({
                clave: "plazo",
                texto: `El plazo vencio hace ${diasDeRetraso} dia(s)`,
                detalle:
                  "La obra sigue en ejecucion despues de la fecha de fin programada.",
              });
            }

            if (presupuesto > 0 && comprometido > presupuesto) {
              alertas.push({
                clave: "presupuesto",
                texto: "El comprometido supera el presupuesto de la obra",
                detalle: `${soles(obra.comprometido)} sobre ${soles(obra.presupuestoTotal)}, sin IGV.`,
              });
            }

            return (
              // `h-full` en el `li` y en el enlace, con la franja empujada al
              // pie: sin esto cada tarjeta mide lo que mide su contenido —un
              // titulo de dos lineas, una obra sin ubicacion— y la fila queda
              // desalineada. Asi todas ocupan el alto de la mas alta y las
              // barras arrancan a la misma altura.
              <li key={obra.id} className="h-full">
                <Link
                  href={`/obras/${obra.id}`}
                  className="flex h-full flex-col rounded-xl border p-4 transition-shadow hover:shadow-md"
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

                {/* `mt-auto` empuja las cifras y la franja al pie de la
                    tarjeta, para que las barras de todas arranquen a la misma
                    altura por muy distinto que sea el texto de arriba. */}
                <dl
                  className="mt-auto grid grid-cols-2 gap-3 border-t pt-3"
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

                <FranjaObra
                  calendario={avance}
                  comprometido={porcentajeComprometido}
                  etiquetaComprometido={
                    presupuesto > 0
                      ? `${soles(obra.comprometido)} de ${soles(obra.presupuestoTotal)}`
                      : "sin presupuesto cargado"
                  }
                  alertas={alertas}
                />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
