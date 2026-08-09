import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerPlanSemanal } from "@/services/plan-semanal.service";
import { puede } from "@/lib/rbac";
import { fechaLarga } from "@/utils/fechas";
import { ETIQUETA_CNC } from "@/lib/plan-semanal";
import { Volver } from "@/components/ui/Volver";
import { FormularioPlanSemanal } from "@/components/plan-semanal/FormularioPlanSemanal";
import { CierrePlanSemanal } from "@/components/plan-semanal/CierrePlanSemanal";
import { BotonReabrir } from "@/components/plan-semanal/BotonReabrir";
import { BotonEliminarPlan } from "@/components/plan-semanal/BotonEliminarPlan";

export const metadata: Metadata = { title: "Plan Semanal" };

function Seccion({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      {children}
    </section>
  );
}

export default async function DetallePlanSemanalPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id, planId } = await params;
  if (!puede(sesion, "plan_semanal:leer")) redirect(`/obras/${id}`);

  const plan = await obtenerPlanSemanal(sesion, id, planId);
  if (!plan) notFound();

  const puedeGestionar = puede(sesion, "plan_semanal:gestionar");
  const abierto = plan.estado === "ABIERTO";

  // El desplegable de tareas y las sugerencias de la semana llegan del servicio
  // (consulta ligera; ya no se carga el cronograma completo).
  const tareas = plan.tareas;

  // Al planificar una semana AUN vacia, se arranca con las tareas cuyo trabajo
  // programado cae en el rango del corte; si ya hay compromisos guardados,
  // mandan esos.
  const autocargado = plan.compromisos.length === 0 && plan.sugeridas.length > 0;
  const inicial =
    plan.compromisos.length > 0
      ? plan.compromisos.map((c) => ({
          uid: c.uid,
          descripcion: c.descripcion,
          metaPorcentaje: c.metaPorcentaje,
        }))
      : plan.sugeridas.map((s) => ({
          uid: s.uid,
          descripcion: s.descripcion,
          metaPorcentaje: s.metaPorcentaje,
        }));

  return (
    <div className="space-y-6">
      <div>
        <Volver href={`/obras/${id}/plan-semanal`}>Volver al plan semanal</Volver>
        <h2 className="mt-3 text-xl font-semibold">Semana {plan.numero}</h2>
        <p className="text-sm opacity-70">
          Cierra el <strong>{fechaLarga(plan.fechaCorte)}</strong> ·{" "}
          {plan.estado === "CERRADO"
            ? `Cerrada por ${plan.cerradoPor ?? "—"}`
            : "Abierta"}{" "}
          · {plan.cumplidos}/{plan.total} cumplidos
          {plan.ppc !== null ? ` · PPC ${plan.ppc.toFixed(0)}%` : ""}
        </p>
      </div>

      {puedeGestionar && (
        <div className="flex justify-end">
          <BotonEliminarPlan
            obraId={id}
            planId={planId}
            numero={plan.numero}
            cerrada={plan.estado === "CERRADO"}
          />
        </div>
      )}

      {abierto && puedeGestionar && (
        <Seccion>
          <h3 className="mb-1 text-base font-semibold">Compromisos de la semana</h3>
          {autocargado ? (
            <p className="mb-3 text-sm opacity-70">
              Se cargaron automaticamente las <strong>{plan.sugeridas.length}</strong>{" "}
              tarea(s) programadas para esta semana. Quita las que no correspondan,
              ajusta metas o anade lineas libres, y guarda.
            </p>
          ) : (
            <p className="mb-3 text-sm opacity-70">
              Elige tareas del cronograma o anade lineas libres para esta semana.
            </p>
          )}
          <FormularioPlanSemanal
            obraId={id}
            planId={planId}
            tareas={tareas}
            inicial={inicial}
          />
        </Seccion>
      )}

      {abierto && puedeGestionar && plan.compromisos.length > 0 && (
        <Seccion>
          <h3 className="mb-1 text-base font-semibold">Cerrar la semana</h3>
          <p className="mb-3 text-sm opacity-70">
            Marca cada compromiso y, si no se cumplio, su causa. De aqui sale el PPC.
          </p>
          <CierrePlanSemanal
            obraId={id}
            planId={planId}
            compromisos={plan.compromisos.map((c) => ({
              id: c.id,
              descripcion: c.descripcion,
              uid: c.uid,
              metaPorcentaje: c.metaPorcentaje,
              cumplido: c.cumplido,
              causa: c.causa,
              notaCierre: c.notaCierre,
              porcentajeReal: c.porcentajeReal,
            }))}
          />
        </Seccion>
      )}

      {(!abierto || !puedeGestionar) && (
        <Seccion>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold">
              {abierto ? "Compromisos" : "Resultado de la semana"}
            </h3>
            {!abierto && puedeGestionar && <BotonReabrir obraId={id} planId={planId} />}
          </div>
          {plan.compromisos.length === 0 ? (
            <p className="mt-3 text-sm opacity-60">Sin compromisos.</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">
              {plan.compromisos.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border p-2"
                  style={{ borderColor: "var(--borde)" }}
                >
                  {!abierto && (
                    <span
                      className="font-semibold"
                      style={{
                        color: c.cumplido ? "var(--color-exito)" : "var(--color-peligro)",
                      }}
                    >
                      {c.cumplido ? "✓" : "✗"}
                    </span>
                  )}
                  <span className="flex-1">{c.descripcion}</span>
                  {!abierto && c.cumplido === false && c.causa && (
                    <span className="text-xs" style={{ color: "var(--color-peligro)" }}>
                      {ETIQUETA_CNC[c.causa]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      )}
    </div>
  );
}
