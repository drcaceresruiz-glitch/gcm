import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { obtenerLookahead } from "@/services/lookahead.service";
import { puede } from "@/lib/rbac";
import { fechaCorta, hoy } from "@/utils/fechas";
import { proximoCorte } from "@/lib/plan-semanal";
import { MatrizLookahead } from "@/components/lookahead/MatrizLookahead";

export const metadata: Metadata = { title: "Lookahead" };

/**
 * Lookahead (Last Planner): la ventana de mediano plazo (3 semanas por
 * defecto, configurable de 1 a 12) con el
 * analisis de las 7 restricciones por tarea y el semaforo de confiabilidad. Es
 * el paso entre el cronograma (largo plazo) y el Plan Semanal (corto plazo): de
 * aqui saldran las tareas LISTAS que se pueden comprometer.
 */
export default async function LookaheadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /// La ventana vive en la URL: se comparte por enlace y se cambia al vuelo,
  /// sin necesidad de guardarla ni de migrar la base.
  searchParams: Promise<{ semanas?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const { semanas } = await searchParams;
  const obra = await obtenerObra(sesion, id);
  if (!obra) redirect("/panel");
  if (!puede(sesion, "lookahead:leer")) redirect(`/obras/${id}`);

  const datos = await obtenerLookahead(sesion, id, semanas);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Lookahead</h2>
        <p className="mt-0.5 max-w-2xl text-sm opacity-70">
          La ventana de mediano plazo: lo que el cronograma trae en las proximas
          semanas y su analisis de restricciones. Una tarea esta{" "}
          <strong>lista</strong> cuando sus 7 flujos estan resueltos; solo lo
          listo deberia comprometerse en el Plan Semanal.
          {datos && (
            <>
              {" "}
              Ventana: {fechaCorta(datos.desde)} – {fechaCorta(datos.hasta)}.
            </>
          )}
        </p>
      </div>

      {datos && (
        <MatrizLookahead
          obraId={id}
          datos={datos}
          fechaProximoCorte={proximoCorte(obra.diaCorteSemanal, hoy())
            .toISOString()
            .slice(0, 10)}
        />
      )}
    </div>
  );
}
