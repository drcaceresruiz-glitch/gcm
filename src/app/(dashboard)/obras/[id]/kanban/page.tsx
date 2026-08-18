import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { kanbanDeObra } from "@/services/kanban.service";
import { puede } from "@/lib/rbac";
import { TableroKanban } from "@/components/kanban/TableroKanban";

export const metadata: Metadata = { title: "Kanban" };

/**
 * El Kanban de la obra: el flujo del Last Planner de izquierda a derecha.
 *
 * OJO CON EL NOMBRE. En este proyecto ya hay dos pantallas que se llaman
 * «Tablero» —el semanal del PTS y el de supervision— y confundirlas ya costo
 * caro. Esta se llama **Kanban** en todas partes: titulo, menu y migas. No
 * renombrarla a «Tablero».
 *
 * Que aporta que no aporten las otras dos: la matriz del Lookahead ordena por
 * tarea y flujo, el tablero semanal por dia, y este por MADUREZ. Es el unico
 * sitio donde se ve de un vistazo cuanto trabajo hay atascado antes de poder
 * comprometerse.
 */
export default async function KanbanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /// La ventana viaja en la URL, igual que en el Lookahead: se comparte por
  /// enlace y no hay que guardarla en ningun sitio.
  searchParams: Promise<{ semanas?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const { semanas } = await searchParams;

  const obra = await obtenerObra(sesion, id);
  if (!obra) redirect("/panel");
  if (!puede(sesion, "lookahead:leer")) redirect(`/obras/${id}`);

  const datos = await kanbanDeObra(sesion, id, semanas);
  if (!datos) redirect(`/obras/${id}`);

  const total = datos.columnas.reduce((n, c) => n + c.tarjetas.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Kanban</h2>
        <p className="mt-0.5 max-w-2xl text-sm opacity-70">
          El mismo trabajo del Lookahead y del Plan Semanal, ordenado por
          madurez: de lo que nadie ha mirado todavía a lo que ya se cumplió o
          no. Cada tarjeta lleva a la pantalla donde se actúa sobre ella.
        </p>
      </div>

      {total === 0 ? (
        // Un tablero vacio no se explica solo: o no hay cronograma, o la
        // ventana no alcanza ninguna tarea. Se dice, y se ofrece la salida.
        <p className="rounded-lg border border-dashed p-6 text-sm opacity-70">
          No hay tareas en la ventana de {datos.semanas} semana(s). Comprueba
          que la obra tenga cronograma importado y tareas en este periodo, o
          amplía la ventana desde el{" "}
          <Link href={`/obras/${id}/lookahead`} className="underline">
            Lookahead
          </Link>
          .
        </p>
      ) : (
        <>
          <TableroKanban datos={datos} obraId={id} />

          <p className="text-xs opacity-60">
            Las tres primeras columnas miran la ventana de {datos.semanas}{" "}
            semana(s) del Lookahead.
            {datos.semanasAbiertas.length > 0 &&
              ` Comprometida: semana(s) ${datos.semanasAbiertas.join(", ")}.`}
            {datos.semanaCerrada !== null &&
              ` Cerrada: la semana ${datos.semanaCerrada}, la última evaluada.`}
          </p>
        </>
      )}
    </div>
  );
}
