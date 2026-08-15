import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LayoutGrid } from "lucide-react";

import { obtenerSesion } from "@/services/sesion.service";
import { obtenerTablero } from "@/services/tablero-semanal.service";
import { puede } from "@/lib/rbac";
import { fechaLarga, hoy } from "@/utils/fechas";
import { Volver } from "@/components/ui/Volver";
import { PublicarEtiqueta } from "@/components/navegacion/PublicarEtiqueta";
import { Rejilla } from "@/components/tablero-semanal/Rejilla";
import {
  ColocarTarjetas,
  lineasDelTablero,
} from "@/components/tablero-semanal/ColocarTarjetas";

export const metadata: Metadata = { title: "Tablero semanal" };

/**
 * El tablero de planificacion semanal (WWP board) del Last Planner.
 *
 * NO sustituye a la pizarra de la sala: el compromiso publico se adquiere
 * delante de la gente, y eso una pantalla no lo da. Esto es el REGISTRO de lo
 * que se acordo, para que nadie tenga que transcribir post-its y para que el
 * PPC, el SWI y la tasa de liberacion salgan solos del mismo dato.
 */
export default async function TableroSemanalPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id, planId } = await params;
  if (!puede(sesion, "plan_semanal:leer")) redirect(`/obras/${id}`);

  const datos = await obtenerTablero(sesion, id, planId);
  if (!datos) notFound();

  const abierta = datos.estado === "ABIERTO";
  const puedeColocar = datos.puedeGestionar && abierta;
  const ahora = hoy();
  const hoyIso = ahora.getUTCDay() === 0 ? 7 : ahora.getUTCDay();

  return (
    <div className="space-y-6">
      <PublicarEtiqueta clave="plan" valor={`Semana ${datos.numero}`} />
      <div>
        <Volver href={`/obras/${id}/plan-semanal/${planId}`}>
          Volver a la semana {datos.numero}
        </Volver>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold">
          <LayoutGrid className="size-5 opacity-70" aria-hidden="true" />
          Tablero de la semana {datos.numero}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-pretty opacity-70">
          Una fila por contratista, una columna por día. Cierra el{" "}
          <strong>{fechaLarga(datos.fechaCorte)}</strong>.{" "}
          {abierta
            ? "No sustituye a la pizarra de la sala: úsala para acordar, y deja aquí lo acordado. De este mismo dato salen el PPC y los indicadores."
            : "La semana está cerrada, así que el tablero ya no se mueve: es el registro de lo que se acordó."}
        </p>
      </div>

      {datos.tablero.sinDia > 0 && (
        <p
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
          }}
        >
          <strong>{datos.tablero.sinDia}</strong>{" "}
          {datos.tablero.sinDia === 1
            ? "compromiso sigue sin día"
            : "compromisos siguen sin día"}
          . La semana no está planificada del todo hasta que esa cifra sea cero:
          un trabajo sin día es un trabajo que nadie sabe cuándo empieza.
        </p>
      )}

      {datos.tablero.filas.length === 0 ? (
        <section
          className="rounded-xl border p-6 text-sm"
          style={{ borderColor: "var(--borde)" }}
        >
          <p className="font-medium">Esta semana todavía no tiene compromisos.</p>
          <p className="mt-1 max-w-2xl text-pretty opacity-70">
            El tablero pinta lo que se comprometió en el Plan Semanal. Vuelve a
            la semana, elige las tareas del cronograma que se van a hacer, y
            después reparte aquí quién las hace y qué día.
          </p>
        </section>
      ) : (
        <Rejilla tablero={datos.tablero} hoyIso={hoyIso} />
      )}

      {puedeColocar && datos.tablero.filas.length > 0 && (
        <section
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
        >
          <h3 className="text-base font-semibold">Colocar en el tablero</h3>
          <p className="mt-1 mb-4 max-w-3xl text-sm text-pretty opacity-70">
            Asigna contratista, días y color a cada compromiso, y guarda todo de
            una vez. Un compromiso de varios días se estira: elige el día de
            inicio y hasta cuándo ocupa el frente. Los colores son la convención
            habitual de obra, pero son solo una sugerencia.
          </p>

          <ColocarTarjetas
            obraId={id}
            planId={planId}
            lineas={lineasDelTablero(datos.tablero)}
            contratistas={datos.contratistas}
          />
        </section>
      )}
    </div>
  );
}
