import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  obtenerPlanSemanal,
  listarPlanesSemanales,
} from "@/services/plan-semanal.service";
import { ambicionDelPlan, type Ambicion } from "@/lib/capacidad";
import { puede } from "@/lib/rbac";
import { fechaLarga } from "@/utils/fechas";
import { ETIQUETA_CNC } from "@/lib/plan-semanal";
import { Volver } from "@/components/ui/Volver";
import { FormularioPlanSemanal } from "@/components/plan-semanal/FormularioPlanSemanal";
import { CierrePlanSemanal } from "@/components/plan-semanal/CierrePlanSemanal";
import { BotonReabrir } from "@/components/plan-semanal/BotonReabrir";
import { BotonEliminarPlan } from "@/components/plan-semanal/BotonEliminarPlan";
import { CorregirCorte } from "@/components/plan-semanal/CorregirCorte";
import { GaleriaEvidencia } from "@/components/evidencia/GaleriaEvidencia";

export const metadata: Metadata = { title: "Plan Semanal" };

/**
 * El aviso de que se esta prometiendo mas de lo que esta obra suele cumplir.
 *
 * Sale AQUI y no en el panel a proposito: en el panel llegaria el lunes
 * siguiente, cuando ya no se puede hacer nada. Aqui llega mientras se arma la
 * semana, que es el unico momento en que la respuesta —comprometer menos—
 * todavia es posible.
 */
function AvisoAmbicion({ a }: { a: Ambicion }) {
  const grave = a.nivel === "sobrecarga";

  return (
    <div
      className="rounded-xl border p-4 text-sm"
      style={{
        borderColor: grave ? "var(--color-peligro)" : "var(--borde)",
        backgroundColor: "var(--superficie)",
      }}
    >
      <p
        className="font-semibold"
        style={grave ? { color: "var(--color-peligro)" } : undefined}
      >
        {grave
          ? `Estás prometiendo ${a.comprometidos} y sueles cumplir ${a.rendimiento} por semana`
          : `Vas justo: ${a.comprometidos} prometidos sobre una media de ${a.rendimiento}`}
      </p>
      <p className="mt-1 opacity-80">
        Es tu propia media de las últimas {a.semanas} semanas cerradas, no un
        estándar de nadie.{" "}
        {grave
          ? "Comprometer más de lo que cabe es la causa de incumplimiento que no se arregla liberando restricciones: el trabajo ya estaba listo y aun así no se hizo."
          : "Si la semana pasada fue floja, conviene mirarlo antes de guardar."}
      </p>
    </div>
  );
}

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
  // OJO: guardar REEMPLAZA la semana, asi que todo lo que no viaje de ida y
  // vuelta por aqui se borraria (cantidad, unidad y el enlace al Lookahead).
  const inicial =
    plan.compromisos.length > 0
      ? plan.compromisos.map((c) => ({
          uid: c.uid,
          descripcion: c.descripcion,
          metaPorcentaje: c.metaPorcentaje,
          cantidadPlan: c.cantidadPlan,
          unidad: c.unidad,
          lookaheadTaskId: c.lookaheadTaskId,
        }))
      : plan.sugeridas.map((s) => ({
          uid: s.uid,
          descripcion: s.descripcion,
          metaPorcentaje: s.metaPorcentaje,
          cantidadPlan: s.cantidadPlan,
          unidad: s.unidad,
          lookaheadTaskId: null,
        }));

  /**
   * Cuanto cabe, segun lo que esta obra viene cumpliendo.
   *
   * Solo se consulta con la semana ABIERTA: en una cerrada el aviso no serviria
   * para nada y seria una consulta regalada. Las semanas cerradas ya traen sus
   * conteos, asi que no hace falta pedir nada nuevo a la base.
   */
  const ambicion = abierto
    ? ambicionDelPlan(
        (await listarPlanesSemanales(sesion, id)).semanas
          .filter((s) => s.estado === "CERRADO")
          .map((s) => ({
            numero: s.numero,
            comprometidos: s.total,
            cumplidos: s.cumplidos,
          })),
        plan.compromisos.length,
      )
    : null;

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
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Solo en las abiertas: mover el corte de una cerrada moveria su
              punto en la tendencia del PPC, que ya se leyo y se firmo. */}
          {abierto && (
            <CorregirCorte
              obraId={id}
              planId={planId}
              fechaCorte={plan.fechaCorte.toISOString().slice(0, 10)}
            />
          )}
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
              Se cargaron automáticamente las <strong>{plan.sugeridas.length}</strong>{" "}
              tarea(s) programadas para esta semana. Quita las que no correspondan,
              ajusta metas o añade líneas libres, y guarda.
            </p>
          ) : (
            <p className="mb-3 text-sm opacity-70">
              Elige tareas del cronograma o añade líneas libres para esta semana.
            </p>
          )}
          <FormularioPlanSemanal
            obraId={id}
            planId={planId}
            tareas={tareas}
            arrastradas={plan.arrastradas}
            inicial={inicial}
          />
        </Seccion>
      )}

      {ambicion && ambicion.nivel !== "cabe" && <AvisoAmbicion a={ambicion} />}

      {abierto && puedeGestionar && plan.compromisos.length > 0 && (
        <Seccion>
          <h3 className="mb-1 text-base font-semibold">Cerrar la semana</h3>
          <p className="mb-3 text-sm opacity-70">
            Marca cada compromiso y, si no se cumplió, su causa. De aquí sale el PPC.
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
              cantidadPlan: c.cantidadPlan,
              unidad: c.unidad,
              cantidadEjec: c.cantidadEjec,
              fotos: c.fotos,
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
                  <span className="flex-1">
                    {c.descripcion}
                    {c.cantidadPlan && (
                      <span className="ml-2 text-xs opacity-70 tabular-nums">
                        {/* Cerrada: lo ejecutado CONTRA lo comprometido, que es
                            la comparacion que interesa. Abierta: solo el plan. */}
                        {!abierto && c.cantidadEjec
                          ? `${c.cantidadEjec} / ${c.cantidadPlan}`
                          : c.cantidadPlan}
                        {c.unidad ? ` ${c.unidad}` : ""}
                      </span>
                    )}
                    {abierto && c.uid !== null && c.estadoLookahead !== "LISTO" && (
                      <span
                        className="ml-2 text-xs"
                        style={{ color: "var(--color-alerta)" }}
                        title="Se comprometió sin liberar sus restricciones en el Lookahead"
                      >
                        sin liberar
                      </span>
                    )}
                  </span>
                  {!abierto && c.cumplido === false && c.causa && (
                    <span className="text-xs" style={{ color: "var(--color-peligro)" }}>
                      {ETIQUETA_CNC[c.causa]}
                    </span>
                  )}
                  {/* La semana cerrada es donde la evidencia sirve de verdad:
                      al revisar por que algo no se cumplio. Aqui solo se mira
                      —adjuntar se hace en el cierre—. */}
                  {c.fotos.length > 0 && (
                    <GaleriaEvidencia fotos={c.fotos} tamano="size-14" />
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
